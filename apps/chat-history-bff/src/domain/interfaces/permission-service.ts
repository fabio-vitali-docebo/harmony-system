export interface PermissionService {
  canAccessTenant(userId: string, tenantId: string): Promise<boolean>;
  getUserPermissions(userId: string, tenantId: string): Promise<string[]>;
  hasPermission(userId: string, tenantId: string, permission: string): Promise<boolean>;
}