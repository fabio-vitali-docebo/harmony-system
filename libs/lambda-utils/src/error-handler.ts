import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ResponseBuilder } from './response-builder';

export type LambdaHandler<TEvent = APIGatewayProxyEvent, TResult = APIGatewayProxyResult> = (
  event: TEvent,
  context: Context
) => Promise<TResult>;

export class ErrorHandler {
  static wrapHandler<TEvent = APIGatewayProxyEvent, TResult = APIGatewayProxyResult>(
    handler: LambdaHandler<TEvent, TResult>
  ): LambdaHandler<TEvent, TResult> {
    return async (event: TEvent, context: Context): Promise<TResult> => {
      try {
        return await handler(event, context);
      } catch (error) {
        console.error('Lambda handler error:', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
          event: ErrorHandler.sanitizeEvent(event),
          context: {
            requestId: context.awsRequestId,
            functionName: context.functionName,
            remainingTimeInMillis: context.getRemainingTimeInMillis(),
          },
        });

        // Return appropriate error response
        if (error instanceof ValidationError) {
          return ResponseBuilder.error(400, error.message, error.details) as TResult;
        }

        if (error instanceof UnauthorizedError) {
          return ResponseBuilder.error(403, 'Access denied') as TResult;
        }

        if (error instanceof NotFoundError) {
          return ResponseBuilder.error(404, error.message) as TResult;
        }

        if (error instanceof TenantIsolationError) {
          return ResponseBuilder.error(403, 'Tenant isolation violation') as TResult;
        }

        // Generic server error
        return ResponseBuilder.error(500, 'Internal server error') as TResult;
      }
    };
  }

  static logError(error: Error, context: Record<string, unknown>): void {
    console.error('Application error:', {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  private static sanitizeEvent(event: unknown): unknown {
    if (typeof event !== 'object' || event === null) {
      return event;
    }

    const sanitized = { ...event as Record<string, unknown> };

    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'authorization'];
    sensitiveFields.forEach(field => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }
}

// Custom error classes
export class ValidationError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized access') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class TenantIsolationError extends Error {
  constructor(message: string = 'Tenant isolation violation detected') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}