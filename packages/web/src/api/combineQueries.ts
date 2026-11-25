// What QueryState needs from a query.
export interface QueryLike {
  isPending: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export interface CombineOptions {
  // Errors the page handles itself, such as an offer that's gone (feature 013).
  ignore?: (error: Error) => boolean;
}

// Several queries shown as one loading and failure state (feature 013): loading until all
// have loaded, then the first failure; "Try again" fetches only the ones that failed.
export function combineQueries(queries: readonly QueryLike[], { ignore }: CombineOptions = {}) {
  const isPending = queries.some((q) => q.isPending);
  const failed = queries.find((q) => q.error !== null && !ignore?.(q.error));
  return {
    isPending,
    error: isPending ? null : (failed?.error ?? null),
    onRetry: () => {
      for (const q of queries) {
        if (q.error !== null) {
          void q.refetch();
        }
      }
    },
    retrying: queries.some((q) => q.isFetching),
  };
}
