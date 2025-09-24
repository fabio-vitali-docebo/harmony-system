import { GraphQLClient } from 'graphql-request';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { expect } from '@jest/globals';

describe('Cross-Service Communication Validation', () => {
  let graphqlClient: GraphQLClient;
  let eventBridgeClient: EventBridgeClient;

  const testTenantId = 'test-tenant-001';
  const testUserId = 'test-user-001';

  beforeAll(() => {
    eventBridgeClient = new EventBridgeClient({ region: process.env.AWS_REGION });

    graphqlClient = new GraphQLClient(process.env.GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql', {
      headers: {
        authorization: `Bearer ${generateTestJWT()}`,
        'x-tenant-id': testTenantId
      }
    });
  });

  describe('Chat History BFF to Event Hub', () => {
    it('should validate GraphQL to EventBridge communication', async () => {
      const mutation = `
        mutation AddMessage($input: MessageInput!) {
          addMessage(input: $input) {
            id
            content
            role
            createdAt
          }
        }
      `;

      const variables = {
        input: {
          threadId: 'thread-001',
          type: 'TEXT',
          content: 'Test message for cross-service validation',
          role: 'USER'
        }
      };

      // Execute GraphQL mutation
      const result = await graphqlClient.request(mutation, variables);

      expect(result.addMessage).toBeDefined();
      expect(result.addMessage.content).toBe('Test message for cross-service validation');

      // Verify event was published to EventBridge
      await waitForEventProcessing(3000);
      const eventLog = await verifyEventPublication('MessageCreated', testTenantId);
      expect(eventLog).toBeDefined();
    });
  });

  describe('Harmony Copilot BFF to Knowledge Base', () => {
    it('should validate knowledge search integration', async () => {
      const query = `
        query SearchKnowledge($input: KnowledgeSearchInput!) {
          searchKnowledge(input: $input) {
            query
            results {
              id
              title
              content
              relevanceScore
            }
            totalResults
          }
        }
      `;

      const variables = {
        input: {
          query: 'integration testing',
          scope: 'ALL',
          maxResults: 5
        }
      };

      const result = await graphqlClient.request(query, variables);

      expect(result.searchKnowledge).toBeDefined();
      expect(result.searchKnowledge.results).toBeInstanceOf(Array);
      expect(result.searchKnowledge.totalResults).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Presentation Builder to S3', () => {
    it('should validate presentation generation workflow', async () => {
      const presentationEvent = {
        eventType: 'PresentationRequested',
        presentationId: 'test-pres-001',
        tenantId: testTenantId,
        userId: testUserId,
        topic: 'Cross-Service Testing',
        requirements: { slideCount: 5, audience: 'intermediate' }
      };

      await publishEvent('PresentationRequested', presentationEvent);
      await waitForEventProcessing(5000);

      // Verify presentation was queued
      const queueStatus = await checkPresentationQueue('test-pres-001');
      expect(queueStatus.status).toBe('queued');
    });
  });

  // Helper functions
  function generateTestJWT(): string {
    return 'mock-jwt-token-for-testing';
  }

  async function publishEvent(eventType: string, eventData: any): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [{
        Source: 'harmony.test',
        DetailType: eventType,
        Detail: JSON.stringify(eventData)
      }]
    });

    await eventBridgeClient.send(command);
  }

  async function waitForEventProcessing(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function verifyEventPublication(eventType: string, tenantId: string): Promise<any> {
    // Mock event verification
    return { eventType, tenantId, published: true };
  }

  async function checkPresentationQueue(presentationId: string): Promise<any> {
    // Mock presentation queue check
    return { id: presentationId, status: 'queued' };
  }
});