// @module-tag core
import { describe, expect, it } from 'vitest';
import { loadConfig, loadImportConfig } from '../../src/config.js';

const aws = { APP_ENV: 'aws', TABLE_NAME: 'JobTracker', AWS_REGION: 'us-east-1' };
const local = { ...aws, APP_ENV: 'local', DYNAMO_ENDPOINT: 'http://localhost:8000' };

describe('loadConfig', () => {
  it('reads the AWS configuration without a DynamoDB endpoint', () => {
    expect(loadConfig({ ...aws, DYNAMO_ENDPOINT: 'http://ignored' })).toEqual({
      tableName: 'JobTracker',
      appEnv: 'aws',
      region: 'us-east-1',
    });
  });

  it('reads the local configuration with the DynamoDB Local endpoint', () => {
    expect(loadConfig(local)).toEqual({
      tableName: 'JobTracker',
      appEnv: 'local',
      region: 'us-east-1',
      dynamoEndpoint: 'http://localhost:8000',
    });
  });

  it('trims values', () => {
    expect(loadConfig({ ...aws, TABLE_NAME: ' JobTracker ' }).tableName).toBe('JobTracker');
  });

  it.each(['APP_ENV', 'TABLE_NAME', 'AWS_REGION'])(
    'fails fast when %s is missing or blank',
    (name) => {
      const message = `Missing required environment variable ${name}`;

      expect(() => loadConfig({ ...aws, [name]: undefined })).toThrow(message);
      expect(() => loadConfig({ ...aws, [name]: '  ' })).toThrow(message);
    },
  );

  it('requires DYNAMO_ENDPOINT locally', () => {
    expect(() => loadConfig({ ...local, DYNAMO_ENDPOINT: undefined })).toThrow(
      'Missing required environment variable DYNAMO_ENDPOINT',
    );
  });

  it('rejects an unknown APP_ENV', () => {
    expect(() => loadConfig({ ...aws, APP_ENV: 'prod' })).toThrow(
      'APP_ENV must be "local" or "aws", got "prod"',
    );
  });
});

describe('loadImportConfig', () => {
  it('needs only APP_ENV: the import function has no table', () => {
    expect(loadImportConfig({ APP_ENV: 'aws' })).toEqual({ appEnv: 'aws', allowHosts: [] });
    expect(loadImportConfig({ APP_ENV: 'local' })).toEqual({ appEnv: 'local', allowHosts: [] });
  });

  it('reads the local allowance as trimmed host:port values', () => {
    expect(
      loadImportConfig({
        APP_ENV: 'local',
        IMPORT_ALLOW_LOCAL_HOSTS: ' localhost:5175, 127.0.0.1:5175 ,,',
      }),
    ).toEqual({ appEnv: 'local', allowHosts: ['localhost:5175', '127.0.0.1:5175'] });
  });

  it('ignores the allowance in AWS', () => {
    expect(
      loadImportConfig({ APP_ENV: 'aws', IMPORT_ALLOW_LOCAL_HOSTS: 'localhost:5175' }).allowHosts,
    ).toEqual([]);
  });

  it('fails fast on a missing or unknown APP_ENV', () => {
    expect(() => loadImportConfig({})).toThrow('Missing required environment variable APP_ENV');
    expect(() => loadImportConfig({ APP_ENV: 'prod' })).toThrow(
      'APP_ENV must be "local" or "aws", got "prod"',
    );
  });
});
