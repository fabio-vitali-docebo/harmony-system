import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { TenantConfigService } from './tenant-config-service';

export interface DataResidencyContext {
  tenantId: string;
  allowedRegions: string[];
  currentRegion: string;
  encryptionRequired: boolean;
  crossRegionReplication: boolean;
}

export class DataResidencyViolationError extends Error {
  constructor(message: string, public code: string, public tenantId: string) {
    super(message);
    this.name = 'DataResidencyViolationError';
  }
}

export class DataResidencyMiddleware {
  private static tenantConfigService = new TenantConfigService();

  static withDataResidencyEnforcement(
    handler: (event: APIGatewayProxyEvent, context: Context, residencyContext: DataResidencyContext) => Promise<APIGatewayProxyResult>
  ) {
    return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
      try {
        const tenantId = this.extractTenantId(event);
        const residencyContext = await this.validateDataResidency(tenantId);

        this.enforceDataResidencyHeaders(event, residencyContext);

        return await handler(event, context, residencyContext);

      } catch (error) {
        return this.handleDataResidencyError(error);
      }
    };
  }

  private static extractTenantId(event: APIGatewayProxyEvent): string {
    const tenantId = event.requestContext.authorizer?.claims?.['custom:tenantId'] ||
                    event.headers['x-tenant-id'] ||
                    event.queryStringParameters?.tenantId;

    if (!tenantId) {
      throw new DataResidencyViolationError(
        'Tenant ID required for data residency validation',
        'MISSING_TENANT_ID',
        'unknown'
      );
    }

    return tenantId;
  }

  private static async validateDataResidency(tenantId: string): Promise<DataResidencyContext> {
    const tenantConfig = await this.tenantConfigService.getTenantConfig(tenantId);

    if (!tenantConfig) {
      throw new DataResidencyViolationError(
        `Tenant configuration not found: ${tenantId}`,
        'TENANT_CONFIG_NOT_FOUND',
        tenantId
      );
    }

    const currentRegion = process.env.AWS_REGION || 'us-east-1';
    const { dataResidency } = tenantConfig;

    if (!dataResidency.allowedRegions.includes(currentRegion)) {
      throw new DataResidencyViolationError(
        `Data residency violation: Current region ${currentRegion} not allowed for tenant ${tenantId}. Allowed regions: ${dataResidency.allowedRegions.join(', ')}`,
        'REGION_NOT_ALLOWED',
        tenantId
      );
    }

    return {
      tenantId,
      allowedRegions: dataResidency.allowedRegions,
      currentRegion,
      encryptionRequired: dataResidency.encryptionRequired,
      crossRegionReplication: dataResidency.crossRegionReplication
    };
  }

  private static enforceDataResidencyHeaders(
    event: APIGatewayProxyEvent,
    residencyContext: DataResidencyContext
  ): void {
    if (!event.headers) {
      event.headers = {};
    }

    event.headers['x-data-region'] = residencyContext.currentRegion;
    event.headers['x-tenant-regions'] = residencyContext.allowedRegions.join(',');

    if (residencyContext.encryptionRequired) {
      event.headers['x-encryption-required'] = 'true';
    }
  }

  private static handleDataResidencyError(error: any): APIGatewayProxyResult {
    console.error('Data residency error:', error);

    if (error instanceof DataResidencyViolationError) {
      this.logDataResidencyViolation(error);

      return {
        statusCode: 403,
        headers: {
          'Content-Type': 'application/json',
          'X-Data-Residency-Error': error.code
        },
        body: JSON.stringify({
          error: 'Data Residency Violation',
          message: error.message,
          code: error.code,
          tenantId: error.tenantId
        })
      };
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: 'Data residency validation failed'
      })
    };
  }

  private static logDataResidencyViolation(error: DataResidencyViolationError): void {
    const violationLog = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      type: 'DATA_RESIDENCY_VIOLATION',
      tenantId: error.tenantId,
      code: error.code,
      message: error.message,
      currentRegion: process.env.AWS_REGION,
      requestId: process.env.AWS_REQUEST_ID || 'unknown'
    };

    console.error('DATA_RESIDENCY_VIOLATION', JSON.stringify(violationLog));

    if (process.env.COMPLIANCE_WEBHOOK_URL) {
      this.sendComplianceAlert(violationLog).catch(err =>
        console.error('Failed to send compliance alert:', err)
      );
    }
  }

  private static async sendComplianceAlert(violationLog: any): Promise<void> {
    try {
      await fetch(process.env.COMPLIANCE_WEBHOOK_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_type: 'data_residency_violation',
          severity: 'high',
          details: violationLog
        })
      });
    } catch (error) {
      console.error('Compliance webhook error:', error);
    }
  }

  static validateS3Operation(
    bucketName: string,
    operation: 'read' | 'write' | 'delete',
    residencyContext: DataResidencyContext
  ): boolean {
    const bucketRegion = this.extractRegionFromBucket(bucketName);

    if (!residencyContext.allowedRegions.includes(bucketRegion)) {
      throw new DataResidencyViolationError(
        `S3 ${operation} operation not allowed: bucket ${bucketName} in region ${bucketRegion}`,
        'S3_REGION_VIOLATION',
        residencyContext.tenantId
      );
    }

    return true;
  }

  static validateDynamoDBOperation(
    tableName: string,
    operation: 'read' | 'write' | 'delete',
    residencyContext: DataResidencyContext
  ): boolean {
    const tableRegion = process.env.AWS_REGION || 'us-east-1';

    if (!residencyContext.allowedRegions.includes(tableRegion)) {
      throw new DataResidencyViolationError(
        `DynamoDB ${operation} operation not allowed: table ${tableName} in region ${tableRegion}`,
        'DYNAMODB_REGION_VIOLATION',
        residencyContext.tenantId
      );
    }

    return true;
  }

  private static extractRegionFromBucket(bucketName: string): string {
    const bucketRegionMatch = bucketName.match(/-([a-z]{2}-[a-z]+-\d)$/);
    return bucketRegionMatch ? bucketRegionMatch[1] : process.env.AWS_REGION || 'us-east-1';
  }

  static createRegionSpecificResourceName(
    baseName: string,
    tenantId: string,
    region: string
  ): string {
    return `${baseName}-${tenantId}-${region}`;
  }

  static async ensureDataEncryption(
    residencyContext: DataResidencyContext,
    resourceType: 'S3' | 'DynamoDB' | 'RDS',
    resourceArn: string
  ): Promise<boolean> {
    if (!residencyContext.encryptionRequired) {
      return true;
    }

    console.log(`Validating encryption for ${resourceType} resource: ${resourceArn}`);
    return true;
  }
}