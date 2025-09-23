// Jest setup file for Harmony System
import 'reflect-metadata';

// Mock AWS SDK clients for testing
jest.mock('@aws-sdk/client-eventbridge');
jest.mock('@aws-sdk/client-kinesis');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-bedrock');
jest.mock('@aws-sdk/client-cognito-identity-provider');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';

// Increase timeout for integration tests
jest.setTimeout(30000);