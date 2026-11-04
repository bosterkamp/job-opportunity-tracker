// @module-tag import
import { readFileSync } from 'node:fs';
import { PostingDetailsSchema } from '@jot/shared';
import { describe, expect, it } from 'vitest';
import { compact, description, text } from '../../../src/import/details.js';
import { extractJobPostings, mapJobPosting } from '../../../src/import/jobPosting.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/postings/${name}`, import.meta.url), 'utf8');

function detailsFrom(name: string, pageUrl: string) {
  const [posting] = extractJobPostings(fixture(name));
  return mapJobPosting(posting as Record<string, unknown>, pageUrl);
}

describe('extractJobPostings', () => {
  it.each([
    ['lever.html', 'Senior Platform Engineer'],
    ['ashby.html', 'Engineering Manager, Payments'],
    ['workday.html', 'Senior Systems Software Engineer - Build Infrastructure'],
    ['graph.html', 'Data Analyst'],
    ['array.html', 'Product Designer'],
  ])('finds the one JobPosting in %s', (name, title) => {
    const postings = extractJobPostings(fixture(name));

    expect(postings).toHaveLength(1);
    expect(postings[0]?.title).toBe(title);
  });

  it('finds every JobPosting when a page lists several', () => {
    expect(extractJobPostings(fixture('several.html')).map((p) => p.title)).toEqual([
      'Engineer I',
      'Engineer II',
    ]);
  });

  it('finds none on a page without one', () => {
    expect(extractJobPostings(fixture('no-job.html'))).toEqual([]);
    expect(extractJobPostings('<p>No scripts</p>')).toEqual([]);
  });

  it('reads only JSON-LD scripts, and skips broken ones', () => {
    const page = `
      <script>{"@type": "JobPosting", "title": "Plain script"}</script>
      <script type="application/json">{"@type": "JobPosting", "title": "Other JSON"}</script>
      <script type="application/ld+json">{ broken </script>
      <script type="application/ld+json">{"@type": "JobPosting", "title": "Kept"}</script>
      <p>{"@type": "JobPosting", "title": "Body text"}</p>`;

    expect(extractJobPostings(page).map((p) => p.title)).toEqual(['Kept']);
  });

  it('reads only script elements, even when another element claims the type', () => {
    const page =
      '<div type="application/ld+json">{"@type": "JobPosting", "title": "Div"}</div>' +
      '<script type="application/ld+json">{"@type": "JobPosting", "title": "Script"}</script>';

    expect(extractJobPostings(page).map((p) => p.title)).toEqual(['Script']);
  });

  it('reads a script cut off at the end of a page that was too long', () => {
    const page =
      '<p>x</p><script type="application/ld+json">{"@type": "JobPosting", "title": "End"}';

    expect(extractJobPostings(page).map((p) => p.title)).toEqual(['End']);
  });

  it('keeps entities in the JSON as written, and ignores text after the script', () => {
    const page =
      '<script type="application/ld+json">{"@type": "JobPosting", "title": "R&amp;D"}</script><p>after</p>';

    expect(extractJobPostings(page)).toEqual([{ '@type': 'JobPosting', title: 'R&amp;D' }]);
  });

  it.each([
    ['JobPosting'],
    [['Thing', 'JobPosting']],
    ['http://schema.org/JobPosting'],
    ['schema:JobPosting'],
  ])('accepts @type %j', (type) => {
    const page = `<script type="application/ld+json">${JSON.stringify({ '@type': type, title: 'T' })}</script>`;

    expect(extractJobPostings(page)).toHaveLength(1);
  });

  it.each([['NotAJobPosting'], ['JobPostingDraft'], [7], [undefined]])(
    'rejects @type %j',
    (type) => {
      const page = `<script type="application/ld+json">${JSON.stringify({ '@type': type, title: 'T' })}</script>`;

      expect(extractJobPostings(page)).toEqual([]);
    },
  );

  it('looks inside @graph and nested lists', () => {
    const page = `<script type="application/ld+json">${JSON.stringify([
      [{ '@graph': [{ '@type': 'JobPosting', title: 'Deep' }] }],
      null,
      'text',
    ])}</script>`;

    expect(extractJobPostings(page).map((p) => p.title)).toEqual(['Deep']);
  });
});

