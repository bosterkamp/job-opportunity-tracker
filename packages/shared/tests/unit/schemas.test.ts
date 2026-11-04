// @module-tag core
import { describe, expect, it } from 'vitest';
import {
  ContactSchema,
  OpportunityInputSchema,
  OpportunityPatchSchema,
  OpportunitySchema,
  OpportunityWithHistorySchema,
  StageChangeInputSchema,
  StageChangeSchema,
} from '../../src/schemas.js';

const valid = { company: 'Acme', title: 'Senior Engineer' };

function issuesFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (result.error?.issues ?? []).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

describe('OpportunityInputSchema', () => {
  it('accepts only company and title', () => {
    expect(OpportunityInputSchema.parse(valid)).toEqual(valid);
  });

  it('trims company and title', () => {
    expect(
      OpportunityInputSchema.parse({ company: '  Acme  ', title: '\tSenior Engineer\n' }),
    ).toEqual(valid);
  });

  it.each([
    ['company', 'Company is required'],
    ['title', 'Job title is required'],
  ])('requires %s', (field, message) => {
    const missing = OpportunityInputSchema.safeParse({ ...valid, [field]: undefined });
    const blank = OpportunityInputSchema.safeParse({ ...valid, [field]: '   ' });

    expect(issuesFor(missing)).toEqual([{ path: field, message }]);
    expect(issuesFor(blank)).toEqual([{ path: field, message }]);
  });

  it.each(['company', 'title'])('limits %s to 200 characters', (field) => {
    expect(OpportunityInputSchema.safeParse({ ...valid, [field]: 'x'.repeat(200) }).success).toBe(
      true,
    );
    expect(
      issuesFor(OpportunityInputSchema.safeParse({ ...valid, [field]: 'x'.repeat(201) })),
    ).toEqual([{ path: field, message: 'Must be 200 characters or fewer' }]);
  });

  it.each([
    ['description', 20_000],
    ['notes', 20_000],
    ['location', 200],
    ['source', 200],
    ['compensation', 500],
  ])('limits %s to %i characters', (field, max) => {
    expect(OpportunityInputSchema.safeParse({ ...valid, [field]: 'x'.repeat(max) }).success).toBe(
      true,
    );
    expect(
      issuesFor(OpportunityInputSchema.safeParse({ ...valid, [field]: 'x'.repeat(max + 1) })),
    ).toEqual([{ path: field, message: `Must be ${max} characters or fewer` }]);
  });

  it('keeps line breaks in description and notes', () => {
    const text = 'Line one\n\nLine two\r\n- bullet';
    const parsed = OpportunityInputSchema.parse({ ...valid, description: text, notes: text });

    expect(parsed.description).toBe(text);
    expect(parsed.notes).toBe(text);
  });

  it('trims short optional text fields', () => {
    const parsed = OpportunityInputSchema.parse({
      ...valid,
      location: ' Remote ',
      source: ' LinkedIn ',
      compensation: ' $150k ',
    });

    expect(parsed).toMatchObject({ location: 'Remote', source: 'LinkedIn', compensation: '$150k' });
  });

  it('drops blank optional fields on create', () => {
    const parsed = OpportunityInputSchema.parse({
      ...valid,
      description: '  ',
      notes: '',
      location: '',
      source: ' ',
      compensation: '',
      postingUrl: '',
      followUpDate: '',
    });

    expect(parsed).toEqual(valid);
  });

  it.each([1, 3, 5])('accepts interest %i', (interest) => {
    expect(OpportunityInputSchema.parse({ ...valid, interest }).interest).toBe(interest);
  });

  it('accepts unrated interest as null', () => {
    expect(OpportunityInputSchema.parse({ ...valid, interest: null }).interest).toBeNull();
  });

  it.each([0, 6, 2.5])('rejects interest %s', (interest) => {
    expect(issuesFor(OpportunityInputSchema.safeParse({ ...valid, interest }))).toEqual([
      { path: 'interest', message: 'Interest must be a whole number from 1 to 5' },
    ]);
  });

  it.each(['http://example.com/job', 'https://example.com/job?id=1'])(
    'accepts posting URL %s',
    (url) => {
      expect(OpportunityInputSchema.parse({ ...valid, postingUrl: url }).postingUrl).toBe(url);
    },
  );

  it.each(['ftp://example.com', 'xhttp://example.com', 'httpsx://example.com', 'not a url'])(
    'rejects posting URL %s',
    (url) => {
      expect(issuesFor(OpportunityInputSchema.safeParse({ ...valid, postingUrl: url }))).toEqual([
        { path: 'postingUrl', message: 'Must be an http or https link' },
      ]);
    },
  );

  it.each(['ONSITE', 'HYBRID', 'REMOTE'])('accepts work arrangement %s', (workArrangement) => {
    expect(OpportunityInputSchema.parse({ ...valid, workArrangement }).workArrangement).toBe(
      workArrangement,
    );
  });

  it('rejects an unknown work arrangement', () => {
    expect(
      issuesFor(OpportunityInputSchema.safeParse({ ...valid, workArrangement: 'MOON' })),
    ).toEqual([{ path: 'workArrangement', message: 'Choose on-site, hybrid, or remote' }]);
  });

  it('accepts a YYYY-MM-DD follow-up date or null', () => {
    expect(
      OpportunityInputSchema.parse({ ...valid, followUpDate: '2026-11-03' }).followUpDate,
    ).toBe('2026-11-03');
    expect(OpportunityInputSchema.parse({ ...valid, followUpDate: null }).followUpDate).toBeNull();
  });

  it.each(['11/03/2026', '2026-13-01', '2026-11-03T10:00:00Z'])(
    'rejects follow-up date %s',
    (date) => {
      expect(issuesFor(OpportunityInputSchema.safeParse({ ...valid, followUpDate: date }))).toEqual(
        [{ path: 'followUpDate', message: 'Use a date like 2026-11-03' }],
      );
    },
  );

  it('accepts a full contact', () => {
    const contact = {
      name: 'Sam Lee',
      role: 'Recruiter',
      email: 'sam@example.com',
      phone: '+1 555 0100',
    };

    expect(OpportunityInputSchema.parse({ ...valid, contact }).contact).toEqual(contact);
  });

  it('treats a contact with every field empty as absent', () => {
    const parsed = OpportunityInputSchema.parse({
      ...valid,
      contact: { name: ' ', role: '', email: '', phone: '' },
    });

    expect(parsed).toEqual(valid);
    expect('contact' in parsed).toBe(false);
  });

  it('rejects unknown fields so typos are not silently ignored', () => {
    expect(issuesFor(OpportunityInputSchema.safeParse({ ...valid, compnay: 'Acme' }))).toEqual([
      { path: '', message: 'Unknown field: compnay' },
    ]);
  });

  it('lists every unknown field in one message', () => {
    expect(issuesFor(OpportunityInputSchema.safeParse({ ...valid, a: 1, b: 2 }))).toEqual([
      { path: '', message: 'Unknown field: a, b' },
    ]);
  });

  it('reports a non-object body with the default message, not the unknown-field one', () => {
    const [issue] = issuesFor(OpportunityInputSchema.safeParse(null));

    expect(issue?.path).toBe('');
    expect(issue?.message).not.toContain('Unknown field');
  });

  it('rejects unknown fields inside the contact', () => {
    expect(
      issuesFor(OpportunityInputSchema.safeParse({ ...valid, contact: { linkedin: 'x' } })),
    ).toEqual([{ path: 'contact', message: 'Unknown field: linkedin' }]);
  });
});

