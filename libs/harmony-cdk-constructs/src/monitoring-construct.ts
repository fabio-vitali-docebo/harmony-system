import { Construct } from 'constructs';
import { Dashboard, Metric, Alarm, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';

export interface HarmonyMonitoringProps {
  dashboardName: string;
  alertsTopic?: Topic;
}

export class HarmonyMonitoring extends Construct {
  public readonly dashboard: Dashboard;
  public readonly alertsTopic: Topic;

  constructor(scope: Construct, id: string, props: HarmonyMonitoringProps) {
    super(scope, id);

    // SNS topic for alerts
    this.alertsTopic = props.alertsTopic || new Topic(this, 'AlertsTopic', {
      topicName: 'harmony-alerts',
      displayName: 'Harmony System Alerts',
    });

    // CloudWatch Dashboard
    this.dashboard = new Dashboard(this, 'Dashboard', {
      dashboardName: props.dashboardName,
    });
  }

  public addLambdaMonitoring(lambdaFunction: LambdaFunction, functionName: string): void {
    // Duration alarm
    const durationAlarm = new Alarm(this, `${functionName}DurationAlarm`, {
      metric: lambdaFunction.metricDuration(),
      threshold: 30000, // 30 seconds
      evaluationPeriods: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: `${functionName} duration exceeded 30 seconds`,
    });

    durationAlarm.addAlarmAction(new SnsAction(this.alertsTopic));

    // Error rate alarm
    const errorAlarm = new Alarm(this, `${functionName}ErrorAlarm`, {
      metric: lambdaFunction.metricErrors(),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: `${functionName} error rate exceeded threshold`,
    });

    errorAlarm.addAlarmAction(new SnsAction(this.alertsTopic));
  }
}