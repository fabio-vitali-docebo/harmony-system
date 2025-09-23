import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// T013: Integration test knowledge base search
// This test MUST FAIL initially (TDD requirement)
describe('Knowledge Base Search Integration', () => {
  let bedrockClient: BedrockAgentRuntimeClient;
  let s3Client: S3Client;
  const MOCK_TENANT_ID = 'tenant-test-123';
  const MOCK_USER_ID = 'user-test-456';
  const KNOWLEDGE_BASE_ID = 'harmony-kb-test-id';

  beforeEach(() => {
    bedrockClient = new BedrockAgentRuntimeClient({ region: 'us-east-1' });
    s3Client = new S3Client({ region: 'us-east-1' });
  });

  describe('Bedrock Knowledge Base Search', () => {
    it('should search tenant-specific knowledge base with natural language query', async () => {
      // This test will FAIL until Bedrock Knowledge Base is implemented (T036)
      const searchQuery = 'How to create automated grading rubrics for assignments';

      const retrieveCommand = new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: {
          text: searchQuery,
        },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 10,
            overrideSearchType: 'HYBRID',
          },
        },
        nextToken: undefined,
      });

      // Execute knowledge base search - will fail until KB exists
      const response = await bedrockClient.send(retrieveCommand);

      // Assertions that will fail until knowledge base is implemented
      expect(response.retrievalResults).toBeDefined();
      expect(response.retrievalResults?.length).toBeGreaterThan(0);

      const firstResult = response.retrievalResults?.[0];
      expect(firstResult?.content?.text).toBeDefined();
      expect(firstResult?.location?.s3Location?.uri).toBeDefined();
      expect(firstResult?.score).toBeGreaterThan(0);

      // Verify content relevance to query
      const content = firstResult?.content?.text?.toLowerCase() || '';
      expect(content).toMatch(/(grading|rubric|assignment)/);
    }, 30000);

    it('should enforce tenant isolation in knowledge base search', async () => {
      // This test will FAIL until tenant-partitioned KB is implemented
      const tenant1Query = 'company holiday policy';
      const tenant2Query = 'company holiday policy';

      // Search for same query with different tenant contexts
      const tenant1Search = new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: { text: tenant1Query },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            filter: {
              equals: {
                key: 'tenantId',
                value: 'tenant-1',
              },
            },
          },
        },
      });

      const tenant2Search = new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: { text: tenant2Query },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            filter: {
              equals: {
                key: 'tenantId',
                value: 'tenant-2',
              },
            },
          },
        },
      });

      const [tenant1Results, tenant2Results] = await Promise.all([
        bedrockClient.send(tenant1Search),
        bedrockClient.send(tenant2Search),
      ]);

      // Results should be tenant-specific
      // This will fail until tenant isolation is implemented
      tenant1Results.retrievalResults?.forEach(result => {
        expect(result.location?.s3Location?.uri).toContain('tenant-1');
      });

      tenant2Results.retrievalResults?.forEach(result => {
        expect(result.location?.s3Location?.uri).toContain('tenant-2');
      });

      // Results should be different for different tenants
      expect(tenant1Results.retrievalResults).not.toEqual(tenant2Results.retrievalResults);
    });

    it('should search across multiple content types (product docs, tenant assets)', async () => {
      // This test will FAIL until multi-source KB is implemented
      const productDocsQuery = 'how to configure user roles and permissions';
      const tenantAssetsQuery = 'course syllabus requirements for statistics';

      // Search product documentation
      const productDocsSearch = new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: { text: productDocsQuery },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            filter: {
              equals: {
                key: 'contentType',
                value: 'product-documentation',
              },
            },
          },
        },
      });

      // Search tenant-specific assets
      const tenantAssetsSearch = new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: { text: tenantAssetsQuery },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            filter: {
              andAll: [
                {
                  equals: {
                    key: 'tenantId',
                    value: MOCK_TENANT_ID,
                  },
                },
                {
                  equals: {
                    key: 'contentType',
                    value: 'tenant-assets',
                  },
                },
              ],
            },
          },
        },
      });

      const [productResults, tenantResults] = await Promise.all([
        bedrockClient.send(productDocsSearch),
        bedrockClient.send(tenantAssetsSearch),
      ]);

      // Verify different content types are returned
      // This will fail until multi-source implementation exists
      expect(productResults.retrievalResults?.length).toBeGreaterThan(0);
      expect(tenantResults.retrievalResults?.length).toBeGreaterThan(0);

      const productResult = productResults.retrievalResults?.[0];
      const tenantResult = tenantResults.retrievalResults?.[0];

      expect(productResult?.location?.s3Location?.uri).toContain('product-docs');
      expect(tenantResult?.location?.s3Location?.uri).toContain(MOCK_TENANT_ID);
    });

    it('should generate proper citations from search results', async () => {
      // This test will FAIL until citation generation is implemented (T039)
      const searchQuery = 'assignment deadline extensions policy';

      const retrieveCommand = new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: { text: searchQuery },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 5,
          },
        },
      });

      const response = await bedrockClient.send(retrieveCommand);

      // Process results to generate citations
      // This will fail until CitationService exists
      const citations = await Promise.all(
        response.retrievalResults?.map(async (result) => {
          const s3Uri = result.location?.s3Location?.uri;
          if (!s3Uri) return null;

          // Extract bucket and key from S3 URI
          const match = s3Uri.match(/s3:\/\/([^\/]+)\/(.+)/);
          if (!match) return null;

          const [, bucket, key] = match;

          // Get object metadata for citation details
          const getObjectCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          });

          const objectResponse = await s3Client.send(getObjectCommand);

          return {
            url: `https://${bucket}.s3.amazonaws.com/${key}`,
            title: objectResponse.Metadata?.title || 'Untitled Document',
            excerpt: result.content?.text?.substring(0, 200) || '',
            score: result.score || 0,
            timestamp: objectResponse.LastModified?.toISOString(),
          };
        }) || []
      );

      const validCitations = citations.filter(c => c !== null);

      // Verify citation structure
      // This will fail until citation processing is implemented
      expect(validCitations.length).toBeGreaterThan(0);

      const citation = validCitations[0];
      expect(citation?.url).toMatch(/^https:\/\//);
      expect(citation?.title).toBeDefined();
      expect(citation?.excerpt).toBeDefined();
      expect(citation?.score).toBeGreaterThan(0);
      expect(citation?.timestamp).toBeDefined();
    });

    it('should handle permission-based content filtering', async () => {
      // This test will FAIL until permission filtering is implemented
      const instructorQuery = 'grade book export procedures';
      const learnerQuery = 'grade book export procedures';

      // Search with instructor permissions
      const instructorSearch = new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: { text: instructorQuery },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            filter: {
              andAll: [
                {
                  equals: {
                    key: 'tenantId',
                    value: MOCK_TENANT_ID,
                  },
                },
                {
                  in: {
                    key: 'requiredPermissions',
                    value: ['grade:read', 'grade:export'],
                  },
                },
              ],
            },
          },
        },
      });

      // Search with learner permissions (should have restricted access)
      const learnerSearch = new RetrieveCommand({
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        retrievalQuery: { text: learnerQuery },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            filter: {
              andAll: [
                {
                  equals: {
                    key: 'tenantId',
                    value: MOCK_TENANT_ID,
                  },
                },
                {
                  in: {
                    key: 'requiredPermissions',
                    value: ['course:read'], // Limited permissions
                  },
                },
              ],
            },
          },
        },
      });

      const [instructorResults, learnerResults] = await Promise.all([
        bedrockClient.send(instructorSearch),
        bedrockClient.send(learnerSearch),
      ]);

      // Instructor should get more comprehensive results
      // This will fail until permission filtering is implemented
      expect(instructorResults.retrievalResults?.length)
        .toBeGreaterThan(learnerResults.retrievalResults?.length || 0);

      // Learner results should not contain instructor-only content
      learnerResults.retrievalResults?.forEach(result => {
        const content = result.content?.text?.toLowerCase() || '';
        expect(content).not.toMatch(/(export|admin|instructor-only)/);
      });
    });

    it('should handle semantic search with synonyms and context', async () => {
      // This test will FAIL until semantic search is optimized
      const synonymQueries = [
        'quiz creation steps',
        'assessment building process',
        'test setup procedure',
      ];

      const searchResults = await Promise.all(
        synonymQueries.map(query =>
          bedrockClient.send(new RetrieveCommand({
            knowledgeBaseId: KNOWLEDGE_BASE_ID,
            retrievalQuery: { text: query },
            retrievalConfiguration: {
              vectorSearchConfiguration: {
                numberOfResults: 3,
              },
            },
          }))
        )
      );

      // All queries should return relevant results about quiz/assessment creation
      // This will fail until semantic understanding is implemented
      searchResults.forEach((response, index) => {
        expect(response.retrievalResults?.length).toBeGreaterThan(0);

        const content = response.retrievalResults?.[0]?.content?.text?.toLowerCase() || '';
        expect(content).toMatch(/(quiz|assessment|test|exam)/);
      });

      // Results should have significant overlap due to semantic similarity
      const result1Uris = new Set(
        searchResults[0].retrievalResults?.map(r => r.location?.s3Location?.uri) || []
      );
      const result2Uris = new Set(
        searchResults[1].retrievalResults?.map(r => r.location?.s3Location?.uri) || []
      );

      const overlap = new Set([...result1Uris].filter(uri => result2Uris.has(uri)));
      expect(overlap.size).toBeGreaterThan(0); // Should have semantic overlap
    });
  });
});