import { injectable, inject } from 'tsyringe';
import {
  ChatThread,
  CreateChatThreadInput,
  UpdateChatThreadInput,
  ChatThreadFilter,
  ChatThreadStatus,
  ChatThreadSource
} from '../models/chat-thread';
import {
  Message,
  CreateMessageInput,
  UpdateMessageInput,
  MessageFilter,
  MessageRole
} from '../models/message';
import { DatabaseService } from '../interfaces/database-service';
import { EventPublisher } from '../interfaces/event-publisher';
import { PermissionService } from '../interfaces/permission-service';

export interface ChatServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
  total?: number;
}

@injectable()
export class ChatService {
  constructor(
    @inject('DatabaseService') private databaseService: DatabaseService,
    @inject('EventPublisher') private eventPublisher: EventPublisher,
    @inject('PermissionService') private permissionService: PermissionService
  ) {}

  async createChatThread(input: CreateChatThreadInput): Promise<ChatServiceResult<ChatThread>> {
    try {
      await this.validateTenantAccess(input.tenantId, input.userId);

      const now = new Date();
      const chatThread: ChatThread = {
        id: this.generateId(),
        tenantId: input.tenantId,
        userId: input.userId,
        title: input.title,
        status: ChatThreadStatus.ACTIVE,
        context: input.context,
        metadata: {
          tags: input.metadata?.tags || [],
          category: input.metadata?.category,
          priority: input.metadata?.priority,
          source: input.metadata?.source || ChatThreadSource.USER_INITIATED,
          isPublic: input.metadata?.isPublic || false
        },
        createdAt: now,
        updatedAt: now,
        messageCount: 0
      };

      await this.databaseService.createChatThread(chatThread);

      await this.eventPublisher.publish('ChatThreadCreated', {
        threadId: chatThread.id,
        tenantId: chatThread.tenantId,
        userId: chatThread.userId,
        timestamp: now
      });

      return { success: true, data: chatThread };
    } catch (error) {
      return this.handleError('CREATE_THREAD_FAILED', error);
    }
  }

  async getChatThread(threadId: string, tenantId: string, userId: string): Promise<ChatServiceResult<ChatThread>> {
    try {
      await this.validateTenantAccess(tenantId, userId);

      const chatThread = await this.databaseService.getChatThread(threadId, tenantId);

      if (!chatThread) {
        return { success: false, errorCode: 'THREAD_NOT_FOUND', error: 'Chat thread not found' };
      }

      if (!await this.canAccessThread(chatThread, userId)) {
        return { success: false, errorCode: 'ACCESS_DENIED', error: 'Access denied to chat thread' };
      }

      return { success: true, data: chatThread };
    } catch (error) {
      return this.handleError('GET_THREAD_FAILED', error);
    }
  }

  async updateChatThread(input: UpdateChatThreadInput): Promise<ChatServiceResult<ChatThread>> {
    try {
      await this.validateTenantAccess(input.tenantId, 'system');

      const existingThread = await this.databaseService.getChatThread(input.id, input.tenantId);

      if (!existingThread) {
        return { success: false, errorCode: 'THREAD_NOT_FOUND', error: 'Chat thread not found' };
      }

      const updatedThread: ChatThread = {
        ...existingThread,
        title: input.title || existingThread.title,
        status: input.status || existingThread.status,
        context: input.context || existingThread.context,
        metadata: { ...existingThread.metadata, ...input.metadata },
        updatedAt: new Date()
      };

      await this.databaseService.updateChatThread(updatedThread);

      await this.eventPublisher.publish('ChatThreadUpdated', {
        threadId: updatedThread.id,
        tenantId: updatedThread.tenantId,
        userId: updatedThread.userId,
        changes: input,
        timestamp: updatedThread.updatedAt
      });

      return { success: true, data: updatedThread };
    } catch (error) {
      return this.handleError('UPDATE_THREAD_FAILED', error);
    }
  }

  async listChatThreads(filter: ChatThreadFilter): Promise<ChatServiceResult<PaginatedResult<ChatThread>>> {
    try {
      await this.validateTenantAccess(filter.tenantId, filter.userId || 'system');

      const result = await this.databaseService.listChatThreads(filter);

      const accessibleThreads = await this.filterAccessibleThreads(result.items, filter.userId);

      return {
        success: true,
        data: {
          items: accessibleThreads,
          nextToken: result.nextToken,
          total: accessibleThreads.length
        }
      };
    } catch (error) {
      return this.handleError('LIST_THREADS_FAILED', error);
    }
  }

