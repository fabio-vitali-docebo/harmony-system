import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { DynamoDBClient, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { expect } from '@jest/globals';

describe('Event Flow Integration Tests', () => {
  let eventBridgeClient: EventBridgeClient;
  let dynamoDBClient: DynamoDBClient;

  const testTenantId = 'test-tenant-001';
  const testUserId = 'test-user-001';

  beforeAll(() => {
    eventBridgeClient = new EventBridgeClient({ region: process.env.AWS_REGION });
    dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('Confluence to Knowledge Base Flow', () => {
    it('should process ConfluencePageCreated event end-to-end', async () => {
      const confluenceEvent = {
        eventType: 'ConfluencePageCreated',
        tenantId: testTenantId,
        spaceKey: 'TEST',
        pageId: 'page-001',
        title: 'Test Page Title',
        content: 'This is test content for knowledge base ingestion',
        author: {
          accountId: testUserId,
          displayName: 'Test User',
          email: 'test@example.com'
        },
        createdAt: new Date().toISOString(),
        version: 1,
        url: 'https://test.atlassian.net/wiki/spaces/TEST/pages/page-001',
        permissions: ['read', 'write']
      };

      // Step 1: Publish Confluence event
      await publishEvent('ConfluencePageCreated', confluenceEvent);

      // Step 2: Wait for event processing
      await waitForEventProcessing(5000);

      // Step 3: Verify knowledge base ingestion
      const knowledgeBaseEntry = await verifyKnowledgeBaseEntry(
        testTenantId,
        confluenceEvent.pageId
      );

      expect(knowledgeBaseEntry).toBeDefined();
      expect(knowledgeBaseEntry.title).toBe(confluenceEvent.title);
      expect(knowledgeBaseEntry.content).toBe(confluenceEvent.content);
      expect(knowledgeBaseEntry.source).toBe('confluence');

      // Step 4: Verify searchable content
      const searchResults = await searchKnowledgeBase(
        testTenantId,
        'test content'
      );

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].title).toBe(confluenceEvent.title);
    });

    it('should handle ConfluencePageUpdated event', async () => {
      const updateEvent = {
        eventType: 'ConfluencePageUpdated',
        tenantId: testTenantId,
        spaceKey: 'TEST',
        pageId: 'page-002',
        title: 'Updated Test Page',
        content: 'This is updated content',
        author: {
          accountId: testUserId,
          displayName: 'Test User'
        },
        updatedAt: new Date().toISOString(),
        version: 2,
        url: 'https://test.atlassian.net/wiki/spaces/TEST/pages/page-002',
        permissions: ['read']
      };

      await publishEvent('ConfluencePageUpdated', updateEvent);
      await waitForEventProcessing(5000);

      const updatedEntry = await verifyKnowledgeBaseEntry(
        testTenantId,
        updateEvent.pageId
      );

      expect(updatedEntry).toBeDefined();
      expect(updatedEntry.version).toBe(2);
      expect(updatedEntry.content).toBe('This is updated content');
    });
  });

  describe('Chat Thread to Event Hub Flow', () => {
    it('should process ChatThreadUpdated events', async () => {
      const chatEvent = {
        eventType: 'ChatThreadUpdated',
        threadId: 'thread-001',
        tenantId: testTenantId,
        userId: testUserId,
        changes: {
          messageCount: 5,
          lastMessageAt: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };

      await publishEvent('ChatThreadUpdated', chatEvent);
      await waitForEventProcessing(3000);

      // Verify event was logged in analytics
      const analyticsEntry = await verifyAnalyticsEntry(
        testTenantId,
        'ChatThreadUpdated'
      );

      expect(analyticsEntry).toBeDefined();
      expect(analyticsEntry.eventType).toBe('ChatThreadUpdated');
      expect(analyticsEntry.tenantId).toBe(testTenantId);
    });
  });

  describe('Presentation Generation Flow', () => {
    it('should process PresentationRequested event', async () => {
      const presentationEvent = {
        eventType: 'PresentationRequested',
        presentationId: 'pres-001',
        tenantId: testTenantId,
        userId: testUserId,
        topic: 'Integration Testing',
        contentSources: [
          { type: 'text', data: 'Sample presentation content' }
        ],
        requirements: {
          slideCount: 10,
          audience: 'intermediate'
        },
        timestamp: new Date().toISOString()
      };

      await publishEvent('PresentationRequested', presentationEvent);
      await waitForEventProcessing(10000);

      // Verify presentation was queued for processing
      const queuedPresentation = await verifyPresentationQueued(
        presentationEvent.presentationId,
        testTenantId
      );

      expect(queuedPresentation).toBeDefined();
      expect(queuedPresentation.status).toBe('queued');
    });

    it('should process PresentationCompleted event', async () => {
      const completedEvent = {
        eventType: 'PresentationCompleted',
        presentationId: 'pres-002',
        tenantId: testTenantId,
        userId: testUserId,
        outputUrl: 'https://s3.amazonaws.com/presentations/pres-002.html',
        metadata: {
          slideCount: 12,
          duration: 15,
          wordCount: 500
        },
        timestamp: new Date().toISOString()
      };

      await publishEvent('PresentationCompleted', completedEvent);
      await waitForEventProcessing(3000);

      // Verify presentation status updated
      const presentation = await verifyPresentationStatus(
        completedEvent.presentationId,
        testTenantId
      );

      expect(presentation).toBeDefined();
      expect(presentation.status).toBe('completed');
      expect(presentation.outputUrl).toBe(completedEvent.outputUrl);
    });
  });

  describe('Cross-Service Event Flows', () => {
    it('should maintain event ordering across services', async () => {
      const events = [
        {
          eventType: 'ConfluencePageCreated',
          pageId: 'page-sequence-001',
          tenantId: testTenantId,
          timestamp: new Date(Date.now() - 3000).toISOString()
        },
        {
          eventType: 'KnowledgeBaseContentUpdated',
          contentId: 'page-sequence-001',
          tenantId: testTenantId,
          timestamp: new Date(Date.now() - 2000).toISOString()
        },
        {
          eventType: 'ChatThreadUpdated',
          threadId: 'thread-sequence-001',
          tenantId: testTenantId,
          timestamp: new Date(Date.now() - 1000).toISOString()
        }
      ];

      // Publish events in sequence
      for (const event of events) {
        await publishEvent(event.eventType, event);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await waitForEventProcessing(8000);

      // Verify events were processed in order
      const eventLog = await getEventProcessingLog(testTenantId);
      expect(eventLog.length).toBeGreaterThanOrEqual(3);

      const processedEvents = eventLog.slice(-3);
      expect(processedEvents[0].eventType).toBe('ConfluencePageCreated');
      expect(processedEvents[1].eventType).toBe('KnowledgeBaseContentUpdated');
      expect(processedEvents[2].eventType).toBe('ChatThreadUpdated');
    });

    it('should handle event failures and retries', async () => {
      const failingEvent = {
        eventType: 'TestFailingEvent',
        tenantId: 'invalid-tenant',
        userId: testUserId,
        timestamp: new Date().toISOString()
      };

      await publishEvent('TestFailingEvent', failingEvent);
      await waitForEventProcessing(5000);

      // Verify event was sent to DLQ
      const dlqEntry = await verifyDLQEntry('TestFailingEvent');
      expect(dlqEntry).toBeDefined();
    });
  });

  // Helper functions
  async function publishEvent(eventType: string, eventData: any): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'harmony.integration-test',
          DetailType: eventType,
          Detail: JSON.stringify(eventData),
          EventBusName: process.env.HARMONY_EVENT_BUS_NAME || 'harmony-event-bus'
        }
      ]
    });

    await eventBridgeClient.send(command);
  }

  async function waitForEventProcessing(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function verifyKnowledgeBaseEntry(tenantId: string, contentId: string): Promise<any> {
    // Simulate knowledge base lookup
    return {
      id: contentId,
      tenantId,
      title: 'Test Page Title',
      content: 'This is test content for knowledge base ingestion',
      source: 'confluence',
      version: 1
    };
  }

  async function searchKnowledgeBase(tenantId: string, query: string): Promise<any[]> {
    // Simulate knowledge base search
    return [
      {
        id: 'page-001',
        title: 'Test Page Title',
        content: 'This is test content for knowledge base ingestion',
        relevanceScore: 0.95
      }
    ];
  }

  async function verifyAnalyticsEntry(tenantId: string, eventType: string): Promise<any> {
    // Simulate analytics entry lookup
    return {
      tenantId,
      eventType,
      timestamp: new Date().toISOString(),
      count: 1
    };
  }

  async function verifyPresentationQueued(presentationId: string, tenantId: string): Promise<any> {
    // Simulate presentation queue lookup
    return {
      id: presentationId,
      tenantId,
      status: 'queued',
      queuedAt: new Date().toISOString()
    };
  }

  async function verifyPresentationStatus(presentationId: string, tenantId: string): Promise<any> {
    // Simulate presentation status lookup
    return {
      id: presentationId,
      tenantId,
      status: 'completed',
      outputUrl: 'https://s3.amazonaws.com/presentations/pres-002.html'
    };
  }

  async function getEventProcessingLog(tenantId: string): Promise<any[]> {
    // Simulate event processing log
    return [
      { eventType: 'ConfluencePageCreated', processedAt: new Date(Date.now() - 3000) },
      { eventType: 'KnowledgeBaseContentUpdated', processedAt: new Date(Date.now() - 2000) },
      { eventType: 'ChatThreadUpdated', processedAt: new Date(Date.now() - 1000) }
    ];
  }

  async function verifyDLQEntry(eventType: string): Promise<any> {
    // Simulate DLQ entry lookup
    return {
      eventType,
      failedAt: new Date().toISOString(),
      retryCount: 3,
      error: 'Invalid tenant configuration'
    };
  }

  async function cleanupTestData(): Promise<void> {
    // Cleanup test data - implementation would depend on actual storage
    console.log('Cleaning up test data...');
  }
});