import { EventProcessor } from '../../src/handlers/event-processor';
import { EventBridge } from '@aws-sdk/client-eventbridge';
import { Kinesis } from '@aws-sdk/client-kinesis';

jest.mock('@aws-sdk/client-eventbridge');
jest.mock('@aws-sdk/client-kinesis');

describe('EventProcessor Unit Tests', () => {
  let eventProcessor: EventProcessor;
  let mockEventBridge: jest.Mocked<EventBridge>;
  let mockKinesis: jest.Mocked<Kinesis>;

  beforeEach(() => {
    mockEventBridge = new EventBridge({}) as jest.Mocked<EventBridge>;
    mockKinesis = new Kinesis({}) as jest.Mocked<Kinesis>;
    eventProcessor = new EventProcessor();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processEvent', () => {
    it('should process valid ConfluencePageCreated event', async () => {
      const event = {
        eventType: 'ConfluencePageCreated',
        tenantId: 'tenant-001',
        pageId: 'page-001',
        title: 'Test Page',
        content: 'Test content',
        timestamp: new Date().toISOString()
      };

      mockEventBridge.putEvents = jest.fn().mockResolvedValue({
        FailedEntryCount: 0,
        Entries: [{ EventId: 'event-123' }]
      });

      const result = await eventProcessor.processEvent(event);

      expect(result.success).toBe(true);
      expect(mockEventBridge.putEvents).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid event data', async () => {
      const invalidEvent = {
        eventType: 'ConfluencePageCreated',
        // Missing required fields
      };

      const result = await eventProcessor.processEvent(invalidEvent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });

    it('should enforce tenant isolation', async () => {
      const event = {
        eventType: 'ChatThreadUpdated',
        tenantId: 'tenant-001',
        threadId: 'thread-001',
        userId: 'user-001'
      };

      const result = await eventProcessor.processEvent(event);

      expect(result.tenantId).toBe('tenant-001');
      expect(result.isolationEnforced).toBe(true);
    });
  });

  describe('validateEvent', () => {
    it('should validate required fields', () => {
      const validEvent = {
        eventType: 'MessageCreated',
        tenantId: 'tenant-001',
        timestamp: new Date().toISOString()
      };

      const isValid = eventProcessor.validateEvent(validEvent);
      expect(isValid).toBe(true);
    });

    it('should reject events missing tenantId', () => {
      const invalidEvent = {
        eventType: 'MessageCreated',
        timestamp: new Date().toISOString()
      };

      const isValid = eventProcessor.validateEvent(invalidEvent);
      expect(isValid).toBe(false);
    });
  });

  describe('routeEvent', () => {
    it('should route to correct stream based on event type', () => {
      const chatEvent = { eventType: 'ChatThreadUpdated', tenantId: 'tenant-001' };
      const stream = eventProcessor.getTargetStream(chatEvent);

      expect(stream).toBe('harmony-chat-events');
    });

    it('should route to analytics stream for trackable events', () => {
      const analyticsEvent = { eventType: 'UserAction', tenantId: 'tenant-001' };
      const stream = eventProcessor.getTargetStream(analyticsEvent);

      expect(stream).toBe('harmony-analytics-events');
    });
  });

  describe('error handling', () => {
    it('should handle EventBridge service errors', async () => {
      const event = { eventType: 'TestEvent', tenantId: 'tenant-001' };

      mockEventBridge.putEvents = jest.fn().mockRejectedValue(
        new Error('EventBridge service unavailable')
      );

      const result = await eventProcessor.processEvent(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('EventBridge service unavailable');
    });

    it('should retry failed events', async () => {
      const event = { eventType: 'TestEvent', tenantId: 'tenant-001' };

      mockEventBridge.putEvents = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ FailedEntryCount: 0, Entries: [{ EventId: 'event-123' }] });

      const result = await eventProcessor.processEventWithRetry(event, 2);

      expect(result.success).toBe(true);
      expect(mockEventBridge.putEvents).toHaveBeenCalledTimes(2);
    });
  });
});