describe('salary', () => {
  const message = 'Enter a whole number, like 150000';
  const schemas = [
    ['create', OpportunityInputSchema, valid],
    ['edit', OpportunityPatchSchema, {}],
  ] as const;

  describe.each(schemas)('when %s', (_mode, schema, base) => {
    it.each([0, 150_000, 10_000_000])('accepts %i', (amount) => {
      expect(schema.parse({ ...base, salaryMin: amount, salaryMax: amount })).toEqual({
        ...base,
        salaryMin: amount,
        salaryMax: amount,
      });
    });

    it.each([10_000_001, -1, 1.5, '150000', true])('rejects %j', (amount) => {
      expect(issuesFor(schema.safeParse({ ...base, salaryMin: amount }))).toEqual([
        { path: 'salaryMin', message },
      ]);
      expect(issuesFor(schema.safeParse({ ...base, salaryMax: amount }))).toEqual([
        { path: 'salaryMax', message },
      ]);
    });

    it('rejects a minimum above the maximum, on the minimum', () => {
      expect(
        issuesFor(schema.safeParse({ ...base, salaryMin: 180_001, salaryMax: 180_000 })),
      ).toEqual([{ path: 'salaryMin', message: "The minimum can't be more than the maximum" }]);
    });

    it('accepts either end alone', () => {
      expect(schema.parse({ ...base, salaryMin: 900 })).toEqual({ ...base, salaryMin: 900 });
      expect(schema.parse({ ...base, salaryMax: 5 })).toEqual({ ...base, salaryMax: 5 });
    });
  });

  it('treats a blank or null salary as not given when adding', () => {
    expect(OpportunityInputSchema.parse({ ...valid, salaryMin: null, salaryMax: '' })).toEqual(
      valid,
    );
    expect(OpportunityInputSchema.parse({ ...valid, salaryMin: '  ' })).toEqual(valid);
  });

  it('clears a blank or null salary when editing', () => {
    expect(OpportunityPatchSchema.parse({ salaryMin: null, salaryMax: ' ' })).toEqual({
      salaryMin: null,
      salaryMax: null,
    });
  });

  it('checks the range only between values given, when editing', () => {
    expect(OpportunityPatchSchema.parse({ salaryMin: 900, salaryMax: null })).toEqual({
      salaryMin: 900,
      salaryMax: null,
    });
  });

  it('is part of the opportunity response', () => {
    const parsed = OpportunitySchema.parse({
      id: 'o',
      company: 'Acme',
      title: 'Engineer',
      stage: 'CONSIDERING',
      status: 'OPEN',
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
      lastStageChangeAt: '2026-10-20T12:00:00.000Z',
      changeCount: 1,
      salaryMin: 150_000,
      salaryMax: 180_000,
    });
    expect([parsed.salaryMin, parsed.salaryMax]).toEqual([150_000, 180_000]);
  });
});

