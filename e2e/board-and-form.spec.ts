import type { Page } from '@playwright/test';
import { addOpportunity, browserDateDaysAgo, expect, moveTo, seedInStage, test } from './fixtures';

// Feature 004: board and form updates (spec.md US1–US4; quickstart.md).

const card = (page: Page, company: string) => page.getByRole('article', { name: company });
const companies = (page: Page) => page.getByRole('article').getByRole('heading', { level: 3 });

test.describe('salary (US1)', { tag: ['@overview', '@capture'] }, () => {
  test('a salary range is entered, shown on the card, sorted, and filtered', async ({
    page,
    request,
  }) => {
    await addOpportunity(page, {
      company: 'Acme',
      title: 'Engineer',
      salaryMin: 150_000,
      salaryMax: 180_000,
      compensation: 'Plus equity',
    });
    await expect(page.getByText('$150k–$180k')).toBeVisible();
    await expect(page.getByText('Plus equity')).toBeVisible();

    const seed = (company: string, salary: { salaryMin?: number; salaryMax?: number }) =>
      seedInStage(request, { company, title: 'Engineer', ...salary }, 'CONSIDERING');
    await seed('Globex', { salaryMax: 200_000 });
    await seed('Initech', { salaryMin: 90_000 });
    await seed('Hooli', {});

    await page.goto('/?sort=salary-max');
    await expect(card(page, 'Acme')).toContainText('$150k–$180k');
    await expect(card(page, 'Globex')).toContainText('Up to $200k');
    await expect(card(page, 'Initech')).toContainText('$90k+');
    // No maximum sorts last, newest change first among those.
    await expect(companies(page)).toHaveText(['Globex', 'Acme', 'Hooli', 'Initech']);

    await page.getByLabel('Salary at least').selectOption({ label: '$150k' });
    await expect(companies(page)).toHaveText(['Globex', 'Acme']);
    await expect(page.getByText('1 hidden because it has no salary')).toBeVisible();
    await expect(page).toHaveURL(/salary=150000/);
  });

  test('a minimum above the maximum is refused', async ({ page }) => {
    await page.goto('/opportunities/new');
    await page.getByRole('textbox', { name: 'Company', exact: true }).fill('Acme');
    await page.getByRole('textbox', { name: 'Job title', exact: true }).fill('Engineer');
    // Typed the way people write amounts; both are understood, and then compared.
    await page.getByLabel('Salary minimum', { exact: true }).fill('$200k');
    await page.getByLabel('Salary maximum', { exact: true }).fill('150,000');
    await page.getByRole('button', { name: 'Save opportunity' }).click();

    await expect(page.getByText("The minimum can't be more than the maximum")).toBeVisible();
    await expect(page.getByLabel('Salary minimum', { exact: true })).toBeFocused();
  });
});

test.describe('date added (US2)', { tag: ['@capture', '@edit'] }, () => {
  const history = (page: Page) =>
    page.getByRole('region', { name: 'History' }).getByRole('listitem');
  const fact = (page: Page, term: string) =>
    page.getByRole('term').filter({ hasText: term }).locator('xpath=following-sibling::dd[1]');

  test('an opportunity found months ago is entered with its real date, which can be moved', async ({
    page,
  }) => {
    // 100 days: noon that day is 99 or 100 full days ago at any time of day, so "3 months".
    const found = await browserDateDaysAgo(page, 100);
    await page.goto('/opportunities/new');
    await page.getByRole('textbox', { name: 'Company', exact: true }).fill('Old Co');
    await page.getByRole('textbox', { name: 'Job title', exact: true }).fill('Engineer');
    await page.getByLabel('Date added', { exact: true }).fill(found.input.slice(0, 10));
    await page.getByRole('button', { name: 'Save opportunity' }).click();

    await expect(page.getByRole('heading', { level: 2, name: 'Engineer' })).toBeVisible();
    await expect(fact(page, 'Date added')).toHaveText(found.shown);
    await expect(history(page)).toHaveText([`Considering · ${found.shown}`]);
    await page.goto('/');
    await expect(card(page, 'Old Co')).toContainText('Last change 3 months ago');

    const corrected = await browserDateDaysAgo(page, 60);
    await card(page, 'Old Co').getByRole('link', { name: 'Old Co' }).click();
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByLabel('Date added', { exact: true }).fill(corrected.input.slice(0, 10));
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(history(page)).toHaveText([`Considering · ${corrected.shown}`]);
    await expect(fact(page, 'Date added')).toHaveText(corrected.shown);
  });
});

test.describe('closed column (US3)', { tag: '@overview' }, () => {
  test(
    'closed opportunities show their outcome at the end of the board, and leave it when reopened',
    { tag: '@responsive' },
    async ({ page, request }) => {
      await seedInStage(request, { company: 'Acme', title: 'Engineer' }, 'CONSIDERING');
      await seedInStage(request, { company: 'Umbrella', title: 'Engineer' }, 'REJECTED');

      await page.goto('/');
      const wide = (page.viewportSize()?.width ?? 0) >= 1280;
      if (wide) {
        await expect(page.getByRole('region').last()).toHaveAccessibleName('Closed 1');
      } else {
        // Phones open on Considering; the Closed tab comes last.
        await expect(page.getByRole('tab').last()).toHaveText('Closed (1)');
        await page.getByRole('tab', { name: 'Closed (1)' }).click();
      }
      const closed = card(page, 'Umbrella');
      await expect(closed).toContainText('Rejected');
      await expect(closed.getByRole('button', { name: /Move/ })).toHaveCount(0);

      await closed.getByRole('link', { name: 'Umbrella' }).click();
      await moveTo(page, 'Applied');
      await page.goto('/');
      if (wide) {
        await expect(page.getByRole('region').last()).toContainText('Nothing closed yet');
      } else {
        await expect(page.getByRole('tab').last()).toHaveText('Closed (0)');
      }
    },
  );
});

test.describe('board width', { tag: '@overview' }, () => {
  for (const width of [1280, 1920]) {
    test(`at ${width} px every column, Closed included, fits on screen`, async ({
      page,
      request,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chromium', 'the board is a desktop layout');
      await seedInStage(request, { company: 'Umbrella', title: 'Engineer' }, 'REJECTED');
      await page.setViewportSize({ width, height: 800 });

      await page.goto('/');
      const closed = page.getByRole('region').last();
      await expect(closed).toHaveAccessibleName('Closed 1');

      const box = await closed.boundingBox();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      // Nothing hidden to the side of the board.
      const board = page.locator('[data-board]');
      expect(await board.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
    });
  }
});

test.describe('full edit page (US4)', { tag: '@edit' }, () => {
  test('editing and adding both show every field at once (feature 011)', async ({
    page,
    request,
  }) => {
    await seedInStage(request, { company: 'Acme', title: 'Engineer' }, 'CONSIDERING');

    await page.goto('/');
    await card(page, 'Acme').getByRole('link', { name: 'Acme' }).click();
    await page.getByRole('button', { name: 'Edit details' }).click();
    await expect(page.getByText('More details')).toHaveCount(0);
    await expect(page.getByLabel('Notes', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Salary maximum', { exact: true })).toBeVisible();

    await page.goto('/opportunities/new');
    await expect(page.getByText('More details')).toHaveCount(0);
    await expect(page.getByLabel('Notes', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Lead', { exact: true })).toBeVisible();
  });
});
