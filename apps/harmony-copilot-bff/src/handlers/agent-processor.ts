import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { injectable, inject } from 'tsyringe';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
  InvokeAgentCommandInput
} from '@aws-sdk/client-bedrock-agent-runtime';
import { KnowledgeService } from '../domain/services/knowledge-service';
import { CitationService } from '../domain/services/citation-service';
import { ResponseBuilder } from '@harmony/lambda-utils';

export interface AgentRequest {
  sessionId: string;
  message: string;
  tenantId: string;
  userId: string;
  context?: {
    currentPage?: string;
    userRole?: string;
    permissions?: string[];
  };
}

export interface AgentResponse {
  sessionId: string;
  response: string;
  citations: any[];
  metadata: {
    processingTimeMs: number;
    confidence?: number;
    model: string;
    searchResults?: number;
  };
}

@injectable()
export class AgentProcessor {
  private bedrockClient: BedrockAgentRuntimeClient;
  private agentId: string;
  private agentAliasId: string;

  constructor(
    @inject('KnowledgeService') private knowledgeService: KnowledgeService,
    @inject('CitationService') private citationService: CitationService
  ) {
    this.bedrockClient = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION
    });
    this.agentId = process.env.AGENT_ID!;
    this.agentAliasId = process.env.AGENT_ALIAS_ID || 'TSTALIASID';
  }

  async processAgentRequest(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    try {
      const request = JSON.parse(event.body || '{}') as AgentRequest;

      if (!this.validateRequest(request)) {
        return ResponseBuilder.error(400, 'Invalid request format');
      }

      const startTime = Date.now();

      const agentResponse = await this.invokeAgent(request);

      const processingTimeMs = Date.now() - startTime;

      const response: AgentResponse = {
        sessionId: request.sessionId,
        response: agentResponse.completion,
        citations: agentResponse.citations,
        metadata: {
          processingTimeMs,
          confidence: agentResponse.confidence,
          model: 'claude-v2.1',
          searchResults: agentResponse.searchResultsCount
        }
      };

      return ResponseBuilder.success(response);

    } catch (error) {
      console.error('Agent processing error:', error);
      return ResponseBuilder.error(500, 'Agent processing failed');
    }
  }

  private async invokeAgent(request: AgentRequest): Promise<any> {
    const input: InvokeAgentCommandInput = {
      agentId: this.agentId,
      agentAliasId: this.agentAliasId,
      sessionId: request.sessionId,
      inputText: request.message,
      sessionState: {
        sessionAttributes: {
          tenantId: request.tenantId,
          userId: request.userId,
          userRole: request.context?.userRole || 'user',
          currentPage: request.context?.currentPage || '',
          permissions: JSON.stringify(request.context?.permissions || [])
        }
      },
      enableTrace: true
    };

    const command = new InvokeAgentCommand(input);
    const response = await this.bedrockClient.send(command);

    return this.processAgentResponse(response, request);
  }

  private async processAgentResponse(response: any, request: AgentRequest): Promise<any> {
    let completion = '';
    const citations: any[] = [];
    const traces: any[] = [];
    let searchResultsCount = 0;

    if (response.completion) {
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes));
          completion += chunkData.bytes ? new TextDecoder().decode(chunkData.bytes) : '';
        }

        if (chunk.trace) {
          traces.push(chunk.trace);

          if (chunk.trace.trace?.knowledgeBaseRetrievalTrace) {
            const retrievalTrace = chunk.trace.trace.knowledgeBaseRetrievalTrace;
            searchResultsCount += retrievalTrace.searchResults?.length || 0;

            for (const result of retrievalTrace.searchResults || []) {
              const citation = await this.createCitationFromSearchResult(result, request.tenantId);
              if (citation) {
                citations.push(citation);
              }
            }
          }
        }
      }
    }

    return {
      completion: completion.trim(),
      citations: await this.deduplicateCitations(citations),
      traces,
      searchResultsCount,
      confidence: this.calculateConfidence(traces)
    };
  }

  private async createCitationFromSearchResult(searchResult: any, tenantId: string): Promise<any | null> {
    try {
      const metadata = searchResult.metadata || {};

      const citationInput = {
        contentId: metadata.id || searchResult.id,
        url: metadata.source_url || this.constructUrl(metadata, tenantId),
        title: metadata.title || this.extractTitle(searchResult.content),
        contentType: this.mapContentType(metadata.content_type),
        source: this.determineSource(metadata),
        author: metadata.author,
        publishedDate: metadata.published_date ? new Date(metadata.published_date) : undefined,
        lastModified: metadata.last_modified ? new Date(metadata.last_modified) : undefined,
        metadata: {
          tenantId: metadata.tenant_id,
          spaceKey: metadata.space_key,
          courseId: metadata.course_id,
          permissions: metadata.permissions || []
        }
      };

      return await this.citationService.generateCitation(citationInput);

    } catch (error) {
      console.error('Error creating citation:', error);
      return null;
    }
  }

  private constructUrl(metadata: any, tenantId: string): string {
    if (metadata.source_url) return metadata.source_url;

    if (metadata.space_key && metadata.page_id) {
      return `/spaces/${metadata.space_key}/pages/${metadata.page_id}`;
    }

    if (metadata.course_id && metadata.content_id) {
      return `/tenant/${tenantId}/courses/${metadata.course_id}/content/${metadata.content_id}`;
    }

    return `/content/${metadata.id}`;
  }

  private extractTitle(content: string): string {
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim();

    if (firstLine && firstLine.length < 100) {
      return firstLine;
    }

    return content.substring(0, 50) + '...';
  }

  private mapContentType(contentType: string): 'page' | 'document' | 'lesson' | 'assessment' | 'media' | 'product_doc' {
    const typeMap: Record<string, any> = {
      'confluence_page': 'page',
      'course_lesson': 'lesson',
      'assessment': 'assessment',
      'media_file': 'media',
      'product_documentation': 'product_doc',
      'document': 'document'
    };

    return typeMap[contentType] || 'document';
  }

  private determineSource(metadata: any): 'PRODUCT_DOCS' | 'TENANT_CONTENT' | 'WEB_SEARCH' | 'KNOWLEDGE_BASE' {
    if (metadata.source === 'product_docs') return 'PRODUCT_DOCS';
    if (metadata.source === 'web_search') return 'WEB_SEARCH';
    if (metadata.tenant_id) return 'TENANT_CONTENT';
    return 'KNOWLEDGE_BASE';
  }

  private async deduplicateCitations(citations: any[]): Promise<any[]> {
    const unique = new Map();

    citations.forEach(citation => {
      const key = `${citation.url}-${citation.title}`;
      if (!unique.has(key) || citation.relevanceScore > unique.get(key).relevanceScore) {
        unique.set(key, citation);
      }
    });

    return Array.from(unique.values()).slice(0, 10);
  }

  private calculateConfidence(traces: any[]): number {
    if (!traces.length) return 0.5;

    const searchTraces = traces.filter(t => t.trace?.knowledgeBaseRetrievalTrace);
    if (!searchTraces.length) return 0.7;

    const avgScore = searchTraces.reduce((sum, trace) => {
      const results = trace.trace.knowledgeBaseRetrievalTrace.searchResults || [];
      const scores = results.map((r: any) => r.score || 0);
      return sum + (scores.reduce((a: number, b: number) => a + b, 0) / (scores.length || 1));
    }, 0) / searchTraces.length;

    return Math.min(0.95, Math.max(0.1, avgScore));
  }

  private validateRequest(request: AgentRequest): boolean {
    return !!(
      request.sessionId &&
      request.message &&
      request.tenantId &&
      request.userId
    );
  }
}

export const agentHandler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const processor = new AgentProcessor(
    // DI container will resolve these in production
    {} as KnowledgeService,
    {} as CitationService
  );

  return processor.processAgentRequest(event, context);
};