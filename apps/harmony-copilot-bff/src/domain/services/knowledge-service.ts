import { injectable, inject } from 'tsyringe';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  RetrieveCommandInput
} from '@aws-sdk/client-bedrock-agent-runtime';

export interface KnowledgeSearchInput {
  query: string;
  tenantId: string;
  userId: string;
  scope?: 'PRODUCT_DOCS' | 'TENANT_CONTENT' | 'ALL';
  maxResults?: number;
  filters?: SearchFilters;
}

export interface SearchFilters {
  contentTypes?: string[];
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  sources?: string[];
  permissions?: string[];
}

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  url: string;
  relevanceScore: number;
  source: 'PRODUCT_DOCS' | 'TENANT_CONTENT';
  contentType: string;
  lastModified?: Date;
  permissions: string[];
  highlights: string[];
  metadata: SearchResultMetadata;
}

export interface SearchResultMetadata {
  author?: string;
  publishedDate?: Date;
  wordCount?: number;
  language?: string;
  tags?: string[];
  spaceKey?: string;
  courseId?: string;
}

export interface KnowledgeSearchResult {
  query: string;
  results: SearchResult[];
  totalResults: number;
  processingTimeMs: number;
  suggestions?: string[];
}

@injectable()
export class KnowledgeService {
  private bedrockClient: BedrockAgentRuntimeClient;
  private knowledgeBaseId: string;

  constructor() {
    this.bedrockClient = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION
    });
    this.knowledgeBaseId = process.env.KNOWLEDGE_BASE_ID!;
  }

  async searchKnowledge(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult> {
    const startTime = Date.now();

    try {
      const retrieveInput: RetrieveCommandInput = {
        knowledgeBaseId: this.knowledgeBaseId,
        retrievalQuery: {
          text: input.query
        },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: input.maxResults || 10,
            overrideSearchType: 'HYBRID'
          }
        },
        nextToken: undefined
      };

      const command = new RetrieveCommand(retrieveInput);
      const response = await this.bedrockClient.send(command);

      const filteredResults = await this.filterAndProcessResults(
        response.retrievalResults || [],
        input
      );

      const processingTimeMs = Date.now() - startTime;

      return {
        query: input.query,
        results: filteredResults,
        totalResults: filteredResults.length,
        processingTimeMs,
        suggestions: this.generateSearchSuggestions(input.query, filteredResults)
      };

    } catch (error) {
      console.error('Knowledge search error:', error);
      throw new Error(`Knowledge search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async filterAndProcessResults(
    rawResults: any[],
    input: KnowledgeSearchInput
  ): Promise<SearchResult[]> {
    const processedResults: SearchResult[] = [];

    for (const rawResult of rawResults) {
      try {
        const processed = await this.processSearchResult(rawResult, input);
        if (processed && await this.hasPermission(processed, input.userId, input.tenantId)) {
          processedResults.push(processed);
        }
      } catch (error) {
        console.warn('Error processing search result:', error);
      }
    }

    return this.rankAndFilterResults(processedResults, input);
  }

  private async processSearchResult(rawResult: any, input: KnowledgeSearchInput): Promise<SearchResult | null> {
    const content = rawResult.content?.text || '';
    const metadata = rawResult.metadata || {};

    const url = this.constructContentUrl(metadata);

    if (!url) {
      console.warn('Unable to construct URL for search result');
      return null;
    }

    return {
      id: metadata.id || this.generateResultId(content),
      title: metadata.title || this.extractTitleFromContent(content),
      content: this.truncateContent(content, 500),
      url,
      relevanceScore: rawResult.score || 0,
      source: this.determineSource(metadata),
      contentType: metadata.content_type || 'document',
      lastModified: metadata.last_modified ? new Date(metadata.last_modified) : undefined,
      permissions: metadata.permissions || [],
      highlights: this.extractHighlights(content, input.query),
      metadata: {
        author: metadata.author,
        publishedDate: metadata.published_date ? new Date(metadata.published_date) : undefined,
        wordCount: this.countWords(content),
        language: metadata.language || 'en',
        tags: metadata.tags || [],
        spaceKey: metadata.space_key,
        courseId: metadata.course_id
      }
    };
  }

  private constructContentUrl(metadata: any): string | null {
    if (metadata.source_url) {
      return metadata.source_url;
    }

    if (metadata.tenant_id && metadata.content_id) {
      return `/tenant/${metadata.tenant_id}/content/${metadata.content_id}`;
    }

    if (metadata.space_key && metadata.page_id) {
      return `/spaces/${metadata.space_key}/pages/${metadata.page_id}`;
    }

    return null;
  }

  private determineSource(metadata: any): 'PRODUCT_DOCS' | 'TENANT_CONTENT' {
    if (metadata.source === 'product_docs' || metadata.content_type === 'product_documentation') {
      return 'PRODUCT_DOCS';
    }
    return 'TENANT_CONTENT';
  }

  private async hasPermission(result: SearchResult, userId: string, tenantId: string): Promise<boolean> {
    if (result.source === 'PRODUCT_DOCS') {
      return true;
    }

    if (result.metadata.tenant_id && result.metadata.tenant_id !== tenantId) {
      return false;
    }

    return true;
  }

  private rankAndFilterResults(results: SearchResult[], input: KnowledgeSearchInput): SearchResult[] {
    let filtered = results;

    if (input.scope && input.scope !== 'ALL') {
      filtered = filtered.filter(result => result.source === input.scope);
    }

    if (input.filters?.contentTypes?.length) {
      filtered = filtered.filter(result =>
        input.filters!.contentTypes!.includes(result.contentType)
      );
    }

    if (input.filters?.dateRange) {
      filtered = filtered.filter(result => {
        if (!result.lastModified) return true;
        const { startDate, endDate } = input.filters!.dateRange!;
        return result.lastModified >= startDate && result.lastModified <= endDate;
      });
    }

    return filtered
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, input.maxResults || 10);
  }

  private extractHighlights(content: string, query: string): string[] {
    const words = query.toLowerCase().split(/\s+/);
    const highlights: string[] = [];
    const sentences = content.split(/[.!?]+/);

    for (const sentence of sentences) {
      const lowercaseSentence = sentence.toLowerCase();
      if (words.some(word => lowercaseSentence.includes(word))) {
        highlights.push(sentence.trim());
        if (highlights.length >= 3) break;
      }
    }

    return highlights;
  }

  private generateSearchSuggestions(query: string, results: SearchResult[]): string[] {
    const suggestions: Set<string> = new Set();

    results.forEach(result => {
      result.metadata.tags?.forEach(tag => suggestions.add(tag));

      if (result.metadata.courseId) {
        suggestions.add(`course:${result.metadata.courseId}`);
      }

      if (result.metadata.spaceKey) {
        suggestions.add(`space:${result.metadata.spaceKey}`);
      }
    });

    return Array.from(suggestions).slice(0, 5);
  }

  private extractTitleFromContent(content: string): string {
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim();

    if (firstLine && firstLine.length > 0 && firstLine.length < 100) {
      return firstLine;
    }

    return content.substring(0, 50) + (content.length > 50 ? '...' : '');
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }

  private countWords(content: string): number {
    return content.trim().split(/\s+/).length;
  }

  private generateResultId(content: string): string {
    const hash = content.substring(0, 100);
    return `result-${Date.now()}-${hash.length}`;
  }
}