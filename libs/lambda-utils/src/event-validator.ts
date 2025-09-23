export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
  permissions: string[];
}

export interface HarmonyEvent {
  source: string;
  detailType: string;
  detail: Record<string, unknown>;
  tenantContext?: TenantContext;
}

export class EventValidator {
  static validateTenant(event: HarmonyEvent): boolean {
    // Validate event has tenant context
    if (!event.tenantContext) {
      console.warn('Event missing tenant context', { event });
      return false;
    }

    // Validate required tenant fields
    const { tenantId, userId, role } = event.tenantContext;
    if (!tenantId || !userId || !role) {
      console.warn('Event missing required tenant fields', {
        tenantContext: event.tenantContext
      });
      return false;
    }

    // Validate tenant ID format (should be alphanumeric with hyphens)
    const tenantIdPattern = /^[a-zA-Z0-9-]+$/;
    if (!tenantIdPattern.test(tenantId)) {
      console.warn('Invalid tenant ID format', { tenantId });
      return false;
    }

    return true;
  }

  static extractContext(event: HarmonyEvent): TenantContext {
    if (!this.validateTenant(event)) {
      throw new Error('Invalid tenant context in event');
    }

    return event.tenantContext!;
  }

  static validateEventSource(event: HarmonyEvent, expectedSource: string): boolean {
    return event.source === expectedSource;
  }

  static validateEventType(event: HarmonyEvent, expectedType: string): boolean {
    return event.detailType === expectedType;
  }

  static sanitizeEvent(event: HarmonyEvent): HarmonyEvent {
    // Remove sensitive information from event for logging
    const sanitized = { ...event };

    // Remove potential PII from detail
    if (sanitized.detail) {
      const { password, token, secret, ...safeDetail } = sanitized.detail as any;
      sanitized.detail = safeDetail;
    }

    return sanitized;
  }
}