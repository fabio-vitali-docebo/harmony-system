#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { EventHubStack } from './stacks/event-hub-stack';

const app = new App();

new EventHubStack(app, 'HarmonyEventHubStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    Project: 'Harmony',
    Service: 'EventHub',
    Environment: process.env.ENVIRONMENT || 'dev',
  },
});