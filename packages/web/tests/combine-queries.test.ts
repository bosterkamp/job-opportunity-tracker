// @module-tag offer
import { describe, expect, it, vi } from 'vitest';
import { combineQueries, type QueryLike } from '../src/api/combineQueries';

// Feature 013: the Offers page and the comparison show several queries as one state.

const query = (state: Partial<QueryLike> = {}): QueryLike => ({
  isPending: false,
  isFetching: false,
  error: null,
  refetch: vi.fn(() => Promise.resolve()),
  ...state,
});

describe('combining queries', () => {
  it('is loading while any one is', () => {
    expect(combineQueries([query(), query({ isPending: true })]).isPending).toBe(true);
    expect(combineQueries([query({ isPending: true }), query()]).isPending).toBe(true);
    expect(combineQueries([query(), query()]).isPending).toBe(false);
  });

  it('gives the first failure, but none while loading', () => {
    const first = new Error('first');
    const second = new Error('second');
    expect(combineQueries([query(), query({ error: second })]).error).toBe(second);
    expect(combineQueries([query({ error: first }), query({ error: second })]).error).toBe(first);
    expect(combineQueries([query(), query()]).error).toBeNull();
    expect(combineQueries([query({ error: first }), query({ isPending: true })]).error).toBeNull();
  });

  it('skips the failures the page handles itself', () => {
    const gone = new Error('gone');
    const down = new Error('down');
    const ignore = (error: Error) => error === gone;
    expect(combineQueries([query({ error: gone }), query({ error: down })], { ignore }).error).toBe(
      down,
    );
    expect(combineQueries([query({ error: gone })], { ignore }).error).toBeNull();
  });

  it('tries again only the ones that failed', () => {
    const ok = query();
    const failing = query({ error: new Error('down') });
    const alsoFailing = query({ error: new Error('down too') });

    combineQueries([ok, failing, alsoFailing]).onRetry();

    expect(ok.refetch).not.toHaveBeenCalled();
    expect(failing.refetch).toHaveBeenCalledTimes(1);
    expect(alsoFailing.refetch).toHaveBeenCalledTimes(1);
  });

  it('is retrying while any one is fetching', () => {
    expect(combineQueries([query(), query({ isFetching: true })]).retrying).toBe(true);
    expect(combineQueries([query({ isFetching: true }), query()]).retrying).toBe(true);
    expect(combineQueries([query(), query()]).retrying).toBe(false);
  });
});
