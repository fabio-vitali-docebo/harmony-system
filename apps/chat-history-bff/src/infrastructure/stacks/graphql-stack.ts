import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  GraphqlApi,
  Schema,
  AuthorizationType,
  FieldLogLevel,
  MappingTemplate,
  DynamoDbDataSource,
  Code,
  FunctionRuntime
} from 'aws-cdk-lib/aws-appsync';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface GraphQLStackProps extends StackProps {
  userPool: UserPool;
  chatThreadsTable: Table;
  messagesTable: Table;
}

export class GraphQLStack extends Stack {
  public readonly api: GraphqlApi;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: GraphQLStackProps) {
    super(scope, id, props);

    this.api = new GraphqlApi(this, 'ChatHistoryGraphQL', {
      name: 'harmony-chat-history-api',
      schema: Schema.fromAsset('src/infrastructure/schemas/chat-schema.graphql'),
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

    this.setupDataSources(props);
    this.setupResolvers();

    this.apiUrl = this.api.graphqlUrl;
  }

  private setupDataSources(props: GraphQLStackProps) {
    // Implementation continues in next step
  }

  private setupResolvers() {
    // Implementation continues in next step
  }
}