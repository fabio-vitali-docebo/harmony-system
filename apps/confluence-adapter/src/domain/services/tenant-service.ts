import { injectable } from 'tsyringe';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

export interface TenantContext {
  tenantId: string;
  baseUrl: string;
  spacePermissions: SpacePermission[];
  userPermissions: UserPermission[];
  settings: TenantSettings;
  atlassianAccountId: string;
}

export interface SpacePermission {
  spaceKey: string;
  spaceName: string;
  permissions: string[];
  isPublic: boolean;
}

export interface UserPermission {
  accountId: string;
  permissions: string[];
  roles: string[];
}

export interface TenantSettings {
  enabledFeatures: string[];
  contentFilters: ContentFilter[];
  dataRetentionDays: number;
  allowedSpaces?: string[];
  blockedSpaces?: string[];
}

export interface ContentFilter {
  type: 'include' | 'exclude';
  pattern: string;
  field: 'title' | 'content' | 'space' | 'author';
}

export interface TenantMapping {
  atlassianAccountId: string;
  confluenceBaseUrl: string;
  tenantId: string;
  spaceKey?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

@injectable()
export class TenantService {
  private dynamoDb: DynamoDBDocument;
  private tableName: string;

  constructor() {
    const client = new DynamoDB({ region: process.env.AWS_REGION });
    this.dynamoDb = DynamoDBDocument.from(client);
    this.tableName = process.env.TENANT_MAPPING_TABLE || 'harmony-tenant-mappings';
  }

  async extractTenantContext(webhookPayload: any): Promise<TenantContext | null> {
    try {
      const atlassianAccountId = this.extractAtlassianAccountId(webhookPayload);
      const baseUrl = this.extractBaseUrl(webhookPayload);

      if (!atlassianAccountId || !baseUrl) {
        console.error('Unable to extract Atlassian account ID or base URL from webhook');
        return null;
      }

      const tenantMapping = await this.getTenantMapping(atlassianAccountId, baseUrl);

      if (!tenantMapping || !tenantMapping.isActive) {
        console.error(`No active tenant mapping found for ${atlassianAccountId}`);
        return null;
      }

      const spacePermissions = await this.getSpacePermissions(tenantMapping.tenantId, webhookPayload);
      const userPermissions = await this.getUserPermissions(tenantMapping.tenantId, webhookPayload.user);
      const settings = await this.getTenantSettings(tenantMapping.tenantId);

      return {
        tenantId: tenantMapping.tenantId,
        baseUrl: tenantMapping.confluenceBaseUrl,
        spacePermissions,
        userPermissions,
        settings,
        atlassianAccountId
      };

    } catch (error) {
      console.error('Error extracting tenant context:', error);
      return null;
    }
  }

  async getTenantMapping(atlassianAccountId: string, baseUrl: string): Promise<TenantMapping | null> {
    try {
      const result = await this.dynamoDb.get({
        TableName: this.tableName,
        Key: {
          atlassianAccountId,
          confluenceBaseUrl: baseUrl
        }
      });

      return result.Item as TenantMapping || null;

    } catch (error) {
      console.error('Error getting tenant mapping:', error);
      return null;
    }
  }

  async createTenantMapping(mapping: Omit<TenantMapping, 'createdAt' | 'updatedAt'>): Promise<boolean> {
    try {
      const now = new Date().toISOString();

      await this.dynamoDb.put({
        TableName: this.tableName,
        Item: {
          ...mapping,
          createdAt: now,
          updatedAt: now
        }
      });

      console.log(`Created tenant mapping for ${mapping.atlassianAccountId} -> ${mapping.tenantId}`);
      return true;

    } catch (error) {
      console.error('Error creating tenant mapping:', error);
      return false;
    }
  }

