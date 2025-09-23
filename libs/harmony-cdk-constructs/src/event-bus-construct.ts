import { Construct } from 'constructs';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { KinesisStreamTarget } from 'aws-cdk-lib/aws-events-targets';
import { Stream } from 'aws-cdk-lib/aws-kinesis';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface HarmonyEventBusProps {
  tenantIsolation: boolean;
  archiveEnabled: boolean;
  streamShardCount?: number;
}

export class HarmonyEventBus extends Construct {
  public readonly eventBus: EventBus;
  public readonly kinesisStream: Stream;
  public readonly eventArchiveRule: Rule;

  constructor(scope: Construct, id: string, props: HarmonyEventBusProps) {
    super(scope, id);

    // Create custom EventBridge bus for Harmony events
    this.eventBus = new EventBus(this, 'EventBus', {
      eventBusName: 'harmony-event-bus',
      description: 'Event bus for Harmony multi-tenant system',
    });

    // Create Kinesis stream for event processing
    this.kinesisStream = new Stream(this, 'EventStream', {
      streamName: 'harmony-event-stream',
      shardCount: props.streamShardCount || 2,
      retentionPeriod: Duration.days(7),
    });

    // Archive rule for audit and replay
    if (props.archiveEnabled) {
      this.eventArchiveRule = new Rule(this, 'ArchiveRule', {
        eventBus: this.eventBus,
        eventPattern: {
          source: ['harmony.*'],
        },
        targets: [new KinesisStreamTarget(this.kinesisStream)],
        description: 'Archive all Harmony events to Kinesis',
      });
    }
  }
}