import { injectable } from 'tsyringe';
import { DataStream } from '@scramjet/framework';
import { EventValidator, HarmonyEvent, TenantContext } from '@harmony/lambda-utils';

@injectable()
export class EventProcessor {
  async processStream(): Promise<ProcessedEvent[]> {
    // This will be called by Lambda handler with Kinesis event stream
    throw new Error('Stream processing implementation pending - requires Kinesis integration');
  }

  async process(events$: DataStream<HarmonyEvent>): Promise<void> {
    return events$
      .filter(event => this.validateTenant(event))
      .map(event => this.enrichContext(event))
      .do(event => this.processBusinessLogic(event))
      .catch(error => this.handleError(error));
  }

  private validateTenant(event: HarmonyEvent): boolean {
    return EventValidator.validateTenant(event);
  }

  private enrichContext(event: HarmonyEvent): EnrichedEvent {
    const tenantContext = EventValidator.extractContext(event);

    return {
      ...event,
      enriched: {
        tenantContext,
        timestamp: new Date().toISOString(),
        processingId: `proc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
    };
  }

  private async processBusinessLogic(event: EnrichedEvent): Promise<void> {
    console.log('Processing event:', {
      source: event.source,
      detailType: event.detailType,
      tenantId: event.enriched.tenantContext.tenantId,
      processingId: event.enriched.processingId,
    });

    // Route events based on type
    switch (event.detailType) {
      case 'ChatThreadUpdated':
        await this.processChatEvent(event);
        break;
      case 'PresentationRequested':
        await this.processPresentationEvent(event);
        break;
      case 'ConfluencePageCreated':
        await this.processConfluenceEvent(event);
        break;
      default:
        console.warn('Unknown event type:', event.detailType);
    }
  }

  private async processChatEvent(event: EnrichedEvent): Promise<void> {
    // Forward to chat-history-bff for persistence
    console.log('Processing chat event for tenant:', event.enriched.tenantContext.tenantId);
  }

  private async processPresentationEvent(event: EnrichedEvent): Promise<void> {
    // Forward to presentation-builder-control
    console.log('Processing presentation event for tenant:', event.enriched.tenantContext.tenantId);
  }

  private async processConfluenceEvent(event: EnrichedEvent): Promise<void> {
    // Process Confluence integration
    console.log('Processing Confluence event for tenant:', event.enriched.tenantContext.tenantId);
  }

  private handleError(error: Error): void {
    console.error('Event processing error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }
}

interface EnrichedEvent extends HarmonyEvent {
  enriched: {
    tenantContext: TenantContext;
    timestamp: string;
    processingId: string;
  };
}

interface ProcessedEvent {
  eventId: string;
  status: 'processed' | 'failed';
  tenantId: string;
  processingTime: number;
}