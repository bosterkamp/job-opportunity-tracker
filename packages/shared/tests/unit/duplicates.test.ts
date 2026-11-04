// @module-tag edit
import { describe, expect, it } from 'vitest';
import { findPossibleDuplicate, isFollowUpDue, localDate } from '../../src/duplicates.js';
import type { Opportunity } from '../../src/schemas.js';

const opp = (overrides: Partial<Opportunity> & { id: string }): Opportunity => ({
  company: 'Acme',
  title: 'Senior Engineer',
  stage: 'CONSIDERING',
  status: 'OPEN',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  lastStageChangeAt: '2026-10-01T12:00:00.000Z',
  changeCount: 1,
  ...overrides,
});

describe('findPossibleDuplicate', () => {
  const existing = [
    opp({
      id: 'closed',
      company: 'Globex',
      title: 'Staff Engineer',
      status: 'CLOSED',
      stage: 'REJECTED',
    }),
    opp({ id: 'acme', company: 'Acme Corp', title: 'Senior  Engineer' }),
  ];

  it('finds an open opportunity with the same company and title, ignoring case and extra spaces', () => {
    expect(
      findPossibleDuplicate({ company: '  acme   CORP ', title: 'senior engineer' }, existing)?.id,
    ).toBe('acme');
  });

  it('ignores closed opportunities', () => {
    expect(
      findPossibleDuplicate({ company: 'Globex', title: 'Staff Engineer' }, existing),
    ).toBeUndefined();
  });

  it('needs both company and title to match', () => {
    expect(
      findPossibleDuplicate({ company: 'Acme Corp', title: 'Staff Engineer' }, existing),
    ).toBeUndefined();
    expect(
      findPossibleDuplicate({ company: 'Acme', title: 'Senior Engineer' }, existing),
    ).toBeUndefined();
  });

  it('keeps word breaks: "AcmeCorp" is not "Acme Corp"', () => {
    expect(
      findPossibleDuplicate({ company: 'AcmeCorp', title: 'Senior Engineer' }, existing),
    ).toBeUndefined();
  });

  it('treats letters with accents as different', () => {
    expect(
      findPossibleDuplicate({ company: 'Acmé Corp', title: 'Senior Engineer' }, existing),
    ).toBeUndefined();
  });

  it('collapses tabs and line breaks too', () => {
    expect(
      findPossibleDuplicate({ company: 'Acme\tCorp', title: 'Senior\nEngineer' }, existing)?.id,
    ).toBe('acme');
  });
});

describe('isFollowUpDue', () => {
  it.each([
    ['2026-10-17', true],
    ['2026-10-18', true],
    ['2026-10-19', false],
  ])('a follow-up on %s is due on 2026-10-18: %s', (date, due) => {
    expect(isFollowUpDue(date, '2026-10-18')).toBe(due);
  });

  it.each([null, undefined])('is never due without a date (%s)', (date) => {
    expect(isFollowUpDue(date, '2026-10-18')).toBe(false);
  });
});

describe('localDate', () => {
  it("formats a moment as YYYY-MM-DD in the device's time zone, zero-padded", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });

  it('uses the current time by default', () => {
    const now = new Date();

    expect(localDate()).toBe(localDate(now));
  });
});
