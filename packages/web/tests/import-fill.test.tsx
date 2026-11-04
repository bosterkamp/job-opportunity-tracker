// @module-tag import
import type { PostingDetails } from '@jot/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_VALUES, OpportunityForm } from '../src/components/OpportunityForm';
import { FILLABLE, fillForm, fillMessage } from '../src/features/import/fillForm';
import { anOpportunity, jsonResponse, mockApi, renderApp } from './harness';
import { fill } from './user';

afterEach(() => {
  vi.restoreAllMocks();
});

const LINK = 'https://jobs.lever.co/acme/123';
const details: PostingDetails = {
  company: 'Acme Rockets',
  title: 'Senior Platform Engineer',
  description: 'Build the platform.',
  location: 'Austin, TX',
  workArrangement: 'HYBRID',
  salaryMin: 150_000,
  salaryMax: 180_000,
  compensation: '$150,000–$180,000 a year',
  source: 'Lever',
};

const field = (name: string) => screen.getByLabelText(name, { exact: false });
const fillButton = () => screen.getByRole('button', { name: /Fill from link|Filling…/ });

describe('fillForm', () => {
  it('fills every empty field the posting states, in form order', () => {
    const result = fillForm(EMPTY_VALUES, details);

    expect(result.values).toEqual({
      ...EMPTY_VALUES,
      company: 'Acme Rockets',
      title: 'Senior Platform Engineer',
      description: 'Build the platform.',
      location: 'Austin, TX',
      workArrangement: 'HYBRID',
      salaryMin: '150000',
      salaryMax: '180000',
      compensation: '$150,000–$180,000 a year',
      source: 'Lever',
    });
    expect(result.filled).toEqual([
      'company',
      'title',
      'description',
      'location',
      'workArrangement',
      'salaryMin',
      'salaryMax',
      'compensation',
      'source',
    ]);
    expect(result.kept).toEqual([]);
  });

  it('never touches the link, interest, contact, follow-up date, or notes', () => {
    const typed = {
      ...EMPTY_VALUES,
      postingUrl: LINK,
      interest: 4,
      contactName: 'Sam',
      followUpDate: '2030-01-01',
      notes: 'Mine',
    };

    const { values } = fillForm(typed, details);

    expect(values).toMatchObject({
      postingUrl: LINK,
      interest: 4,
      contactName: 'Sam',
      followUpDate: '2030-01-01',
      notes: 'Mine',
    });
  });

  it('keeps a typed value that differs, and treats the same value (or only spaces) as neither', () => {
    const result = fillForm(
      {
        ...EMPTY_VALUES,
        company: 'Typed Co',
        title: '  Senior Platform Engineer ',
        location: '  ',
      },
      details,
    );

    expect(result.values.company).toBe('Typed Co');
    expect(result.values.title).toBe('  Senior Platform Engineer ');
    expect(result.values.location).toBe('Austin, TX');
    expect(result.kept).toEqual(['company']);
    expect(result.filled).not.toContain('title');
    expect(result.filled).toContain('location');
  });

  it('treats a salary typed another way as the same amount, and keeps a different one', () => {
    const result = fillForm(
      { ...EMPTY_VALUES, salaryMin: ' $150k ', salaryMax: '175000' },
      details,
    );

    expect(result.values).toMatchObject({ salaryMin: ' $150k ', salaryMax: '175000' });
    expect(result.filled).not.toContain('salaryMin');
    expect(result.kept).toEqual(['salaryMax']);
  });

  it('compares text fields as text, even when they hold only digits', () => {
    const result = fillForm(
      { ...EMPTY_VALUES, compensation: '150000' },
      { title: 'T', source: 'S', compensation: '150000' },
    );

    expect(result.kept).toEqual([]);
    expect(result.filled).not.toContain('compensation');
  });

  it('leaves fields the posting does not state', () => {
    const result = fillForm(EMPTY_VALUES, { title: 'Engineer', source: 'acme.com' });

    expect(result.filled).toEqual(['title', 'source']);
    expect(result.values.company).toBe('');
  });

  it('names the fields the way the form labels them', () => {
    expect(FILLABLE).toEqual({
      company: 'Company',
      title: 'Job title',
      description: 'Job description',
      location: 'Location',
      workArrangement: 'Work arrangement',
      salaryMin: 'Salary minimum',
      salaryMax: 'Salary maximum',
      compensation: 'Pay notes',
      source: 'Where you found it',
      postedUntil: 'Posted until',
    });
  });
});