  async updateTenantMapping(atlassianAccountId: string, baseUrl: string, updates: Partial<TenantMapping>): Promise<boolean> {
    try {
      await this.dynamoDb.update({
        TableName: this.tableName,
        Key: {
          atlassianAccountId,
          confluenceBaseUrl: baseUrl
        },
        UpdateExpression: 'SET updatedAt = :updatedAt, #isActive = :isActive',
        ExpressionAttributeNames: {
          '#isActive': 'isActive'
        },
        ExpressionAttributeValues: {
          ':updatedAt': new Date().toISOString(),
          ':isActive': updates.isActive ?? true
        }
      });

      return true;

    } catch (error) {
      console.error('Error updating tenant mapping:', error);
      return false;
    }
  }

  private extractAtlassianAccountId(payload: any): string | null {
    return payload.atlassianAccountId ||
           payload.user?.atlassianAccountId ||
           payload.user?.accountId ||
           null;
  }

  private extractBaseUrl(payload: any): string | null {
    if (payload.page?.space) {
      return this.constructBaseUrl(payload);
    }

    if (payload.blog?.space) {
      return this.constructBaseUrl(payload);
    }

    return null;
  }

  private constructBaseUrl(payload: any): string {
    const space = payload.page?.space || payload.blog?.space;

    if (space?.homepage) {
      const url = new URL(space.homepage);
      return `${url.protocol}//${url.hostname}`;
    }

    return `https://${space?.key || 'unknown'}.atlassian.net/wiki`;
  }

  private async getSpacePermissions(tenantId: string, payload: any): Promise<SpacePermission[]> {
    const space = payload.page?.space || payload.blog?.space;

    if (!space) return [];

    return [{
      spaceKey: space.key,
      spaceName: space.name,
      permissions: ['read', 'write'], // Default permissions
      isPublic: space.type === 'global'
    }];
  }

  private async getUserPermissions(tenantId: string, user: any): Promise<UserPermission[]> {
    if (!user) return [];

    return [{
      accountId: user.accountId,
      permissions: ['read', 'write', 'comment'],
      roles: ['contributor']
    }];
  }

  private async getTenantSettings(tenantId: string): Promise<TenantSettings> {
    return {
      enabledFeatures: [
        'page_indexing',
        'blog_indexing',
        'comment_indexing',
        'attachment_indexing'
      ],
      contentFilters: [],
      dataRetentionDays: 365,
      allowedSpaces: [],
      blockedSpaces: []
    };
  }

  async validateTenantAccess(tenantId: string, resourceId: string, action: string): Promise<boolean> {
    try {
      const tenantMapping = await this.dynamoDb.query({
        TableName: this.tableName,
        IndexName: 'TenantIndex',
        KeyConditionExpression: 'tenantId = :tenantId',
        ExpressionAttributeValues: {
          ':tenantId': tenantId
        }
      });

      return tenantMapping.Items?.length > 0 && tenantMapping.Items[0].isActive;

    } catch (error) {
      console.error('Error validating tenant access:', error);
      return false;
    }
  }

  isContentAllowed(content: any, settings: TenantSettings): boolean {
    if (settings.allowedSpaces?.length > 0 && content.space) {
      return settings.allowedSpaces.includes(content.space.key);
    }

    if (settings.blockedSpaces?.length > 0 && content.space) {
      return !settings.blockedSpaces.includes(content.space.key);
    }

    for (const filter of settings.contentFilters) {
      const fieldValue = this.getFieldValue(content, filter.field);
      const matches = new RegExp(filter.pattern, 'i').test(fieldValue);

      if (filter.type === 'include' && !matches) {
        return false;
      }

      if (filter.type === 'exclude' && matches) {
        return false;
      }
    }

    return true;
  }

  private getFieldValue(content: any, field: string): string {
    switch (field) {
      case 'title':
        return content.title || '';
      case 'content':
        return content.body?.storage?.value || content.content || '';
      case 'space':
        return content.space?.key || content.space?.name || '';
      case 'author':
        return content.author?.displayName || '';
      default:
        return '';
    }
  }
}