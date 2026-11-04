import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { addOpportunity, expect, seedInStage, test } from './fixtures';

// Feature 009: the date a posting is up until, on the cards and as the overview's default sort
// (spec.md US1–US3; quickstart.md).

// A YYYY-MM-DD date `days` from today in the browser's time zone, the app's "today".
function browserDate(page: Page, days: number): Promise<string> {
  return page.evaluate((offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }, days);
}

test.describe('the posting deadline (feature 009)', { tag: ['@deadline', '@responsive'] }, () => {
  test('the overview opens with the postings that close soonest first', async ({
    page,
    request,
  }) => {
    // All in Considering, which phones open on. Seeded in the opposite order to the expected one,
    // so the most recently changed (today's old default) would put them the other way round.
    const seeds: [string, number | undefined][] = [
      ['Ended', -7],
      ['Undated', undefined],
      ['Later', 20],
      ['Soon', 2],
    ];
    for (const [company, days] of seeds) {
      const postedUntil = days === undefined ? undefined : await browserDate(page, days);
      await seedInStage(request, { company, title: 'Engineer', postedUntil }, 'CONSIDERING');
    }

    await page.goto('/');

    await expect(page.getByLabel('Sort by')).toHaveValue('closing');
    await expect(page.getByRole('combobox', { name: 'Sort by' })).toContainText('Closing soonest');
    const cards = page.getByRole('article');
    await expect(cards.getByRole('heading')).toHaveText(['Soon', 'Later', 'Undated', 'Ended']);
    await expect(cards.nth(0)).toContainText('Closes in 2 days');
    await expect(cards.nth(1)).toContainText('Open until');
    await expect(cards.nth(2)).not.toContainText(/Open until|Closes|Posting ended/);
    await expect(cards.nth(3)).toContainText('Posting ended');

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((v) => ({ colorScheme, rule: v.id }))).toEqual([]);
    }

    await page.getByLabel('Sort by').selectOption({ label: 'Recently changed' });
    await expect(page).toHaveURL(/[?&]sort=recent/);
    await page.reload();
    await expect(page.getByLabel('Sort by')).toHaveValue('recent');
    await expect(cards.getByRole('heading')).toHaveText(['Soon', 'Later', 'Undated', 'Ended']);
  });

  test('the archive keeps Recently changed as its default', async ({ page, request }) => {
    // The archive shows its toolbar once there's something in it.
    await seedInStage(request, { company: 'Withdrawn', title: 'Engineer' }, 'WITHDRAWN');

    await page.goto('/archive');

    await expect(page.getByLabel('Sort by')).toHaveValue('recent');
  });

  test('a date entered on the add form shows on the opportunity', async ({ page }) => {
    const postedUntil = await browserDate(page, 10);

    await addOpportunity(page, { company: 'Initech', title: 'Engineer', postedUntil });

    const term = page.getByRole('term').filter({ hasText: 'Posted until' });
    await expect(term).toBeVisible();
    await expect(term.locator('xpath=following-sibling::dd[1]')).not.toBeEmpty();
  });
});
