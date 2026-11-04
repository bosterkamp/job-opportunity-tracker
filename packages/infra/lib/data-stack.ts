import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

// The single table from data-model.md. packages/api/src/local/table.ts creates the same
// layout in DynamoDB Local; keep the two in step.
export class DataStack extends Stack {
  readonly table: Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.table = new Table(this, 'Table', {
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      // Job search history must survive a stack deletion (Constitution Principle II).
      removalPolicy: RemovalPolicy.RETAIN,
      // Only the MCP change counters set it (feature 003); DynamoDB deletes them after an hour.
      timeToLiveAttribute: 'expiresAt',
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
  }
}
