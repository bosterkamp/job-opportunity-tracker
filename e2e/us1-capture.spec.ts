import { addOpportunity, expect, test, todayInBrowser } from './fixtures';

// User Story 1: capture a new opportunity (spec.md US1; quickstart.md step 1).

test.describe('Capture (US1)', { tag: '@capture' }, () => {
  test(
    'the empty overview offers a way to add the first opportunity',
    { tag: '@responsive' },
    async ({ page }) => {
      await page.goto('/');

      await expect(page.getByText('No opportunities yet.')).toBeVisible();
      await page.getByRole('link', { name: 'Add your first opportunity' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Add opportunity' })).toBeVisible();
    },
  );

  test('adding only a company and title saves it in Considering, dated today', async ({ page }) => {
    await addOpportunity(page, { company: 'Acme', title: 'Senior Engineer' });

    const today = await todayInBrowser(page);
    await expect(page.getByText('Acme', { exact: true })).toBeVisible();
    await expect(page.getByRole('definition').filter({ hasText: 'Considering' })).toBeVisible();
    await expect(page.getByRole('definition').filter({ hasText: today })).toBeVisible();
    await expect(page.getByText('Not rated')).toBeVisible();

    await page.goto('/');
    // Desktop board: the card is in the Considering column.
    const card = page
      .getByRole('region', { name: /^Considering/ })
      .getByRole('article', { name: 'Acme' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Senior Engineer');
    await expect(page.getByRole('article')).toHaveCount(1);
  });

  test('an empty job title shows "Job title is required" and saves nothing', async ({ page }) => {
    await page.goto('/opportunities/new');
    await page.getByRole('textbox', { name: 'Company', exact: true }).fill('Acme');

    await page.getByRole('button', { name: 'Save opportunity' }).click();

    await expect(page.getByText('Job title is required')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Job title', exact: true })).toBeFocused();
    await page.goto('/');
    await expect(page.getByText('No opportunities yet.')).toBeVisible();
  });

  test(
    'every field is saved exactly as entered and survives a reload',
    { tag: '@responsive' },
    async ({ page }) => {
      await addOpportunity(page, {
        company: 'Initech',
        title: 'Principal Engineer',
        interest: 4,
        contact: {
          name: 'Sam Lee',
          role: 'Recruiter',
          email: 'sam@initech.example',
          phone: '+1 555 0100',
        },
        description: 'Build things.\n\n- Lead the platform team\n- Mentor engineers',
        postingUrl: 'https://initech.example/jobs/42',
        location: 'Austin, TX',
        workArrangement: 'Hybrid',
        compensation: '$180k–$210k',
        source: 'Referral: Pat',
        followUpDate: '2026-11-03',
        notes: 'Ask about on-call.',
      });

      await page.reload();

      await expect(
        page.getByRole('heading', { level: 2, name: 'Principal Engineer' }),
      ).toBeVisible();
      await expect(page.getByRole('img', { name: 'Interest: 4 of 5' })).toBeVisible();
      for (const text of [
        'Sam Lee, Recruiter · sam@initech.example · +1 555 0100',
        'Austin, TX',
        'Hybrid',
        '$180k–$210k',
        'Referral: Pat',
        'Ask about on-call.',
      ]) {
        await expect(page.getByText(text, { exact: true })).toBeVisible();
      }
      await expect(
        page.getByRole('link', { name: 'https://initech.example/jobs/42' }),
      ).toBeVisible();
      const description = page.getByRole('region', { name: 'Job description' }).locator('p');
      expect(await description.textContent()).toBe(
        'Build things.\n\n- Lead the platform team\n- Mentor engineers',
      );
      // The follow-up date keeps its calendar day in any time zone.
      const followUp = await page.evaluate(() =>
        new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
          new Date('2026-11-03T00:00:00Z'),
        ),
      );
      await expect(page.getByRole('definition').filter({ hasText: followUp })).toBeVisible();
    },
  );
});