describe('date added', () => {
  const schemas = [
    ['create', OpportunityInputSchema, valid],
    ['edit', OpportunityPatchSchema, {}],
  ] as const;

  describe.each(schemas)('when %s', (_mode, schema, base) => {
    it('accepts a date and time with a time zone', () => {
      for (const createdAt of ['2026-07-04T12:00:00.000Z', '2026-07-04T12:00:00-05:00']) {
        expect(schema.parse({ ...base, createdAt })).toEqual({ ...base, createdAt });
      }
    });

    it('is optional', () => {
      expect(schema.parse(base)).not.toHaveProperty('createdAt');
    });

    it.each(['2026-07-04', 'yesterday', '2026-07-04T12:00:00', null, ''])(
      'rejects %j',
      (createdAt) => {
        expect(issuesFor(schema.safeParse({ ...base, createdAt }))).toEqual([
          { path: 'createdAt', message: 'Use a date and time with a time zone' },
        ]);
      },
    );
  });
});

describe('ContactSchema', () => {
  it('trims contact fields and keeps a partial contact', () => {
    expect(ContactSchema.parse({ name: ' Sam ', email: ' sam@example.com ' })).toEqual({
      name: 'Sam',
      email: 'sam@example.com',
    });
  });

  it.each([
    ['name', 200],
    ['role', 200],
    ['phone', 50],
  ])('limits contact %s to %i characters', (field, max) => {
    expect(ContactSchema.safeParse({ [field]: 'x'.repeat(max) }).success).toBe(true);
    expect(issuesFor(ContactSchema.safeParse({ [field]: 'x'.repeat(max + 1) }))).toEqual([
      { path: field, message: `Must be ${max} characters or fewer` },
    ]);
  });

  it('rejects an invalid email', () => {
    expect(issuesFor(ContactSchema.safeParse({ email: 'sam-at-example' }))).toEqual([
      { path: 'email', message: 'Enter a valid email address' },
    ]);
  });
});

