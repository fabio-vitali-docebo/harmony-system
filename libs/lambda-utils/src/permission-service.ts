import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';

export interface UserPermissions {
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  courseAccess: CourseAccess[];
  lastSynced: Date;
  isActive: boolean;
}

export interface CourseAccess {
  courseId: string;
  role: 'instructor' | 'student' | 'ta' | 'admin';
  permissions: string[];
  enrollmentStatus: 'active' | 'completed' | 'dropped';
}

export interface LMSUser {
  id: string;
  email: string;
  roles: string[];
  courses: {
    id: string;
    role: string;
    permissions: string[];
  }[];
  isActive: boolean;
}

export class PermissionService {
  private dynamoDb: DynamoDBDocument;
  private tableName: string;
  private lmsApiUrl: string;
  private lmsApiKey: string;

  constructor() {
    const client = new DynamoDB({ region: process.env.AWS_REGION });
    this.dynamoDb = DynamoDBDocument.from(client);
    this.tableName = process.env.USER_PERMISSIONS_TABLE || 'harmony-user-permissions';
    this.lmsApiUrl = process.env.LMS_API_URL || '';
    this.lmsApiKey = process.env.LMS_API_KEY || '';
  }

  async getUserPermissions(userId: string, tenantId: string): Promise<UserPermissions | null> {
    try {
      const result = await this.dynamoDb.get({
        TableName: this.tableName,
        Key: { userId, tenantId }
      });

      if (!result.Item) {
        return await this.syncUserPermissionsFromLMS(userId, tenantId);
      }

      const permissions = result.Item as UserPermissions;

      if (this.needsSync(permissions)) {
        return await this.syncUserPermissionsFromLMS(userId, tenantId);
      }

      return permissions;

    } catch (error) {
      console.error('Error getting user permissions:', error);
      return null;
    }
  }

  async syncUserPermissionsFromLMS(userId: string, tenantId: string): Promise<UserPermissions | null> {
    try {
      const lmsUser = await this.fetchUserFromLMS(userId, tenantId);

      if (!lmsUser) {
        console.warn(`User ${userId} not found in LMS for tenant ${tenantId}`);
        return null;
      }

      const permissions: UserPermissions = {
        userId,
        tenantId,
        roles: lmsUser.roles,
        permissions: this.derivePermissionsFromRoles(lmsUser.roles),
        courseAccess: lmsUser.courses.map(course => ({
          courseId: course.id,
          role: course.role as CourseAccess['role'],
          permissions: course.permissions,
          enrollmentStatus: 'active'
        })),
        lastSynced: new Date(),
        isActive: lmsUser.isActive
      };

      await this.saveUserPermissions(permissions);
      return permissions;

    } catch (error) {
      console.error('Error syncing user permissions from LMS:', error);
      return null;
    }
  }

  async hasPermission(userId: string, tenantId: string, permission: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, tenantId);

    if (!userPermissions || !userPermissions.isActive) {
      return false;
    }

    return userPermissions.permissions.includes(permission);
  }

  async hasCourseAccess(userId: string, tenantId: string, courseId: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, tenantId);

    if (!userPermissions || !userPermissions.isActive) {
      return false;
    }

    return userPermissions.courseAccess.some(
      access => access.courseId === courseId && access.enrollmentStatus === 'active'
    );
  }

  async getUserRole(userId: string, tenantId: string, courseId?: string): Promise<string | null> {
    const userPermissions = await this.getUserPermissions(userId, tenantId);

    if (!userPermissions || !userPermissions.isActive) {
      return null;
    }

    if (courseId) {
      const courseAccess = userPermissions.courseAccess.find(
        access => access.courseId === courseId
      );
      return courseAccess?.role || null;
    }

    return userPermissions.roles[0] || null;
  }

  async canAccessTenant(userId: string, tenantId: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId, tenantId);
    return userPermissions !== null && userPermissions.isActive;
  }

  private async fetchUserFromLMS(userId: string, tenantId: string): Promise<LMSUser | null> {
    try {
      const response = await fetch(`${this.lmsApiUrl}/tenants/${tenantId}/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${this.lmsApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return null;
      }

      return await response.json() as LMSUser;

    } catch (error) {
      console.error('Error fetching user from LMS:', error);
      return null;
    }
  }

  private derivePermissionsFromRoles(roles: string[]): string[] {
    const permissionMap: Record<string, string[]> = {
      'admin': [
        'read:all',
        'write:all',
        'delete:all',
        'manage:users',
        'manage:courses',
        'manage:settings'
      ],
      'instructor': [
        'read:courses',
        'write:courses',
        'read:students',
        'write:grades',
        'create:assignments',
        'view:analytics'
      ],
      'student': [
        'read:own_courses',
        'submit:assignments',
        'view:grades',
        'participate:discussions'
      ],
      'ta': [
        'read:courses',
        'write:grades',
        'moderate:discussions',
        'assist:students'
      ]
    };

    const permissions = new Set<string>();

    roles.forEach(role => {
      const rolePermissions = permissionMap[role.toLowerCase()] || [];
      rolePermissions.forEach(permission => permissions.add(permission));
    });

    return Array.from(permissions);
  }

  private async saveUserPermissions(permissions: UserPermissions): Promise<void> {
    await this.dynamoDb.put({
      TableName: this.tableName,
      Item: permissions
    });
  }

  private needsSync(permissions: UserPermissions): boolean {
    const syncThreshold = 15 * 60 * 1000; // 15 minutes
    const timeSinceSync = Date.now() - permissions.lastSynced.getTime();
    return timeSinceSync > syncThreshold;
  }

  async invalidateUserPermissions(userId: string, tenantId: string): Promise<void> {
    try {
      await this.dynamoDb.delete({
        TableName: this.tableName,
        Key: { userId, tenantId }
      });
    } catch (error) {
      console.error('Error invalidating user permissions:', error);
    }
  }

  async batchSyncUsers(userIds: string[], tenantId: string): Promise<UserPermissions[]> {
    const results: UserPermissions[] = [];

    for (const userId of userIds) {
      const permissions = await this.syncUserPermissionsFromLMS(userId, tenantId);
      if (permissions) {
        results.push(permissions);
      }
    }

    return results;
  }
}