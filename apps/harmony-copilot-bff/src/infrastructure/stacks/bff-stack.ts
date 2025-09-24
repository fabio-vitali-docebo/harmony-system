import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Bucket,
  BucketEncryption,
  BlockPublicAccess
} from 'aws-cdk-lib/aws-s3';
import {
  BucketDeployment,
  Source
} from 'aws-cdk-lib/aws-s3-deployment';
import {
  GraphqlApi,
  Schema,
  AuthorizationType,
  FieldLogLevel,
  Code,
  FunctionRuntime
} from 'aws-cdk-lib/aws-appsync';
import {
  Function,
  Runtime,
  Architecture
} from 'aws-cdk-lib/aws-lambda';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import {
  Distribution,
  OriginAccessIdentity,
  AllowedMethods,
  ViewerProtocolPolicy
} from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';

export interface BFFStackProps extends StackProps {
  userPool: UserPool;
  agentId: string;
  knowledgeBaseId: string;
}

export class BFFStack extends Stack {
  public readonly api: GraphqlApi;
  public readonly assetsBucket: Bucket;
  public readonly distribution: Distribution;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: BFFStackProps) {
    super(scope, id, props);

    this.assetsBucket = this.createAssetsBucket();
    this.api = this.createGraphQLAPI(props);
    this.distribution = this.createCloudFrontDistribution();

    this.deployFrontendAssets();
    this.setupResolvers(props);

    this.apiUrl = this.api.graphqlUrl;
  }

  private createAssetsBucket(): Bucket {
    return new Bucket(this, 'CopilotAssetsBucket', {
      bucketName: `harmony-copilot-assets-${this.account}-${this.region}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN
    });
  }

  private createGraphQLAPI(props: BFFStackProps): GraphqlApi {
    return new GraphqlApi(this, 'CopilotGraphQLAPI', {
      name: 'harmony-copilot-api',
      schema: Schema.fromAsset('src/infrastructure/schemas/copilot-schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: props.userPool
          }
        },
        additionalAuthorizationModes: [
          {
            authorizationType: AuthorizationType.IAM
          }
        ]
      },
      logConfig: {
        fieldLogLevel: FieldLogLevel.ALL
      },
      xrayEnabled: true
    });
  }

  private createCloudFrontDistribution(): Distribution {
    const originAccessIdentity = new OriginAccessIdentity(this, 'CopilotOAI', {
      comment: 'Origin Access Identity for Harmony Copilot Assets'
    });

    this.assetsBucket.grantRead(originAccessIdentity);

    return new Distribution(this, 'CopilotDistribution', {
      defaultBehavior: {
        origin: new S3Origin(this.assetsBucket, {
          originAccessIdentity
        }),
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true
      },
      additionalBehaviors: {
        '/graphql': {
          origin: new S3Origin(this.assetsBucket),
          allowedMethods: AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY
        }
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html'
        }
      ]
    });
  }

  private deployFrontendAssets(): void {
    new BucketDeployment(this, 'CopilotAssetDeployment', {
      sources: [Source.asset('src/frontend/dist')],
      destinationBucket: this.assetsBucket,
      distribution: this.distribution,
      distributionPaths: ['/*']
    });
  }

  private setupResolvers(props: BFFStackProps): void {
    const conversationLambda = new Function(this, 'ConversationResolver', {
      functionName: 'harmony-copilot-conversation',
      runtime: Runtime.NODEJS_18_X,
      architecture: Architecture.ARM_64,
      handler: 'conversation.handler',
      code: Code.fromAsset('src/handlers'),
      environment: {
        AGENT_ID: props.agentId,
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        GRAPHQL_API_URL: this.api.graphqlUrl
      }
    });

    const knowledgeSearchLambda = new Function(this, 'KnowledgeSearchResolver', {
      functionName: 'harmony-copilot-knowledge-search',
      runtime: Runtime.NODEJS_18_X,
      architecture: Architecture.ARM_64,
      handler: 'knowledge-search.handler',
      code: Code.fromAsset('src/handlers'),
      environment: {
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        GRAPHQL_API_URL: this.api.graphqlUrl
      }
    });

    this.api.addLambdaDataSource('ConversationDataSource', conversationLambda);
    this.api.addLambdaDataSource('KnowledgeSearchDataSource', knowledgeSearchLambda);

    conversationLambda.addToRolePolicy({
      actions: [
        'bedrock:InvokeAgent',
        'bedrock:InvokeModel'
      ],
      resources: ['*']
    } as any);

    knowledgeSearchLambda.addToRolePolicy({
      actions: [
        'bedrock:Retrieve',
        'bedrock:InvokeModel'
      ],
      resources: ['*']
    } as any);
  }
}