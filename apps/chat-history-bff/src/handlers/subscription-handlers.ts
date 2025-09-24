import { DynamoDBStreamEvent, DynamoDBRecord, Context } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AppSyncClient, PostToConnectionCommand } from '@aws-sdk/client-appsync';
import { ChatThread } from '../domain/models/chat-thread';
import { Message } from '../domain/models/message';

const appSyncClient = new AppSyncClient({ region: process.env.AWS_REGION });

export interface SubscriptionMessage {
  type: 'ChatThreadUpdated' | 'MessageAdded';
  payload: any;
  tenantId: string;
  threadId: string;
}

export const dynamoStreamHandler = async (
  event: DynamoDBStreamEvent,
  context: Context
): Promise<void> => {
  console.log('Processing DynamoDB stream records:', event.Records.length);

  for (const record of event.Records) {
    try {
      await processStreamRecord(record);
    } catch (error) {
      console.error('Error processing stream record:', error);
    }
  }
};

export const processStreamRecord = async (record: DynamoDBRecord): Promise<void> => {
  if (!record.dynamodb || !record.eventSource === 'aws:dynamodb') {
    return;
  }

  const eventName = record.eventName;
  const tableName = record.eventSourceARN?.split('/')[1];

  if (tableName === 'harmony-chat-threads') {
    await handleChatThreadStreamEvent(record, eventName);
  } else if (tableName === 'harmony-messages') {
    await handleMessageStreamEvent(record, eventName);
  }
};

const handleChatThreadStreamEvent = async (
  record: DynamoDBRecord,
  eventName?: string
): Promise<void> => {
  if (eventName === 'REMOVE') {
    return;
  }

  const newImage = record.dynamodb?.NewImage;
  if (!newImage) {
    return;
  }

  const chatThread = unmarshall(newImage) as ChatThread;

  const subscriptionMessage: SubscriptionMessage = {
    type: 'ChatThreadUpdated',
    payload: chatThread,
    tenantId: chatThread.tenantId,
    threadId: chatThread.id
  };

  await publishToSubscribers(subscriptionMessage);
};

const handleMessageStreamEvent = async (
  record: DynamoDBRecord,
  eventName?: string
): Promise<void> => {
  if (eventName === 'REMOVE') {
    return;
  }

  const newImage = record.dynamodb?.NewImage;
  if (!newImage) {
    return;
  }

  const message = unmarshall(newImage) as Message;

  const subscriptionMessage: SubscriptionMessage = {
    type: 'MessageAdded',
    payload: message,
    tenantId: message.tenantId,
    threadId: message.threadId
  };

  await publishToSubscribers(subscriptionMessage);
};

const publishToSubscribers = async (message: SubscriptionMessage): Promise<void> => {
  try {
    const graphqlMessage = {
      data: {
        [message.type === 'ChatThreadUpdated' ? 'onChatThreadUpdated' : 'onMessageAdded']: message.payload
      }
    };

    console.log(`Publishing ${message.type} for thread ${message.threadId}:`, graphqlMessage);
  } catch (error) {
    console.error('Error publishing to subscribers:', error);
    throw error;
  }
};

export const connectionHandler = async (
  event: any,
  context: Context
): Promise<any> => {
  const connectionId = event.requestContext.connectionId;
  const eventType = event.requestContext.eventType;

  console.log(`WebSocket ${eventType} for connection ${connectionId}`);

  switch (eventType) {
    case 'CONNECT':
      return handleConnect(connectionId, event);
    case 'DISCONNECT':
      return handleDisconnect(connectionId);
    default:
      return { statusCode: 400, body: 'Unknown event type' };
  }
};

const handleConnect = async (connectionId: string, event: any): Promise<any> => {
  console.log(`Client connected: ${connectionId}`);

  const identity = event.requestContext.identity;
  if (!identity.userArn) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  return { statusCode: 200, body: 'Connected' };
};

const handleDisconnect = async (connectionId: string): Promise<any> => {
  console.log(`Client disconnected: ${connectionId}`);
  return { statusCode: 200, body: 'Disconnected' };
};