export interface ChatThread {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  status: ChatThreadStatus;
  context?: ChatContext;
  metadata: ChatThreadMetadata;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
  messageCount: number;
}

export enum ChatThreadStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  CLOSED = 'CLOSED'
}

export interface ChatContext {
  lmsPageUrl?: string;
  lmsPageTitle?: string;
  courseId?: string;
  lessonId?: string;
  userRole: string;
  permissions: string[];
}

export interface ChatThreadMetadata {
  tags: string[];
  category?: string;
  priority?: ChatThreadPriority;
  source: ChatThreadSource;
  isPublic: boolean;
}

export enum ChatThreadPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum ChatThreadSource {
  USER_INITIATED = 'USER_INITIATED',
  SYSTEM_GENERATED = 'SYSTEM_GENERATED',
  EXTERNAL_INTEGRATION = 'EXTERNAL_INTEGRATION'
}

export interface CreateChatThreadInput {
  tenantId: string;
  userId: string;
  title: string;
  context?: ChatContext;
  metadata?: Partial<ChatThreadMetadata>;
}

export interface UpdateChatThreadInput {
  id: string;
  tenantId: string;
  title?: string;
  status?: ChatThreadStatus;
  context?: ChatContext;
  metadata?: Partial<ChatThreadMetadata>;
}

export interface ChatThreadFilter {
  tenantId: string;
  userId?: string;
  status?: ChatThreadStatus;
  category?: string;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  tags?: string[];
  limit?: number;
  nextToken?: string;
}