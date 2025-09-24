import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { injectable, inject } from 'tsyringe';
import { ResponseBuilder, EventValidator } from '@harmony/lambda-utils';
import { EventPublisher } from '../domain/services/event-publisher';
import { TenantService } from '../domain/services/tenant-service';

export interface ConfluenceWebhookEvent {
  timestamp: number;
  user: {
    type: string;
    accountId: string;
    accountType: string;
    email?: string;
    publicName: string;
    displayName: string;
  };
  page?: {
    id: string;
    title: string;
    type: string;
    status: string;
    space: {
      key: string;
      name: string;
      type: string;
    };
    history: {
      latest: boolean;
      createdBy: any;
      createdDate: string;
    };
    version: {
      by: any;
      when: string;
      number: number;
    };
    ancestors: any[];
    descendants: {
      attachment: any;
      comment: any;
      page: any;
    };
    body: {
      storage: {
        value: string;
        representation: string;
      };
    };
  };
  blog?: {
    id: string;
    title: string;
    type: string;
    status: string;
    space: any;
  };
  userAccountId: string;
  atlassianAccountId: string;
}

@injectable()
export class WebhookProcessor {
  constructor(
    @inject('EventPublisher') private eventPublisher: EventPublisher,
    @inject('TenantService') private tenantService: TenantService
  ) {}

  async processWebhook(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
      console.log('Processing Confluence webhook:', event.headers);

      const signature = event.headers['x-atlassian-webhook-signature'];
      const webhookEvent = event.headers['x-atlassian-webhook-event'];

      if (!this.validateWebhookSignature(event.body || '', signature)) {
        return ResponseBuilder.error(401, 'Invalid webhook signature');
      }

      const payload = JSON.parse(event.body || '{}') as ConfluenceWebhookEvent;

      const tenantContext = await this.tenantService.extractTenantContext(payload);
      if (!tenantContext) {
        return ResponseBuilder.error(400, 'Unable to determine tenant context');
      }

      await this.processWebhookEvent(webhookEvent, payload, tenantContext);

      return ResponseBuilder.success({
        message: 'Webhook processed successfully',
        eventType: webhookEvent,
        tenantId: tenantContext.tenantId
      });

    } catch (error) {
      console.error('Webhook processing error:', error);
      return ResponseBuilder.error(500, 'Internal server error');
    }
  }

  private async processWebhookEvent(
    eventType: string | undefined,
    payload: ConfluenceWebhookEvent,
    tenantContext: any
  ): Promise<void> {
    switch (eventType) {
      case 'page_created':
        await this.handlePageCreated(payload, tenantContext);
        break;
      case 'page_updated':
        await this.handlePageUpdated(payload, tenantContext);
        break;
      case 'page_removed':
        await this.handlePageRemoved(payload, tenantContext);
        break;
      case 'blog_created':
        await this.handleBlogCreated(payload, tenantContext);
        break;
      case 'blog_updated':
        await this.handleBlogUpdated(payload, tenantContext);
        break;
      default:
        console.log(`Unhandled webhook event type: ${eventType}`);
    }
  }

  private async handlePageCreated(payload: ConfluenceWebhookEvent, tenantContext: any): Promise<void> {
    if (!payload.page) return;

    const eventData = {
      eventType: 'ConfluencePageCreated',
      tenantId: tenantContext.tenantId,
      spaceKey: payload.page.space.key,
      pageId: payload.page.id,
      title: payload.page.title,
      content: payload.page.body.storage.value,
      author: {
        accountId: payload.user.accountId,
        displayName: payload.user.displayName,
        email: payload.user.email
      },
      createdAt: payload.page.history.createdDate,
      version: payload.page.version.number,
      url: this.buildPageUrl(tenantContext.baseUrl, payload.page.space.key, payload.page.id),
      permissions: tenantContext.permissions
    };

    await this.eventPublisher.publishEvent('ConfluencePageCreated', eventData);
  }

  private async handlePageUpdated(payload: ConfluenceWebhookEvent, tenantContext: any): Promise<void> {
    if (!payload.page) return;

    const eventData = {
      eventType: 'ConfluencePageUpdated',
      tenantId: tenantContext.tenantId,
      spaceKey: payload.page.space.key,
      pageId: payload.page.id,
      title: payload.page.title,
      content: payload.page.body.storage.value,
      author: {
        accountId: payload.user.accountId,
        displayName: payload.user.displayName,
        email: payload.user.email
      },
      updatedAt: payload.page.version.when,
      version: payload.page.version.number,
      url: this.buildPageUrl(tenantContext.baseUrl, payload.page.space.key, payload.page.id),
      permissions: tenantContext.permissions
    };

    await this.eventPublisher.publishEvent('ConfluencePageUpdated', eventData);
  }

  private async handlePageRemoved(payload: ConfluenceWebhookEvent, tenantContext: any): Promise<void> {
    if (!payload.page) return;

    const eventData = {
      eventType: 'ConfluencePageRemoved',
      tenantId: tenantContext.tenantId,
      spaceKey: payload.page.space.key,
      pageId: payload.page.id,
      title: payload.page.title,
      removedBy: {
        accountId: payload.user.accountId,
        displayName: payload.user.displayName
      },
      removedAt: new Date().toISOString(),
      permissions: tenantContext.permissions
    };

    await this.eventPublisher.publishEvent('ConfluencePageRemoved', eventData);
  }

  private async handleBlogCreated(payload: ConfluenceWebhookEvent, tenantContext: any): Promise<void> {
    if (!payload.blog) return;

    const eventData = {
      eventType: 'ConfluenceBlogCreated',
      tenantId: tenantContext.tenantId,
      blogId: payload.blog.id,
      title: payload.blog.title,
      author: {
        accountId: payload.user.accountId,
        displayName: payload.user.displayName,
        email: payload.user.email
      },
      createdAt: new Date().toISOString(),
      permissions: tenantContext.permissions
    };

    await this.eventPublisher.publishEvent('ConfluenceBlogCreated', eventData);
  }

  private async handleBlogUpdated(payload: ConfluenceWebhookEvent, tenantContext: any): Promise<void> {
    if (!payload.blog) return;

    const eventData = {
      eventType: 'ConfluenceBlogUpdated',
      tenantId: tenantContext.tenantId,
      blogId: payload.blog.id,
      title: payload.blog.title,
      author: {
        accountId: payload.user.accountId,
        displayName: payload.user.displayName,
        email: payload.user.email
      },
      updatedAt: new Date().toISOString(),
      permissions: tenantContext.permissions
    };

    await this.eventPublisher.publishEvent('ConfluenceBlogUpdated', eventData);
  }

  private validateWebhookSignature(body: string, signature: string | undefined): boolean {
    if (!signature || !process.env.CONFLUENCE_WEBHOOK_SECRET) {
      return false;
    }

    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.CONFLUENCE_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    return signature === expectedSignature;
  }

  private buildPageUrl(baseUrl: string, spaceKey: string, pageId: string): string {
    return `${baseUrl}/spaces/${spaceKey}/pages/${pageId}`;
  }
}

export const webhookHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const processor = new WebhookProcessor(
    // DI container will resolve these in production
    {} as EventPublisher,
    {} as TenantService
  );

  return processor.processWebhook(event, context);
};