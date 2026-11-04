// @module-tag leads
import { describe, expect, it } from 'vitest';
import {
  LeadInputSchema,
  LeadPatchSchema,
  LeadSchema,
  LeadWithOpportunitiesSchema,
} from '../../src/schemas.js';

function issuesFor(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return (result.error?.issues ?? []).map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

const lead = {
  id: '01JLEAD',
  name: 'Dana Ruiz',
  email: 'dana@example.com',
  phone: '+1 555 0100',
  createdAt: '2026-10-31T15:00:00.000Z',
  updatedAt: '2026-10-31T15:00:00.000Z',
};

describe('LeadInputSchema', () => {
  it('keeps a trimmed name, email and phone', () => {
    expect(
      LeadInputSchema.parse({
        name: '  Dana Ruiz ',
        email: ' dana@example.com ',
        phone: ' +1 555 0100 ',
      }),
    ).toEqual({ name: 'Dana Ruiz', email: 'dana@example.com', phone: '+1 555 0100' });
  });

  it('needs only a name, and drops a blank email or phone', () => {
    expect(LeadInputSchema.parse({ name: 'Dana' })).toEqual({ name: 'Dana' });
    expect(LeadInputSchema.parse({ name: 'Dana', email: ' ', phone: '' })).toEqual({
      name: 'Dana',
    });
  });

  it.each([{}, { name: '' }, { name: '   ' }, { name: 7 }])(
    'refuses %j without a name',
    (input) => {
      expect(issuesFor(LeadInputSchema.safeParse(input))).toEqual([
        { path: 'name', message: 'Name is required' },
      ]);
    },
  );

  it('refuses a name over 200 characters, but takes 200', () => {
    expect(LeadInputSchema.safeParse({ name: 'x'.repeat(200) }).success).toBe(true);
    expect(issuesFor(LeadInputSchema.safeParse({ name: 'x'.repeat(201) }))).toEqual([
      { path: 'name', message: 'Must be 200 characters or fewer' },
    ]);
  });

  it('refuses an invalid email and a phone over 50 characters', () => {
    expect(issuesFor(LeadInputSchema.safeParse({ name: 'Dana', email: 'dana@' }))).toEqual([
      { path: 'email', message: 'Enter a valid email address' },
    ]);
    expect(LeadInputSchema.safeParse({ name: 'Dana', phone: '1'.repeat(50) }).success).toBe(true);
    expect(issuesFor(LeadInputSchema.safeParse({ name: 'Dana', phone: '1'.repeat(51) }))).toEqual([
      { path: 'phone', message: 'Must be 50 characters or fewer' },
    ]);
  });

  it('refuses any other field', () => {
    expect(
      issuesFor(LeadInputSchema.safeParse({ name: 'Dana', notes: 'met at a meetup' })),
    ).toEqual([{ path: '', message: 'Unknown field: notes' }]);
  });
});

describe('LeadPatchSchema', () => {
  it('changes only what is given', () => {
    expect(LeadPatchSchema.parse({})).toEqual({});
    expect(LeadPatchSchema.parse({ phone: ' 555 0199 ' })).toEqual({ phone: '555 0199' });
  });

  it('clears the email or phone with null or blank', () => {
    expect(LeadPatchSchema.parse({ email: null, phone: ' ' })).toEqual({
      email: null,
      phone: null,
    });
  });

  it("can't clear the name", () => {
    expect(issuesFor(LeadPatchSchema.safeParse({ name: '' }))).toEqual([
      { path: 'name', message: 'Name is required' },
    ]);
    expect(LeadPatchSchema.safeParse({ name: null }).success).toBe(false);
  });

  it('checks the email and refuses other fields', () => {
    expect(issuesFor(LeadPatchSchema.safeParse({ email: 'nope' }))).toEqual([
      { path: 'email', message: 'Enter a valid email address' },
    ]);
    expect(issuesFor(LeadPatchSchema.safeParse({ company: 'Acme' }))).toEqual([
      { path: '', message: 'Unknown field: company' },
    ]);
  });
});

describe('lead responses', () => {
  it('parses a lead, with or without its email and phone', () => {
    expect(LeadSchema.parse(lead)).toEqual(lead);
    const { email: _email, phone: _phone, ...nameOnly } = lead;
    expect(LeadSchema.parse(nameOnly)).toEqual(nameOnly);
    expect(LeadSchema.safeParse({ ...lead, createdAt: 'today' }).success).toBe(false);
  });

  it('parses a lead with its opportunities', () => {
    const withOpportunities = {
      ...lead,
      opportunities: [
        {
          id: '01JOPP',
          company: 'Acme',
          title: 'Staff Engineer',
          stage: 'APPLIED',
          status: 'OPEN',
        },
      ],
      notes: [],
    };
    expect(LeadWithOpportunitiesSchema.parse(withOpportunities)).toEqual(withOpportunities);
    expect(
      LeadWithOpportunitiesSchema.safeParse({
        ...lead,
        opportunities: [{ ...withOpportunities.opportunities[0], stage: 'HIRED' }],
        notes: [],
      }).success,
    ).toBe(false);
  });
});