describe('fillMessage', () => {
  const result = (filled: string[], kept: string[] = []) =>
    ({ values: EMPTY_VALUES, filled, kept }) as Parameters<typeof fillMessage>[0];

  it('lists what was filled and what was kept', () => {
    expect(fillMessage(result(['company', 'title']))).toBe('Filled in: Company, Job title.');
    expect(fillMessage(result(['title'], ['company', 'location']))).toBe(
      'Filled in: Job title. Kept what you typed for: Company, Location.',
    );
    expect(fillMessage(result([], ['company']))).toBe(
      'Nothing new to fill in. Kept what you typed for: Company.',
    );
    expect(fillMessage(result([]))).toBe('Nothing new to fill in.');
  });

  it('says the description was shortened only when it filled the description', () => {
    expect(fillMessage(result(['description']), true)).toBe(
      'Filled in: Job description. The description was shortened to fit.',
    );
    expect(fillMessage(result(['title']), true)).toBe('Filled in: Job title.');
    expect(fillMessage(result(['description']), false)).toBe('Filled in: Job description.');
    expect(fillMessage(result(['description']))).toBe('Filled in: Job description.');
  });
});

describe('the add form with "Fill from link"', () => {
  it('puts the link first, with the button beside it, disabled until a link is entered', async () => {
    mockApi({});
    renderApp('/opportunities/new');

    const form = screen
      .getByRole('button', { name: 'Save opportunity' })
      .closest('form') as HTMLElement;
    expect(within(form).getAllByRole('textbox')[0]).toBe(field('Job posting link'));
    expect(field('Job posting link')).toBeVisible();
    expect(fillButton()).toHaveTextContent('Fill from link');
    expect(fillButton()).toHaveAttribute('type', 'button');
    expect(fillButton()).toBeDisabled();

    await fill(field('Job posting link'), '   ');
    expect(fillButton()).toBeDisabled();
    await fill(field('Job posting link'), LINK);
    expect(fillButton()).toBeEnabled();
  });

  it('fills the form from the posting, and says what it filled', async () => {
    const requests: unknown[] = [];
    mockApi({
      'POST /imports': ({ body }) => {
        requests.push(body);
        return jsonResponse(200, details);
      },
    });
    renderApp('/opportunities/new');
    await fill(field('Job posting link'), `  ${LINK} `);

    await userEvent.click(fillButton());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Filled in: Company, Job title, Job description, Location, Work arrangement, Salary minimum, Salary maximum, Pay notes, Where you found it.',
    );
    expect(requests).toEqual([{ url: LINK }]);
    expect(field('Company')).toHaveValue('Acme Rockets');
    expect(field('Job title')).toHaveValue('Senior Platform Engineer');
    expect(field('Location')).toBeVisible();
    expect(field('Location')).toHaveValue('Austin, TX');
    expect(field('Work arrangement')).toHaveValue('HYBRID');
    expect(field('Salary minimum')).toHaveValue('150000');
    expect(field('Salary maximum')).toHaveValue('180000');
    expect(field('Pay notes')).toHaveValue('$150,000–$180,000 a year');
    expect(field('Where you found it')).toHaveValue('Lever');
  });

  it('says when the description was shortened', async () => {
    mockApi({
      'POST /imports': () => jsonResponse(200, { ...details, descriptionTruncated: true }),
    });
    renderApp('/opportunities/new');
    await fill(field('Job posting link'), LINK);

    await userEvent.click(fillButton());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'The description was shortened to fit.',
    );
  });

  it('shows that it is filling, and still lets the form be saved by hand', async () => {
    mockApi({ 'POST /imports': () => new Promise<Response>(() => undefined) });
    renderApp('/opportunities/new');
    await fill(field('Job posting link'), LINK);

    await userEvent.click(fillButton());

    expect(fillButton()).toHaveTextContent('Filling…');
    expect(fillButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save opportunity' })).toBeEnabled();
  });

  it('saves nothing until Save is chosen, then saves exactly what the form shows', async () => {
    const created: unknown[] = [];
    mockApi({
      'POST /imports': () => jsonResponse(200, details),
      'POST /opportunities': ({ body }) => {
        created.push(body);
        return jsonResponse(201, anOpportunity({ id: 'saved', title: details.title }));
      },
      'GET /opportunities/saved': () => jsonResponse(200, anOpportunity({ id: 'saved' })),
    });
    renderApp('/opportunities/new');
    await fill(field('Job posting link'), LINK);
    await userEvent.click(fillButton());
    await screen.findByText(/Filled in:/);
    expect(created).toEqual([]);

    await userEvent.clear(field('Location'));
    await fill(field('Location'), 'Remote');
    await userEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({
      company: 'Acme Rockets',
      title: 'Senior Platform Engineer',
      description: 'Build the platform.',
      interest: null,
      postingUrl: LINK,
      location: 'Remote',
      workArrangement: 'HYBRID',
      salaryMin: 150_000,
      salaryMax: 180_000,
      compensation: '$150,000–$180,000 a year',
      source: 'Lever',
    });
  });

  it('keeps a company typed before filling, and says so', async () => {
    mockApi({ 'POST /imports': () => jsonResponse(200, details) });
    renderApp('/opportunities/new');
    await fill(field('Company'), 'Typed Co');
    await fill(field('Job posting link'), LINK);

    await userEvent.click(fillButton());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Kept what you typed for: Company.',
    );
    expect(field('Company')).toHaveValue('Typed Co');
    expect(field('Job title')).toHaveValue('Senior Platform Engineer');
  });

  it('keeps a value typed while the fill was still loading', async () => {
    let answer: (response: Response) => void = () => undefined;
    mockApi({ 'POST /imports': () => new Promise<Response>((resolve) => (answer = resolve)) });
    renderApp('/opportunities/new');
    await fill(field('Job posting link'), LINK);
    await userEvent.click(fillButton());

    await fill(field('Job title'), 'My title');
    answer(jsonResponse(200, details));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Kept what you typed for: Job title.',
    );
    expect(field('Job title')).toHaveValue('My title');
    expect(field('Company')).toHaveValue('Acme Rockets');
  });

  it('fills only what is still empty on a second fill', async () => {
    let calls = 0;
    mockApi({
      'POST /imports': () => {
        calls += 1;
        return jsonResponse(
          200,
          calls === 1 ? { title: 'First', source: 'Lever' } : { ...details, title: 'Second' },
        );
      },
    });
    renderApp('/opportunities/new');
    await fill(field('Job posting link'), LINK);
    await userEvent.click(fillButton());
    await screen.findByText(/Filled in: Job title, Where you found it\./);

    await userEvent.click(fillButton());

    expect(await screen.findByText(/Kept what you typed for: Job title\./)).toBeInTheDocument();
    expect(field('Job title')).toHaveValue('First');
    expect(field('Company')).toHaveValue('Acme Rockets');
  });

  it.each([
    ['SIGN_IN_REQUIRED', "This site doesn't let its postings be read without signing in."],
    ['NO_JOB_DETAILS', 'No job details were found on that page.'],
    ['MULTIPLE_JOBS', 'That page lists several jobs.'],
    ['UNREACHABLE', "That page couldn't be loaded."],
    ['URL_NOT_ALLOWED', "That link can't be used."],
  ])('shows the %s message and leaves the form as it was', async (code, message) => {
    mockApi({ 'POST /imports': () => jsonResponse(422, { code, message }) });
    renderApp('/opportunities/new');
    await fill(field('Company'), 'Typed Co');
    await fill(field('Job posting link'), LINK);

    await userEvent.click(fillButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(field('Company')).toHaveValue('Typed Co');
    expect(field('Job title')).toHaveValue('');
    expect(field('Job posting link')).toHaveValue(LINK);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(fillButton()).toBeEnabled();
  });

  it('clears a success message when the next fill fails', async () => {
    let calls = 0;
    mockApi({
      'POST /imports': () => {
        calls += 1;
        return calls === 1
          ? jsonResponse(200, { title: 'First', source: 'Lever' })
          : jsonResponse(422, { code: 'UNREACHABLE', message: "That page couldn't be loaded." });
      },
    });
    renderApp('/opportunities/new');
    await fill(field('Job posting link'), LINK);
    await userEvent.click(fillButton());
    await screen.findByText(/Filled in:/);

    await userEvent.click(fillButton());

    await screen.findByRole('alert');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('clears the problems on the fields it fills, and keeps the others', async () => {
    mockApi({ 'POST /imports': () => jsonResponse(200, { title: 'Engineer', source: 'Lever' }) });
    renderApp('/opportunities/new');
    await userEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));
    expect(field('Company')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Job title')).toHaveAttribute('aria-invalid', 'true');

    await fill(field('Job posting link'), LINK);
    await userEvent.click(fillButton());

    await screen.findByText(/Filled in: Job title/);
    expect(field('Job title')).not.toHaveAttribute('aria-invalid');
    expect(field('Company')).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears the last message when filling again', async () => {
    let calls = 0;
    mockApi({
      'POST /imports': () => {
        calls += 1;
        return calls === 1
          ? jsonResponse(422, { code: 'UNREACHABLE', message: "That page couldn't be loaded." })
          : jsonResponse(200, details);
      },
    });
    renderApp('/opportunities/new');
    await fill(field('Job posting link'), LINK);
    await userEvent.click(fillButton());
    await screen.findByRole('alert');

    await userEvent.click(fillButton());

    await screen.findByText(/Filled in:/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('checks the link before sending it, with the form message', async () => {
    const requests: unknown[] = [];
    mockApi({
      'POST /imports': ({ body }) => {
        requests.push(body);
        return jsonResponse(200, details);
      },
    });
    renderApp('/opportunities/new');
    await fill(field('Job posting link'), 'jobs at acme');

    await userEvent.click(fillButton());

    expect(field('Job posting link')).toHaveAccessibleDescription('Must be an http or https link');
    await waitFor(() => expect(field('Job posting link')).toHaveFocus());
    expect(requests).toEqual([]);

    await userEvent.clear(field('Job posting link'));
    await fill(field('Job posting link'), LINK);
    await userEvent.click(fillButton());
    await screen.findByText(/Filled in:/);
    expect(field('Job posting link')).not.toHaveAttribute('aria-invalid');
  });
});

describe('adding without a link', () => {
  it('saves only a company and title, exactly as before', async () => {
    const created: unknown[] = [];
    mockApi({
      'POST /opportunities': ({ body }) => {
        created.push(body);
        return jsonResponse(201, anOpportunity({ id: 'plain' }));
      },
      'GET /opportunities/plain': () => jsonResponse(200, anOpportunity({ id: 'plain' })),
    });
    renderApp('/opportunities/new');

    expect(fillButton()).toBeDisabled();
    await fill(field('Company'), 'Acme');
    await fill(field('Job title'), 'Engineer');
    await userEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));

    await waitFor(() =>
      expect(created).toEqual([{ company: 'Acme', title: 'Engineer', interest: null }]),
    );
  });

  it('still warns about a duplicate after a fill', async () => {
    mockApi({
      'GET /opportunities?status=OPEN': () =>
        jsonResponse(200, {
          items: [
            {
              ...anOpportunity({ id: 'dup', company: 'Acme Rockets', title: details.title }),
              history: undefined,
            },
          ],
        }),
      'POST /imports': () => jsonResponse(200, details),
    });
    renderApp('/opportunities/new');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await fill(field('Job posting link'), LINK);
    await userEvent.click(fillButton());
    await screen.findByText(/Filled in:/);

    await userEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `You already have an open opportunity for ${details.title} at Acme Rockets.`,
    );
  });
});

