// @module-tag core
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { createDocumentClient } from '../../src/repo/client.js';
import {
  CHANGE_PREFIX,
  GSI1,
  OPPORTUNITY_SK,
  isOpportunityItem,
  isStageChangeItem,
  opportunityGsi1,
  opportunityKey,
  opportunityPk,
  stageChangeKey,
  statusPartition,
} from '../../src/repo/keys.js';

describe('keys', () => {
  it('builds the opportunity key', () => {
    expect(opportunityPk('01J')).toBe('OPP#01J');
    expect(opportunityKey('01J')).toEqual({ PK: 'OPP#01J', SK: 'OPP' });
    expect(OPPORTUNITY_SK).toBe('OPP');
  });

  it('builds the GSI1 status keys', () => {
    expect(GSI1).toBe('GSI1');
    expect(statusPartition('OPEN')).toBe('STATUS#OPEN');
    expect(opportunityGsi1('CLOSED', '2026-10-17T12:00:00.000Z', '01J')).toEqual({
      GSI1PK: 'STATUS#CLOSED',
      GSI1SK: '2026-10-17T12:00:00.000Z#01J',
    });
  });

  it('zero-pads stage change sequence numbers to 6 digits', () => {
    expect(CHANGE_PREFIX).toBe('CHANGE#');
    expect(stageChangeKey('01J', 1)).toEqual({ PK: 'OPP#01J', SK: 'CHANGE#000001' });
    expect(stageChangeKey('01J', 123456)).toEqual({ PK: 'OPP#01J', SK: 'CHANGE#123456' });
  });

  it('tells opportunity items from stage change items', () => {
    expect(isOpportunityItem({ SK: 'OPP' })).toBe(true);
    expect(isOpportunityItem({ SK: 'CHANGE#000001' })).toBe(false);
    expect(isStageChangeItem({ SK: 'CHANGE#000001' })).toBe(true);
    expect(isStageChangeItem({ SK: 'OPP' })).toBe(false);
    expect(isStageChangeItem({ SK: 7 })).toBe(false);
    expect(isStageChangeItem({})).toBe(false);
  });
});

describe('createDocumentClient', () => {
  it('points at DynamoDB Local with dummy credentials when an endpoint is set', async () => {
    const client = createDocumentClient({
      tableName: 'T',
      appEnv: 'local',
      region: 'us-east-1',
      dynamoEndpoint: 'http://localhost:8000',
    });

    expect(client).toBeInstanceOf(DynamoDBDocumentClient);
    const endpoint = await client.config.endpoint?.();
    expect(endpoint?.hostname).toBe('localhost');
    expect(endpoint?.port).toBe(8000);
    expect(await client.config.credentials()).toMatchObject({
      accessKeyId: 'local',
      secretAccessKey: 'local',
    });
    expect(await client.config.region()).toBe('us-east-1');
  });

  it('uses the default AWS endpoint and credential chain otherwise', async () => {
    const client = createDocumentClient({ tableName: 'T', appEnv: 'aws', region: 'eu-west-1' });

    expect(client.config.endpoint).toBeUndefined();
    expect(await client.config.region()).toBe('eu-west-1');
  });

  it('drops undefined attributes when writing items', () => {
    const client = createDocumentClient({ tableName: 'T', appEnv: 'aws', region: 'us-east-1' });

    expect(client.config.translateConfig?.marshallOptions).toEqual({ removeUndefinedValues: true });
  });
});
