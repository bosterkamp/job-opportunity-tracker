import {
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  INTERVIEW_MESSAGES,
  InterviewSchema,
  MAX_INTERVIEWS,
  OpportunitySchema,
  StageChangeSchema,
  statusForStage,
  type Interview,
  type Opportunity,
  type OpportunityInput,
  type OpportunityPatch,
  type OpportunityStatus,
  type OpportunityWithHistory,
  type Stage,
  type StageChange,
  type Via,
} from '@jot/shared';
import { ApiError } from '../http.js';
import {
  GSI1,
  gsi1SortKey,
  interviewKey,
  isInterviewItem,
  isOpportunityItem,
  isStageChangeItem,
  opportunityGsi1,
  opportunityKey,
  opportunityPk,
  stageChangeKey,
  statusPartition,
} from './keys.js';
import { MAX_TRANSACTION_ITEMS, isConditionFailure, pagedQuery } from './query.js';

export interface OpportunityRepo {
  // `via` marks the first history entry when it was added through Claude (feature 003).
  create(
    input: OpportunityInput,
    meta: { id: string; now: string; via?: Via },
  ): Promise<OpportunityWithHistory>;
  getWithHistory(id: string): Promise<OpportunityWithHistory | undefined>;
  // Newest stage change first, without history.
  listByStatus(status: OpportunityStatus): Promise<Opportunity[]>;
  // Writes the new stage and its history entry together. Throws CONFLICT if the
  // opportunity's changeCount is no longer `expectedChangeCount`.
  changeStage(id: string, change: StageChangeWrite): Promise<void>;
  // Sets the given detail fields (null removes one). Undefined if there's no such opportunity.
  // Through Claude, it also records when; an edit in the web app clears that.
  updateDetails(
    id: string,
    patch: OpportunityPatch,
    now: string,
    via?: Via,
  ): Promise<Opportunity | undefined>;
  // Moves the date added and the first history entry together (feature 004). Throws CONFLICT
  // if the opportunity's changeCount is no longer `expectedChangeCount`.
  changeDateAdded(id: string, change: DateAddedWrite): Promise<void>;
  // Logs an interview and raises the count in one transaction (feature 005). Throws the
  // limit's VALIDATION_ERROR when the opportunity already has the most it can have.
  addInterview(id: string, interview: Interview, now: string): Promise<void>;
  // Changes an interview's date or note (null clears the note). Through Claude it's marked;
  // a web edit removes the mark. False if there's no such interview.
  updateInterview(
    id: string,
    interviewId: string,
    fields: { heldAt?: string; note?: string | null },
    via?: Via,
  ): Promise<boolean>;
  // Removes an interview and lowers the count in one transaction. False if there's no such
  // interview.
  removeInterview(id: string, interviewId: string, now: string): Promise<boolean>;
  // Removes the opportunity and its whole history. False if there was nothing to delete.
  deletePermanently(id: string): Promise<boolean>;
}

export interface DateAddedWrite {
  // A UTC timestamp, already checked against the rules (dateAddedProblem).
  createdAt: string;
  expectedChangeCount: number;
  now: string;
}

export interface StageChangeWrite {
  expectedChangeCount: number;
  fromStage: Stage;
  toStage: Stage;
  status: OpportunityStatus;
  changedAt: string;
  lastStageChangeAt: string;
  note: string | null;
  // When the change is recorded (updatedAt and recordedAt).
  now: string;
  // Set when the change was made through Claude.
  via?: Via;
}

export const CONFLICT_MESSAGE =
  'This opportunity changed since you loaded it. Reload and try again.';

export interface RepoOptions {
  // Items per Query page. Only tests set this, to exercise pagination.
  pageSize?: number;
}

// Oldest first by date; interviews on the same date by when they were recorded.
export function sortInterviews(interviews: Interview[]): Interview[] {
  return [...interviews].sort(
    (a, b) => a.heldAt.localeCompare(b.heldAt) || a.recordedAt.localeCompare(b.recordedAt),
  );
}

// Oldest first by date; entries on the same date keep the order they were recorded in.
export function sortHistory(history: StageChange[]): StageChange[] {
  return [...history].sort((a, b) => a.changedAt.localeCompare(b.changedAt) || a.seq - b.seq);
}

