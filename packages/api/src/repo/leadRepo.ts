import {
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  LEAD_NOTE_MESSAGES,
  LeadNoteSchema,
  LeadSchema,
  MAX_LEAD_NOTES,
  type Lead,
  type LeadInput,
  type LeadNote,
  type LeadPatch,
} from '@jot/shared';
import { ApiError } from '../http.js';
import {
  GSI1,
  LEADS_PARTITION,
  NOTE_PREFIX,
  isLeadItem,
  isLeadNoteItem,
  leadKey,
  leadNoteGsi1,
  leadNoteKey,
  leadPk,
  opportunityKey,
} from './keys.js';
import { MAX_TRANSACTION_ITEMS, isConditionFailure, pagedQuery } from './query.js';
import type { RepoOptions } from './opportunityRepo.js';

export type LeadWithNotes = Lead & { notes: LeadNote[] };

// Networking leads (feature 010): a name, an email and a phone, linked from opportunities by
// their `leadId`. Each has its dated notes (feature 011).
export interface LeadRepo {
  create(input: LeadInput, meta: { id: string; now: string }): Promise<Lead>;
  get(id: string): Promise<Lead | undefined>;
  // By name, ignoring case, each with its notes (in no particular order).
  list(): Promise<LeadWithNotes[]>;
  // Sets the given fields (null removes one). Undefined if there's no such lead.
  update(id: string, patch: LeadPatch, now: string): Promise<Lead | undefined>;
  // Removes the lead, its notes, and the link from each of `opportunityIds` (their updatedAt
  // is `now`).
  delete(id: string, opportunityIds: string[], now: string): Promise<void>;
  // Adds a note and counts it on the lead, in one transaction that holds the limit even when
  // two adds race. The route checks the lead exists first, so a failed condition is the limit.
  addNote(note: LeadNote): Promise<void>;
  // Changes a note's text or date. Undefined if there's no such note.
  updateNote(
    leadId: string,
    noteId: string,
    fields: { text?: string; heldAt?: string },
    now: string,
  ): Promise<LeadNote | undefined>;
  // Deletes a note and lowers the lead's count. False if there's no such note.
  deleteNote(leadId: string, noteId: string): Promise<boolean>;
}

export const byName = (a: Lead, b: Lead) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

export function createLeadRepo(
  client: DynamoDBDocumentClient,
  tableName: string,
  { pageSize }: RepoOptions = {},
): LeadRepo {
  const queryAll = pagedQuery(client, tableName, pageSize);

  return {
    async create(input, { id, now }) {
      const lead: Lead = { ...input, id, createdAt: now, updatedAt: now };
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: { ...leadKey(id), GSI1PK: LEADS_PARTITION, GSI1SK: id, ...lead },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
      return lead;
    },

    async get(id) {
      const result = await client.send(new GetCommand({ TableName: tableName, Key: leadKey(id) }));
      return result.Item ? LeadSchema.parse(result.Item) : undefined;
    },

    // One query: each lead's notes share its GSI1 partition.
    async list() {
      const items = await queryAll({
        IndexName: GSI1,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': LEADS_PARTITION },
      });
      const notes = items.filter(isLeadNoteItem).map((item) => LeadNoteSchema.parse(item));
      return items
        .filter(isLeadItem)
        .map((item) => LeadSchema.parse(item))
        .sort(byName)
        .map((lead) => ({ ...lead, notes: notes.filter((note) => note.leadId === lead.id) }));
    },

    async update(id, patch, now) {
      const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
      const values: Record<string, unknown> = { ':now': now };
      const sets = ['#updatedAt = :now'];
      const removes: string[] = [];
      for (const [field, value] of Object.entries(patch)) {
        names[`#${field}`] = field;
        if (value === null) {
          removes.push(`#${field}`);
        } else {
          sets.push(`#${field} = :${field}`);
          values[`:${field}`] = value;
        }
      }
      try {
        const result = await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: leadKey(id),
            UpdateExpression:
              `SET ${sets.join(', ')}` +
              (removes.length > 0 ? ` REMOVE ${removes.join(', ')}` : ''),
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ReturnValues: 'ALL_NEW',
          }),
        );
        return LeadSchema.parse(result.Attributes);
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
          return undefined;
        }
        throw error;
      }
    },

    // The unlinks and the delete in one transaction when they fit, so a lead is never gone
    // while an opportunity still points at it. Beyond that, the unlinks go first, in batches,
    // and the lead is deleted in the last one.
    async delete(id, opportunityIds, now) {
      const notes = await queryAll({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :note)',
        ExpressionAttributeValues: { ':pk': leadPk(id), ':note': NOTE_PREFIX },
      });
      const writes = [
        ...notes.map((note) => ({
          Delete: { TableName: tableName, Key: { PK: note.PK, SK: note.SK } },
        })),
        ...opportunityIds.map((opportunityId) => ({
          Update: {
            TableName: tableName,
            Key: opportunityKey(opportunityId),
            UpdateExpression: 'SET updatedAt = :now REMOVE leadId',
            // Never writes a stray item for an opportunity deleted since it was listed.
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeValues: { ':now': now },
          },
        })),
        { Delete: { TableName: tableName, Key: leadKey(id) } },
      ];
      for (let start = 0; start < writes.length; start += MAX_TRANSACTION_ITEMS) {
        await client.send(
          new TransactWriteCommand({
            TransactItems: writes.slice(start, start + MAX_TRANSACTION_ITEMS),
          }),
        );
      }
    },

    async addNote(note) {
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: tableName,
                  Item: {
                    ...leadNoteKey(note.leadId, note.id),
                    ...leadNoteGsi1(note.leadId, note.id),
                    ...note,
                  },
                  ConditionExpression: 'attribute_not_exists(PK)',
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: leadKey(note.leadId),
                  UpdateExpression: 'SET noteCount = if_not_exists(noteCount, :zero) + :one',
                  ConditionExpression:
                    'attribute_exists(PK) AND ' +
                    '(attribute_not_exists(noteCount) OR noteCount < :max)',
                  ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':max': MAX_LEAD_NOTES },
                },
              },
            ],
          }),
        );
      } catch (error) {
        if (isConditionFailure(error)) {
          throw new ApiError('VALIDATION_ERROR', LEAD_NOTE_MESSAGES.LIMIT);
        }
        throw error;
      }
    },

    async updateNote(leadId, noteId, fields, now) {
      const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
      const values: Record<string, unknown> = { ':now': now };
      const sets = ['#updatedAt = :now'];
      for (const [field, value] of Object.entries(fields)) {
        names[`#${field}`] = field;
        values[`:${field}`] = value;
        sets.push(`#${field} = :${field}`);
      }
      try {
        const result = await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: leadNoteKey(leadId, noteId),
            UpdateExpression: `SET ${sets.join(', ')}`,
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ReturnValues: 'ALL_NEW',
          }),
        );
        return LeadNoteSchema.parse(result.Attributes);
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) {
          return undefined;
        }
        throw error;
      }
    },

    async deleteNote(leadId, noteId) {
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Delete: {
                  TableName: tableName,
                  Key: leadNoteKey(leadId, noteId),
                  ConditionExpression: 'attribute_exists(PK)',
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: leadKey(leadId),
                  UpdateExpression: 'SET noteCount = noteCount - :one',
                  ConditionExpression: 'attribute_exists(PK)',
                  ExpressionAttributeValues: { ':one': 1 },
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
  };
}
