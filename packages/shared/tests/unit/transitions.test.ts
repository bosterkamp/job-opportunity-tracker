// @module-tag pipeline
import { describe, expect, it } from 'vitest';
import { STAGE_IDS, type Stage } from '../../src/stages.js';
import { CLOCK_SKEW_MS, validateStageChange } from '../../src/transitions.js';

const now = new Date('2026-10-18T12:00:00.000Z');
const current = (stage: Stage, lastStageChangeAt = '2026-10-10T09:00:00.000Z') => ({
  stage,
  lastStageChangeAt,
});

describe('validateStageChange', () => {
  it('allows every stage to move to every other stage, including skipping and moving back', () => {
    for (const from of STAGE_IDS) {
      for (const to of STAGE_IDS.filter((stage) => stage !== from)) {
        expect(validateStageChange(current(from), { toStage: to }, now)).toMatchObject({
          ok: true,
          stage: to,
        });
      }
    }
  });

  it('rejects a move to the current stage', () => {
    expect(validateStageChange(current('APPLIED'), { toStage: 'APPLIED' }, now)).toEqual({
      ok: false,
      error: 'SAME_STAGE',
      message: 'Already in Applied',
    });
  });

  it('dates the change now when no date is given', () => {
    const result = validateStageChange(current('CONSIDERING'), { toStage: 'APPLIED' }, now);

    expect(result).toEqual({
      ok: true,
      stage: 'APPLIED',
      status: 'OPEN',
      changedAt: '2026-10-18T12:00:00.000Z',
      lastStageChangeAt: '2026-10-18T12:00:00.000Z',
    });
  });

  it('accepts an earlier date and stores it in UTC', () => {
    const result = validateStageChange(
      current('CONSIDERING'),
      { toStage: 'APPLIED', changedAt: '2026-10-15T09:30:00-05:00' },
      now,
    );

    expect(result).toMatchObject({ ok: true, changedAt: '2026-10-15T14:30:00.000Z' });
  });

  it('allows up to one minute of clock skew, but no more', () => {
    expect(CLOCK_SKEW_MS).toBe(60_000);
    const at = (ms: number) => new Date(now.getTime() + ms).toISOString();

    expect(
      validateStageChange(
        current('CONSIDERING'),
        { toStage: 'APPLIED', changedAt: at(60_000) },
        now,
      ),
    ).toMatchObject({ ok: true });
    expect(
      validateStageChange(
        current('CONSIDERING'),
        { toStage: 'APPLIED', changedAt: at(60_001) },
        now,
      ),
    ).toEqual({ ok: false, error: 'FUTURE_DATE', message: "The date can't be in the future" });
  });

  it('closes the opportunity when it moves to an outcome', () => {
    expect(
      validateStageChange(current('INTERVIEWING'), { toStage: 'REJECTED' }, now),
    ).toMatchObject({
      ok: true,
      stage: 'REJECTED',
      status: 'CLOSED',
    });
  });

  it('reopens a closed opportunity when it moves back to an open stage', () => {
    expect(validateStageChange(current('WITHDRAWN'), { toStage: 'APPLIED' }, now)).toMatchObject({
      ok: true,
      status: 'OPEN',
    });
  });

  it('keeps lastStageChangeAt at the latest date when the new change is backdated', () => {
    const result = validateStageChange(
      current('CONTACTED', '2026-10-16T08:00:00.000Z'),
      { toStage: 'APPLIED', changedAt: '2026-10-12T08:00:00.000Z' },
      now,
    );

    expect(result).toMatchObject({
      ok: true,
      changedAt: '2026-10-12T08:00:00.000Z',
      lastStageChangeAt: '2026-10-16T08:00:00.000Z',
    });
  });

  it('moves lastStageChangeAt forward when the new change is later', () => {
    const result = validateStageChange(
      current('CONTACTED', '2026-10-16T08:00:00.000Z'),
      { toStage: 'APPLIED', changedAt: '2026-10-17T08:00:00.000Z' },
      now,
    );

    expect(result).toMatchObject({ ok: true, lastStageChangeAt: '2026-10-17T08:00:00.000Z' });
  });

  it('keeps lastStageChangeAt when the new change has the same date', () => {
    const result = validateStageChange(
      current('CONTACTED', '2026-10-16T08:00:00.000Z'),
      { toStage: 'APPLIED', changedAt: '2026-10-16T08:00:00.000Z' },
      now,
    );

    expect(result).toMatchObject({ ok: true, lastStageChangeAt: '2026-10-16T08:00:00.000Z' });
  });
});
