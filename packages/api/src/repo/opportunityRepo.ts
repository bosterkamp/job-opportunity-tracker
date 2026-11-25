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
  OfferChangeSchema,
  OpportunitySchema,
  StageChangeSchema,
  statusForStage,
  type Interview,
  type InterviewPatch,
  type Offer,
  type OfferChange,
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
  isOfferChangeItem,
  isOpportunityItem,
  offerChangeKey,
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
  // Changes an interview's fields (null clears one). A new date also changes the
  // opportunity's interview times, in the same transaction (feature 012). Through Claude it's
  // marked; a web edit removes the mark. False if there's no such interview.
  updateInterview(
    id: string,
    interviewId: string,
    fields: InterviewPatch,
    now: string,
    via?: Via,
  ): Promise<boolean>;
  // Removes an interview and lowers the count in one transaction. False if there's no such
  // interview.
  removeInterview(id: string, interviewId: string, now: string): Promise<boolean>;
  // Gives an opportunity stored before feature 012 its interview times, from its interviews
  // as just read. Every interview change calls this first, so the times always exist before
  // any one of them changes, and the first to be written comes from a complete read. Does
  // nothing when they're already there (research §2).
  startInterviewTimes(opportunity: OpportunityWithHistory): Promise<void>;
  // Removes the opportunity and its whole history. False if there was nothing to delete.
  deletePermanently(id: string): Promise<boolean>;
  // Writes the offer and its history entry together (feature 013). Throws CONFLICT if the
  // offer's version is no longer `expectedVersion` (0: there's no offer yet).
  saveOffer(id: string, write: OfferWrite): Promise<void>;
  // Sets scores (null removes one), leaving the others. False if there's no offer.
  setOfferScores(id: string, scores: Record<string, number | null>, now: string): Promise<boolean>;
  // Removes the offer, its scores and its whole history. Throws CONFLICT if the offer changed
  // since it was read.
  removeOffer(id: string, expectedVersion: number, now: string): Promise<void>;
}

