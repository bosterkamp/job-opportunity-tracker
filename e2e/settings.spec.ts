import { expect, test } from './fixtures';

// Settings (feature 014): how much each offer detail counts toward the overall score.

test.describe('Settings', { tag: '@offer' }, () => {
  test('an importance is saved on its own and kept', { tag: '@responsive' }, async ({ page }) => {
    await page.goto('/settings');
    const baseSalary = page.getByLabel('How much Base salary counts');
    const title = page.getByLabel('How much Title counts');
    await expect(baseSalary).toHaveValue('1');

    await baseSalary.selectOption('3');
    await expect(page.getByRole('status')).toHaveText('Saved');
    await title.selectOption('0');
    await expect(page.getByRole('status')).toHaveText('Saved');

    await page.reload();
    await expect(baseSalary).toHaveValue('3');
    await expect(title).toHaveValue('0');
    await expect(page.getByLabel('How much PTO counts')).toHaveValue('1');

    // The page never scrolls sideways, on a phone either.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
