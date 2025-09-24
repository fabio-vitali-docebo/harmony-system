import { ChatThread, ChatThreadFilter } from '../models/chat-thread';
import { Message, MessageFilter } from '../models/message';
import { PaginatedResult } from '../services/chat-service';

export interface DatabaseService {
  createChatThread(chatThread: ChatThread): Promise<void>;
  getChatThread(threadId: string, tenantId: string): Promise<ChatThread | null>;
  updateChatThread(chatThread: ChatThread): Promise<void>;
  deleteChatThread(threadId: string, tenantId: string): Promise<void>;
  listChatThreads(filter: ChatThreadFilter): Promise<PaginatedResult<ChatThread>>;

  createMessage(message: Message): Promise<void>;
  getMessage(messageId: string, tenantId: string): Promise<Message | null>;
  updateMessage(message: Message): Promise<void>;
  deleteMessage(messageId: string, tenantId: string): Promise<void>;
  listMessages(filter: MessageFilter): Promise<PaginatedResult<Message>>;
}