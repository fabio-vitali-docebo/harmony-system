import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  KnowledgeBase,
  BedrockFoundationModel,
  VectorIndex,
  VectorCollection,
  ChunkingStrategy,
  CfnDataSource
} from '@aws-cdk/aws-bedrock-alpha';
import {
  Bucket,
  BucketEncryption,
  BlockPublicAccess,
  BucketAccessControl
} from 'aws-cdk-lib/aws-s3';
import {
  Role,
  ServicePrincipal,
  PolicyStatement,
  ManagedPolicy
} from 'aws-cdk-lib/aws-iam';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';

export interface KnowledgeBaseStackProps extends StackProps {
  tenantId?: string;
}

export class KnowledgeBaseStack extends Stack {
  public readonly knowledgeBase: KnowledgeBase;
  public readonly knowledgeBaseBucket: Bucket;
  public readonly knowledgeBaseId: string;
  public readonly vectorCollection: VectorCollection;

  constructor(scope: Construct, id: string, props?: KnowledgeBaseStackProps) {
    super(scope, id, props);

    this.knowledgeBaseBucket = this.createKnowledgeBaseBucket();
    this.vectorCollection = this.createVectorCollection();

    const knowledgeBaseRole = this.createKnowledgeBaseRole();

    this.knowledgeBase = this.createKnowledgeBase(knowledgeBaseRole);
    this.knowledgeBaseId = this.knowledgeBase.knowledgeBaseId;

    this.createDataSources();
  }

  private createKnowledgeBaseBucket(): Bucket {
    return new Bucket(this, 'HarmonyKnowledgeBaseBucket', {
      bucketName: `harmony-knowledge-base-${this.account}-${this.region}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      accessControl: BucketAccessControl.PRIVATE,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN
    });
  }

  private createVectorCollection(): VectorCollection {
    return new VectorCollection(this, 'HarmonyVectorCollection', {
      collectionName: 'harmony-knowledge-vectors',
      description: 'Vector collection for Harmony LMS knowledge base with tenant isolation'
    });
  }

  private createKnowledgeBaseRole(): Role {
    const role = new Role(this, 'HarmonyKnowledgeBaseRole', {
      assumedBy: new ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Role for Harmony Knowledge Base operations',
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess')
      ]
    });

    role.addToPolicy(new PolicyStatement({
      actions: [
        's3:GetObject',
        's3:ListBucket',
        's3:GetBucketLocation'
      ],
      resources: [
        this.knowledgeBaseBucket.bucketArn,
        `${this.knowledgeBaseBucket.bucketArn}/*`
      ]
    }));

    role.addToPolicy(new PolicyStatement({
      actions: [
        'aoss:APIAccessAll',
        'aoss:DashboardsAccessAll'
      ],
      resources: [
        this.vectorCollection.collectionArn
      ]
    }));

    role.addToPolicy(new PolicyStatement({
      actions: [
        'bedrock:InvokeModel'
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1`
      ]
    }));

    return role;
  }

  private createKnowledgeBase(role: Role): KnowledgeBase {
    return new KnowledgeBase(this, 'HarmonyKnowledgeBase', {
      name: 'harmony-lms-knowledge-base',
      description: 'Multi-tenant knowledge base for Harmony LMS system with product docs and tenant content',
      roleArn: role.roleArn,
      embeddingModel: BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
      vectorIndex: new VectorIndex({
        vectorField: 'harmony_vector',
        textField: 'harmony_text',
        metadataField: 'harmony_metadata'
      }),
      vectorStore: this.vectorCollection,
      instruction: `This knowledge base contains multi-tenant LMS content with strict data isolation.

Content Types:
1. LMS Product Documentation - Available to all tenants
2. Tenant-Specific Content - Isolated per tenant with access controls
3. User-Generated Content - Subject to user permission validation

Search Guidelines:
- Always respect tenant boundaries in search results
- Filter results based on user permissions
- Prioritize content relevance while maintaining security
- Include proper citation metadata for all results

Metadata Structure:
- tenant_id: Tenant identifier for data isolation
- content_type: Type of content (product_docs, course, lesson, assessment, etc.)
- permissions: Required permissions to access content
- last_modified: Content modification timestamp
- author: Content creator information
- source_url: Original content location`
    });
  }

  private createDataSources(): void {
    const productDocsDataSource = new CfnDataSource(this, 'ProductDocsDataSource', {
      knowledgeBaseId: this.knowledgeBase.knowledgeBaseId,
      name: 'harmony-product-documentation',
      description: 'LMS product documentation available to all tenants',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: this.knowledgeBaseBucket.bucketArn,
          inclusionPrefixes: ['product-docs/']
        }
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: ChunkingStrategy.FIXED_SIZE,
          fixedSizeChunkingConfiguration: {
            maxTokens: 512,
            overlapPercentage: 20
          }
        }
      }
    });

    const tenantContentDataSource = new CfnDataSource(this, 'TenantContentDataSource', {
      knowledgeBaseId: this.knowledgeBase.knowledgeBaseId,
      name: 'harmony-tenant-content',
      description: 'Tenant-specific content with access controls',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: this.knowledgeBaseBucket.bucketArn,
          inclusionPrefixes: ['tenant-content/']
        }
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: ChunkingStrategy.SEMANTIC,
          semanticChunkingConfiguration: {
            maxTokens: 300,
            bufferSize: 0,
            breakpointPercentileThreshold: 95
          }
        }
      }
    });

    productDocsDataSource.addDependsOn(this.knowledgeBase.node.defaultChild as any);
    tenantContentDataSource.addDependsOn(this.knowledgeBase.node.defaultChild as any);
  }
}