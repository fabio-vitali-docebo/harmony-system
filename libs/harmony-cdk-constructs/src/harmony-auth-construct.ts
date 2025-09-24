import { Construct } from 'constructs';
import { UserPool, UserPoolClient, CfnIdentityPool, StringAttribute } from 'aws-cdk-lib/aws-cognito';
import { Role, FederatedPrincipal, PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

export interface HarmonyAuthProps {
  userPoolName: string;
  enabledMfaSecondFactor?: boolean;
}

export class HarmonyAuth extends Construct {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly identityPool: CfnIdentityPool;

  constructor(scope: Construct, id: string, props: HarmonyAuthProps) {
    super(scope, id);

    // Cognito User Pool for authentication
    this.userPool = new UserPool(this, 'UserPool', {
      userPoolName: props.userPoolName,
      selfSignUpEnabled: false, // Admin manages users for tenants
      standardAttributes: {
        email: {
          required: true,
          mutable: false,
        },
      },
      customAttributes: {
        tenantId: new StringAttribute({ mutable: false }),
        role: new StringAttribute({ mutable: true }),
      },
    });

    // User Pool Client
    this.userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: true, // For LMS token exchange
      },
      generateSecret: false, // For frontend use
    });

    // Identity Pool for AWS resource access
    this.identityPool = new CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });
  }
}