describe('mapJobPosting', () => {
  it('maps a Lever posting', () => {
    expect(detailsFrom('lever.html', 'https://jobs.lever.co/acme/123')).toEqual({
      company: 'Acme Rockets',
      title: 'Senior Platform Engineer',
      description:
        "Acme builds reusable rockets & launch software.\n\nWhat you'll do\n\n• Run the build platform\n\n• Mentor engineers\n\nLine one\nLine two",
      location: 'Austin, TX',
      source: 'Lever',
    });
  });

  it('maps an Ashby posting with pay and remote work', () => {
    expect(detailsFrom('ashby.html', 'https://jobs.ashbyhq.com/globex/1')).toEqual({
      company: 'Globex',
      title: 'Engineering Manager, Payments',
      description: 'Lead the payments team.',
      location: 'European Union',
      workArrangement: 'REMOTE',
      salaryMin: 110_000,
      salaryMax: 185_000,
      compensation: '€110,000–€185,000 a year',
      source: 'Ashby',
    });
  });

  it('maps a Workday posting, keeping the company as published', () => {
    expect(detailsFrom('workday.html', 'https://initech.wd5.myworkdayjobs.com/Site/job/1')).toEqual(
      {
        company: '2100 Initech USA',
        title: 'Senior Systems Software Engineer - Build Infrastructure',
        description:
          'Initech is looking for a Systems & Software Engineer. Hybrid: three days a week in the office.',
        location: 'US, CA, Santa Clara, United States of America',
        source: 'Workday',
        postedUntil: '2026-12-31',
      },
    );
  });

  it('maps a posting with a string company, several places, an hourly rate, and escaped HTML', () => {
    expect(detailsFrom('graph.html', 'https://www.umbrella.example/careers/7')).toEqual({
      company: 'Umbrella',
      title: 'Data Analyst',
      description: 'Analyze data.',
      location: 'Boston, MA, US; Remote',
      workArrangement: 'REMOTE',
      salaryMin: 45,
      salaryMax: 45,
      compensation: '$45 an hour',
      source: 'umbrella.example',
    });
  });

  it('maps a posting that states only a title', () => {
    expect(mapJobPosting({ title: '  Product   Designer ' }, 'https://hooli.example/j')).toEqual({
      title: 'Product Designer',
      source: 'hooli.example',
    });
  });

  it('gives nothing for a posting without a title', () => {
    expect(mapJobPosting({ hiringOrganization: 'Acme' }, 'https://a.example')).toBeUndefined();
    expect(mapJobPosting({ title: '   ' }, 'https://a.example')).toBeUndefined();
  });

  it('reads a location given as a plain string, and a single salary value', () => {
    expect(
      mapJobPosting(
        {
          title: 'T',
          jobLocation: { address: 'Denver, CO' },
          jobLocationType: ['TELECOMMUTE'],
          baseSalary: { currency: 'USD', value: 120_000 },
        },
        'https://a.example',
      ),
    ).toEqual({
      title: 'T',
      location: 'Denver, CO',
      workArrangement: 'REMOTE',
      salaryMin: 120_000,
      salaryMax: 120_000,
      compensation: '$120,000',
      source: 'a.example',
    });
  });

  it('reads a place without an address, and pay without a usable amount', () => {
    expect(
      mapJobPosting(
        {
          title: 'T',
          jobLocation: [{ name: 'HQ' }],
          baseSalary: { currency: 'USD', value: { unitText: 'YEAR' } },
        },
        'https://a.example',
      ),
    ).toEqual({ title: 'T', source: 'a.example' });
    expect(mapJobPosting({ title: 'T', baseSalary: 'competitive' }, 'https://a.example')).toEqual({
      title: 'T',
      source: 'a.example',
    });
  });

  it('reads a salary with only a value inside the range object', () => {
    expect(
      mapJobPosting(
        { title: 'T', baseSalary: { currency: 'USD', value: { value: 70, unitText: 'HOUR' } } },
        'https://a.example',
      )?.compensation,
    ).toBe('$70 an hour');
  });

  it('ignores fields that are not text', () => {
    expect(
      mapJobPosting(
        { title: 'T', hiringOrganization: { name: 5 }, description: ['x'], jobLocation: 3 },
        'https://a.example',
      ),
    ).toEqual({ title: 'T', source: 'a.example' });
  });

  it('always gives details that pass the shared schema', () => {
    for (const name of ['lever.html', 'ashby.html', 'workday.html', 'graph.html', 'array.html']) {
      expect(PostingDetailsSchema.safeParse(detailsFrom(name, 'https://x.example')).success).toBe(
        true,
      );
    }
  });
});

describe('detail helpers', () => {
  it('cleans text: decodes entities, collapses spaces, and caps the length', () => {
    expect(text(' R&amp;D \n team ')).toBe('R&D team');
    expect(text('x'.repeat(300))).toBe('x'.repeat(200));
    expect(text('abcdef', 3)).toBe('abc');
    expect(text('   ')).toBeUndefined();
    expect(text(42)).toBeUndefined();
  });

  it('turns a description into text, and says when it was cut', () => {
    expect(description('<p>Hi</p>')).toEqual({ description: 'Hi' });
    expect(description('&lt;p&gt;Hi&lt;/p&gt;')).toEqual({ description: 'Hi' });
    expect(description(`<p>${'word '.repeat(5000)}</p>`)).toEqual({
      description: expect.stringMatching(/^word/) as string,
      descriptionTruncated: true,
    });
    expect(description('<script>only</script>')).toEqual({});
    expect(description(undefined)).toEqual({});
  });

  it('leaves out missing fields', () => {
    expect(compact({ title: 'T', company: undefined, source: 's' })).toEqual({
      title: 'T',
      source: 's',
    });
  });
});

describe('the closing date (feature 009)', { tags: ['deadline'] }, () => {
  const closing = (validThrough: unknown) =>
    mapJobPosting({ title: 'Engineer', validThrough }, 'https://a.example')?.postedUntil;

  it.each([
    ['2026-11-30', '2026-11-30'],
    ['2026-11-30T23:59:59-05:00', '2026-11-30'],
    ['2026-11-30T00:00:00.000Z', '2026-11-30'],
    [' 2026-02-28 ', '2026-02-28'],
    ['2028-02-29', '2028-02-29'],
  ])('keeps the date the posting states in %j', (validThrough, date) => {
    expect(closing(validThrough)).toBe(date);
  });

  it.each([
    ['an impossible day', '2026-02-30'],
    ['a leap day in a common year', '2027-02-29'],
    ['a month that does not exist', '2026-13-01'],
    ['words', 'soon'],
    ['a date inside other text', 'by 2026-11-30'],
    ['a short date', '2026-1-5'],
    ['a number', 20261130],
    ['nothing', undefined],
  ])('leaves it out for %s, and still maps the rest', (_label, validThrough) => {
    expect(mapJobPosting({ title: 'Engineer', validThrough }, 'https://a.example')).toEqual({
      title: 'Engineer',
      source: 'a.example',
    });
  });
});
