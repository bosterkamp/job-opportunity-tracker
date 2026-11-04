import {
  test as base,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';

// The e2e copy of the local API that Playwright starts (see playwright.config.ts), with its
// own table, separate from `npm run dev`. Against a deployed site (E2E_BASE_URL set) there is
// no reset route, and tests must not touch real data.
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3101';
const isLocal = !process.env.E2E_BASE_URL;

const RESET_TIMEOUT_MS = 30_000;

// Empties the local table. Retries while the local API is still starting up.
export async function resetData(request: APIRequestContext): Promise<void> {
  const deadline = Date.now() + RESET_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await request.post(`${API_URL}/__test/reset`);
      if (response.status() === 204) {
        return;
      }
      lastError = new Error(`Reset returned HTTP ${response.status()}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Could not reset local data at ${API_URL}: ${String(lastError)}`);
}

export interface OpportunityFields {
  company: string;
  title: string;
  interest?: number;
  contact?: { name?: string; role?: string; email?: string; phone?: string };
  description?: string;
  postingUrl?: string;
  location?: string;
  // The option label, for example "Hybrid".
  workArrangement?: string;
  salaryMin?: number;
  salaryMax?: number;
  // Shown as "Pay notes".
  compensation?: string;
  source?: string;
  // YYYY-MM-DD
  followUpDate?: string;
  // YYYY-MM-DD: the date the posting is up until (feature 009).
  postedUntil?: string;
  notes?: string;
  // The date added as an ISO date-time; only seeding through the API uses it.
  createdAt?: string;
}

// Fills the "Add opportunity" form and saves it, then waits for the detail page. `lead` is the
// name of a networking lead to pick under "Lead" (feature 010).
export async function addOpportunity(
  page: Page,
  { lead, ...fields }: OpportunityFields & { lead?: string },
): Promise<void> {
  await page.goto('/opportunities/new');
  await page.getByRole('textbox', { name: 'Company', exact: true }).fill(fields.company);
  await page.getByRole('textbox', { name: 'Job title', exact: true }).fill(fields.title);

  if (fields.interest) {
    await page
      .getByRole('radio', { name: `${fields.interest} of 5`, exact: true })
      .check({ force: true });
  }
  const contact = page.getByRole('group', { name: 'Point of contact' });
  const fills: [Locator, string | undefined][] = [
    [contact.getByLabel('Name', { exact: true }), fields.contact?.name],
    [contact.getByLabel('Role', { exact: true }), fields.contact?.role],
    [contact.getByLabel('Email', { exact: true }), fields.contact?.email],
    [contact.getByLabel('Phone', { exact: true }), fields.contact?.phone],
    [page.getByLabel('Job description', { exact: true }), fields.description],
    [page.getByLabel('Job posting link', { exact: true }), fields.postingUrl],
    [page.getByLabel('Location', { exact: true }), fields.location],
    [page.getByLabel('Salary minimum', { exact: true }), fields.salaryMin?.toString()],
    [page.getByLabel('Salary maximum', { exact: true }), fields.salaryMax?.toString()],
    [page.getByLabel('Pay notes', { exact: true }), fields.compensation],
    [page.getByLabel('Where you found it', { exact: true }), fields.source],
    [page.getByLabel('Posted until', { exact: true }), fields.postedUntil],
    [page.getByLabel('Follow-up date', { exact: true }), fields.followUpDate],
    [page.getByLabel('Notes', { exact: true }), fields.notes],
  ];
  for (const [locator, value] of fills) {
    if (value !== undefined) {
      await locator.fill(value);
    }
  }
  if (fields.workArrangement) {
    await page
      .getByLabel('Work arrangement', { exact: true })
      .selectOption({ label: fields.workArrangement });
  }
  if (lead) {
    await page.getByLabel('Lead', { exact: true }).selectOption({ label: lead });
  }

  await page.getByRole('button', { name: 'Save opportunity' }).click();
  await expect(page.getByRole('heading', { level: 2, name: fields.title })).toBeVisible();
}

// Creates a networking lead (feature 010) straight through the local API.
export async function createLead(
  request: APIRequestContext,
  lead: { name: string; email?: string; phone?: string },
): Promise<{ id: string }> {
  const response = await request.post(`${API_URL}/leads`, { data: lead });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

// Adds a note to a lead (feature 011) straight through the local API.
export async function addLeadNote(
  request: APIRequestContext,
  leadId: string,
  note: { text: string; heldAt?: string },
): Promise<void> {
  const response = await request.post(`${API_URL}/leads/${leadId}/notes`, { data: note });
  expect(response.status()).toBe(201);
}

// Opens an opportunity from the overview by its company name.
export async function openOpportunity(page: Page, company: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('article', { name: company }).getByRole('link', { name: company }).click();
}

// Creates opportunities straight through the local API, for fast test setup.
export async function seedOpportunities(
  request: APIRequestContext,
  count: number,
  overrides: (index: number) => Partial<OpportunityFields> = () => ({}),
): Promise<{ id: string; company: string }[]> {
  const created: { id: string; company: string }[] = [];
  for (let i = 0; i < count; i++) {
    const response = await request.post(`${API_URL}/opportunities`, {
      data: { company: `Company ${i + 1}`, title: 'Engineer', ...overrides(i) },
    });
    expect(response.status()).toBe(201);
    created.push((await response.json()) as { id: string; company: string });
  }
  return created;
}

// Creates an opportunity through the local API and moves it to `stage` (an API stage id such
// as "APPLIED"), for fast setup of a board with several stages.
export async function seedInStage(
  request: APIRequestContext,
  fields: Partial<OpportunityFields> & { company: string },
  stage: string,
): Promise<{ id: string }> {
  const [created] = await seedOpportunities(request, 1, () => fields);
  const id = (created as { id: string }).id;
  if (stage !== 'CONSIDERING') {
    const response = await request.post(`${API_URL}/opportunities/${id}/stage-changes`, {
      data: { toStage: stage, expectedChangeCount: 1 },
    });
    expect(response.status()).toBe(201);
  }
  return { id };
}

// Moves the opportunity shown on its detail page to another stage, through the visible
// "Move to…" control (a popover on desktop, a bottom sheet on phones). `when` is a
// datetime-local value (YYYY-MM-DDTHH:mm) in the browser's time zone.
export async function moveTo(
  page: Page,
  stage: string,
  { note, when }: { note?: string; when?: string } = {},
): Promise<void> {
  await page.getByRole('button', { name: 'Move to…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: stage, exact: true }).check();
  if (note !== undefined) {
    await dialog.getByLabel('Note (optional)').fill(note);
  }
  if (when !== undefined) {
    await dialog.getByLabel('When?').fill(when);
  }
  await dialog.getByRole('button', { name: 'Move', exact: true }).click();
}

// A datetime-local value for `daysAgo` days before now, in the browser's time zone, and how
// the app will show that date.
export function browserDateDaysAgo(
  page: Page,
  daysAgo: number,
): Promise<{ input: string; shown: string }> {
  return page.evaluate((days) => {
    const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      input: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,
      shown: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date),
    };
  }, daysAgo);
}

// Today's date as the app shows it, using the browser's own locale and time zone.
export function todayInBrowser(page: Page): Promise<string> {
  return page.evaluate(() =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date()),
  );
}

export const test = base.extend<{ cleanData: void }>({
  // Every local test starts from an empty table.
  cleanData: [
    async ({ request }, use) => {
      if (isLocal) {
        await resetData(request);
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