describe('OpportunityPatchSchema', () => {
  it('accepts an empty patch', () => {
    expect(OpportunityPatchSchema.parse({})).toEqual({});
  });

  it('accepts a partial patch and trims values', () => {
    expect(OpportunityPatchSchema.parse({ title: ' Staff Engineer ', interest: 5 })).toEqual({
      title: 'Staff Engineer',
      interest: 5,
    });
  });

  it.each([
    ['company', 'Company is required'],
    ['title', 'Job title is required'],
  ])('rejects clearing %s', (field, message) => {
    expect(issuesFor(OpportunityPatchSchema.safeParse({ [field]: '' }))).toEqual([
      { path: field, message },
    ]);
    expect(issuesFor(OpportunityPatchSchema.safeParse({ [field]: null }))).toEqual([
      { path: field, message },
    ]);
  });

  it('turns blank optional fields into null, which clears them', () => {
    expect(
      OpportunityPatchSchema.parse({
        description: ' ',
        notes: '',
        location: '',
        source: '',
        compensation: '',
        postingUrl: '',
        followUpDate: '',
        workArrangement: '',
        interest: null,
      }),
    ).toEqual({
      description: null,
      notes: null,
      location: null,
      source: null,
      compensation: null,
      postingUrl: null,
      followUpDate: null,
      workArrangement: null,
      interest: null,
    });
  });

  it('clears the contact when every contact field is empty', () => {
    expect(OpportunityPatchSchema.parse({ contact: { name: '', email: ' ' } })).toEqual({
      contact: null,
    });
    expect(OpportunityPatchSchema.parse({ contact: null })).toEqual({ contact: null });
  });

  it('keeps a contact that has at least one value', () => {
    expect(OpportunityPatchSchema.parse({ contact: { name: 'Sam', email: '' } })).toEqual({
      contact: { name: 'Sam' },
    });
  });

  it('applies the same limits as create', () => {
    expect(issuesFor(OpportunityPatchSchema.safeParse({ location: 'x'.repeat(201) }))).toEqual([
      { path: 'location', message: 'Must be 200 characters or fewer' },
    ]);
    expect(issuesFor(OpportunityPatchSchema.safeParse({ interest: 9 }))).toEqual([
      { path: 'interest', message: 'Interest must be a whole number from 1 to 5' },
    ]);
  });

  it('rejects stage fields, which only change through stage changes', () => {
    expect(issuesFor(OpportunityPatchSchema.safeParse({ stage: 'APPLIED' }))).toEqual([
      { path: '', message: 'Unknown field: stage' },
    ]);
  });
});