export function createOpportunityRepo(
  client: DynamoDBDocumentClient,
  tableName: string,
  { pageSize }: RepoOptions = {},
): OpportunityRepo {
  const queryAll = pagedQuery(client, tableName, pageSize);

  return {
    // Access pattern A4: the opportunity and its first history entry are written together.
    // An earlier date added dates both; when they were really written stays `now`.
    async create(input, { id, now, via }) {
      const stage = 'CONSIDERING' as const;
      const status = statusForStage(stage);
      const added = input.createdAt ?? now;
      const opportunity: Opportunity = {
        ...input,
        id,
        stage,
        status,
        createdAt: added,
        updatedAt: now,
        lastStageChangeAt: added,
        changeCount: 1,
      };
      const firstChange: StageChange = {
        seq: 1,
        fromStage: null,
        toStage: stage,
        changedAt: added,
        note: null,
        recordedAt: now,
        ...(via && { via }),
      };

      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: {
                  ...opportunityKey(id),
                  ...opportunityGsi1(status, added, id),
                  ...opportunity,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: tableName,
                Item: { ...stageChangeKey(id, 1), ...firstChange },
              },
            },
          ],
        }),
      );

      return { ...opportunity, history: [firstChange], interviews: [] };
    },

    // Access pattern A3: one Query returns the OPP item and every CHANGE# item.
    async getWithHistory(id) {
      const items = await queryAll({
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': opportunityPk(id) },
      });
      const opportunityItem = items.find(isOpportunityItem);
      if (!opportunityItem) {
        return undefined;
      }
      const history = items.filter(isStageChangeItem).map((item) => StageChangeSchema.parse(item));
      const interviews = items.filter(isInterviewItem).map((item) => InterviewSchema.parse(item));
      return {
        ...OpportunitySchema.parse(opportunityItem),
        history: sortHistory(history),
        interviews: sortInterviews(interviews),
      };
    },

    // Access patterns A1/A2: the overview and the archive.
    async listByStatus(status) {
      const items = await queryAll({
        IndexName: GSI1,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': statusPartition(status) },
        ScanIndexForward: false,
      });
      return items.map((item) => OpportunitySchema.parse(item));
    },

    // Access pattern A5: update the OPP item and add CHANGE#<n+1> in one transaction. The
    // changeCount condition is optimistic locking: if anything changed the opportunity since it
    // was read (another device, a double tap), nothing is written.
    async changeStage(id, change) {
      const seq = change.expectedChangeCount + 1;
      const gsi1 = opportunityGsi1(change.status, change.lastStageChangeAt, id);
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: opportunityKey(id),
                  UpdateExpression:
                    'SET stage = :stage, #status = :status, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk, ' +
                    'lastStageChangeAt = :last, updatedAt = :now, changeCount = :seq',
                  ConditionExpression: 'changeCount = :expected',
                  // "status" is a DynamoDB reserved word.
                  ExpressionAttributeNames: { '#status': 'status' },
                  ExpressionAttributeValues: {
                    ':stage': change.toStage,
                    ':status': change.status,
                    ':gsi1pk': gsi1.GSI1PK,
                    ':gsi1sk': gsi1.GSI1SK,
                    ':last': change.lastStageChangeAt,
                    ':now': change.now,
                    ':seq': seq,
                    ':expected': change.expectedChangeCount,
                  },
                },
              },
              {
                Put: {
                  TableName: tableName,
                  Item: {
                    ...stageChangeKey(id, seq),
                    seq,
                    fromStage: change.fromStage,
                    toStage: change.toStage,
                    changedAt: change.changedAt,
                    note: change.note,
                    recordedAt: change.now,
                    ...(change.via && { via: change.via }),
                  },
                },
              },
            ],
          }),
        );
      } catch (error) {
        if (isConditionFailure(error)) {
          throw new ApiError('CONFLICT', CONFLICT_MESSAGE);
        }
        throw error;
      }
    },

    // Access pattern A6: one UpdateItem on the OPP item. Only detail fields can be in the
    // patch (the schema rejects stage fields), so stage, status, and history never change.
    async updateDetails(id, patch, now, via) {
      // Every field goes through a placeholder name: "location" and "source" are reserved words.
      const names: Record<string, string> = {
        '#updatedAt': 'updatedAt',
        '#viaClaude': 'detailsEditedViaClaudeAt',
      };
      const values: Record<string, unknown> = { ':now': now };
      const sets = ['#updatedAt = :now'];
      const removes: string[] = [];
      // Only the latest edit counts: through Claude it's recorded, in the web app it's cleared.
      if (via === 'CLAUDE') {
        sets.push('#viaClaude = :now');
      } else {
        removes.push('#viaClaude');
      }
      for (const [index, [field, value]] of Object.entries(patch).entries()) {
        names[`#f${index}`] = field;
        if (value === null) {
          removes.push(`#f${index}`);
        } else {
          sets.push(`#f${index} = :v${index}`);
          values[`:v${index}`] = value;
        }
      }
      try {
        const result = await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: opportunityKey(id),
            UpdateExpression:
              `SET ${sets.join(', ')}` +
              (removes.length > 0 ? ` REMOVE ${removes.join(', ')}` : ''),
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ReturnValues: 'ALL_NEW',
          }),
        );
        return OpportunitySchema.parse(result.Attributes);
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
          return undefined;
        }
        throw error;
      }
    },

    // Moving the date added: the OPP item and CHANGE#000001 in one transaction, so the
    // opportunity and its history never disagree. Before the first move, the first entry is the
    // latest change too, so "last change" and the list order (GSI1SK) follow it. The changeCount
    // condition stops a stage move made since the route read the history.
    async changeDateAdded(id, { createdAt, expectedChangeCount, now }) {
      const neverMoved = expectedChangeCount === 1;
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: opportunityKey(id),
                  UpdateExpression:
                    'SET createdAt = :added, updatedAt = :now' +
                    (neverMoved ? ', lastStageChangeAt = :added, GSI1SK = :gsi1sk' : ''),
                  ConditionExpression: 'changeCount = :expected',
                  ExpressionAttributeValues: {
                    ':added': createdAt,
                    ':now': now,
                    ':expected': expectedChangeCount,
                    ...(neverMoved && { ':gsi1sk': gsi1SortKey(createdAt, id) }),
                  },
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: stageChangeKey(id, 1),
                  UpdateExpression: 'SET changedAt = :added',
                  ConditionExpression: 'attribute_exists(PK)',
                  ExpressionAttributeValues: { ':added': createdAt },
                },
              },
            ],
          }),
        );
      } catch (error) {
        if (isConditionFailure(error)) {
          throw new ApiError('CONFLICT', CONFLICT_MESSAGE);
        }
        throw error;
      }
    },

    // Feature 005. The count is kept with the items in one transaction, so it never drifts,
    // and the condition holds the limit even when two adds race.
    async addInterview(id, interview, now) {
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: tableName,
                  Item: { ...interviewKey(id, interview.id), ...interview },
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: opportunityKey(id),
                  UpdateExpression:
                    'SET interviewCount = if_not_exists(interviewCount, :zero) + :one, ' +
                    'updatedAt = :now',
                  ConditionExpression:
                    'attribute_exists(PK) AND ' +
                    '(attribute_not_exists(interviewCount) OR interviewCount < :max)',
                  ExpressionAttributeValues: {
                    ':zero': 0,
                    ':one': 1,
                    ':max': MAX_INTERVIEWS,
                    ':now': now,
                  },
                },
              },
            ],
          }),
        );
      } catch (error) {
        // The route checked the opportunity exists, so a failed condition is the limit.
        if (isConditionFailure(error)) {
          throw new ApiError('VALIDATION_ERROR', INTERVIEW_MESSAGES.LIMIT);
        }
        throw error;
      }
    },

    async updateInterview(id, interviewId, fields, via) {
      const names: Record<string, string> = { '#via': 'via' };
      const values: Record<string, unknown> = {};
      const sets: string[] = [];
      for (const [field, value] of Object.entries(fields)) {
        names[`#${field}`] = field;
        values[`:${field}`] = value;
        sets.push(`#${field} = :${field}`);
      }
      if (via === 'CLAUDE') {
        values[':via'] = via;
        sets.push('#via = :via');
      }
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: interviewKey(id, interviewId),
            UpdateExpression:
              (sets.length > 0 ? `SET ${sets.join(', ')} ` : '') +
              (via === 'CLAUDE' ? '' : 'REMOVE #via'),
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: names,
            ...(Object.keys(values).length > 0 && { ExpressionAttributeValues: values }),
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

    async removeInterview(id, interviewId, now) {
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Delete: {
                  TableName: tableName,
                  Key: interviewKey(id, interviewId),
                  ConditionExpression: 'attribute_exists(PK)',
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: opportunityKey(id),
                  UpdateExpression: 'SET interviewCount = interviewCount - :one, updatedAt = :now',
                  ConditionExpression: 'interviewCount > :zero',
                  ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':now': now },
                },
              },
            ],
          }),
        );
        return true;
      } catch (error) {
        if (isConditionFailure(error)) {
          return false;
        }
        throw error;
      }
    },

    // Access pattern A7: find every item in the partition, then delete them in transactions,
    // which either delete all their items or fail loudly (a batch write can silently leave
    // some behind).
    async deletePermanently(id) {
      const keys = await queryAll({
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': opportunityPk(id) },
        ProjectionExpression: 'PK, SK',
      });
      for (let i = 0; i < keys.length; i += MAX_TRANSACTION_ITEMS) {
        await client.send(
          new TransactWriteCommand({
            TransactItems: keys.slice(i, i + MAX_TRANSACTION_ITEMS).map((key) => ({
              Delete: { TableName: tableName, Key: { PK: key.PK, SK: key.SK } },
            })),
          }),
        );
      }
      return keys.length > 0;
    },
  };
}
