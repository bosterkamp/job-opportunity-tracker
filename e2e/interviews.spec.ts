import type { Page } from '@playwright/test';
import {
  API_URL,
  browserDateDaysAgo,
  expect,
  openOpportunity,
  seedInStage,
  test,
} from './fixtures';

// Feature 005: logging interviews and the interview count (spec.md US1–US3; quickstart.md).

const history = (page: Page) => page.getByRole('region', { name: 'History' }).getByRole('listitem');
const stage = (page: Page) =>
  page.getByRole('term').filter({ hasText: 'Stage' }).locator('xpath=following-sibling::dd[1]');

async function logInterview(page: Page, { day, note }: { day?: string; note?: string } = {}) {
  await page.getByRole('button', { name: 'Add interview' }).click();
  const form = page.getByRole('form', { name: 'Add interview' });
  if (day) await form.getByLabel('Date', { exact: true }).fill(day);
  if (note) await form.getByLabel('Note', { exact: true }).fill(note);
  await form.getByRole('button', { name: 'Save interview' }).click();
  await expect(form).toBeHidden();
}

test.describe('interviews (feature 005)', { tag: '@interview' }, () => {
  test('interviews are logged on the opportunity and shown in the history, in date order', async ({
    page,
    request,
  }) => {
    // Added a month ago, so an interview last week is after the date added.
    const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await seedInStage(request, { company: 'Farmers', title: 'Engineer', createdAt }, 'CONSIDERING');
    const lastWeek = await browserDateDaysAgo(page, 7);
    await openOpportunity(page, 'Farmers');

    await logInterview(page);
    await logInterview(page, { day: lastWeek.input.slice(0, 10), note: 'Hiring manager' });

    // In date order: added, last week's interview, today's. Interview entries also end with
    // their Edit and Remove buttons, so they're matched by what they contain.
    await expect(history(page)).toHaveText([/^Considering · /, /^Interview · /, /^Interview · /]);
    await expect(history(page).nth(1)).toContainText(
      `Interview · ${lastWeek.shown} · Hiring manager`,
    );
    // Logging an interview never moves the opportunity.
    await expect(stage(page)).toHaveText('Considering');
  });

  test(
    'cards show how many interviews, and only once there is one',
    { tag: ['@overview', '@responsive'] },
    async ({ page, request }) => {
      // Phones open on the Considering tab, so both are seeded there.
      const { id } = await seedInStage(
        request,
        { company: 'Farmers', title: 'Engineer' },
        'CONSIDERING',
      );
      await seedInStage(request, { company: 'Acme', title: 'Engineer' }, 'CONSIDERING');
      for (let i = 0; i < 2; i++) {
        const response = await request.post(`${API_URL}/opportunities/${id}/interviews`, {
          data: {},
        });
        expect(response.status()).toBe(201);
      }

      await page.goto('/');

      await expect(page.getByRole('article', { name: 'Farmers' })).toContainText('2 interviews');
      await expect(page.getByRole('article', { name: 'Acme' })).not.toContainText('interview');
    },
  );

  test('an interview can be changed, and removed after confirming', async ({ page, request }) => {
    const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { id } = await seedInStage(
      request,
      { company: 'Farmers', title: 'Engineer', createdAt },
      'CONSIDERING',
    );
    for (const note of ['Phone', 'Panel']) {
      const response = await request.post(`${API_URL}/opportunities/${id}/interviews`, {
        data: { note },
      });
      expect(response.status()).toBe(201);
    }
    const twoDaysAgo = await browserDateDaysAgo(page, 2);
    await openOpportunity(page, 'Farmers');

    // Change the phone interview's day and note.
    const phone = history(page).filter({ hasText: 'Phone' });
    await phone.getByRole('button', { name: /^Edit the interview on / }).click();
    const form = page.getByRole('form', { name: 'Change interview' });
    await form.getByLabel('Date', { exact: true }).fill(twoDaysAgo.input.slice(0, 10));
    await form.getByLabel('Note', { exact: true }).fill('Phone screen');
    await form.getByRole('button', { name: 'Save interview' }).click();
    await expect(form).toBeHidden();
    await expect(history(page).filter({ hasText: 'Phone screen' })).toContainText(
      `Interview · ${twoDaysAgo.shown} · Phone screen`,
    );

    // Remove the panel interview.
    await history(page)
      .filter({ hasText: 'Panel' })
      .getByRole('button', { name: /^Remove the interview on / })
      .click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect(history(page).filter({ hasText: 'Panel' })).toHaveCount(0);

    await page.goto('/');
    await expect(page.getByRole('article', { name: 'Farmers' })).toContainText('1 interview');
  });
});
