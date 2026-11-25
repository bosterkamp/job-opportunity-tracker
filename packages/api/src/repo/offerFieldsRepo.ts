import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { OfferFieldsSchema, type OfferFields } from '@jot/shared';
import { OFFER_FIELDS_SK, SETTINGS_PK } from './keys.js';

// The custom fields every offer shares (feature 013, research §4): one item, replaced whole,
// conditional on its version, so add, rename, reorder and remove are each one write.

export interface OfferFieldsRepo {
  // Empty lists and version 0 before the first field is added.
  get(): Promise<OfferFields>;
  // False if the stored version is no longer `expectedVersion`.
  put(next: OfferFields, expectedVersion: number): Promise<boolean>;
}

export interface OfferFieldsRepoOptions {
  // The settings partition. Only tests set this, so their files don't share one list.
  settingsPk?: string;
}

export function createOfferFieldsRepo(
  client: DynamoDBDocumentClient,
  tableName: string,
  { settingsPk = SETTINGS_PK }: OfferFieldsRepoOptions = {},
): OfferFieldsRepo {
  const Key = { PK: settingsPk, SK: OFFER_FIELDS_SK };
  return {
    async get() {
      const { Item } = await client.send(
        new GetCommand({ TableName: tableName, Key, ConsistentRead: true }),
      );
      return Item ? OfferFieldsSchema.parse(Item) : { fields: [], removed: [], version: 0 };
    },

    async put(next, expectedVersion) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: { ...Key, ...next },
            ...(expectedVersion === 0
              ? { ConditionExpression: 'attribute_not_exists(PK)' }
              : {
                  ConditionExpression: 'version = :expected',
                  ExpressionAttributeValues: { ':expected': expectedVersion },
                }),
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
          return false;
        }
        throw error;
      }
    },
  };
}
