import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Agent,
  BedrockFoundationModel,
  ApiSchema,
  ActionGroup
} from '@aws-cdk/aws-bedrock-alpha';
import {
  Role,
  ServicePrincipal,
  PolicyStatement,
  ManagedPolicy
} from 'aws-cdk-lib/aws-iam';
import {
  Function,
  Runtime,
  Code,
  Architecture
} from 'aws-cdk-lib/aws-lambda';
import { Bucket } from 'aws-cdk-lib/aws-s3';

export interface AgentCoreStackProps extends StackProps {
  knowledgeBaseBucket: Bucket;
  agentAssetsBucket: Bucket;
  knowledgeBaseId: string;
}

export class AgentCoreStack extends Stack {
  public readonly agent: Agent;
  public readonly agentId: string;
  public readonly agentAliasId: string;

  constructor(scope: Construct, id: string, props: AgentCoreStackProps) {
    super(scope, id, props);

    const agentRole = this.createAgentRole(props);
    const actionGroupLambda = this.createActionGroupLambda(props);

    this.agent = this.createBedrockAgent(agentRole, actionGroupLambda, props);
    this.agentId = this.agent.agentId;
    this.agentAliasId = this.agent.aliasId!;
  }

  private createAgentRole(props: AgentCoreStackProps): Role {
    const role = new Role(this, 'HarmonyCopilotAgentRole', {
      assumedBy: new ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Role for Harmony Copilot Bedrock Agent',
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess')
      ]
    });

    role.addToPolicy(new PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeAgent',
        'bedrock:Retrieve',
        'bedrock:StartIngestionJob',
        'bedrock:GetIngestionJob',
        'bedrock:ListIngestionJobs'
      ],
      resources: ['*']
    }));

    role.addToPolicy(new PolicyStatement({
      actions: [
        's3:GetObject',
        's3:ListBucket'
      ],
      resources: [
        props.knowledgeBaseBucket.bucketArn,
        `${props.knowledgeBaseBucket.bucketArn}/*`,
        props.agentAssetsBucket.bucketArn,
        `${props.agentAssetsBucket.bucketArn}/*`
      ]
    }));

    role.addToPolicy(new PolicyStatement({
      actions: [
        'lambda:InvokeFunction'
      ],
      resources: ['*']
    }));

    return role;
  }

  private createActionGroupLambda(props: AgentCoreStackProps): Function {
    const lambda = new Function(this, 'AgentActionGroupLambda', {
      functionName: 'harmony-copilot-action-group',
      runtime: Runtime.NODEJS_18_X,
      architecture: Architecture.ARM_64,
      handler: 'agent-actions.handler',
      code: Code.fromAsset('src/handlers'),
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        KNOWLEDGE_BASE_BUCKET: props.knowledgeBaseBucket.bucketName,
        AGENT_ASSETS_BUCKET: props.agentAssetsBucket.bucketName
      }
    });

    props.knowledgeBaseBucket.grantRead(lambda);
    props.agentAssetsBucket.grantReadWrite(lambda);

    lambda.addToRolePolicy(new PolicyStatement({
      actions: [
        'bedrock:Retrieve',
        'bedrock:InvokeModel'
      ],
      resources: ['*']
    }));

    return lambda;
  }

  private createBedrockAgent(
    agentRole: Role,
    actionGroupLambda: Function,
    props: AgentCoreStackProps
  ): Agent {
    const agent = new Agent(this, 'HarmonyCopilotAgent', {
      agentName: 'harmony-copilot-agent',
      description: 'AI assistant for Harmony LMS multi-tenant system providing contextual help and content generation',
      foundationModel: BedrockFoundationModel.ANTHROPIC_CLAUDE_V2_1,
      instruction: `You are Harmony Copilot, an AI assistant integrated into a multi-tenant Learning Management System (LMS).

Your primary responsibilities are:
1. Help users navigate LMS features and answer "how do I?" questions
2. Provide semantic search across LMS product documentation and tenant content
3. Generate citations for all non-trivial answers with links to source content
4. Respect tenant data boundaries and user permissions at all times
5. Assist with content creation while maintaining educational context

Key behavioral guidelines:
- Always provide step-by-step guidance when explaining LMS features
- Include relevant citations with URLs, titles, and timestamps
- Only access content the current user has permission to view
- Maintain context awareness of the user's current LMS page/section
- Be helpful, accurate, and educational in tone
- When uncertain, acknowledge limitations and suggest alternative resources

You have access to:
- LMS product documentation and help articles
- Tenant-specific content (courses, lessons, assessments, media)
- User permission context and role information
- Current page/screen context when available`,
      agentResourceRoleArn: agentRole.roleArn,
      idleSessionTTL: Duration.minutes(30)
    });

    const actionGroup = new ActionGroup(this, 'KnowledgeSearchActionGroup', {
      actionGroupName: 'knowledge-search-actions',
      description: 'Actions for searching knowledge base and generating citations',
      agent: agent,
      actionGroupExecutor: {
        lambda: actionGroupLambda
      },
      actionGroupState: 'ENABLED',
      apiSchema: ApiSchema.fromAsset('src/infrastructure/schemas/agent-actions-schema.json')
    });

    return agent;
  }
}