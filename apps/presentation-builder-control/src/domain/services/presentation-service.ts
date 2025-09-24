import { injectable, inject } from 'tsyringe';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export interface PresentationRequest {
  id: string;
  tenantId: string;
  userId: string;
  topic: string;
  content: ContentInput[];
  requirements: PresentationRequirements;
  createdAt: Date;
  status: PresentationStatus;
}

export interface ContentInput {
  type: 'text' | 'file' | 'url' | 'tenant_asset';
  data: string;
  metadata?: {
    title?: string;
    author?: string;
    priority?: number;
    tags?: string[];
  };
}

export interface PresentationRequirements {
  slideCount?: number;
  audience: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
  duration?: number;
  includeWebContent?: boolean;
  style?: PresentationStyle;
  branding?: BrandingOptions;
}

export interface PresentationStyle {
  theme: 'professional' | 'academic' | 'creative' | 'minimal';
  colorScheme: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'custom';
  fontFamily: 'sans-serif' | 'serif' | 'monospace';
  layout: 'standard' | 'widescreen' | 'square';
}

export interface BrandingOptions {
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  organizationName?: string;
}

export enum PresentationStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface PresentationResult {
  id: string;
  htmlUrl: string;
  pdfUrl?: string;
  thumbnailUrl?: string;
  metadata: PresentationMetadata;
  generatedAt: Date;
}

export interface PresentationMetadata {
  slideCount: number;
  duration: number;
  wordCount: number;
  citationCount: number;
  language: string;
  accessibility: {
    hasAltText: boolean;
    hasHeadings: boolean;
    colorContrast: 'good' | 'fair' | 'poor';
  };
}

@injectable()
export class PresentationService {
  private s3Client: S3Client;
  private sqsClient: SQSClient;
  private outputBucket: string;
  private processingQueueUrl: string;

  constructor() {
    this.s3Client = new S3Client({ region: process.env.AWS_REGION });
    this.sqsClient = new SQSClient({ region: process.env.AWS_REGION });
    this.outputBucket = process.env.OUTPUT_BUCKET!;
    this.processingQueueUrl = process.env.PROCESSING_QUEUE_URL!;
  }

  async createPresentation(
    topic: string,
    content: ContentInput[],
    requirements: PresentationRequirements,
    tenantId: string,
    userId: string
  ): Promise<PresentationRequest> {
    const presentationId = this.generatePresentationId();

    const request: PresentationRequest = {
      id: presentationId,
      tenantId,
      userId,
      topic,
      content,
      requirements: {
        slideCount: requirements.slideCount || this.estimateSlideCount(content),
        audience: requirements.audience,
        duration: requirements.duration || this.estimateDuration(content),
        includeWebContent: requirements.includeWebContent || false,
        style: requirements.style || this.getDefaultStyle(),
        branding: requirements.branding
      },
      createdAt: new Date(),
      status: PresentationStatus.QUEUED
    };

    await this.savePresentationRequest(request);
    await this.queueForProcessing(request);

    return request;
  }

  async getPresentationStatus(presentationId: string, tenantId: string): Promise<PresentationRequest | null> {
    try {
      const key = `presentations/${tenantId}/${presentationId}/request.json`;
      const command = new GetObjectCommand({
        Bucket: this.outputBucket,
        Key: key
      });

      const response = await this.s3Client.send(command);
      const data = await response.Body?.transformToString();

      if (!data) return null;

      return JSON.parse(data) as PresentationRequest;

    } catch (error) {
      console.error('Error getting presentation status:', error);
      return null;
    }
  }

  async updatePresentationStatus(
    presentationId: string,
    tenantId: string,
    status: PresentationStatus,
    metadata?: Partial<PresentationMetadata>
  ): Promise<void> {
    const request = await this.getPresentationStatus(presentationId, tenantId);

    if (!request) {
      throw new Error('Presentation not found');
    }

    request.status = status;

    if (metadata) {
      (request as any).metadata = { ...((request as any).metadata || {}), ...metadata };
    }

    await this.savePresentationRequest(request);
  }

