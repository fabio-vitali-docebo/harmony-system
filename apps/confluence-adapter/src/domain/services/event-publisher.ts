import { injectable } from 'tsyringe';
import { EventBridge } from '@aws-sdk/client-eventbridge';
import { EventValidator } from '@harmony/lambda-utils';

export interface HarmonyEvent {
  eventType: string;
  tenantId: string;
  timestamp?: string;
  source: string;
  data: any;
  metadata?: {
    version: string;
    correlationId?: string;
    userId?: string;
    traceId?: string;
  };
}

export interface EventPublishResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@injectable()
export class EventPublisher {
  private eventBridge: EventBridge;
  private eventBusName: string;

  constructor() {
    this.eventBridge = new EventBridge({ region: process.env.AWS_REGION });
    this.eventBusName = process.env.HARMONY_EVENT_BUS_NAME || 'harmony-event-bus';
  }

  async publishEvent(eventType: string, eventData: any): Promise<EventPublishResult> {
    try {
      const harmonyEvent = this.buildHarmonyEvent(eventType, eventData);

      if (!this.validateEvent(harmonyEvent)) {
        return {
          success: false,
          error: 'Event validation failed'
        };
      }

      const result = await this.eventBridge.putEvents({
        Entries: [
          {
            Source: 'harmony.confluence-adapter',
            DetailType: eventType,
            Detail: JSON.stringify(harmonyEvent),
            EventBusName: this.eventBusName,
            Time: new Date(),
            Resources: [`tenant:${harmonyEvent.tenantId}`]
          }
        ]
      });

      if (result.FailedEntryCount && result.FailedEntryCount > 0) {
        const failedEntry = result.Entries?.[0];
        return {
          success: false,
          error: `Event publish failed: ${failedEntry?.ErrorMessage}`
        };
      }

      console.log(`Successfully published ${eventType} event for tenant ${harmonyEvent.tenantId}`);

      return {
        success: true,
        messageId: result.Entries?.[0]?.EventId
      };

    } catch (error) {
      console.error('Event publishing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async publishBatchEvents(events: Array<{ eventType: string; eventData: any }>): Promise<EventPublishResult[]> {
    const results: EventPublishResult[] = [];

    try {
      const entries = events.map(({ eventType, eventData }) => {
        const harmonyEvent = this.buildHarmonyEvent(eventType, eventData);
        return {
          Source: 'harmony.confluence-adapter',
          DetailType: eventType,
          Detail: JSON.stringify(harmonyEvent),
          EventBusName: this.eventBusName,
          Time: new Date(),
          Resources: [`tenant:${harmonyEvent.tenantId}`]
        };
      });

      const result = await this.eventBridge.putEvents({
        Entries: entries
      });

      if (result.Entries) {
        result.Entries.forEach((entry, index) => {
          if (entry.EventId) {
            results.push({
              success: true,
              messageId: entry.EventId
            });
          } else {
            results.push({
              success: false,
              error: entry.ErrorMessage || 'Unknown error'
            });
          }
        });
      }

      console.log(`Published batch of ${events.length} events, ${results.filter(r => r.success).length} successful`);

    } catch (error) {
      console.error('Batch event publishing error:', error);
      events.forEach(() => {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }

    return results;
  }

  private buildHarmonyEvent(eventType: string, eventData: any): HarmonyEvent {
    return {
      eventType,
      tenantId: eventData.tenantId,
      timestamp: eventData.timestamp || new Date().toISOString(),
      source: 'confluence-adapter',
      data: eventData,
      metadata: {
        version: '1.0',
        correlationId: this.generateCorrelationId(),
        userId: eventData.author?.accountId,
        traceId: process.env.AWS_XRAY_TRACE_ID
      }
    };
  }

  private validateEvent(event: HarmonyEvent): boolean {
    if (!event.eventType || !event.tenantId || !event.source) {
      console.error('Event validation failed: missing required fields');
      return false;
    }

    if (!EventValidator.validateTenant({ tenantId: event.tenantId })) {
      console.error('Event validation failed: invalid tenant');
      return false;
    }

    const supportedEvents = [
      'ConfluencePageCreated',
      'ConfluencePageUpdated',
      'ConfluencePageRemoved',
      'ConfluenceBlogCreated',
      'ConfluenceBlogUpdated',
      'ConfluenceSpaceCreated',
      'ConfluenceSpaceUpdated'
    ];

    if (!supportedEvents.includes(event.eventType)) {
      console.warn(`Unsupported event type: ${event.eventType}`);
    }

    return true;
  }

  private generateCorrelationId(): string {
    return `conf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async publishConfluencePageEvent(eventType: 'ConfluencePageCreated' | 'ConfluencePageUpdated', pageData: any): Promise<EventPublishResult> {
    const eventData = {
      ...pageData,
      source: 'confluence',
      contentType: 'page'
    };

    return this.publishEvent(eventType, eventData);
  }

  async publishConfluenceBlogEvent(eventType: 'ConfluenceBlogCreated' | 'ConfluenceBlogUpdated', blogData: any): Promise<EventPublishResult> {
    const eventData = {
      ...blogData,
      source: 'confluence',
      contentType: 'blog'
    };

    return this.publishEvent(eventType, eventData);
  }

  async publishKnowledgeBaseUpdateEvent(tenantId: string, contentId: string, action: 'add' | 'update' | 'remove'): Promise<EventPublishResult> {
    const eventData = {
      tenantId,
      contentId,
      action,
      source: 'confluence',
      timestamp: new Date().toISOString()
    };

    return this.publishEvent('KnowledgeBaseContentUpdated', eventData);
  }
}