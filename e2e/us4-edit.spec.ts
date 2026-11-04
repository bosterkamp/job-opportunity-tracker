import type { Page } from '@playwright/test';
import { addOpportunity, expect, openOpportunity, seedInStage, test } from './fixtures';

// User Story 4: keep details current, and remove mistakes (spec.md US4; quickstart.md step 4).

// Today as YYYY-MM-DD in the browser's time zone, the value a date input takes.
function todayInput(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
}

const company = (page: Page) => page.getByRole('textbox', { name: 'Company', exact: true });

test.describe('Edit and delete (US4)', { tag: '@edit' }, () => {
  test(
    'editing interest and the follow-up date saves, survives a reload, and flags a due follow-up',
    { tag: '@responsive' },
    async ({ page, request }) => {
      await seedInStage(
        request,
        { company: 'Acme', title: 'Senior Engineer', interest: 3 },
        'CONSIDERING',
      );
      await openOpportunity(page, 'Acme');

      await page.getByRole('button', { name: 'Edit details' }).click();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Edit Senior Engineer' }),
      ).toBeVisible();
      await expect(company(page)).toHaveValue('Acme');
      // Every field shows at once when editing (feature 004).
      await page.getByRole('radio', { name: '5 of 5', exact: true }).check({ force: true });
      await page.getByLabel('Follow-up date', { exact: true }).fill(await todayInput(page));
      await page.getByRole('button', { name: 'Save changes' }).click();

      await expect(page.getByRole('heading', { level: 2, name: 'Senior Engineer' })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('img', { name: 'Interest: 5 of 5' })).toBeVisible();
      await expect(page.getByText('· Follow up now')).toBeVisible();

      await page.goto('/');
      const card = page.getByRole('article', { name: 'Acme' });
      await expect(card.getByText('Follow up', { exact: true })).toBeVisible();
      await expect(card.getByRole('img', { name: 'Interest: 5 of 5' })).toBeVisible();
    },
  );

  test('clearing a required field is rejected and keeps the saved value', async ({
    page,
    request,
  }) => {
    await seedInStage(request, { company: 'Acme', title: 'Senior Engineer' }, 'CONSIDERING');
    await openOpportunity(page, 'Acme');

    await page.getByRole('button', { name: 'Edit details' }).click();
    await company(page).fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(company(page)).toHaveAccessibleDescription('Company is required');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.reload();
    await expect(page.getByText('Acme').first()).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('article', { name: 'Acme' })).toBeVisible();
  });

  test('adding a duplicate of an open opportunity warns first, and can be added anyway', async ({
    page,
    request,
  }) => {
    await seedInStage(request, { company: 'Acme', title: 'Senior Engineer' }, 'APPLIED');

    // Wait until the open list (for the duplicate check) has loaded.
    const openList = page.waitForResponse((r) => r.url().includes('/opportunities?status=OPEN'));
    await page.goto('/opportunities/new');
    await openList;
    await company(page).fill('acme');
    await page.getByRole('textbox', { name: 'Job title', exact: true }).fill('Senior engineer');
    await page.getByRole('button', { name: 'Save opportunity' }).click();

    const warning = page.getByRole('alert');
    await expect(warning).toContainText(
      'You already have an open opportunity for Senior Engineer at Acme.',
    );
    await expect(warning.getByRole('link', { name: 'Open existing' })).toBeVisible();
    await warning.getByRole('button', { name: 'Add anyway' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Senior engineer' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('article')).toHaveCount(2);
  });

  test('deleting needs the company name typed, and removes it everywhere', async ({ page }) => {
    await addOpportunity(page, { company: 'Initech', title: 'Engineer' });

    await page.getByRole('button', { name: 'Delete permanently' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete Initech permanently?' });
    const del = dialog.getByRole('button', { name: 'Delete', exact: true });
    await expect(del).toBeDisabled();
    await dialog.getByLabel('Type the company name to confirm').fill('Initech');
    await del.click();

    await expect(page.getByRole('heading', { level: 2, name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Initech' })).toHaveCount(0);
    await page.goto('/archive');
    await expect(page.getByText('Nothing in the archive yet.')).toBeVisible();
  });
});
