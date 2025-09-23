import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HarmonyEventBus } from '@harmony/cdk-constructs';

export class EventHubStack extends Stack {
  public readonly eventBus: HarmonyEventBus;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create Harmony event bus with tenant isolation and archiving
    this.eventBus = new HarmonyEventBus(this, 'HarmonyEventBus', {
      tenantIsolation: true,
      archiveEnabled: true,
      streamShardCount: 3,
    });

    // Export event bus ARN for other stacks
    this.exportValue(this.eventBus.eventBus.eventBusArn, {
      name: 'HarmonyEventBusArn',
    });

    this.exportValue(this.eventBus.kinesisStream.streamArn, {
      name: 'HarmonyKinesisStreamArn',
    });
  }
}