import { APIGatewayProxyResult } from 'aws-lambda';

export class ResponseBuilder {
  static success<T>(data: T, statusCode: number = 200): APIGatewayProxyResult {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'X-Tenant-Isolated': 'true',
      },
      body: JSON.stringify({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }),
    };
  }

  static error(statusCode: number, message: string, details?: unknown): APIGatewayProxyResult {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      },
      body: JSON.stringify({
        success: false,
        error: {
          message,
          details,
          code: statusCode,
        },
        timestamp: new Date().toISOString(),
      }),
    };
  }

  static redirect(location: string, statusCode: number = 302): APIGatewayProxyResult {
    return {
      statusCode,
      headers: {
        Location: location,
      },
      body: '',
    };
  }
}