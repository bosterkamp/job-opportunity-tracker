// @module-tag capture
// @module-tag edit
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DATE_ADDED_MESSAGES,
  dateAddedProblem,
  dateAddedTimestamp,
  dayToTimestamp,
  firstInterviewAt,
  firstMoveAt,
} from '../../src/dateAdded.js';
import { localDate } from '../../src/duplicates.js';

const now = new Date('2026-10-20T15:00:00.000Z');
const added = { seq: 1, changedAt: '2026-09-01T12:00:00.000Z' };
const history = [
  added,
  { seq: 3, changedAt: '2026-10-05T09:00:00.000Z' },
  // Backdated, so recorded later but earlier in time: this is the first move.
  { seq: 2, changedAt: '2026-10-01T09:30:00.000Z' },
];

describe('firstMoveAt', () => {
  it('is the earliest change after the first entry', () => {
    expect(firstMoveAt(history)).toBe('2026-10-01T09:30:00.000Z');
  });

  it('is undefined before the opportunity has moved', () => {
    expect(firstMoveAt([added])).toBeUndefined();
    expect(firstMoveAt([])).toBeUndefined();
  });
});

describe('dateAddedProblem', () => {
  it('accepts a past date, now, and up to a minute of clock skew', () => {
    expect(dateAddedProblem('2020-01-01T00:00:00.000Z', now)).toBeUndefined();
    expect(dateAddedProblem(now.toISOString(), now)).toBeUndefined();
    expect(dateAddedProblem('2026-10-20T15:01:00.000Z', now)).toBeUndefined();
  });

  it('refuses a date in the future', () => {
    expect(dateAddedProblem('2026-10-20T15:01:00.001Z', now)).toBe(
      "The date can't be in the future",
    );
  });

  it('accepts the moment of the first move, and refuses anything after it', () => {
    expect(dateAddedProblem('2026-10-01T09:30:00.000Z', now, history)).toBeUndefined();
    expect(dateAddedProblem('2026-10-01T09:30:00.001Z', now, history)).toBe(
      "The date added can't be after the first stage change",
    );
  });

  it('checks the future first', () => {
    expect(dateAddedProblem('2027-01-01T00:00:00.000Z', now, history)).toBe(
      DATE_ADDED_MESSAGES.FUTURE,
    );
  });

  it('allows any past date before the opportunity has moved', () => {
    expect(dateAddedProblem('2026-10-19T00:00:00.000Z', now, [added])).toBeUndefined();
  });

  describe('with interviews (feature 005)', () => {
    const interviews = [
      { heldAt: '2026-09-20T12:00:00.000Z' },
      { heldAt: '2026-09-10T08:00:00.000Z' },
    ];

    it('accepts the moment of the first interview, and refuses anything after it', () => {
      expect(
        dateAddedProblem('2026-09-10T08:00:00.000Z', now, [added], interviews),
      ).toBeUndefined();
      expect(dateAddedProblem('2026-09-10T08:00:00.001Z', now, [added], interviews)).toBe(
        "The date added can't be after the first interview",
      );
      expect(DATE_ADDED_MESSAGES.AFTER_FIRST_INTERVIEW).toBe(
        "The date added can't be after the first interview",
      );
    });

    it('checks the first stage change before the first interview', () => {
      const late = [{ heldAt: '2026-10-02T00:00:00.000Z' }];

      expect(dateAddedProblem('2026-10-03T00:00:00.000Z', now, history, late)).toBe(
        DATE_ADDED_MESSAGES.AFTER_FIRST_CHANGE,
      );
    });

    it('finds the earliest interview', () => {
      expect(firstInterviewAt(interviews)).toBe('2026-09-10T08:00:00.000Z');
      expect(firstInterviewAt([])).toBeUndefined();
    });
  });
});

describe('dayToTimestamp', () => {
  const day = '2026-10-01';
  const morning = new Date(`${day}T09:30:00`).toISOString();
  const evening = new Date(`${day}T21:00:00`).toISOString();
  const noon = new Date(`${day}T12:00:00`).toISOString();

  it('is noon on another day with no bounds', () => {
    expect(dayToTimestamp(day, {}, now)).toBe(noon);
  });

  it("is never earlier than a lower bound on that bound's own day", () => {
    expect(dayToTimestamp(day, { notBefore: evening }, now)).toBe(evening);
    expect(dayToTimestamp(day, { notBefore: morning }, now)).toBe(noon);
    expect(dayToTimestamp('2026-10-02', { notBefore: evening }, now)).toBe(
      new Date('2026-10-02T12:00:00').toISOString(),
    );
  });

  it("is never later than an upper bound on that bound's own day", () => {
    expect(dayToTimestamp(day, { notAfter: morning }, now)).toBe(morning);
    expect(dayToTimestamp(day, { notAfter: evening }, now)).toBe(noon);
  });

  it('is now for today', () => {
    expect(dayToTimestamp(localDate(now), {}, now)).toBe(now.toISOString());
  });

  it('dates the date added no later than the first interview on its day', () => {
    expect(dateAddedTimestamp(day, [added], now, [{ heldAt: morning }])).toBe(morning);
  });

  it('uses whichever comes first on the day, the first move or the first interview', () => {
    const moved = [added, { seq: 2, changedAt: evening }];

    expect(dateAddedTimestamp(day, moved, now, [{ heldAt: morning }])).toBe(morning);
    expect(
      dateAddedTimestamp(day, [added, { seq: 2, changedAt: morning }], now, [{ heldAt: evening }]),
    ).toBe(morning);
  });
});

describe('dateAddedTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is now for today', () => {
    expect(dateAddedTimestamp(localDate(now), [], now)).toBe(now.toISOString());
    expect(dateAddedTimestamp(localDate())).toBe(now.toISOString());
  });

  it('is noon in the device time zone for another day', () => {
    const stored = new Date(dateAddedTimestamp('2026-07-04', [], now));

    expect(localDate(stored)).toBe('2026-07-04');
    expect([stored.getHours(), stored.getMinutes()]).toEqual([12, 0]);
  });

  it('is never later than the first move on the day of that move', () => {
    const morning = new Date('2026-10-01T09:30:00').toISOString();
    const moved = [added, { seq: 2, changedAt: morning }];

    expect(dateAddedTimestamp('2026-10-01', moved, now)).toBe(morning);
    expect(dateAddedProblem(morning, now, moved)).toBeUndefined();
  });

  it('keeps noon on the day of the first move when noon comes first', () => {
    const early = [added, { seq: 2, changedAt: new Date('2026-10-01T23:30:00').toISOString() }];

    expect(dateAddedTimestamp('2026-10-01', early, now)).toBe(
      new Date('2026-10-01T12:00:00').toISOString(),
    );
  });

  it('ignores the first move on a later day, which the rules then refuse', () => {
    const day = '2026-10-03';
    const stored = dateAddedTimestamp(day, history, now);

    expect(stored).toBe(new Date(`${day}T12:00:00`).toISOString());
    expect(dateAddedProblem(stored, now, history)).toBe(DATE_ADDED_MESSAGES.AFTER_FIRST_CHANGE);
  });

  it('ignores the first move on other days', () => {
    expect(dateAddedTimestamp('2026-09-15', history, now)).toBe(
      new Date('2026-09-15T12:00:00').toISOString(),
    );
  });
});
