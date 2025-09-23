import { MetricUnits, Metrics } from '@aws-lambda-powertools/metrics';

export class MetricsHelper {
  private static metrics = new Metrics({
    namespace: 'Harmony',
    serviceName: process.env.SERVICE_NAME || 'unknown',
  });

  static recordLatency(operation: string, duration: number, tenantId?: string): void {
    const metadata = tenantId ? { tenantId } : {};

    this.metrics.addMetric(operation, MetricUnits.Milliseconds, duration, metadata);
    this.metrics.publishStoredMetrics();
  }

  static incrementCounter(metric: string, value: number = 1, tenantId?: string): void {
    const metadata = tenantId ? { tenantId } : {};

    this.metrics.addMetric(metric, MetricUnits.Count, value, metadata);
    this.metrics.publishStoredMetrics();
  }

  static recordError(errorType: string, tenantId?: string): void {
    const metadata = {
      errorType,
      ...(tenantId && { tenantId }),
    };

    this.metrics.addMetric('ErrorCount', MetricUnits.Count, 1, metadata);
    this.metrics.publishStoredMetrics();
  }

  static recordUserAction(action: string, tenantId: string, userId: string): void {
    const metadata = { action, tenantId, userId };

    this.metrics.addMetric('UserAction', MetricUnits.Count, 1, metadata);
    this.metrics.publishStoredMetrics();
  }

  static startTimer(): () => number {
    const startTime = Date.now();
    return (): number => Date.now() - startTime;
  }

  static async measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    tenantId?: string
  ): Promise<T> {
    const timer = this.startTimer();

    try {
      const result = await fn();
      this.recordLatency(operation, timer(), tenantId);
      return result;
    } catch (error) {
      this.recordLatency(operation, timer(), tenantId);
      this.recordError(operation + 'Error', tenantId);
      throw error;
    }
  }

  static addCustomMetric(name: string, value: number, unit: MetricUnits, metadata?: Record<string, string>): void {
    this.metrics.addMetric(name, unit, value, metadata);
    this.metrics.publishStoredMetrics();
  }
}