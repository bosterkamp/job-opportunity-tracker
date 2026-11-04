import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Feature 002: fill the add form from a job posting link (specs/002-import-job-from-link).
// The postings are synthetic pages from e2e/fixtures/posting-server.mjs.
const POSTINGS = 'http://localhost:5175';

const link = (page: Page) => page.getByRole('textbox', { name: 'Job posting link', exact: true });
const fillButton = (page: Page) => page.getByRole('button', { name: /Fill from link|Filling…/ });
const company = (page: Page) => page.getByRole('textbox', { name: 'Company', exact: true });
const title = (page: Page) => page.getByRole('textbox', { name: 'Job title', exact: true });

async function fillFrom(page: Page, url: string) {
  await link(page).fill(url);
  await fillButton(page).click();
}

test.describe('Fill from link (feature 002)', { tag: '@import' }, () => {
  test(
    'filling from a posting fills the form, and saving keeps the values and the link',
    { tag: '@responsive' },
    async ({ page }) => {
      await page.goto('/opportunities/new');
      await expect(fillButton(page)).toBeDisabled();

      await fillFrom(page, `${POSTINGS}/posting.html`);

      await expect(page.getByRole('status')).toContainText(
        'Filled in: Company, Job title, Job description, Location, Work arrangement, Salary minimum, Salary maximum, Pay notes, Where you found it.',
      );
      await expect(company(page)).toHaveValue('Initrode');
      await expect(title(page)).toHaveValue('Staff Software Engineer');
      await expect(page.getByLabel('Location', { exact: true })).toHaveValue('Denver, CO');
      await expect(page.getByLabel('Salary minimum', { exact: true })).toHaveValue('170000');
      await expect(page.getByLabel('Salary maximum', { exact: true })).toHaveValue('210000');
      await expect(page.getByLabel('Pay notes', { exact: true })).toHaveValue(
        '$170,000–$210,000 a year',
      );
      await expect(page.getByLabel('Job description', { exact: true })).toHaveValue(
        'Lead the payments platform.\n\n• Design services\n• Mentor engineers',
      );

      await page.getByRole('button', { name: 'Save opportunity' }).click();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Staff Software Engineer' }),
      ).toBeVisible();
      await page.reload();
      await expect(page.getByText('Denver, CO')).toBeVisible();
      await expect(page.getByRole('link', { name: `${POSTINGS}/posting.html` })).toBeVisible();
    },
  );

  test('a company typed before filling is kept', async ({ page }) => {
    await page.goto('/opportunities/new');
    await company(page).fill('My Company');

    await fillFrom(page, `${POSTINGS}/posting.html`);

    await expect(page.getByRole('status')).toContainText('Kept what you typed for: Company.');
    await expect(company(page)).toHaveValue('My Company');
    await expect(title(page)).toHaveValue('Staff Software Engineer');
  });

  for (const [name, url, message] of [
    ['a page without job details', `${POSTINGS}/no-job.html`, 'No job details were found'],
    ['a page with several jobs', `${POSTINGS}/several.html`, 'That page lists several jobs'],
    ['a link the API may not read', 'http://localhost:3101/health', "That link can't be used"],
  ] as const) {
    test(`${name} shows why, and leaves the form unchanged`, async ({ page }) => {
      await page.goto('/opportunities/new');
      await company(page).fill('Typed Co');

      await fillFrom(page, url);

      await expect(page.getByRole('alert')).toContainText(message);
      await expect(company(page)).toHaveValue('Typed Co');
      await expect(title(page)).toHaveValue('');
      await expect(fillButton(page)).toBeEnabled();
    });
  }

  test('adding without a link works as before', async ({ page }) => {
    await page.goto('/opportunities/new');
    await company(page).fill('Acme');
    await title(page).fill('Engineer');

    await page.getByRole('button', { name: 'Save opportunity' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Engineer' })).toBeVisible();
    await expect(page.getByText('Considering', { exact: true }).first()).toBeVisible();
  });
});
