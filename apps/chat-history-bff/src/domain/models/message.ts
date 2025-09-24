export interface Message {
  id: string;
  threadId: string;
  tenantId: string;
  userId: string;
  type: MessageType;
  content: string;
  role: MessageRole;
  metadata: MessageMetadata;
  citations: Citation[];
  attachments: Attachment[];
  createdAt: Date;
  updatedAt: Date;
  parentMessageId?: string;
  isEdited: boolean;
  editHistory: MessageEdit[];
}

export enum MessageType {
  TEXT = 'TEXT',
  HTML = 'HTML',
  MARKDOWN = 'MARKDOWN',
  CODE = 'CODE',
  SYSTEM = 'SYSTEM'
}

export enum MessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
  SYSTEM = 'SYSTEM'
}

export interface MessageMetadata {
  tokens?: number;
  processingTimeMs?: number;
  model?: string;
  temperature?: number;
  confidence?: number;
  language?: string;
  sentiment?: MessageSentiment;
  categories: string[];
  flags: MessageFlag[];
}

export enum MessageSentiment {
  POSITIVE = 'POSITIVE',
  NEGATIVE = 'NEGATIVE',
  NEUTRAL = 'NEUTRAL'
}

export enum MessageFlag {
  FLAGGED_CONTENT = 'FLAGGED_CONTENT',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  CONTAINS_PII = 'CONTAINS_PII',
  EXTERNAL_CONTENT = 'EXTERNAL_CONTENT'
}

export interface Citation {
  id: string;
  url: string;
  title: string;
  source: CitationSource;
  content: string;
  timestamp: Date;
  relevanceScore?: number;
  permissions: string[];
  metadata: CitationMetadata;
}

export enum CitationSource {
  LMS_PRODUCT_DOCS = 'LMS_PRODUCT_DOCS',
  TENANT_CONTENT = 'TENANT_CONTENT',
  WEB_SEARCH = 'WEB_SEARCH',
  USER_UPLOAD = 'USER_UPLOAD',
  KNOWLEDGE_BASE = 'KNOWLEDGE_BASE'
}

export interface CitationMetadata {
  author?: string;
  publishedDate?: Date;
  lastModified?: Date;
  contentType: string;
  size?: number;
  language?: string;
  license?: string;
  usageNotes?: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  s3Key: string;
  url: string;
  thumbnailUrl?: string;
  uploadedAt: Date;
  metadata: AttachmentMetadata;
}

export interface AttachmentMetadata {
  originalName: string;
  mimeType: string;
  dimensions?: {
    width: number;
    height: number;
  };
  duration?: number;
  extractedText?: string;
  virus_scan_status: VirusScanStatus;
}

export enum VirusScanStatus {
  PENDING = 'PENDING',
  CLEAN = 'CLEAN',
  INFECTED = 'INFECTED',
  ERROR = 'ERROR'
}

export interface MessageEdit {
  editedAt: Date;
  editedBy: string;
  previousContent: string;
  reason?: string;
}

export interface CreateMessageInput {
  threadId: string;
  tenantId: string;
  userId: string;
  type: MessageType;
  content: string;
  role: MessageRole;
  citations?: Citation[];
  attachments?: string[];
  parentMessageId?: string;
  metadata?: Partial<MessageMetadata>;
}

export interface UpdateMessageInput {
  id: string;
  tenantId: string;
  content?: string;
  metadata?: Partial<MessageMetadata>;
  reason?: string;
}

export interface MessageFilter {
  threadId: string;
  tenantId: string;
  userId?: string;
  role?: MessageRole;
  type?: MessageType;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  hasAttachments?: boolean;
  hasCitations?: boolean;
  categories?: string[];
  limit?: number;
  nextToken?: string;
}