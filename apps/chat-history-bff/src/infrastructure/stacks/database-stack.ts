import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Table,
  AttributeType,
  BillingMode,
  ProjectionType,
  StreamViewType
} from 'aws-cdk-lib/aws-dynamodb';

export class DatabaseStack extends Stack {
  public readonly chatThreadsTable: Table;
  public readonly messagesTable: Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.chatThreadsTable = this.createChatThreadsTable();
    this.messagesTable = this.createMessagesTable();
  }

  private createChatThreadsTable(): Table {
    const table = new Table(this, 'ChatThreadsTable', {
      tableName: 'harmony-chat-threads',
      partitionKey: {
        name: 'tenantId',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'threadId',
        type: AttributeType.STRING
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.RETAIN
    });

    table.addGlobalSecondaryIndex({
      indexName: 'UserThreadsIndex',
      partitionKey: {
        name: 'userId',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'updatedAt',
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL
    });

    table.addGlobalSecondaryIndex({
      indexName: 'TenantStatusIndex',
      partitionKey: {
        name: 'tenantId',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'status#updatedAt',
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL
    });

    return table;
  }

  private createMessagesTable(): Table {
    const table = new Table(this, 'MessagesTable', {
      tableName: 'harmony-messages',
      partitionKey: {
        name: 'threadId',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'messageId',
        type: AttributeType.STRING
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.RETAIN
    });

    table.addGlobalSecondaryIndex({
      indexName: 'TenantMessagesIndex',
      partitionKey: {
        name: 'tenantId',
        type: AttributeType.STRING
      },
      sortKey: {
        name: 'createdAt',
        type: AttributeType.STRING
      },
      projectionType: ProjectionType.ALL
    });

    return table;
  }
}