describe('StageChangeInputSchema', () => {
  const change = { toStage: 'APPLIED', expectedChangeCount: 1 };

  it('accepts a stage change with only the target stage and change count', () => {
    expect(StageChangeInputSchema.parse(change)).toEqual(change);
  });

  it('accepts a note and a changedAt with a time zone', () => {
    expect(
      StageChangeInputSchema.parse({
        ...change,
        note: ' Applied via site ',
        changedAt: '2026-10-14T09:30:00-05:00',
      }),
    ).toEqual({ ...change, note: 'Applied via site', changedAt: '2026-10-14T09:30:00-05:00' });
  });

  it('drops a blank note', () => {
    expect(StageChangeInputSchema.parse({ ...change, note: '  ' })).toEqual(change);
  });

  it('limits the note to 2,000 characters', () => {
    expect(StageChangeInputSchema.safeParse({ ...change, note: 'x'.repeat(2000) }).success).toBe(
      true,
    );
    expect(
      issuesFor(StageChangeInputSchema.safeParse({ ...change, note: 'x'.repeat(2001) })),
    ).toEqual([{ path: 'note', message: 'Must be 2000 characters or fewer' }]);
  });

  it('rejects unknown fields', () => {
    expect(issuesFor(StageChangeInputSchema.safeParse({ ...change, status: 'CLOSED' }))).toEqual([
      { path: '', message: 'Unknown field: status' },
    ]);
  });

  it('rejects an unknown stage', () => {
    expect(issuesFor(StageChangeInputSchema.safeParse({ ...change, toStage: 'HIRED' }))).toEqual([
      { path: 'toStage', message: 'Unknown stage' },
    ]);
  });

  it.each(['2026-10-14', 'yesterday', '2026-10-14T09:30:00'])(
    'rejects changedAt %s',
    (changedAt) => {
      expect(issuesFor(StageChangeInputSchema.safeParse({ ...change, changedAt }))).toEqual([
        { path: 'changedAt', message: 'Use a date and time with a time zone' },
      ]);
    },
  );

  it.each([0, -1, 1.5])('rejects expectedChangeCount %s', (expectedChangeCount) => {
    expect(issuesFor(StageChangeInputSchema.safeParse({ ...change, expectedChangeCount }))).toEqual(
      [{ path: 'expectedChangeCount', message: 'Must be a positive whole number' }],
    );
  });
});

describe('response schemas', () => {
  const opportunity = {
    id: '01JABCDEF',
    company: 'Acme',
    title: 'Senior Engineer',
    interest: null,
    stage: 'APPLIED',
    status: 'OPEN',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-02T12:00:00.000Z',
    lastStageChangeAt: '2026-10-02T12:00:00.000Z',
    changeCount: 2,
  };
  const history = [
    {
      seq: 1,
      fromStage: null,
      toStage: 'CONSIDERING',
      changedAt: '2026-10-01T12:00:00.000Z',
      note: null,
      recordedAt: '2026-10-01T12:00:00.000Z',
    },
    {
      seq: 2,
      fromStage: 'CONSIDERING',
      toStage: 'APPLIED',
      changedAt: '2026-10-02T12:00:00.000Z',
      note: 'Applied',
      recordedAt: '2026-10-02T12:00:00.000Z',
    },
  ];

  it('parses an opportunity', () => {
    expect(OpportunitySchema.parse(opportunity)).toEqual(opportunity);
  });

  it('parses a closed opportunity with every optional field', () => {
    const closed = {
      ...opportunity,
      stage: 'REJECTED',
      status: 'CLOSED',
      interest: 4,
      contact: { name: 'Sam', role: 'Recruiter', email: 'sam@example.com', phone: '555' },
      description: 'Build things',
      postingUrl: 'https://example.com/job',
      location: 'Remote',
      workArrangement: 'REMOTE',
      compensation: '$150k',
      source: 'LinkedIn',
      followUpDate: '2026-11-03',
      notes: 'Good team',
    };

    expect(OpportunitySchema.parse(closed)).toEqual(closed);
  });

  it('rejects an opportunity with an unknown status', () => {
    expect(OpportunitySchema.safeParse({ ...opportunity, status: 'PAUSED' }).success).toBe(false);
  });

  it('parses a stage change and an opportunity with history', () => {
    expect(StageChangeSchema.parse(history[1])).toEqual(history[1]);
    expect(OpportunityWithHistorySchema.parse({ ...opportunity, history })).toEqual({
      ...opportunity,
      history,
    });
  });
});