describe('the link field outside of adding', () => {
  it('sits with the other details, with no button, when editing', async () => {
    render(
      <OpportunityForm
        mode="edit"
        submitLabel="Save changes"
        initialValues={{ ...EMPTY_VALUES, company: 'Acme', title: 'Engineer', postingUrl: 'nope' }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Fill from link' })).not.toBeInTheDocument();
    expect(field('Job posting link')).toBeVisible();
    expect(field('Job posting link')).toHaveAttribute('type', 'url');
    const labels = [...document.querySelectorAll('label')].map((l) => l.textContent);
    expect(labels.indexOf('Job posting link')).toBe(labels.indexOf('Job description') + 1);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(field('Job posting link')).toHaveFocus());
  });

  it('is first but has no button when the add form is given no way to read links', () => {
    render(<OpportunityForm submitLabel="Save" onSubmit={vi.fn()} />);

    expect(field('Job posting link')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Fill from link' })).not.toBeInTheDocument();
  });
});

describe('filling the closing date (feature 009)', { tags: ['deadline'] }, () => {
  const withDate: PostingDetails = { ...details, postedUntil: '2026-11-30' };

  it('fills an empty "Posted until" and says so', () => {
    const result = fillForm(EMPTY_VALUES, withDate);

    expect(result.values.postedUntil).toBe('2026-11-30');
    expect(result.filled).toContain('postedUntil');
    expect(fillMessage(result)).toContain('Posted until');
    expect(FILLABLE.postedUntil).toBe('Posted until');
  });

  it('keeps a date the owner typed', () => {
    const result = fillForm({ ...EMPTY_VALUES, postedUntil: '2026-12-15' }, withDate);

    expect(result.values.postedUntil).toBe('2026-12-15');
    expect(result.kept).toEqual(['postedUntil']);
  });

  it('leaves it empty when the posting does not say', () => {
    expect(fillForm(EMPTY_VALUES, details).values.postedUntil).toBe('');
  });
});
