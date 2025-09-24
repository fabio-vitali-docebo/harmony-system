import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

export interface TenantConfiguration {
  tenantId: string;
  name: string;
  domain: string;
  settings: TenantSettings;
  features: TenantFeatures;
  dataResidency: DataResidencyConfig;
  integrations: IntegrationConfig;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface TenantSettings {
  maxUsers: number;
  maxCourses: number;
  storageQuotaGB: number;
  retentionDays: number;
  timeZone: string;
  language: string;
  branding: BrandingConfig;
  security: SecurityConfig;
}

export interface BrandingConfig {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  customCSS?: string;
}

export interface SecurityConfig {
  passwordPolicy: {
    minLength: number;
    requireNumbers: boolean;
    requireSymbols: boolean;
    requireUppercase: boolean;
  };
  sessionTimeoutMinutes: number;
  mfaRequired: boolean;
  ipWhitelist?: string[];
}

export interface TenantFeatures {
  copilotEnabled: boolean;
  presentationBuilderEnabled: boolean;
  knowledgeBaseEnabled: boolean;
  analyticsEnabled: boolean;
  confluenceIntegrationEnabled: boolean;
  webSearchEnabled: boolean;
  customModelsEnabled: boolean;
}

export interface DataResidencyConfig {
  region: string;
  allowedRegions: string[];
  crossRegionReplication: boolean;
  encryptionRequired: boolean;
}

export interface IntegrationConfig {
  lms: {
    apiUrl: string;
    apiKey: string;
    webhookSecret: string;
    syncInterval: number;
  };
  confluence?: {
    baseUrl: string;
    apiToken: string;
    spaceKeys: string[];
  };
  customIntegrations: Record<string, any>;
}

export class TenantConfigService {
  private dynamoDb: DynamoDBDocument;
  private tableName: string;

  constructor() {
    const client = new DynamoDB({ region: process.env.AWS_REGION });
    this.dynamoDb = DynamoDBDocument.from(client);
    this.tableName = process.env.TENANT_CONFIG_TABLE || 'harmony-tenant-configurations';
  }

  async getTenantConfig(tenantId: string): Promise<TenantConfiguration | null> {
    try {
      const result = await this.dynamoDb.get({
        TableName: this.tableName,
        Key: { tenantId }
      });

      return result.Item as TenantConfiguration || null;

    } catch (error) {
      console.error('Error getting tenant configuration:', error);
      return null;
    }
  }

  async createTenantConfig(config: Omit<TenantConfiguration, 'createdAt' | 'updatedAt'>): Promise<boolean> {
    try {
      const now = new Date();
      const fullConfig: TenantConfiguration = {
        ...config,
        createdAt: now,
        updatedAt: now
      };

      await this.dynamoDb.put({
        TableName: this.tableName,
        Item: fullConfig,
        ConditionExpression: 'attribute_not_exists(tenantId)'
      });

      return true;

    } catch (error) {
      console.error('Error creating tenant configuration:', error);
      return false;
    }
  }

  async updateTenantConfig(
    tenantId: string,
    updates: Partial<Omit<TenantConfiguration, 'tenantId' | 'createdAt'>>
  ): Promise<boolean> {
    try {
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      updateExpressions.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = new Date();

      Object.entries(updates).forEach(([key, value], index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;

        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
      });

      await this.dynamoDb.update({
        TableName: this.tableName,
        Key: { tenantId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      });

      return true;

    } catch (error) {
      console.error('Error updating tenant configuration:', error);
      return false;
    }
  }

  async isFeatureEnabled(tenantId: string, feature: keyof TenantFeatures): Promise<boolean> {
    const config = await this.getTenantConfig(tenantId);

    if (!config || !config.isActive) {
      return false;
    }

    return config.features[feature] === true;
  }

  async getTenantSetting<T>(tenantId: string, settingPath: string): Promise<T | null> {
    const config = await this.getTenantConfig(tenantId);

    if (!config) {
      return null;
    }

    const pathParts = settingPath.split('.');
    let current: any = config.settings;

    for (const part of pathParts) {
      current = current?.[part];
      if (current === undefined) {
        return null;
      }
    }

    return current as T;
  }

  async updateTenantSetting(tenantId: string, settingPath: string, value: any): Promise<boolean> {
    try {
      const config = await this.getTenantConfig(tenantId);

      if (!config) {
        return false;
      }

      const pathParts = settingPath.split('.');
      let current = config.settings;

      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }

      current[pathParts[pathParts.length - 1]] = value;

      return await this.updateTenantConfig(tenantId, { settings: config.settings });

    } catch (error) {
      console.error('Error updating tenant setting:', error);
      return false;
    }
  }

  async listActiveTenants(): Promise<string[]> {
    try {
      const result = await this.dynamoDb.scan({
        TableName: this.tableName,
        FilterExpression: 'isActive = :active',
        ExpressionAttributeValues: {
          ':active': true
        },
        ProjectionExpression: 'tenantId'
      });

      return result.Items?.map(item => item.tenantId) || [];

    } catch (error) {
      console.error('Error listing active tenants:', error);
      return [];
    }
  }

  async validateTenantLimits(tenantId: string, resourceType: 'users' | 'courses' | 'storage', currentCount: number): Promise<boolean> {
    const config = await this.getTenantConfig(tenantId);

    if (!config) {
      return false;
    }

    switch (resourceType) {
      case 'users':
        return currentCount < config.settings.maxUsers;
      case 'courses':
        return currentCount < config.settings.maxCourses;
      case 'storage':
        return currentCount < config.settings.storageQuotaGB * 1024 * 1024 * 1024; // Convert GB to bytes
      default:
        return false;
    }
  }

  async getDefaultConfiguration(): Promise<Omit<TenantConfiguration, 'tenantId' | 'name' | 'domain' | 'createdAt' | 'updatedAt'>> {
    return {
      settings: {
        maxUsers: 1000,
        maxCourses: 100,
        storageQuotaGB: 10,
        retentionDays: 365,
        timeZone: 'UTC',
        language: 'en',
        branding: {
          primaryColor: '#007bff',
          secondaryColor: '#6c757d',
          fontFamily: 'Inter, sans-serif'
        },
        security: {
          passwordPolicy: {
            minLength: 8,
            requireNumbers: true,
            requireSymbols: true,
            requireUppercase: true
          },
          sessionTimeoutMinutes: 480,
          mfaRequired: false
        }
      },
      features: {
        copilotEnabled: true,
        presentationBuilderEnabled: true,
        knowledgeBaseEnabled: true,
        analyticsEnabled: true,
        confluenceIntegrationEnabled: false,
        webSearchEnabled: false,
        customModelsEnabled: false
      },
      dataResidency: {
        region: process.env.AWS_REGION || 'us-east-1',
        allowedRegions: [process.env.AWS_REGION || 'us-east-1'],
        crossRegionReplication: false,
        encryptionRequired: true
      },
      integrations: {
        lms: {
          apiUrl: '',
          apiKey: '',
          webhookSecret: '',
          syncInterval: 300
        },
        customIntegrations: {}
      },
      isActive: true
    };
  }
}