import { KnowledgeService, KnowledgeSearchInput, SearchResult } from '../../src/domain/services/knowledge-service';
import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';

jest.mock('@aws-sdk/client-bedrock-agent-runtime');

describe('KnowledgeService Unit Tests', () => {
  let knowledgeService: KnowledgeService;
  let mockBedrockClient: jest.Mocked<BedrockAgentRuntimeClient>;

  beforeEach(() => {
    mockBedrockClient = new BedrockAgentRuntimeClient({}) as jest.Mocked<BedrockAgentRuntimeClient>;
    knowledgeService = new KnowledgeService();
    (knowledgeService as any).bedrockClient = mockBedrockClient;
    (knowledgeService as any).knowledgeBaseId = 'test-kb-001';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchKnowledge', () => {
    it('should search knowledge base successfully', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            content: { text: 'Test content about LMS features' },
            metadata: {
              id: 'doc-001',
              title: 'LMS Features Guide',
              source_url: 'https://docs.example.com/features',
              content_type: 'product_documentation'
            },
            score: 0.95
          }
        ]
      };

      mockBedrockClient.send = jest.fn().mockResolvedValue(mockResponse);

      const input: KnowledgeSearchInput = {
        query: 'LMS features',
        tenantId: 'tenant-001',
        userId: 'user-001',
        maxResults: 10
      };

      const result = await knowledgeService.searchKnowledge(input);

      expect(result.query).toBe('LMS features');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('LMS Features Guide');
      expect(result.results[0].relevanceScore).toBe(0.95);
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });

    it('should filter results by scope', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            content: { text: 'Product documentation content' },
            metadata: {
              id: 'doc-001',
              source: 'product_docs',
              content_type: 'product_documentation'
            },
            score: 0.9
          },
          {
            content: { text: 'Tenant specific content' },
            metadata: {
              id: 'doc-002',
              source: 'tenant_content',
              tenant_id: 'tenant-001'
            },
            score: 0.8
          }
        ]
      };

      mockBedrockClient.send = jest.fn().mockResolvedValue(mockResponse);

      const input: KnowledgeSearchInput = {
        query: 'test query',
        tenantId: 'tenant-001',
        userId: 'user-001',
        scope: 'PRODUCT_DOCS',
        maxResults: 10
      };

      const result = await knowledgeService.searchKnowledge(input);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].source).toBe('PRODUCT_DOCS');
    });

    it('should handle empty search results', async () => {
      const mockResponse = {
        retrievalResults: []
      };

      mockBedrockClient.send = jest.fn().mockResolvedValue(mockResponse);

      const input: KnowledgeSearchInput = {
        query: 'non-existent topic',
        tenantId: 'tenant-001',
        userId: 'user-001'
      };

      const result = await knowledgeService.searchKnowledge(input);

      expect(result.results).toHaveLength(0);
      expect(result.totalResults).toBe(0);
    });

    it('should enforce tenant isolation', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            content: { text: 'Tenant A content' },
            metadata: {
              id: 'doc-001',
              tenant_id: 'tenant-001'
            },
            score: 0.9
          },
          {
            content: { text: 'Tenant B content' },
            metadata: {
              id: 'doc-002',
              tenant_id: 'tenant-002'
            },
            score: 0.8
          }
        ]
      };

      mockBedrockClient.send = jest.fn().mockResolvedValue(mockResponse);

      const input: KnowledgeSearchInput = {
        query: 'test query',
        tenantId: 'tenant-001',
        userId: 'user-001'
      };

      const result = await knowledgeService.searchKnowledge(input);

      // Should only return results for tenant-001
      expect(result.results).toHaveLength(1);
      expect(result.results[0].metadata.tenant_id).toBe('tenant-001');
    });
  });

  describe('result processing', () => {
    it('should extract highlights from content', () => {
      const content = 'This is a test document about LMS features. The LMS system provides various tools for education.';
      const highlights = (knowledgeService as any).extractHighlights(content, 'LMS features');

      expect(highlights).toContain('This is a test document about LMS features');
      expect(highlights.length).toBeGreaterThan(0);
    });

    it('should generate search suggestions', () => {
      const mockResults: SearchResult[] = [
        {
          id: 'doc-001',
          title: 'Course Management',
          content: 'Content about courses',
          url: 'https://example.com/doc-001',
          relevanceScore: 0.9,
          source: 'PRODUCT_DOCS',
          contentType: 'documentation',
          permissions: [],
          highlights: [],
          metadata: {
            tags: ['courses', 'management'],
            courseId: 'course-123'
          }
        }
      ];

      const suggestions = (knowledgeService as any).generateSearchSuggestions('course', mockResults);

      expect(suggestions).toContain('courses');
      expect(suggestions).toContain('course:course-123');
    });

    it('should construct proper content URLs', () => {
      const metadata = {
        tenant_id: 'tenant-001',
        content_id: 'content-123'
      };

      const url = (knowledgeService as any).constructContentUrl(metadata);

      expect(url).toBe('/tenant/tenant-001/content/content-123');
    });
  });

  describe('error handling', () => {
    it('should handle Bedrock service errors', async () => {
      mockBedrockClient.send = jest.fn().mockRejectedValue(
        new Error('Bedrock service unavailable')
      );

      const input: KnowledgeSearchInput = {
        query: 'test query',
        tenantId: 'tenant-001',
        userId: 'user-001'
      };

      await expect(knowledgeService.searchKnowledge(input)).rejects.toThrow(
        'Knowledge search failed: Bedrock service unavailable'
      );
    });

    it('should handle malformed search results', async () => {
      const mockResponse = {
        retrievalResults: [
          {
            // Missing required fields
            content: null,
            metadata: null
          }
        ]
      };

      mockBedrockClient.send = jest.fn().mockResolvedValue(mockResponse);

      const input: KnowledgeSearchInput = {
        query: 'test query',
        tenantId: 'tenant-001',
        userId: 'user-001'
      };

      const result = await knowledgeService.searchKnowledge(input);

      // Should handle malformed results gracefully
      expect(result.results).toHaveLength(0);
    });
  });

  describe('performance', () => {
    it('should track processing time', async () => {
      const mockResponse = {
        retrievalResults: []
      };

      mockBedrockClient.send = jest.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(mockResponse), 100))
      );

      const input: KnowledgeSearchInput = {
        query: 'test query',
        tenantId: 'tenant-001',
        userId: 'user-001'
      };

      const result = await knowledgeService.searchKnowledge(input);

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(100);
    });

    it('should limit results to maxResults parameter', async () => {
      const mockResponse = {
        retrievalResults: Array.from({ length: 20 }, (_, i) => ({
          content: { text: `Content ${i}` },
          metadata: { id: `doc-${i}` },
          score: 0.9 - i * 0.01
        }))
      };

      mockBedrockClient.send = jest.fn().mockResolvedValue(mockResponse);

      const input: KnowledgeSearchInput = {
        query: 'test query',
        tenantId: 'tenant-001',
        userId: 'user-001',
        maxResults: 5
      };

      const result = await knowledgeService.searchKnowledge(input);

      expect(result.results).toHaveLength(5);
    });
  });
});