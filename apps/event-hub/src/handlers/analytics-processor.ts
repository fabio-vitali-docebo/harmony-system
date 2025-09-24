import { DynamoDBStreamEvent, DynamoDBRecord, Context } from 'aws-lambda';
import { KinesisClient, PutRecordsCommand } from '@aws-sdk/client-kinesis';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

export interface AnalyticsEvent {
  tenantId: string;
  userId: string;
  eventType: string;
  timestamp: Date;
  properties: Record<string, any>;
  sessionId?: string;
  deviceInfo?: DeviceInfo;
  location?: LocationInfo;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  browser: string;
  version: string;
  isMobile: boolean;
}

export interface LocationInfo {
  country: string;
  region: string;
  city: string;
  timezone: string;
}

export interface AnonymizedAnalyticsEvent {
  anonymizedTenantId: string;
  anonymizedUserId: string;
  eventType: string;
  timestamp: Date;
  aggregatedProperties: Record<string, any>;
  sessionHash?: string;
  deviceCategory: string;
  locationRegion: string;
}

export class AnalyticsProcessor {
  private kinesisClient: KinesisClient;
  private cloudWatchClient: CloudWatchClient;
  private anonymizationSalt: string;

  constructor() {
    this.kinesisClient = new KinesisClient({ region: process.env.AWS_REGION });
    this.cloudWatchClient = new CloudWatchClient({ region: process.env.AWS_REGION });
    this.anonymizationSalt = process.env.ANONYMIZATION_SALT || 'harmony-default-salt';
  }

  async processAnalyticsStream(event: DynamoDBStreamEvent, context: Context): Promise<void> {
    console.log(`Processing ${event.Records.length} analytics events`);

    const analyticsEvents: AnalyticsEvent[] = [];

    for (const record of event.Records) {
      try {
        const analyticsEvent = this.extractAnalyticsEvent(record);
        if (analyticsEvent) {
          analyticsEvents.push(analyticsEvent);
        }
      } catch (error) {
        console.error('Error extracting analytics event:', error);
      }
    }

    if (analyticsEvents.length === 0) {
      return;
    }

    await Promise.all([
      this.processIndividualTenantAnalytics(analyticsEvents),
      this.processCrossTenantAnalytics(analyticsEvents)
    ]);
  }

  private extractAnalyticsEvent(record: DynamoDBRecord): AnalyticsEvent | null {
    if (!record.dynamodb?.NewImage || record.eventName === 'REMOVE') {
      return null;
    }

    const image = record.dynamodb.NewImage;

    try {
      return {
        tenantId: image.tenantId?.S || '',
        userId: image.userId?.S || '',
        eventType: image.eventType?.S || 'unknown',
        timestamp: new Date(image.timestamp?.S || Date.now()),
        properties: image.properties?.M ? this.parseProperties(image.properties.M) : {},
        sessionId: image.sessionId?.S,
        deviceInfo: image.deviceInfo?.M ? this.parseDeviceInfo(image.deviceInfo.M) : undefined,
        location: image.location?.M ? this.parseLocationInfo(image.location.M) : undefined
      };
    } catch (error) {
      console.error('Error parsing analytics event:', error);
      return null;
    }
  }

  private parseProperties(properties: any): Record<string, any> {
    const result: Record<string, any> = {};

    Object.entries(properties).forEach(([key, value]: [string, any]) => {
      if (value.S) result[key] = value.S;
      else if (value.N) result[key] = parseFloat(value.N);
      else if (value.BOOL !== undefined) result[key] = value.BOOL;
    });

    return result;
  }

  private parseDeviceInfo(deviceInfo: any): DeviceInfo {
    return {
      userAgent: deviceInfo.userAgent?.S || '',
      platform: deviceInfo.platform?.S || 'unknown',
      browser: deviceInfo.browser?.S || 'unknown',
      version: deviceInfo.version?.S || 'unknown',
      isMobile: deviceInfo.isMobile?.BOOL || false
    };
  }

  private parseLocationInfo(location: any): LocationInfo {
    return {
      country: location.country?.S || 'unknown',
      region: location.region?.S || 'unknown',
      city: location.city?.S || 'unknown',
      timezone: location.timezone?.S || 'UTC'
    };
  }

  private async processIndividualTenantAnalytics(events: AnalyticsEvent[]): Promise<void> {
    const tenantGroups = this.groupEventsByTenant(events);

    await Promise.all(
      Object.entries(tenantGroups).map(([tenantId, tenantEvents]) =>
        this.publishTenantAnalytics(tenantId, tenantEvents)
      )
    );
  }

  private async processCrossTenantAnalytics(events: AnalyticsEvent[]): Promise<void> {
    const anonymizedEvents = events.map(event => this.anonymizeAnalyticsEvent(event));

    await this.publishAnonymizedAnalytics(anonymizedEvents);
    await this.updateAggregatedMetrics(anonymizedEvents);
  }

  private groupEventsByTenant(events: AnalyticsEvent[]): Record<string, AnalyticsEvent[]> {
    return events.reduce((groups, event) => {
      if (!groups[event.tenantId]) {
        groups[event.tenantId] = [];
      }
      groups[event.tenantId].push(event);
      return groups;
    }, {} as Record<string, AnalyticsEvent[]>);
  }

