import { Stack, type StackProps } from 'aws-cdk-lib';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import type { Construct } from 'constructs';

export interface BudgetStackProps extends StackProps {
  email: string;
  monthlyLimitUsd?: number;
}

export const DEFAULT_MONTHLY_LIMIT_USD = 5;
export const ALERT_THRESHOLD_PERCENT = 80;

// A guard against surprise bills in a learning account (research.md, "Cost guardrails").
export class BudgetStack extends Stack {
  constructor(scope: Construct, id: string, props: BudgetStackProps) {
    super(scope, id, props);

    new CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'job-tracker-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.monthlyLimitUsd ?? DEFAULT_MONTHLY_LIMIT_USD, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: ALERT_THRESHOLD_PERCENT,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: props.email }],
        },
      ],
    });
  }
}
