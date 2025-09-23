import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { HarmonyAuth } from '@harmony/cdk-constructs';

export class AuthStack extends Stack {
  public readonly auth: HarmonyAuth;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create Harmony authentication with multi-tenant support
    this.auth = new HarmonyAuth(this, 'HarmonyAuth', {
      userPoolName: 'harmony-users',
      enabledMfaSecondFactor: false, // Can be enabled per tenant
    });

    // Export authentication resources for other stacks
    this.exportValue(this.auth.userPool.userPoolId, {
      name: 'HarmonyUserPoolId',
    });

    this.exportValue(this.auth.userPoolClient.userPoolClientId, {
      name: 'HarmonyUserPoolClientId',
    });

    this.exportValue(this.auth.identityPool.identityPoolId, {
      name: 'HarmonyIdentityPoolId',
    });
  }
}