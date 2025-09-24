import { Context, AppSyncResolverEvent } from 'aws-lambda';
import { container } from 'tsyringe';
import { ChatService } from '../domain/services/chat-service';
import { ResponseBuilder } from '@harmony/lambda-utils';

export interface GraphQLContext {
  identity: {
    sub: string;
    claims: {
      'custom:tenantId': string;
      'cognito:groups': string[];
    };
  };
}

export const listThreadsResolver = async (
  event: AppSyncResolverEvent<any>,
  context: Context
): Promise<any> => {
  const chatService = container.resolve(ChatService);
  const gqlContext = event.requestContext as GraphQLContext;

  const tenantId = gqlContext.identity.claims['custom:tenantId'];
  const userId = gqlContext.identity.sub;

  const filter = {
    tenantId,
    userId,
    ...event.arguments.filter
  };

  const result = await chatService.listChatThreads(filter);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
};

export const listMessagesResolver = async (
  event: AppSyncResolverEvent<any>,
  context: Context
): Promise<any> => {
  const chatService = container.resolve(ChatService);
  const gqlContext = event.requestContext as GraphQLContext;

  const tenantId = gqlContext.identity.claims['custom:tenantId'];
  const userId = gqlContext.identity.sub;

  const filter = {
    threadId: event.arguments.threadId,
    tenantId,
    userId,
    ...event.arguments.filter
  };

  const result = await chatService.listMessages(filter);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
};

export const getChatThreadResolver = async (
  event: AppSyncResolverEvent<any>,
  context: Context
): Promise<any> => {
  const chatService = container.resolve(ChatService);
  const gqlContext = event.requestContext as GraphQLContext;

  const tenantId = gqlContext.identity.claims['custom:tenantId'];
  const userId = gqlContext.identity.sub;

  const result = await chatService.getChatThread(
    event.arguments.id,
    tenantId,
    userId
  );

  if (!result.success) {
    if (result.errorCode === 'THREAD_NOT_FOUND') {
      return null;
    }
    throw new Error(result.error);
  }

  return result.data;
};

export const addMessageResolver = async (
  event: AppSyncResolverEvent<any>,
  context: Context
): Promise<any> => {
  const chatService = container.resolve(ChatService);
  const gqlContext = event.requestContext as GraphQLContext;

  const tenantId = gqlContext.identity.claims['custom:tenantId'];
  const userId = gqlContext.identity.sub;

  const input = {
    ...event.arguments.input,
    tenantId,
    userId
  };

  const result = await chatService.createMessage(input);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
};

export const archiveThreadResolver = async (
  event: AppSyncResolverEvent<any>,
  context: Context
): Promise<any> => {
  const chatService = container.resolve(ChatService);
  const gqlContext = event.requestContext as GraphQLContext;

  const tenantId = gqlContext.identity.claims['custom:tenantId'];

  const result = await chatService.archiveChatThread(
    event.arguments.threadId,
    tenantId
  );

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
};