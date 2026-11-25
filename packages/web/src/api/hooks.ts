import {
  LeadNoteSchema,
  LeadSchema,
  LeadWithOpportunitiesSchema,
  OfferFieldsSchema,
  OpportunitySchema,
  PostingDetailsSchema,
  OpportunityWithHistorySchema,
  type InterviewInput,
  type InterviewPatch,
  type LeadInput,
  type LeadNoteInput,
  type LeadNotePatch,
  type LeadPatch,
  type OfferFieldsPatch,
  type OfferInput,
  type OpportunityInput,
  type OpportunityPatch,
  type OpportunityStatus,
} from '@jot/shared';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { StageMove } from '../components/MoveStageMenu';
import { useApiClient } from './ApiClientProvider';
import { ApiError } from './client';

const ListSchema = z.object({ items: z.array(OpportunitySchema) });
const LeadListSchema = z.object({ items: z.array(LeadWithOpportunitiesSchema) });

export const queryKeys = {
  lists: ['opportunities'] as const,
  list: (status: OpportunityStatus) => ['opportunities', status] as const,
  detail: (id: string) => ['opportunity', id] as const,
  details: ['opportunity'] as const,
  // Networking leads, each with its linked opportunities (feature 010).
  leads: ['leads'] as const,
  // The custom fields every offer shares (feature 013).
  offerFields: ['offerFields'] as const,
};

export function useOpportunities(status: OpportunityStatus) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.list(status),
    queryFn: async () =>
      (await api.request('GET', `/opportunities?status=${status}`, { schema: ListSchema })).items,
  });
}

export function useOpportunity(id: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.detail(id),
    queryFn: () =>
      api.request('GET', `/opportunities/${encodeURIComponent(id)}`, {
        schema: OpportunityWithHistorySchema,
      }),
  });
}

// Several opportunities at once, for the offer comparison (feature 013), sharing the cache
// with each opportunity's own page.
export function useOpportunitiesById(ids: readonly string[]) {
  const api = useApiClient();
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.detail(id),
      queryFn: () =>
        api.request('GET', `/opportunities/${encodeURIComponent(id)}`, {
          schema: OpportunityWithHistorySchema,
        }),
    })),
  });
}

export const CHANGED_ELSEWHERE_MESSAGE = 'This opportunity changed. Please try again.';

interface ChangeStageVariables extends StageMove {
  // The changeCount the user was looking at (optimistic locking).
  expectedChangeCount: number;
}

export function useChangeStage(id: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: ChangeStageVariables) =>
      api.request('POST', `/opportunities/${encodeURIComponent(id)}/stage-changes`, {
        body: variables,
        schema: OpportunityWithHistorySchema,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.detail(id), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists });
    },
    onError: async (error) => {
      // Someone (another tab or device) changed it first: reload so the next try is current.
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.lists });
      }
    },
  });
}

export function useUpdateOpportunity(id: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: OpportunityPatch) =>
      api.request('PATCH', `/opportunities/${encodeURIComponent(id)}`, {
        body: patch,
        schema: OpportunitySchema,
      }),
    // The response has no history, so reload the detail rather than patch the cache. The
    // leads list shows each lead's opportunities, which the edit may have changed.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists });
      await queryClient.invalidateQueries({ queryKey: queryKeys.leads });
    },
  });
}

export function useDeleteOpportunity(id: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    // The API refuses to delete without this header (spec FR-016).
    mutationFn: () =>
      api.request('DELETE', `/opportunities/${encodeURIComponent(id)}`, {
        headers: { 'x-confirm-delete': 'true' },
      }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: queryKeys.detail(id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists });
    },
  });
}

// Interviews (feature 005). Each route answers with the opportunity as it now is, so the
// detail page updates without another request; the lists reload for the board's count.
function useInterviewChange<V>(
  id: string,
  request: (variables: V) => {
    method: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: V) => {
      const { method, path, body, headers } = request(variables);
      return api.request(method, path, { body, headers, schema: OpportunityWithHistorySchema });
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.detail(id), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists });
    },
  });
}

const interviewsPath = (id: string) => `/opportunities/${encodeURIComponent(id)}/interviews`;

export function useAddInterview(id: string) {
  return useInterviewChange(id, (input: InterviewInput) => ({
    method: 'POST',
    path: interviewsPath(id),
    body: input,
  }));
}

export function useUpdateInterview(id: string) {
  return useInterviewChange(
    id,
    ({ interviewId, patch }: { interviewId: string; patch: InterviewPatch }) => ({
      method: 'PATCH',
      path: `${interviewsPath(id)}/${encodeURIComponent(interviewId)}`,
      body: patch,
    }),
  );
}

