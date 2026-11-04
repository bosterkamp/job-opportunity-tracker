// @module-tag import
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { greenhouseApiUrl, mapGreenhouse } from '../../../src/import/greenhouse.js';

const posting = () =>
  JSON.parse(
    readFileSync(new URL('../../fixtures/postings/greenhouse.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;

describe('greenhouseApiUrl', () => {
  it.each([
    'https://job-boards.greenhouse.io/soylent/jobs/4001',
    'https://boards.greenhouse.io/soylent/jobs/4001',
    'https://job-boards.greenhouse.io/soylent/jobs/4001/',
    'https://job-boards.greenhouse.io/soylent/jobs/4001?gh_src=abc',
    'https://JOB-BOARDS.GREENHOUSE.IO/soylent/jobs/4001',
  ])('reads %s through the public API', (link) => {
    expect(greenhouseApiUrl(link)).toBe(
      'https://boards-api.greenhouse.io/v1/boards/soylent/jobs/4001?pay_transparency=true',
    );
  });

  it('keeps a board name with dashes', () => {
    expect(greenhouseApiUrl('https://boards.greenhouse.io/acme-co/jobs/7')).toBe(
      'https://boards-api.greenhouse.io/v1/boards/acme-co/jobs/7?pay_transparency=true',
    );
  });

  it.each([
    'https://jobs.lever.co/soylent/4001',
    'https://www.soylent.com/careers?gh_jid=4001',
    'https://job-boards.greenhouse.io/soylent',
    'https://job-boards.greenhouse.io/soylent/jobs/abc',
    'https://job-boards.greenhouse.io/soylent/jobs/4001/apply',
    'https://job-boards.greenhouse.io/x/soylent/jobs/4001',
    'https://evil.example/soylent/jobs/4001',
    'https://boards.greenhouse.io.evil.example/soylent/jobs/4001',
  ])('leaves %s alone', (link) => {
    expect(greenhouseApiUrl(link)).toBeUndefined();
  });
});

describe('mapGreenhouse', () => {
  it('maps the public API posting', () => {
    expect(mapGreenhouse(posting())).toEqual({
      company: 'Soylent',
      title: 'Revenue Accounting & Reporting Lead',
      description: 'About Soylent\n\nWe make food & drinks.\n\n• Close the books',
      location: 'San Francisco, CA | Seattle, WA',
      workArrangement: 'ONSITE',
      salaryMin: 190_000,
      salaryMax: 230_000,
      compensation: '$190,000–$230,000 a year',
      source: 'Greenhouse',
    });
  });

  it('reads hourly pay, and pay without a unit', () => {
    const hourly = {
      ...posting(),
      pay_input_ranges: [
        { min_cents: 4500, max_cents: 6000, currency_type: 'USD', title: 'Hourly rate' },
      ],
    };
    const unlabeled = {
      ...posting(),
      pay_input_ranges: [{ min_cents: 100000, currency_type: 'USD', title: 'Pay' }],
    };
    const untitled = {
      ...posting(),
      pay_input_ranges: [{ min_cents: 100000, currency_type: 'USD' }],
    };

    expect(mapGreenhouse(hourly)).toMatchObject({
      compensation: '$45–$60 an hour',
      salaryMin: 45,
      salaryMax: 60,
    });
    expect(mapGreenhouse(unlabeled)?.compensation).toBe('$1,000');
    expect(mapGreenhouse(untitled)?.compensation).toBe('$1,000');
  });

  it('reads the arrangement from the location when there is no Location Type', () => {
    const remote = {
      ...posting(),
      metadata: [{ name: 'Team', value: 'Finance' }],
      location: { name: 'Remote - US' },
    };

    expect(mapGreenhouse(remote)?.workArrangement).toBe('REMOTE');
  });

  it('leaves out what the posting does not state', () => {
    expect(
      mapGreenhouse({ title: 'Analyst', metadata: null, pay_input_ranges: [null], location: 'x' }),
    ).toEqual({
      title: 'Analyst',
      source: 'Greenhouse',
    });
    expect(
      mapGreenhouse({ title: 'Analyst', metadata: [{ name: 'Location Type', value: 7 }] }),
    ).toEqual({
      title: 'Analyst',
      source: 'Greenhouse',
    });
  });

  it('ignores pay and metadata that are not lists', () => {
    expect(
      mapGreenhouse({
        title: 'Analyst',
        metadata: { name: 'Location Type' },
        pay_input_ranges: 'none',
      }),
    ).toEqual({ title: 'Analyst', source: 'Greenhouse' });
  });

  it.each([null, 'text', {}, { title: '' }])('gives nothing for %j', (json) => {
    expect(mapGreenhouse(json)).toBeUndefined();
  });
});
