export interface ConfluenceContent {
  id: string;
  type: 'page' | 'blog' | 'comment' | 'attachment';
  title: string;
  space: {
    key: string;
    name: string;
    type: string;
  };
  status: 'current' | 'trashed' | 'historical' | 'draft';
  version: {
    number: number;
    when: string;
    by: {
      accountId: string;
      displayName: string;
      email?: string;
    };
  };
  body?: {
    storage: {
      value: string;
      representation: string;
    };
    view?: {
      value: string;
      representation: string;
    };
  };
  ancestors: ConfluenceContent[];
  descendants?: {
    attachment?: any;
    comment?: any;
    page?: any;
  };
}

export interface ConfluenceWebhookPayload {
  timestamp: number;
  user: {
    accountId: string;
    accountType: string;
    email?: string;
    publicName: string;
    displayName: string;
    type: string;
  };
  userAccountId: string;
  atlassianAccountId: string;
  page?: ConfluenceContent;
  blog?: ConfluenceContent;
  comment?: ConfluenceContent;
  attachment?: ConfluenceContent;
}

export interface ProcessedConfluenceEvent {
  eventType: string;
  tenantId: string;
  contentId: string;
  contentType: 'page' | 'blog' | 'comment' | 'attachment';
  title: string;
  spaceKey: string;
  spaceName: string;
  content?: string;
  url: string;
  author: {
    accountId: string;
    displayName: string;
    email?: string;
  };
  version: number;
  timestamp: string;
  permissions: string[];
  metadata: {
    isPublic: boolean;
    hasAttachments: boolean;
    wordCount?: number;
    labels?: string[];
  };
}