export interface OfferWrite {
  offer: Offer;
  // The version read, which is the last history entry's seq; 0 when there's no offer.
  expectedVersion: number;
  entry: OfferChange;
  // Scores for custom fields that have been removed, dropped with this save.
  dropScores: string[];
  now: string;
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

// The item keeps interview times by interview id, so one can change on its own; replies list
// them, sorted (feature 012). They're UTC timestamps, so they sort as strings.
function opportunityFromItem(item: Record<string, unknown>): Opportunity {
  const { interviewTimes, ...rest } = item;
  return OpportunitySchema.parse(
    interviewTimes ? { ...rest, interviewTimes: Object.values(interviewTimes).sort() } : rest,
  );
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
      // In key order, which is the order they were saved (feature 013).
      const offerHistory = items
        .filter(isOfferChangeItem)
        .map((item) => OfferChangeSchema.parse(item));
      return {
        ...opportunityFromItem(opportunityItem),
        history: sortHistory(history),
        interviews: sortInterviews(interviews),
        ...(offerHistory.length > 0 && { offerHistory }),
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
      return items.map((item) => opportunityFromItem(item));
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
        return opportunityFromItem(result.Attributes as Record<string, unknown>);
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
                    'interviewTimes.#iid = :heldAt, updatedAt = :now',
                  ConditionExpression:
                    'attribute_exists(PK) AND ' +
                    '(attribute_not_exists(interviewCount) OR interviewCount < :max)',
                  ExpressionAttributeNames: { '#iid': interview.id },
                  ExpressionAttributeValues: {
                    ':zero': 0,
                    ':one': 1,
                    ':max': MAX_INTERVIEWS,
                    ':heldAt': interview.heldAt,
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

    async updateInterview(id, interviewId, fields, now, via) {
      const names: Record<string, string> = { '#via': 'via' };
      const values: Record<string, unknown> = {};
      const sets: string[] = [];
      const removes: string[] = [];
      for (const [field, value] of Object.entries(fields)) {
        names[`#${field}`] = field;
        // A cleared detail is removed; the note is kept as null, as it always has been.
        if (value === null && field !== 'note') {
          removes.push(`#${field}`);
        } else {
          values[`:${field}`] = value;
          sets.push(`#${field} = :${field}`);
        }
      }
      if (via === 'CLAUDE') {
        values[':via'] = via;
        sets.push('#via = :via');
      } else {
        removes.push('#via');
      }
      const interviewUpdate = {
        TableName: tableName,
        Key: interviewKey(id, interviewId),
        UpdateExpression: [
          sets.length > 0 && `SET ${sets.join(', ')}`,
          removes.length > 0 && `REMOVE ${removes.join(', ')}`,
        ]
          .filter(Boolean)
          .join(' '),
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: names,
        ...(Object.keys(values).length > 0 && { ExpressionAttributeValues: values }),
      };
      try {
        if (fields.heldAt === undefined) {
          await client.send(new UpdateCommand(interviewUpdate));
        } else {
          // A new date moves the interview's time on the opportunity too (feature 012).
          await client.send(
            new TransactWriteCommand({
              TransactItems: [
                { Update: interviewUpdate },
                {
                  Update: {
                    TableName: tableName,
                    Key: opportunityKey(id),
                    UpdateExpression: 'SET interviewTimes.#iid = :heldAt, updatedAt = :now',
                    ConditionExpression: 'attribute_exists(PK)',
                    ExpressionAttributeNames: { '#iid': interviewId },
                    ExpressionAttributeValues: { ':heldAt': fields.heldAt, ':now': now },
                  },
                },
              ],
            }),
          );
        }
        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException || isConditionFailure(error)) {
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
                  UpdateExpression:
                    'SET interviewCount = interviewCount - :one, updatedAt = :now ' +
                    'REMOVE interviewTimes.#iid',
                  ConditionExpression: 'interviewCount > :zero',
                  ExpressionAttributeNames: { '#iid': interviewId },
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

    async startInterviewTimes(opportunity) {
      if (opportunity.interviewTimes) {
        return;
      }
      const times = Object.fromEntries(
        (opportunity.interviews ?? []).map((interview) => [interview.id, interview.heldAt]),
      );
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: opportunityKey(opportunity.id),
            UpdateExpression: 'SET interviewTimes = :times',
            ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(interviewTimes)',
            ExpressionAttributeValues: { ':times': times },
          }),
        );
      } catch (error) {
        // Another change started them first, from its own complete read.
        if (!(error instanceof ConditionalCheckFailedException)) {
          throw error;
        }
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

    // Feature 013, research §2: the offer and its entry in one transaction. The version
    // condition means two saves racing can't both write, so no change is lost from the history.
    async saveOffer(id, { offer, expectedVersion, entry, dropScores, now }) {
      const first = expectedVersion === 0;
      const names: Record<string, string> = {};
      dropScores.forEach((key, index) => {
        names[`#d${index}`] = key;
      });
      const removes = dropScores.map((_, index) => `offerScores.#d${index}`);
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: opportunityKey(id),
                  UpdateExpression:
                    'SET offer = :offer, offerVersion = :version, updatedAt = :now' +
                    (first ? ', offerScores = :noScores' : '') +
                    (removes.length > 0 ? ` REMOVE ${removes.join(', ')}` : ''),
                  ConditionExpression: first
                    ? 'attribute_exists(PK) AND attribute_not_exists(offerVersion)'
                    : 'offerVersion = :expected',
                  ...(removes.length > 0 && { ExpressionAttributeNames: names }),
                  ExpressionAttributeValues: {
                    ':offer': offer,
                    ':version': entry.seq,
                    ':now': now,
                    ...(first ? { ':noScores': {} } : { ':expected': expectedVersion }),
                  },
                },
              },
              {
                Put: {
                  TableName: tableName,
                  Item: { ...offerChangeKey(id, entry.seq), ...entry },
                  ConditionExpression: 'attribute_not_exists(PK)',
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

    // One UpdateItem, so each score is set on its own and quick changes can't overwrite each
    // other (research §3).
    async setOfferScores(id, scores, now) {
      const names: Record<string, string> = {};
      const values: Record<string, unknown> = { ':now': now };
      const sets = ['updatedAt = :now'];
      const removes: string[] = [];
      Object.entries(scores).forEach(([key, score], index) => {
        names[`#k${index}`] = key;
        if (score === null) {
          removes.push(`offerScores.#k${index}`);
        } else {
          values[`:v${index}`] = score;
          sets.push(`offerScores.#k${index} = :v${index}`);
        }
      });
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: opportunityKey(id),
            UpdateExpression:
              `SET ${sets.join(', ')}` +
              (removes.length > 0 ? ` REMOVE ${removes.join(', ')}` : ''),
            ConditionExpression: 'attribute_exists(offer)',
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
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

    // The offer goes first, conditional on its version, with as many history entries as fit;
    // then any left, in further transactions. A later save starts a new history from 1.
    async removeOffer(id, expectedVersion, now) {
      const entries = Array.from({ length: expectedVersion }, (_, i) => ({
        Delete: { TableName: tableName, Key: offerChangeKey(id, i + 1) },
      }));
      const offerUpdate = {
        Update: {
          TableName: tableName,
          Key: opportunityKey(id),
          UpdateExpression: 'SET updatedAt = :now REMOVE offer, offerScores, offerVersion',
          ConditionExpression: 'offerVersion = :expected',
          ExpressionAttributeValues: { ':now': now, ':expected': expectedVersion },
        },
      };
      const batches = [entries.slice(0, MAX_TRANSACTION_ITEMS - 1)];
      for (let i = MAX_TRANSACTION_ITEMS - 1; i < entries.length; i += MAX_TRANSACTION_ITEMS) {
        batches.push(entries.slice(i, i + MAX_TRANSACTION_ITEMS));
      }
      try {
        await client.send(
          new TransactWriteCommand({ TransactItems: [offerUpdate, ...(batches[0] ?? [])] }),
        );
      } catch (error) {
        if (isConditionFailure(error)) {
          throw new ApiError('CONFLICT', CONFLICT_MESSAGE);
        }
        throw error;
      }
      for (const batch of batches.slice(1)) {
        await client.send(new TransactWriteCommand({ TransactItems: batch }));
      }
    },
  };
}