describe('posted until (feature 009)', { tags: ['deadline'] }, () => {
  it('keeps a date when adding, and drops a blank one', () => {
    expect(OpportunityInputSchema.parse({ ...valid, postedUntil: '2026-11-30' })).toEqual({
      ...valid,
      postedUntil: '2026-11-30',
    });
    expect(OpportunityInputSchema.parse({ ...valid, postedUntil: ' ' })).toEqual(valid);
  });

  it.each(['2026-13-01', '2026-02-30', 'next week', '2026-11-30T10:00:00Z'])(
    'refuses %s',
    (date) => {
      expect(issuesFor(OpportunityInputSchema.safeParse({ ...valid, postedUntil: date }))).toEqual([
        { path: 'postedUntil', message: 'Use a date like 2026-11-03' },
      ]);
      expect(issuesFor(OpportunityPatchSchema.safeParse({ postedUntil: date }))).toEqual([
        { path: 'postedUntil', message: 'Use a date like 2026-11-03' },
      ]);
    },
  );

  it('changes it on edit, and clears it with null or blank', () => {
    expect(OpportunityPatchSchema.parse({ postedUntil: '2026-12-01' })).toEqual({
      postedUntil: '2026-12-01',
    });
    expect(OpportunityPatchSchema.parse({ postedUntil: null })).toEqual({ postedUntil: null });
    expect(OpportunityPatchSchema.parse({ postedUntil: '' })).toEqual({ postedUntil: null });
  });

  it('is optional in responses', () => {
    const opportunity = {
      id: '01JABCDEF',
      company: 'Acme',
      title: 'Senior Engineer',
      stage: 'APPLIED',
      status: 'OPEN',
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-02T12:00:00.000Z',
      lastStageChangeAt: '2026-10-02T12:00:00.000Z',
      changeCount: 2,
    };
    expect(OpportunitySchema.parse(opportunity)).not.toHaveProperty('postedUntil');
    expect(OpportunitySchema.parse({ ...opportunity, postedUntil: '2026-11-30' }).postedUntil).toBe(
      '2026-11-30',
    );
    expect(OpportunitySchema.safeParse({ ...opportunity, postedUntil: 'soon' }).success).toBe(
      false,
    );
  });
});

describe('the lead link (feature 010)', { tags: ['leads'] }, () => {
  it('keeps a lead when adding, and drops a blank one', () => {
    expect(OpportunityInputSchema.parse({ ...valid, leadId: ' 01JLEAD ' })).toEqual({
      ...valid,
      leadId: '01JLEAD',
    });
    expect(OpportunityInputSchema.parse({ ...valid, leadId: '' })).toEqual(valid);
  });

  it('changes it on edit, and clears it with null or blank', () => {
    expect(OpportunityPatchSchema.parse({ leadId: '01JLEAD' })).toEqual({ leadId: '01JLEAD' });
    expect(OpportunityPatchSchema.parse({ leadId: null })).toEqual({ leadId: null });
    expect(OpportunityPatchSchema.parse({ leadId: ' ' })).toEqual({ leadId: null });
  });

  it('refuses an id over 100 characters', () => {
    expect(
      issuesFor(OpportunityInputSchema.safeParse({ ...valid, leadId: 'x'.repeat(101) })),
    ).toEqual([{ path: 'leadId', message: 'Must be 100 characters or fewer' }]);
    expect(OpportunityPatchSchema.safeParse({ leadId: 'x'.repeat(100) }).success).toBe(true);
  });

  it('is optional in responses', () => {
    const opportunity = {
      id: '01JABCDEF',
      company: 'Acme',
      title: 'Senior Engineer',
      stage: 'APPLIED',
      status: 'OPEN',
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-02T12:00:00.000Z',
      lastStageChangeAt: '2026-10-02T12:00:00.000Z',
      changeCount: 2,
    };
    expect(OpportunitySchema.parse(opportunity)).not.toHaveProperty('leadId');
    expect(OpportunitySchema.parse({ ...opportunity, leadId: '01JLEAD' }).leadId).toBe('01JLEAD');
  });
});
