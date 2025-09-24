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
import { Queue } from 'aws-cdk-lib/aws-sqs';

export interface PresentationAgentStackProps extends StackProps {
  processingQueue: Queue;
  outputBucket: Bucket;
  knowledgeBaseId: string;
}

export class PresentationAgentStack extends Stack {
  public readonly agent: Agent;
  public readonly agentId: string;
  public readonly agentAliasId: string;

  constructor(scope: Construct, id: string, props: PresentationAgentStackProps) {
    super(scope, id, props);

    const agentRole = this.createAgentRole(props);
    const actionGroupLambda = this.createActionGroupLambda(props);

    this.agent = this.createPresentationAgent(agentRole, actionGroupLambda, props);
    this.agentId = this.agent.agentId;
    this.agentAliasId = this.agent.aliasId!;
  }

  private createAgentRole(props: PresentationAgentStackProps): Role {
    const role = new Role(this, 'PresentationAgentRole', {
      assumedBy: new ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Role for Harmony Presentation Builder Bedrock Agent',
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess')
      ]
    });

    role.addToPolicy(new PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeAgent',
        'bedrock:Retrieve'
      ],
      resources: ['*']
    }));

    role.addToPolicy(new PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket'
      ],
      resources: [
        props.outputBucket.bucketArn,
        `${props.outputBucket.bucketArn}/*`
      ]
    }));

    role.addToPolicy(new PolicyStatement({
      actions: [
        'sqs:SendMessage',
        'sqs:ReceiveMessage',
        'sqs:GetQueueAttributes'
      ],
      resources: [props.processingQueue.queueArn]
    }));

    role.addToPolicy(new PolicyStatement({
      actions: [
        'lambda:InvokeFunction'
      ],
      resources: ['*']
    }));

    return role;
  }

  private createActionGroupLambda(props: PresentationAgentStackProps): Function {
    const lambda = new Function(this, 'PresentationActionGroupLambda', {
      functionName: 'harmony-presentation-action-group',
      runtime: Runtime.NODEJS_18_X,
      architecture: Architecture.ARM_64,
      handler: 'presentation-actions.handler',
      code: Code.fromAsset('src/handlers'),
      timeout: Duration.minutes(15),
      memorySize: 2048,
      environment: {
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        PROCESSING_QUEUE_URL: props.processingQueue.queueUrl,
        OUTPUT_BUCKET: props.outputBucket.bucketName
      }
    });

    props.outputBucket.grantReadWrite(lambda);
    props.processingQueue.grantSendMessages(lambda);

    lambda.addToRolePolicy(new PolicyStatement({
      actions: [
        'bedrock:Retrieve',
        'bedrock:InvokeModel'
      ],
      resources: ['*']
    }));

    return lambda;
  }

  private createPresentationAgent(
    agentRole: Role,
    actionGroupLambda: Function,
    props: PresentationAgentStackProps
  ): Agent {
    const agent = new Agent(this, 'HarmonyPresentationAgent', {
      agentName: 'harmony-presentation-builder',
      description: 'AI agent for generating educational presentations from LMS content and external sources',
      foundationModel: BedrockFoundationModel.ANTHROPIC_CLAUDE_V2_1,
      instruction: `You are Harmony Presentation Builder, an AI agent specialized in creating educational presentations for Learning Management Systems.

Your primary responsibilities:
1. Generate comprehensive, visually appealing HTML slide presentations
2. Structure content logically with clear learning objectives
3. Incorporate relevant citations and source materials
4. Create presentations suitable for various educational contexts
5. Support multiple input formats (text, documents, web content, LMS assets)

Content Creation Guidelines:
- Create engaging slide titles and clear section headers
- Break complex topics into digestible slide segments
- Include relevant examples, diagrams, and media when appropriate
- Maintain educational tone suitable for the target audience
- Ensure all content respects tenant permissions and data boundaries

Presentation Structure:
- Title slide with topic and learning objectives
- Introduction/overview slides
- Main content sections with supporting details
- Summary/conclusion slides
- References and citations

Technical Requirements:
- Generate responsive HTML presentations compatible with mobile devices
- Include proper metadata and accessibility features
- Support print-friendly layouts for PDF export
- Maintain consistent styling and branding
- Optimize for various screen sizes and browsers`,
      agentResourceRoleArn: agentRole.roleArn,
      idleSessionTTL: Duration.minutes(30)
    });

    const actionGroup = new ActionGroup(this, 'PresentationActionGroup', {
      actionGroupName: 'presentation-generation-actions',
      description: 'Actions for generating presentations and processing content',
      agent: agent,
      actionGroupExecutor: {
        lambda: actionGroupLambda
      },
      actionGroupState: 'ENABLED',
      apiSchema: ApiSchema.fromAsset('src/infrastructure/schemas/presentation-actions-schema.json')
    });

    return agent;
  }
}