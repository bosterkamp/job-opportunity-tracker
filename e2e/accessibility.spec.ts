import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, openOpportunity, seedInStage, test } from './fixtures';

// Accessibility checks with axe (WCAG 2.2 A and AA, including color contrast and target size)
// on every page and dialog, in light and dark mode. Each block is tagged with the feature
// whose screens it checks.

// On phones, everything you tap is at least 44 by 44 px (the project's touch-target size,
// stricter than WCAG's 24 px). Links inside running text are exempt, as WCAG allows.
async function expectTouchTargets(page: Page) {
  if ((page.viewportSize()?.width ?? 0) >= 640) {
    return;
  }
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('a, button, input, select, textarea, summary')]
      .filter((el) => !el.closest('p, li > span'))
      .map((el) => {
        // A visually hidden input is tapped through its label, and a link stretched over its
        // card with an absolutely positioned ::after is tapped anywhere on the card.
        const stretched = getComputedStyle(el, '::after').position === 'absolute';
        const target =
          el.matches('input') && el.closest('label')
            ? el.closest('label')!
            : stretched && el.offsetParent instanceof HTMLElement
              ? el.offsetParent
              : el;
        const box = target.getBoundingClientRect();
        return { el: target, box, hidden: box.width <= 1 || box.height <= 1 };
      })
      .filter(({ hidden, box }) => !hidden && (box.width < 44 || box.height < 44))
      .map(
        ({ el, box }) =>
          `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
      ),
  );
  expect(small).toEqual([]);
}

async function expectNoViolations(page: Page) {
  await expectTouchTargets(page);
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map((v) => ({
        colorScheme,
        rule: v.id,
        nodes: v.nodes.map((n) => n.target.join(' ')),
      })),
    ).toEqual([]);
  }
}

// Tab and Shift+Tab, several times each, never move focus out of the open dialog.
async function expectFocusTrapped(page: Page, dialog: Locator) {
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
  }
}

test.describe('Accessibility', () => {
  test.describe('overview and archive', { tag: '@overview' }, () => {
    test('the board and the archive', { tag: '@responsive' }, async ({ page, request }) => {
      await seedInStage(request, { company: 'Acme', title: 'Engineer', interest: 4 }, 'APPLIED');
      await seedInStage(request, { company: 'Globex', title: 'Engineer' }, 'CONSIDERING');
      await seedInStage(request, { company: 'Initech', title: 'Engineer' }, 'REJECTED');

      await page.goto('/');
      await expect(page.getByRole('article', { name: 'Globex' })).toBeVisible();
      await expectNoViolations(page);

      await page.goto('/archive');
      await expect(page.getByRole('article', { name: 'Initech' })).toBeVisible();
      await expectNoViolations(page);
    });

    test('the empty overview', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByText('No opportunities yet.')).toBeVisible();
      await expectNoViolations(page);
    });
  });

  test.describe('adding', { tag: '@capture' }, () => {
    test(
      'the add form, with every field and its errors',
      { tag: '@responsive' },
      async ({ page }) => {
        await page.goto('/opportunities/new');
        await page.getByRole('button', { name: 'Save opportunity' }).click();
        await expect(page.getByText('Company is required')).toBeVisible();
        await expectNoViolations(page);
      },
    );

    test('the detail page', async ({ page, request }) => {
      await seedInStage(
        request,
        { company: 'Acme', title: 'Engineer', interest: 3, notes: 'Call back' },
        'APPLIED',
      );
      await openOpportunity(page, 'Acme');
      await expect(page.getByRole('heading', { level: 2, name: 'Engineer' })).toBeVisible();
      await expectNoViolations(page);
    });
  });

  test.describe('moving stages', { tag: '@pipeline' }, () => {
    test('the "Move to…" dialog', { tag: '@responsive' }, async ({ page, request }) => {
      await seedInStage(request, { company: 'Acme', title: 'Engineer' }, 'CONSIDERING');
      await openOpportunity(page, 'Acme');
      await page.getByRole('button', { name: 'Move to…' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoViolations(page);
    });

    test('keeps keyboard focus inside the "Move to…" dialog', async ({ page, request }) => {
      await seedInStage(request, { company: 'Acme', title: 'Engineer' }, 'CONSIDERING');
      await openOpportunity(page, 'Acme');
      await page.getByRole('button', { name: 'Move to…' }).click();

      await expectFocusTrapped(page, page.getByRole('dialog'));
    });
  });

  test.describe('editing and deleting', { tag: '@edit' }, () => {
    test(
      'the edit form and the delete dialog',
      { tag: '@responsive' },
      async ({ page, request }) => {
        await seedInStage(request, { company: 'Acme', title: 'Engineer' }, 'CONSIDERING');
        await openOpportunity(page, 'Acme');

        await page.getByRole('button', { name: 'Edit details' }).click();
        await expect(page.getByRole('heading', { level: 2, name: 'Edit Engineer' })).toBeVisible();
        await expectNoViolations(page);

        await page.getByRole('button', { name: 'Cancel' }).click();
        await page.getByRole('button', { name: 'Delete permanently' }).click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await expectNoViolations(page);
      },
    );

    test('keeps keyboard focus inside the delete dialog', async ({ page, request }) => {
      await seedInStage(request, { company: 'Acme', title: 'Engineer' }, 'CONSIDERING');
      await openOpportunity(page, 'Acme');
      await page.getByRole('button', { name: 'Delete permanently' }).click();
      await page.getByLabel('Type the company name to confirm').fill('Acme');

      await expectFocusTrapped(page, page.getByRole('alertdialog'));
    });
  });

  test.describe('filling from a link', { tag: '@import' }, () => {
    test(
      'the add form after a fill, and after a failed one',
      { tag: '@responsive' },
      async ({ page }) => {
        await page.goto('/opportunities/new');
        const link = page.getByRole('textbox', { name: 'Job posting link', exact: true });
        const fill = page.getByRole('button', { name: 'Fill from link' });

        await link.fill('http://localhost:5175/posting.html');
        await fill.click();
        await expect(page.getByRole('status')).toContainText('Filled in:');
        await expectNoViolations(page);

        await link.fill('http://localhost:5175/no-job.html');
        await fill.click();
        await expect(page.getByRole('alert')).toContainText('No job details were found');
        await expectNoViolations(page);
      },
    );
  });
});
