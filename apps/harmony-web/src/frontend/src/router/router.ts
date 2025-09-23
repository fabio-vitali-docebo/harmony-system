// Centralized routing configuration for Harmony web app
export class HarmonyRouter {
  private routes: RouteConfig[] = [
    {
      path: '/',
      component: 'DashboardComponent',
      requiresAuth: true,
      permissions: ['dashboard:read'],
    },
    {
      path: '/chat',
      component: 'ChatComponent',
      requiresAuth: true,
      permissions: ['chat:read'],
    },
    {
      path: '/presentations',
      component: 'PresentationsComponent',
      requiresAuth: true,
      permissions: ['presentation:read'],
    },
    {
      path: '/login',
      component: 'LoginComponent',
      requiresAuth: false,
    },
  ];

  getRoutes(): RouteConfig[] {
    return this.routes;
  }

  canAccess(path: string, userPermissions: string[]): boolean {
    const route = this.routes.find(r => r.path === path);
    if (!route) return false;

    if (!route.requiresAuth) return true;

    return route.permissions?.every(permission =>
      userPermissions.includes(permission)
    ) ?? true;
  }
}

interface RouteConfig {
  path: string;
  component: string;
  requiresAuth: boolean;
  permissions?: string[];
}