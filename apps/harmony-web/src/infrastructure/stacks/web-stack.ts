import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Distribution, OriginAccessIdentity } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin, HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket } from 'aws-cdk-lib/aws-s3';

export class WebStack extends Stack {
  public readonly distribution: Distribution;
  public readonly assetsBucket: Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 bucket for frontend assets
    this.assetsBucket = new Bucket(this, 'WebAssets', {
      bucketName: `harmony-web-assets-${this.account}`,
      publicReadAccess: false,
    });

    const originAccessIdentity = new OriginAccessIdentity(this, 'OAI', {
      comment: 'Harmony Web Assets Access',
    });

    this.assetsBucket.grantRead(originAccessIdentity);

    // CloudFront distribution with multiple origins
    this.distribution = new Distribution(this, 'WebDistribution', {
      defaultBehavior: {
        origin: new S3Origin(this.assetsBucket, {
          originAccessIdentity,
        }),
      },
      additionalBehaviors: {
        '/api/chat/*': {
          origin: new HttpOrigin('chat-history-bff-api.harmony.local'), // Will be replaced with actual AppSync endpoint
        },
        '/api/copilot/*': {
          origin: new HttpOrigin('harmony-copilot-bff-api.harmony.local'), // Will be replaced with actual AppSync endpoint
        },
        '/graphql': {
          origin: new HttpOrigin('appsync.harmony.local'), // Will be replaced with actual AppSync endpoints
        },
      },
      comment: 'Harmony Multi-Origin Distribution',
    });

    // Export distribution domain for other stacks
    this.exportValue(this.distribution.distributionDomainName, {
      name: 'HarmonyWebDistributionDomain',
    });
  }
}