export function useRemoveInterview(id: string) {
  // The API refuses to remove without this header (spec FR-007).
  return useInterviewChange(id, (interviewId: string) => ({
    method: 'DELETE',
    path: `${interviewsPath(id)}/${encodeURIComponent(interviewId)}`,
    headers: { 'x-confirm-delete': 'true' },
  }));
}

// An opportunity's offer (feature 013). Each change answers with the opportunity as it now
// is, as interview changes do.
const offerPath = (id: string) => `/opportunities/${encodeURIComponent(id)}/offer`;

export function useSaveOffer(id: string) {
  return useInterviewChange(id, (input: OfferInput) => ({
    method: 'PATCH',
    path: offerPath(id),
    body: input,
  }));
}

export function useRemoveOffer(id: string) {
  // The API refuses to remove it without this header, as for interviews.
  return useInterviewChange(id, () => ({
    method: 'DELETE',
    path: offerPath(id),
    headers: { 'x-confirm-delete': 'true' },
  }));
}

export function useSetOfferScores(id: string) {
  return useInterviewChange(id, (scores: Record<string, number | null>) => ({
    method: 'PATCH',
    path: `${offerPath(id)}/scores`,
    body: { scores },
  }));
}

export function useOfferFields() {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.offerFields,
    queryFn: () => api.request('GET', '/offer-fields', { schema: OfferFieldsSchema }),
  });
}

export function useSaveOfferFields() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    // Dropping a field is confirmed first, in the page; the API asks for the header.
    mutationFn: ({ patch, confirmRemove }: { patch: OfferFieldsPatch; confirmRemove?: boolean }) =>
      api.request('PATCH', '/offer-fields', {
        body: patch,
        headers: confirmRemove ? { 'x-confirm-delete': 'true' } : undefined,
        schema: OfferFieldsSchema,
      }),
    onSuccess: (fields) => queryClient.setQueryData(queryKeys.offerFields, fields),
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 409) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.offerFields });
      }
    },
  });
}

// Reads a posting link to fill the add form (feature 002). Nothing is stored.
export function useImportPosting() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (url: string) =>
      api.request('POST', '/imports', { body: { url }, schema: PostingDetailsSchema }),
  });
}

export function useCreateOpportunity() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OpportunityInput) =>
      api.request('POST', '/opportunities', { body: input, schema: OpportunityWithHistorySchema }),
    onSuccess: async (created) => {
      // The detail page opens next; show it without another request.
      queryClient.setQueryData(queryKeys.detail(created.id), created);
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists });
      await queryClient.invalidateQueries({ queryKey: queryKeys.leads });
    },
  });
}

// Networking leads (feature 010). Every change reloads the list, which carries each lead's
// opportunities.
export function useLeads() {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.leads,
    queryFn: async () => (await api.request('GET', '/leads', { schema: LeadListSchema })).items,
  });
}

export function useCreateLead() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LeadInput) =>
      api.request('POST', '/leads', { body: input, schema: LeadSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.leads }),
  });
}

export function useUpdateLead(id: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: LeadPatch) =>
      api.request('PATCH', `/leads/${encodeURIComponent(id)}`, { body: patch, schema: LeadSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.leads }),
  });
}

export function useDeleteLead(id: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    // The API refuses to delete without this header, as for opportunities.
    mutationFn: () =>
      api.request('DELETE', `/leads/${encodeURIComponent(id)}`, {
        headers: { 'x-confirm-delete': 'true' },
      }),
    // Its opportunities lose their link, so they reload too.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.leads });
      await queryClient.invalidateQueries({ queryKey: queryKeys.lists });
      await queryClient.invalidateQueries({ queryKey: queryKeys.details });
    },
  });
}

// A lead's notes (feature 011) come with the leads list, so each change reloads only that.
const notesPath = (leadId: string) => `/leads/${encodeURIComponent(leadId)}/notes`;

export function useAddLeadNote(leadId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LeadNoteInput) =>
      api.request('POST', notesPath(leadId), { body: input, schema: LeadNoteSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.leads }),
  });
}

export function useUpdateLeadNote(leadId: string, noteId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: LeadNotePatch) =>
      api.request('PATCH', `${notesPath(leadId)}/${encodeURIComponent(noteId)}`, {
        body: patch,
        schema: LeadNoteSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.leads }),
  });
}

export function useDeleteLeadNote(leadId: string, noteId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.request('DELETE', `${notesPath(leadId)}/${encodeURIComponent(noteId)}`, {
        headers: { 'x-confirm-delete': 'true' },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.leads }),
  });
}
