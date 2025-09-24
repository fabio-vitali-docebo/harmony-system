import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

export interface TenantContext {
  tenantId: string;
  userId: string;
  permissions: string[];
  roles: string[];
  dataRegion: string;
  isolationLevel: 'strict' | 'standard';
}

export interface MiddlewareConfig {
  requireTenantId: boolean;
  allowedRoles?: string[];
  requiredPermissions?: string[];
  enforceDataResidency: boolean;
  logTenantAccess: boolean;
}

export class TenantIsolationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

export class TenantMiddleware {
  static withTenantIsolation(
    handler: (event: APIGatewayProxyEvent, context: Context, tenantContext: TenantContext) => Promise<APIGatewayProxyResult>,
    config: MiddlewareConfig = { requireTenantId: true, enforceDataResidency: true, logTenantAccess: true }
  ) {
    return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
      try {
        const tenantContext = await this.extractTenantContext(event);
        await this.validateTenantAccess(tenantContext, config);

        if (config.logTenantAccess) {
          this.logTenantAccess(tenantContext, event, context);
        }

        this.enforceTenantIsolation(event, tenantContext);
        return await handler(event, context, tenantContext);

      } catch (error) {
        return this.handleTenantError(error);
      }
    };
  }

  private static async extractTenantContext(event: APIGatewayProxyEvent): Promise<TenantContext> {
    const requestContext = event.requestContext;
    const authorizer = requestContext.authorizer;

    if (!authorizer || !authorizer.claims) {
      throw new TenantIsolationError('Missing authorization context', 'MISSING_AUTH');
    }

    const claims = authorizer.claims;
    const tenantId = claims['custom:tenantId'] || event.headers['x-tenant-id'];

    if (!tenantId) {
      throw new TenantIsolationError('Tenant ID is required', 'MISSING_TENANT_ID');
    }

    return {
      tenantId,
      userId: claims.sub,
      permissions: claims['custom:permissions']?.split(',') || [],
      roles: claims['cognito:groups']?.split(',') || [],
      dataRegion: claims['custom:dataRegion'] || process.env.AWS_REGION || 'us-east-1',
      isolationLevel: 'strict'
    };
  }

  private static async validateTenantAccess(
    tenantContext: TenantContext,
    config: MiddlewareConfig
  ): Promise<void> {
    if (config.allowedRoles?.length) {
      const hasAllowedRole = config.allowedRoles.some(role =>
        tenantContext.roles.includes(role)
      );

      if (!hasAllowedRole) {
        throw new TenantIsolationError('Access denied: Required role not found', 'INSUFFICIENT_ROLE');
      }
    }

    if (config.requiredPermissions?.length) {
      const hasRequiredPermissions = config.requiredPermissions.every(permission =>
        tenantContext.permissions.includes(permission)
      );

      if (!hasRequiredPermissions) {
        throw new TenantIsolationError('Access denied: Required permissions not found', 'INSUFFICIENT_PERMISSIONS');
      }
    }
  }

  private static enforceTenantIsolation(event: APIGatewayProxyEvent, tenantContext: TenantContext): void {
    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.tenantId && body.tenantId !== tenantContext.tenantId) {
          throw new TenantIsolationError('Tenant ID mismatch in request body', 'TENANT_ID_MISMATCH');
        }
        body.tenantId = tenantContext.tenantId;
        event.body = JSON.stringify(body);
      } catch (parseError) {
        // If body is not JSON, skip validation
      }
    }
  }

  private static logTenantAccess(tenantContext: TenantContext, event: APIGatewayProxyEvent, context: Context): void {
    const logData = {
      timestamp: new Date().toISOString(),
      requestId: context.awsRequestId,
      tenantId: tenantContext.tenantId,
      userId: tenantContext.userId,
      httpMethod: event.httpMethod,
      resource: event.resource,
      sourceIp: event.requestContext.identity.sourceIp,
      dataRegion: tenantContext.dataRegion
    };

    console.log('TENANT_ACCESS_LOG', JSON.stringify(logData));
  }

  private static handleTenantError(error: any): APIGatewayProxyResult {
    console.error('Tenant isolation error:', error);

    if (error instanceof TenantIsolationError) {
      const statusCode = error.code === 'MISSING_AUTH' ? 401 :
                        error.code.includes('INSUFFICIENT') ? 403 : 400;

      return {
        statusCode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Tenant Access Denied',
          message: error.message,
          code: error.code
        })
      };
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }

  static addTenantFilter(queryParams: Record<string, any>, tenantId: string): Record<string, any> {
    return {
      ...queryParams,
      FilterExpression: queryParams.FilterExpression
        ? `${queryParams.FilterExpression} AND tenantId = :tenantId`
        : 'tenantId = :tenantId',
      ExpressionAttributeValues: {
        ...queryParams.ExpressionAttributeValues,
        ':tenantId': tenantId
      }
    };
  }
}