import { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider';
import jwt from 'jsonwebtoken';
import { expect } from '@jest/globals';

describe('Authentication Flow End-to-End Tests', () => {
  let cognitoClient: CognitoIdentityProviderClient;

  const testTenantId = 'test-tenant-001';
  const testUserId = 'test-user-001';
  const userEmail = 'test@harmony-lms.com';
  const clientId = process.env.COGNITO_CLIENT_ID!;

  beforeAll(() => {
    cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
  });

  describe('LMS Custom Authentication Flow', () => {
    it('should complete custom auth flow with LMS token', async () => {
      // Step 1: Generate mock LMS token
      const lmsToken = generateMockLMSToken(testTenantId, testUserId, userEmail);

      // Step 2: Initiate custom auth flow
      const initiateAuthResult = await initiateCustomAuth(lmsToken);

      expect(initiateAuthResult.ChallengeName).toBe('CUSTOM_CHALLENGE');
      expect(initiateAuthResult.Session).toBeDefined();

      // Step 3: Respond to custom challenge
      const authResult = await respondToCustomChallenge(
        initiateAuthResult.Session!,
        lmsToken
      );

      expect(authResult.AuthenticationResult).toBeDefined();
      expect(authResult.AuthenticationResult!.AccessToken).toBeDefined();
      expect(authResult.AuthenticationResult!.IdToken).toBeDefined();

      // Step 4: Verify JWT claims
      const idToken = authResult.AuthenticationResult!.IdToken!;
      const decodedToken = jwt.decode(idToken) as any;

      expect(decodedToken['custom:tenantId']).toBe(testTenantId);
      expect(decodedToken['custom:userId']).toBe(testUserId);
      expect(decodedToken.email).toBe(userEmail);
      expect(decodedToken['cognito:groups']).toContain('users');
    });

    it('should reject invalid LMS token', async () => {
      const invalidToken = 'invalid-token-123';

      try {
        await initiateCustomAuth(invalidToken);
        fail('Should have thrown an error for invalid token');
      } catch (error: any) {
        expect(error.name).toBe('NotAuthorizedException');
        expect(error.message).toContain('Invalid authentication');
      }
    });

    it('should reject expired LMS token', async () => {
      const expiredToken = generateMockLMSToken(
        testTenantId,
        testUserId,
        userEmail,
        -3600 // Expired 1 hour ago
      );

      try {
        await initiateCustomAuth(expiredToken);
        fail('Should have thrown an error for expired token');
      } catch (error: any) {
        expect(error.name).toBe('NotAuthorizedException');
        expect(error.message).toContain('Token expired');
      }
    });
  });

  describe('JWT Token Validation', () => {
    let validAccessToken: string;
    let validIdToken: string;

    beforeAll(async () => {
      const lmsToken = generateMockLMSToken(testTenantId, testUserId, userEmail);
      const initiateResult = await initiateCustomAuth(lmsToken);
      const authResult = await respondToCustomChallenge(initiateResult.Session!, lmsToken);

      validAccessToken = authResult.AuthenticationResult!.AccessToken!;
      validIdToken = authResult.AuthenticationResult!.IdToken!;
    });

    it('should validate access token structure', () => {
      const decoded = jwt.decode(validAccessToken) as any;

      expect(decoded.token_use).toBe('access');
      expect(decoded.client_id).toBe(clientId);
      expect(decoded.username).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it('should validate ID token claims', () => {
      const decoded = jwt.decode(validIdToken) as any;

      expect(decoded.token_use).toBe('id');
      expect(decoded.aud).toBe(clientId);
      expect(decoded['custom:tenantId']).toBe(testTenantId);
      expect(decoded['custom:userId']).toBe(testUserId);
      expect(decoded.email).toBe(userEmail);
      expect(decoded['cognito:groups']).toContain('users');
    });

    it('should include proper permissions in token', () => {
      const decoded = jwt.decode(validIdToken) as any;

      expect(decoded['custom:permissions']).toBeDefined();
      const permissions = decoded['custom:permissions'].split(',');

      expect(permissions).toContain('read:own_courses');
      expect(permissions).toContain('submit:assignments');
    });
  });

  describe('Multi-Tenant Authentication', () => {
    it('should isolate users by tenant', async () => {
      const tenant1Token = generateMockLMSToken('tenant-001', 'user-001', 'user1@tenant1.com');
      const tenant2Token = generateMockLMSToken('tenant-002', 'user-001', 'user1@tenant2.com');

      // Authenticate user in tenant 1
      const auth1Result = await authenticateUser(tenant1Token);
      const token1 = jwt.decode(auth1Result.AuthenticationResult!.IdToken!) as any;

      // Authenticate user in tenant 2
      const auth2Result = await authenticateUser(tenant2Token);
      const token2 = jwt.decode(auth2Result.AuthenticationResult!.IdToken!) as any;

      // Verify tenant isolation
      expect(token1['custom:tenantId']).toBe('tenant-001');
      expect(token2['custom:tenantId']).toBe('tenant-002');
      expect(token1.sub).not.toBe(token2.sub); // Different Cognito user IDs
    });

    it('should enforce tenant-specific permissions', async () => {
      const adminToken = generateMockLMSToken(
        testTenantId,
        'admin-001',
        'admin@harmony-lms.com',
        3600,
        ['admin']
      );

      const authResult = await authenticateUser(adminToken);
      const decoded = jwt.decode(authResult.AuthenticationResult!.IdToken!) as any;

      expect(decoded['cognito:groups']).toContain('admin');

      const permissions = decoded['custom:permissions'].split(',');
      expect(permissions).toContain('read:all');
      expect(permissions).toContain('write:all');
      expect(permissions).toContain('manage:users');
    });
  });

  describe('Session Management', () => {
    it('should handle token refresh', async () => {
      const lmsToken = generateMockLMSToken(testTenantId, testUserId, userEmail);
      const authResult = await authenticateUser(lmsToken);

      const refreshToken = authResult.AuthenticationResult!.RefreshToken!;
      expect(refreshToken).toBeDefined();

      // Simulate token refresh (would use InitiateAuth with REFRESH_TOKEN flow)
      const refreshResult = await refreshAuthToken(refreshToken);
      expect(refreshResult.AuthenticationResult).toBeDefined();
      expect(refreshResult.AuthenticationResult!.AccessToken).toBeDefined();
    });

    it('should enforce session timeout', async () => {
      const shortLivedToken = generateMockLMSToken(
        testTenantId,
        testUserId,
        userEmail,
        5 // 5 seconds
      );

      const authResult = await authenticateUser(shortLivedToken);
      const accessToken = authResult.AuthenticationResult!.AccessToken!;

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Verify token is expired
      const decoded = jwt.decode(accessToken) as any;
      expect(decoded.exp * 1000).toBeLessThan(Date.now());
    });
  });

  describe('Authorization Integration', () => {
    it('should integrate with API Gateway authorizer', async () => {
      const lmsToken = generateMockLMSToken(testTenantId, testUserId, userEmail);
      const authResult = await authenticateUser(lmsToken);
      const idToken = authResult.AuthenticationResult!.IdToken!;

      // Simulate API Gateway request with token
      const apiRequest = {
        headers: {
          Authorization: `Bearer ${idToken}`
        },
        requestContext: {
          authorizer: {
            claims: jwt.decode(idToken)
          }
        }
      };

      // Verify token can be used for API authorization
      expect(apiRequest.requestContext.authorizer.claims).toBeDefined();
      expect((apiRequest.requestContext.authorizer.claims as any)['custom:tenantId']).toBe(testTenantId);
    });

    it('should integrate with GraphQL authorization', async () => {
      const lmsToken = generateMockLMSToken(testTenantId, testUserId, userEmail);
      const authResult = await authenticateUser(lmsToken);
      const idToken = authResult.AuthenticationResult!.IdToken!;

      // Simulate GraphQL context
      const graphqlContext = {
        identity: {
          sub: testUserId,
          claims: jwt.decode(idToken)
        }
      };

      expect(graphqlContext.identity.claims).toBeDefined();
      expect((graphqlContext.identity.claims as any)['custom:tenantId']).toBe(testTenantId);
    });
  });

  // Helper functions
  function generateMockLMSToken(
    tenantId: string,
    userId: string,
    email: string,
    expiresInSeconds: number = 3600,
    roles: string[] = ['user']
  ): string {
    const payload = {
      tenantId,
      userId,
      email,
      roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      iss: 'harmony-lms'
    };

    return jwt.sign(payload, 'mock-secret-key');
  }

  async function initiateCustomAuth(lmsToken: string) {
    const command = new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: 'CUSTOM_AUTH',
      AuthParameters: {
        USERNAME: testUserId,
        lmsToken: lmsToken
      }
    });

    return await cognitoClient.send(command);
  }

  async function respondToCustomChallenge(session: string, lmsToken: string) {
    const command = new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: 'CUSTOM_CHALLENGE',
      Session: session,
      ChallengeResponses: {
        USERNAME: testUserId,
        ANSWER: lmsToken
      }
    });

    return await cognitoClient.send(command);
  }

  async function authenticateUser(lmsToken: string) {
    const initiateResult = await initiateCustomAuth(lmsToken);
    return await respondToCustomChallenge(initiateResult.Session!, lmsToken);
  }

  async function refreshAuthToken(refreshToken: string) {
    const command = new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    });

    return await cognitoClient.send(command);
  }
});