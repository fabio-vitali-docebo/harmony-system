import { ChatService } from '../../src/domain/services/chat-service';
import { DatabaseService } from '../../src/domain/interfaces/database-service';
import { EventPublisher } from '../../src/domain/interfaces/event-publisher';
import { PermissionService } from '../../src/domain/interfaces/permission-service';
import { ChatThreadStatus, CreateChatThreadInput } from '../../src/domain/models/chat-thread';
import { MessageRole, CreateMessageInput } from '../../src/domain/models/message';

jest.mock('tsyringe');

describe('ChatService Unit Tests', () => {
  let chatService: ChatService;
  let mockDatabaseService: jest.Mocked<DatabaseService>;
  let mockEventPublisher: jest.Mocked<EventPublisher>;
  let mockPermissionService: jest.Mocked<PermissionService>;

  beforeEach(() => {
    mockDatabaseService = {
      createChatThread: jest.fn(),
      getChatThread: jest.fn(),
      updateChatThread: jest.fn(),
      deleteChatThread: jest.fn(),
      listChatThreads: jest.fn(),
      createMessage: jest.fn(),
      getMessage: jest.fn(),
      updateMessage: jest.fn(),
      deleteMessage: jest.fn(),
      listMessages: jest.fn()
    };

    mockEventPublisher = {
      publish: jest.fn()
    };

    mockPermissionService = {
      canAccessTenant: jest.fn(),
      getUserPermissions: jest.fn(),
      hasPermission: jest.fn()
    };

    chatService = new ChatService();
    (chatService as any).databaseService = mockDatabaseService;
    (chatService as any).eventPublisher = mockEventPublisher;
    (chatService as any).permissionService = mockPermissionService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createChatThread', () => {
    it('should create a new chat thread successfully', async () => {
      const input: CreateChatThreadInput = {
        tenantId: 'tenant-001',
        userId: 'user-001',
        title: 'Test Chat Thread',
        context: {
          userRole: 'student',
          permissions: ['read:courses']
        }
      };

      mockPermissionService.canAccessTenant.mockResolvedValue(true);
      mockDatabaseService.createChatThread.mockResolvedValue(undefined);
      mockEventPublisher.publish.mockResolvedValue(undefined);

      const result = await chatService.createChatThread(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.title).toBe('Test Chat Thread');
      expect(result.data!.status).toBe(ChatThreadStatus.ACTIVE);
      expect(mockDatabaseService.createChatThread).toHaveBeenCalledTimes(1);
      expect(mockEventPublisher.publish).toHaveBeenCalledWith('ChatThreadCreated', expect.any(Object));
    });

    it('should reject creation for unauthorized tenant access', async () => {
      const input: CreateChatThreadInput = {
        tenantId: 'tenant-001',
        userId: 'user-001',
        title: 'Unauthorized Thread'
      };

      mockPermissionService.canAccessTenant.mockResolvedValue(false);

      const result = await chatService.createChatThread(input);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ACCESS_DENIED');
      expect(mockDatabaseService.createChatThread).not.toHaveBeenCalled();
    });
  });

  describe('createMessage', () => {
    it('should create a new message successfully', async () => {
      const mockThread = {
        id: 'thread-001',
        tenantId: 'tenant-001',
        userId: 'user-001',
        title: 'Test Thread',
        status: ChatThreadStatus.ACTIVE,
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { tags: [], source: 'USER_INITIATED' as any, isPublic: false }
      };

      const input: CreateMessageInput = {
        threadId: 'thread-001',
        tenantId: 'tenant-001',
        userId: 'user-001',
        type: 'TEXT',
        content: 'Test message content',
        role: MessageRole.USER
      };

      mockPermissionService.canAccessTenant.mockResolvedValue(true);
      mockDatabaseService.getChatThread.mockResolvedValue(mockThread);
      mockDatabaseService.createMessage.mockResolvedValue(undefined);
      mockDatabaseService.updateChatThread.mockResolvedValue(undefined);
      mockEventPublisher.publish.mockResolvedValue(undefined);

      const result = await chatService.createMessage(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.content).toBe('Test message content');
      expect(result.data!.role).toBe(MessageRole.USER);
      expect(mockDatabaseService.createMessage).toHaveBeenCalledTimes(1);
      expect(mockEventPublisher.publish).toHaveBeenCalledWith('MessageCreated', expect.any(Object));
    });

    it('should reject message creation for non-existent thread', async () => {
      const input: CreateMessageInput = {
        threadId: 'non-existent-thread',
        tenantId: 'tenant-001',
        userId: 'user-001',
        type: 'TEXT',
        content: 'Test message',
        role: MessageRole.USER
      };

      mockPermissionService.canAccessTenant.mockResolvedValue(true);
      mockDatabaseService.getChatThread.mockResolvedValue(null);

      const result = await chatService.createMessage(input);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('THREAD_NOT_FOUND');
      expect(mockDatabaseService.createMessage).not.toHaveBeenCalled();
    });
  });

  describe('getChatThread', () => {
    it('should retrieve chat thread for authorized user', async () => {
      const mockThread = {
        id: 'thread-001',
        tenantId: 'tenant-001',
        userId: 'user-001',
        title: 'Test Thread',
        status: ChatThreadStatus.ACTIVE,
        messageCount: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { tags: [], source: 'USER_INITIATED' as any, isPublic: false }
      };

      mockPermissionService.canAccessTenant.mockResolvedValue(true);
      mockDatabaseService.getChatThread.mockResolvedValue(mockThread);

      const result = await chatService.getChatThread('thread-001', 'tenant-001', 'user-001');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockThread);
    });

    it('should return null for non-existent thread', async () => {
      mockPermissionService.canAccessTenant.mockResolvedValue(true);
      mockDatabaseService.getChatThread.mockResolvedValue(null);

      const result = await chatService.getChatThread('non-existent', 'tenant-001', 'user-001');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('THREAD_NOT_FOUND');
    });
  });

  describe('listChatThreads', () => {
    it('should list threads with tenant filtering', async () => {
      const mockThreads = [
        {
          id: 'thread-001',
          tenantId: 'tenant-001',
          userId: 'user-001',
          title: 'Thread 1',
          status: ChatThreadStatus.ACTIVE,
          messageCount: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: { tags: [], source: 'USER_INITIATED' as any, isPublic: false }
        }
      ];

      mockPermissionService.canAccessTenant.mockResolvedValue(true);
      mockDatabaseService.listChatThreads.mockResolvedValue({
        items: mockThreads,
        nextToken: undefined
      });

      const result = await chatService.listChatThreads({
        tenantId: 'tenant-001',
        userId: 'user-001'
      });

      expect(result.success).toBe(true);
      expect(result.data!.items).toHaveLength(1);
      expect(result.data!.items[0].title).toBe('Thread 1');
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const input: CreateChatThreadInput = {
        tenantId: 'tenant-001',
        userId: 'user-001',
        title: 'Test Thread'
      };

      mockPermissionService.canAccessTenant.mockResolvedValue(true);
      mockDatabaseService.createChatThread.mockRejectedValue(new Error('Database connection failed'));

      const result = await chatService.createChatThread(input);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CREATE_THREAD_FAILED');
    });

    it('should handle event publishing failures', async () => {
      const input: CreateChatThreadInput = {
        tenantId: 'tenant-001',
        userId: 'user-001',
        title: 'Test Thread'
      };

      mockPermissionService.canAccessTenant.mockResolvedValue(true);
      mockDatabaseService.createChatThread.mockResolvedValue(undefined);
      mockEventPublisher.publish.mockRejectedValue(new Error('EventBridge unavailable'));

      const result = await chatService.createChatThread(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('EventBridge unavailable');
    });
  });
});