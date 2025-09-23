import { Construct } from 'constructs';
import { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

export interface TenantIsolationProps {
  tenantPrefix: string;
  enforceDataResidency?: boolean;
}

export class TenantIsolation extends Construct {
  public readonly tenantPolicyStatement: PolicyStatement;

  constructor(scope: Construct, id: string, props: TenantIsolationProps) {
    super(scope, id);

    // Policy statement for tenant data isolation
    this.tenantPolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
      ],
      resources: [
        `arn:aws:s3:::${props.tenantPrefix}-*`,
        `arn:aws:dynamodb:*:*:table/${props.tenantPrefix}-*`,
      ],
      conditions: {
        StringEquals: {
          'aws:RequestedRegion': props.enforceDataResidency ? ['us-east-1'] : undefined,
        },
      },
    });
  }

  public addTenantIsolationToFunction(lambdaFunction: LambdaFunction): void {
    lambdaFunction.addToRolePolicy(this.tenantPolicyStatement);

    // Add tenant validation environment variable
    lambdaFunction.addEnvironment('ENFORCE_TENANT_ISOLATION', 'true');
    lambdaFunction.addEnvironment('TENANT_PREFIX', this.node.tryGetContext('tenantPrefix') || 'tenant');
  }
}