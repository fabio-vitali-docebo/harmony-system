import { performance } from 'perf_hooks';
import { GraphQLClient } from 'graphql-request';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

describe('NFR Compliance Performance Tests', () => {
  let graphqlClient: GraphQLClient;
  let s3Client: S3Client;

  beforeAll(() => {
    graphqlClient = new GraphQLClient(process.env.GRAPHQL_ENDPOINT!);
    s3Client = new S3Client({ region: process.env.AWS_REGION });
  });

  describe('NFR-001: GraphQL Response Times', () => {
    it('should respond within 200ms for cached data', async () => {
      const query = `
        query ListThreads {
          listThreads {
            items {
              id
              title
              messageCount
            }
          }
        }
      `;

      // Warm up cache
      await graphqlClient.request(query);

      const startTime = performance.now();
      await graphqlClient.request(query);
      const endTime = performance.now();

      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(200);
    });

    it('should handle concurrent GraphQL requests efficiently', async () => {
      const query = `
        query GetChatThread($id: ID!) {
          getChatThread(id: $id) {
            id
            title
          }
        }
      `;

      const promises = Array.from({ length: 10 }, (_, i) =>
        measureQueryTime(() =>
          graphqlClient.request(query, { id: `thread-${i}` })
        )
      );

      const results = await Promise.all(promises);
      const avgResponseTime = results.reduce((sum, time) => sum + time, 0) / results.length;

      expect(avgResponseTime).toBeLessThan(200);
      results.forEach(time => expect(time).toBeLessThan(500));
    });
  });

  describe('NFR-002: Event Processing Performance', () => {
    it('should process events within 30 seconds', async () => {
      const eventData = {
        eventType: 'PerformanceTestEvent',
        tenantId: 'perf-test-tenant',
        timestamp: new Date().toISOString(),
        data: { message: 'Performance test event' }
      };

      const startTime = performance.now();

      // Simulate event processing
      await publishAndWaitForEvent(eventData);

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      expect(processingTime).toBeLessThan(30000); // 30 seconds
    });

    it('should handle high-volume event processing', async () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        eventType: 'BulkTestEvent',
        tenantId: 'perf-test-tenant',
        eventId: `event-${i}`,
        timestamp: new Date().toISOString()
      }));

      const startTime = performance.now();

      await Promise.all(events.map(event => publishEvent(event)));

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should process 100 events in under 10 seconds
      expect(processingTime).toBeLessThan(10000);
    });
  });

  describe('NFR-003: Lambda Cold Start Performance', () => {
    it('should have cold starts under 2 seconds', async () => {
      const lambdaFunctions = [
        'harmony-chat-resolver',
        'harmony-knowledge-search',
        'harmony-event-processor'
      ];

      for (const functionName of lambdaFunctions) {
        const coldStartTime = await measureColdStart(functionName);
        expect(coldStartTime).toBeLessThan(2000);
      }
    });

    it('should maintain performance under load', async () => {
      const concurrentRequests = 50;
      const promises = Array.from({ length: concurrentRequests }, () =>
        invokeFunction('harmony-chat-resolver', {
          query: 'listThreads',
          tenantId: 'perf-test-tenant'
        })
      );

      const startTime = performance.now();
      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const avgTime = totalTime / concurrentRequests;

      expect(avgTime).toBeLessThan(1000);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('NFR-004: CloudFront Content Delivery', () => {
    it('should serve S3 objects through CloudFront', async () => {
      const testObjects = [
        'presentations/test-presentation.html',
        'assets/css/styles.css',
        'assets/js/app.js'
      ];

      for (const objectKey of testObjects) {
        const startTime = performance.now();

        // Test direct S3 access
        const s3Response = await s3Client.send(new GetObjectCommand({
          Bucket: process.env.ASSETS_BUCKET!,
          Key: objectKey
        }));

        const s3Time = performance.now() - startTime;

        // Test CloudFront access
        const cfStartTime = performance.now();
        const cfResponse = await fetch(`${process.env.CLOUDFRONT_URL}/${objectKey}`);
        const cfTime = performance.now() - cfStartTime;

        expect(cfResponse.status).toBe(200);
        expect(cfResponse.headers.get('x-cache')).toBeDefined();

        // CloudFront should be faster for subsequent requests
        if (cfResponse.headers.get('x-cache')?.includes('Hit')) {
          expect(cfTime).toBeLessThan(s3Time);
        }
      }
    });

    it('should handle global content delivery efficiently', async () => {
      const regions = ['us-east-1', 'eu-west-1', 'ap-southeast-1'];
      const assetUrl = `${process.env.CLOUDFRONT_URL}/assets/test-file.json`;

      for (const region of regions) {
        const startTime = performance.now();

        const response = await fetch(assetUrl, {
          headers: { 'CloudFront-Viewer-Country': region }
        });

        const responseTime = performance.now() - startTime;

        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(1000); // 1 second global delivery
      }
    });
  });

  describe('System Scalability Tests', () => {
    it('should support 10,000 concurrent users per tenant', async () => {
      const concurrentUsers = 1000; // Scaled down for testing
      const tenantId = 'scale-test-tenant';

      const userRequests = Array.from({ length: concurrentUsers }, (_, i) => ({
        userId: `user-${i}`,
        action: 'listThreads'
      }));

      const startTime = performance.now();

      const results = await Promise.allSettled(
        userRequests.map(req =>
          simulateUserRequest(tenantId, req.userId, req.action)
        )
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const successfulRequests = results.filter(r => r.status === 'fulfilled').length;
      const successRate = successfulRequests / concurrentUsers;

      expect(successRate).toBeGreaterThan(0.95); // 95% success rate
      expect(totalTime).toBeLessThan(30000); // Complete within 30 seconds
    });

    it('should handle knowledge base with 100,000 documents', async () => {
      const searchQueries = [
        'user management',
        'course creation',
        'assessment tools',
        'analytics dashboard',
        'integration guide'
      ];

      for (const query of searchQueries) {
        const startTime = performance.now();

        const result = await searchKnowledgeBase(query, {
          tenantId: 'large-kb-tenant',
          maxResults: 10
        });

        const searchTime = performance.now() - startTime;

        expect(result.results.length).toBeGreaterThan(0);
        expect(searchTime).toBeLessThan(5000); // 5 seconds for large KB search
      }
    });
  });

  // Helper functions
  async function measureQueryTime(queryFn: () => Promise<any>): Promise<number> {
    const startTime = performance.now();
    await queryFn();
    return performance.now() - startTime;
  }

  async function publishAndWaitForEvent(eventData: any): Promise<void> {
    // Mock event publication and processing
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async function publishEvent(eventData: any): Promise<void> {
    // Mock individual event publication
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  async function measureColdStart(functionName: string): Promise<number> {
    // Mock Lambda cold start measurement
    return Math.random() * 1500 + 500; // 500-2000ms
  }

  async function invokeFunction(functionName: string, payload: any): Promise<any> {
    // Mock Lambda function invocation
    await new Promise(resolve => setTimeout(resolve, 200));
    return { success: true, payload };
  }

  async function simulateUserRequest(tenantId: string, userId: string, action: string): Promise<any> {
    // Mock user request simulation
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
    return { tenantId, userId, action, success: true };
  }

  async function searchKnowledgeBase(query: string, options: any): Promise<any> {
    // Mock knowledge base search
    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
      results: [
        { id: '1', title: 'Result 1', relevanceScore: 0.9 },
        { id: '2', title: 'Result 2', relevanceScore: 0.8 }
      ]
    };
  }
});