  async createMessage(input: CreateMessageInput): Promise<ChatServiceResult<Message>> {
    try {
      await this.validateTenantAccess(input.tenantId, input.userId);

      const thread = await this.databaseService.getChatThread(input.threadId, input.tenantId);

      if (!thread) {
        return { success: false, errorCode: 'THREAD_NOT_FOUND', error: 'Chat thread not found' };
      }

      if (!await this.canAccessThread(thread, input.userId)) {
        return { success: false, errorCode: 'ACCESS_DENIED', error: 'Access denied to chat thread' };
      }

      const now = new Date();
      const message: Message = {
        id: this.generateId(),
        threadId: input.threadId,
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type,
        content: input.content,
        role: input.role,
        metadata: {
          categories: input.metadata?.categories || [],
          flags: input.metadata?.flags || [],
          ...input.metadata
        },
        citations: input.citations || [],
        attachments: [],
        createdAt: now,
        updatedAt: now,
        parentMessageId: input.parentMessageId,
        isEdited: false,
        editHistory: []
      };

      await this.databaseService.createMessage(message);

      await this.databaseService.updateChatThread({
        ...thread,
        messageCount: thread.messageCount + 1,
        lastMessageAt: now,
        updatedAt: now
      });

      await this.eventPublisher.publish('MessageCreated', {
        messageId: message.id,
        threadId: message.threadId,
        tenantId: message.tenantId,
        userId: message.userId,
        role: message.role,
        timestamp: now
      });

      return { success: true, data: message };
    } catch (error) {
      return this.handleError('CREATE_MESSAGE_FAILED', error);
    }
  }

  async listMessages(filter: MessageFilter): Promise<ChatServiceResult<PaginatedResult<Message>>> {
    try {
      await this.validateTenantAccess(filter.tenantId, filter.userId || 'system');

      const thread = await this.databaseService.getChatThread(filter.threadId, filter.tenantId);

      if (!thread) {
        return { success: false, errorCode: 'THREAD_NOT_FOUND', error: 'Chat thread not found' };
      }

      if (!await this.canAccessThread(thread, filter.userId)) {
        return { success: false, errorCode: 'ACCESS_DENIED', error: 'Access denied to chat thread' };
      }

      const result = await this.databaseService.listMessages(filter);

      return { success: true, data: result };
    } catch (error) {
      return this.handleError('LIST_MESSAGES_FAILED', error);
    }
  }

  async updateMessage(input: UpdateMessageInput): Promise<ChatServiceResult<Message>> {
    try {
      await this.validateTenantAccess(input.tenantId, 'system');

      const existingMessage = await this.databaseService.getMessage(input.id, input.tenantId);

      if (!existingMessage) {
        return { success: false, errorCode: 'MESSAGE_NOT_FOUND', error: 'Message not found' };
      }

      const now = new Date();
      const editHistory = [...existingMessage.editHistory];

      if (input.content && input.content !== existingMessage.content) {
        editHistory.push({
          editedAt: now,
          editedBy: 'system',
          previousContent: existingMessage.content,
          reason: input.reason
        });
      }

      const updatedMessage: Message = {
        ...existingMessage,
        content: input.content || existingMessage.content,
        metadata: { ...existingMessage.metadata, ...input.metadata },
        updatedAt: now,
        isEdited: editHistory.length > 0,
        editHistory
      };

      await this.databaseService.updateMessage(updatedMessage);

      await this.eventPublisher.publish('MessageUpdated', {
        messageId: updatedMessage.id,
        threadId: updatedMessage.threadId,
        tenantId: updatedMessage.tenantId,
        changes: input,
        timestamp: now
      });

      return { success: true, data: updatedMessage };
    } catch (error) {
      return this.handleError('UPDATE_MESSAGE_FAILED', error);
    }
  }

  async archiveChatThread(threadId: string, tenantId: string): Promise<ChatServiceResult<ChatThread>> {
    return this.updateChatThread({
      id: threadId,
      tenantId,
      status: ChatThreadStatus.ARCHIVED
    });
  }

  async deleteChatThread(threadId: string, tenantId: string): Promise<ChatServiceResult<void>> {
    try {
      await this.databaseService.deleteChatThread(threadId, tenantId);

      await this.eventPublisher.publish('ChatThreadDeleted', {
        threadId,
        tenantId,
        timestamp: new Date()
      });

      return { success: true };
    } catch (error) {
      return this.handleError('DELETE_THREAD_FAILED', error);
    }
  }

  private async validateTenantAccess(tenantId: string, userId: string): Promise<void> {
    const hasAccess = await this.permissionService.canAccessTenant(userId, tenantId);
    if (!hasAccess) {
      throw new Error('Access denied: Invalid tenant access');
    }
  }

  private async canAccessThread(thread: ChatThread, userId?: string): Promise<boolean> {
    if (!userId) return true;

    if (thread.userId === userId) return true;

    if (thread.metadata.isPublic) {
      return await this.permissionService.canAccessTenant(userId, thread.tenantId);
    }

    return false;
  }

  private async filterAccessibleThreads(threads: ChatThread[], userId?: string): Promise<ChatThread[]> {
    if (!userId) return threads;

    const accessible = [];
    for (const thread of threads) {
      if (await this.canAccessThread(thread, userId)) {
        accessible.push(thread);
      }
    }
    return accessible;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleError(errorCode: string, error: any): ChatServiceResult<any> {
    console.error(`ChatService Error [${errorCode}]:`, error);
    return {
      success: false,
      errorCode,
      error: error.message || 'An unexpected error occurred'
    };
  }
}