  async getPresentationResult(presentationId: string, tenantId: string): Promise<PresentationResult | null> {
    try {
      const key = `presentations/${tenantId}/${presentationId}/result.json`;
      const command = new GetObjectCommand({
        Bucket: this.outputBucket,
        Key: key
      });

      const response = await this.s3Client.send(command);
      const data = await response.Body?.transformToString();

      if (!data) return null;

      return JSON.parse(data) as PresentationResult;

    } catch (error) {
      console.error('Error getting presentation result:', error);
      return null;
    }
  }

  async savePresentationResult(presentationId: string, tenantId: string, result: PresentationResult): Promise<void> {
    const key = `presentations/${tenantId}/${presentationId}/result.json`;
    const command = new PutObjectCommand({
      Bucket: this.outputBucket,
      Key: key,
      Body: JSON.stringify(result, null, 2),
      ContentType: 'application/json'
    });

    await this.s3Client.send(command);
  }

  async cancelPresentation(presentationId: string, tenantId: string): Promise<boolean> {
    const request = await this.getPresentationStatus(presentationId, tenantId);

    if (!request) {
      return false;
    }

    if (request.status === PresentationStatus.COMPLETED || request.status === PresentationStatus.FAILED) {
      return false;
    }

    await this.updatePresentationStatus(presentationId, tenantId, PresentationStatus.CANCELLED);
    return true;
  }

  private async savePresentationRequest(request: PresentationRequest): Promise<void> {
    const key = `presentations/${request.tenantId}/${request.id}/request.json`;
    const command = new PutObjectCommand({
      Bucket: this.outputBucket,
      Key: key,
      Body: JSON.stringify(request, null, 2),
      ContentType: 'application/json'
    });

    await this.s3Client.send(command);
  }

  private async queueForProcessing(request: PresentationRequest): Promise<void> {
    const message = {
      presentationId: request.id,
      tenantId: request.tenantId,
      userId: request.userId,
      timestamp: new Date().toISOString()
    };

    const command = new SendMessageCommand({
      QueueUrl: this.processingQueueUrl,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        presentationId: {
          StringValue: request.id,
          DataType: 'String'
        },
        tenantId: {
          StringValue: request.tenantId,
          DataType: 'String'
        }
      }
    });

    await this.sqsClient.send(command);
  }

  private generatePresentationId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `pres-${timestamp}-${random}`;
  }

  private estimateSlideCount(content: ContentInput[]): number {
    const totalWords = content.reduce((sum, item) => {
      return sum + (item.data?.split(' ').length || 0);
    }, 0);

    const baseSlides = Math.ceil(totalWords / 150);
    return Math.max(5, Math.min(50, baseSlides + 3));
  }

  private estimateDuration(content: ContentInput[]): number {
    const totalWords = content.reduce((sum, item) => {
      return sum + (item.data?.split(' ').length || 0);
    }, 0);

    return Math.max(5, Math.ceil(totalWords / 125));
  }

  private getDefaultStyle(): PresentationStyle {
    return {
      theme: 'professional',
      colorScheme: 'blue',
      fontFamily: 'sans-serif',
      layout: 'widescreen'
    };
  }

  validatePresentationRequest(request: Partial<PresentationRequest>): string[] {
    const errors: string[] = [];

    if (!request.topic || request.topic.trim().length === 0) {
      errors.push('Topic is required');
    }

    if (!request.content || request.content.length === 0) {
      errors.push('Content is required');
    }

    if (!request.tenantId) {
      errors.push('Tenant ID is required');
    }

    if (!request.userId) {
      errors.push('User ID is required');
    }

    if (request.requirements?.slideCount && (request.requirements.slideCount < 5 || request.requirements.slideCount > 50)) {
      errors.push('Slide count must be between 5 and 50');
    }

    return errors;
  }
}