  private async publishTenantAnalytics(tenantId: string, events: AnalyticsEvent[]): Promise<void> {
    const streamName = `harmony-tenant-analytics-${tenantId}`;

    const records = events.map(event => ({
      Data: JSON.stringify(event),
      PartitionKey: event.userId || event.sessionId || 'anonymous'
    }));

    try {
      await this.kinesisClient.send(new PutRecordsCommand({
        StreamName: streamName,
        Records: records
      }));

      console.log(`Published ${records.length} tenant analytics events for ${tenantId}`);

    } catch (error) {
      console.error(`Error publishing tenant analytics for ${tenantId}:`, error);
    }
  }

  private anonymizeAnalyticsEvent(event: AnalyticsEvent): AnonymizedAnalyticsEvent {
    return {
      anonymizedTenantId: this.hashWithSalt(event.tenantId),
      anonymizedUserId: this.hashWithSalt(event.userId),
      eventType: event.eventType,
      timestamp: event.timestamp,
      aggregatedProperties: this.aggregateProperties(event.properties),
      sessionHash: event.sessionId ? this.hashWithSalt(event.sessionId) : undefined,
      deviceCategory: this.categorizeDevice(event.deviceInfo),
      locationRegion: this.generalizeLocation(event.location)
    };
  }

  private hashWithSalt(value: string): string {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', this.anonymizationSalt)
      .update(value)
      .digest('hex')
      .substring(0, 16);
  }

  private aggregateProperties(properties: Record<string, any>): Record<string, any> {
    const aggregated: Record<string, any> = {};

    Object.entries(properties).forEach(([key, value]) => {
      if (this.isSensitiveProperty(key)) {
        return;
      }

      if (typeof value === 'number') {
        aggregated[key] = this.quantizeNumber(value);
      } else if (typeof value === 'string') {
        aggregated[key] = this.categorizeString(key, value);
      } else {
        aggregated[key] = typeof value;
      }
    });

    return aggregated;
  }

  private isSensitiveProperty(key: string): boolean {
    const sensitiveKeys = [
      'email', 'name', 'firstName', 'lastName', 'phone', 'address',
      'ip', 'userId', 'tenantId', 'sessionId', 'apiKey', 'token'
    ];

    return sensitiveKeys.some(sensitive =>
      key.toLowerCase().includes(sensitive.toLowerCase())
    );
  }

  private quantizeNumber(value: number): string {
    if (value < 10) return '0-9';
    if (value < 100) return '10-99';
    if (value < 1000) return '100-999';
    return '1000+';
  }

  private categorizeString(key: string, value: string): string {
    if (key.toLowerCase().includes('url')) {
      try {
        const url = new URL(value);
        return url.hostname;
      } catch {
        return 'invalid-url';
      }
    }

    if (value.length < 10) return 'short';
    if (value.length < 100) return 'medium';
    return 'long';
  }

  private categorizeDevice(deviceInfo?: DeviceInfo): string {
    if (!deviceInfo) return 'unknown';

    if (deviceInfo.isMobile) {
      return `mobile-${deviceInfo.platform.toLowerCase()}`;
    }

    return `desktop-${deviceInfo.platform.toLowerCase()}`;
  }

  private generalizeLocation(location?: LocationInfo): string {
    if (!location) return 'unknown';

    return `${location.country}-${location.region}`.toLowerCase();
  }

  private async publishAnonymizedAnalytics(events: AnonymizedAnalyticsEvent[]): Promise<void> {
    const streamName = 'harmony-cross-tenant-analytics';

    const records = events.map(event => ({
      Data: JSON.stringify(event),
      PartitionKey: event.anonymizedTenantId
    }));

    try {
      await this.kinesisClient.send(new PutRecordsCommand({
        StreamName: streamName,
        Records: records
      }));

      console.log(`Published ${records.length} anonymized analytics events`);

    } catch (error) {
      console.error('Error publishing anonymized analytics:', error);
    }
  }

  private async updateAggregatedMetrics(events: AnonymizedAnalyticsEvent[]): Promise<void> {
    const eventTypeCounts = this.countEventTypes(events);
    const deviceCategoryCounts = this.countDeviceCategories(events);

    const metricData = [
      ...Object.entries(eventTypeCounts).map(([eventType, count]) => ({
        MetricName: 'EventCount',
        Dimensions: [{ Name: 'EventType', Value: eventType }],
        Value: count,
        Unit: 'Count'
      })),
      ...Object.entries(deviceCategoryCounts).map(([category, count]) => ({
        MetricName: 'DeviceUsage',
        Dimensions: [{ Name: 'DeviceCategory', Value: category }],
        Value: count,
        Unit: 'Count'
      }))
    ];

    try {
      await this.cloudWatchClient.send(new PutMetricDataCommand({
        Namespace: 'Harmony/CrossTenantAnalytics',
        MetricData: metricData
      }));

      console.log(`Updated ${metricData.length} CloudWatch metrics`);

    } catch (error) {
      console.error('Error updating CloudWatch metrics:', error);
    }
  }

  private countEventTypes(events: AnonymizedAnalyticsEvent[]): Record<string, number> {
    return events.reduce((counts, event) => {
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
  }

  private countDeviceCategories(events: AnonymizedAnalyticsEvent[]): Record<string, number> {
    return events.reduce((counts, event) => {
      counts[event.deviceCategory] = (counts[event.deviceCategory] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
  }
}

export const analyticsStreamHandler = async (
  event: DynamoDBStreamEvent,
  context: Context
): Promise<void> => {
  const processor = new AnalyticsProcessor();
  await processor.processAnalyticsStream(event, context);
};