import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Queue,
  DeadLetterQueue
} from 'aws-cdk-lib/aws-sqs';
import {
  Function,
  Runtime,
  Code,
  Architecture
} from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  Role,
  ServicePrincipal,
  PolicyStatement
} from 'aws-cdk-lib/aws-iam';

export interface QueueStackProps extends StackProps {
  outputBucket: Bucket;
}

export class QueueStack extends Stack {
  public readonly processingQueue: Queue;
  public readonly dlq: Queue;
  public readonly processorFunction: Function;

  constructor(scope: Construct, id: string, props: QueueStackProps) {
    super(scope, id, props);

    this.dlq = this.createDeadLetterQueue();
    this.processingQueue = this.createProcessingQueue();
    this.processorFunction = this.createProcessorFunction(props);

    this.setupEventSources();
  }

  private createDeadLetterQueue(): Queue {
    return new Queue(this, 'PresentationDLQ', {
      queueName: 'harmony-presentation-dlq',
      retentionPeriod: Duration.days(14),
      deliveryDelay: Duration.seconds(0)
    });
  }

  private createProcessingQueue(): Queue {
    const dlqConfig: DeadLetterQueue = {
      queue: this.dlq,
      maxReceiveCount: 3
    };

    return new Queue(this, 'PresentationProcessingQueue', {
      queueName: 'harmony-presentation-processing',
      visibilityTimeout: Duration.minutes(15),
      messageRetentionPeriod: Duration.days(7),
      deadLetterQueue: dlqConfig,
      deliveryDelay: Duration.seconds(0)
    });
  }

  private createProcessorFunction(props: QueueStackProps): Function {
    const processorRole = new Role(this, 'ProcessorFunctionRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for presentation processor Lambda function'
    });

    processorRole.addToPolicy(new PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: ['*']
    }));

    processorRole.addToPolicy(new PolicyStatement({
      actions: [
        'sqs:ReceiveMessage',
        'sqs:DeleteMessage',
        'sqs:GetQueueAttributes',
        'sqs:SendMessage'
      ],
      resources: [
        this.processingQueue.queueArn,
        this.dlq.queueArn
      ]
    }));

    processorRole.addToPolicy(new PolicyStatement({
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

    processorRole.addToPolicy(new PolicyStatement({
      actions: [
        'bedrock:InvokeAgent',
        'bedrock:InvokeModel',
        'bedrock:Retrieve'
      ],
      resources: ['*']
    }));

    const lambda = new Function(this, 'PresentationProcessor', {
      functionName: 'harmony-presentation-processor',
      runtime: Runtime.NODEJS_18_X,
      architecture: Architecture.ARM_64,
      handler: 'presentation-processor.handler',
      code: Code.fromAsset('src/handlers'),
      timeout: Duration.minutes(15),
      memorySize: 3008,
      role: processorRole,
      environment: {
        OUTPUT_BUCKET: props.outputBucket.bucketName,
        PROCESSING_QUEUE_URL: this.processingQueue.queueUrl,
        DLQ_URL: this.dlq.queueUrl
      },
      reservedConcurrentExecutions: 10
    });

    return lambda;
  }

  private setupEventSources(): void {
    const eventSource = new SqsEventSource(this.processingQueue, {
      batchSize: 1,
      maxBatchingWindow: Duration.seconds(5),
      reportBatchItemFailures: true
    });

    this.processorFunction.addEventSource(eventSource);

    const dlqEventSource = new SqsEventSource(this.dlq, {
      batchSize: 1,
      maxBatchingWindow: Duration.seconds(10)
    });

    const dlqProcessorFunction = new Function(this, 'DLQProcessor', {
      functionName: 'harmony-presentation-dlq-processor',
      runtime: Runtime.NODEJS_18_X,
      architecture: Architecture.ARM_64,
      handler: 'dlq-processor.handler',
      code: Code.fromAsset('src/handlers'),
      timeout: Duration.minutes(5),
      memorySize: 512,
      environment: {
        MAIN_QUEUE_URL: this.processingQueue.queueUrl
      }
    });

    dlqProcessorFunction.addEventSource(dlqEventSource);

    this.processingQueue.grantSendMessages(dlqProcessorFunction);
    this.dlq.grantConsumeMessages(dlqProcessorFunction);
  }
}