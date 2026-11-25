import type { Page } from '@playwright/test';
import {
  addInterview,
  browserDateDaysAgo,
  expect,
  openOpportunity,
  seedInStage,
  shownDateTime,
  test,
} from './fixtures';

// Interviews: logging them with their details and interviewers, each on its own page (feature
// 012, building on feature 005's count), and upcoming ones.

const history = (page: Page) => page.getByRole('region', { name: 'History' }).getByRole('listitem');
const section = (page: Page) => page.getByRole('region', { name: 'Interviews' });
const stage = (page: Page) =>
  page.getByRole('term').filter({ hasText: 'Stage' }).locator('xpath=following-sibling::dd[1]');
const DAY = 24 * 60 * 60 * 1000;

// Added a month ago, so an interview last week is after the date added.
const seedFarmers = (request: Parameters<typeof seedInStage>[0]) =>
  seedInStage(
    request,
    {
      company: 'Globex',
      title: 'Engineer',
      createdAt: new Date(Date.now() - 30 * DAY).toISOString(),
    },
    'CONSIDERING',
  );

test.describe('interviews', { tag: '@interview' }, () => {
  test(
    'an interview is added with its details and interviewers, and has its own page',
    { tag: '@responsive' },
    async ({ page, request }) => {
      await seedFarmers(request);
      const lastWeek = await browserDateDaysAgo(page, 7);
      await openOpportunity(page, 'Globex');

      await section(page).getByRole('link', { name: 'Add interview' }).click();
      await expect(
        page.getByRole('heading', { name: 'Add an interview for Globex' }),
      ).toBeVisible();
      const form = page.getByRole('form', { name: 'Add interview' });
      await form.getByLabel('Date and time').fill(lastWeek.input);
      await form.getByLabel('Type').selectOption({ label: 'Hiring manager' });
      await form.getByLabel('Panel interview').check();
      await form.getByLabel('Format').selectOption({ label: 'Video' });
      await form.getByLabel('How it went').selectOption({ label: 'Went well' });
      await form.getByLabel('Next steps').fill('Decision by Friday');
      for (const [n, person] of [
        [
          '1',
          {
            name: 'Priya Shah',
            email: 'priya.shah.platform-engineering@globex.example',
            linkedin: 'linkedin.com/in/priya-shah-platform-engineering-manager',
          },
        ],
        ['2', { name: 'Tom Lee' }],
      ] as const) {
        await form.getByRole('button', { name: 'Add interviewer' }).click();
        const row = form.getByRole('group', { name: `Interviewer ${n}` });
        for (const [field, value] of Object.entries(person)) {
          const label = { name: 'Name', email: 'Email', linkedin: 'LinkedIn' }[field] as string;
          await row.getByLabel(label).fill(value);
        }
      }
      await form.getByRole('button', { name: 'Save interview' }).click();

      // Its own page shows everything.
      await expect(page.getByRole('heading', { name: 'Hiring manager interview' })).toBeVisible();
      const details = page.getByRole('region', { name: 'Details' });
      await expect(details).toContainText('Panel');
      await expect(details).toContainText('Video');
      await expect(details).toContainText('Went well');
      await expect(details).toContainText('Decision by Friday');
      const people = page.getByRole('region', { name: 'Interviewers' }).getByRole('listitem');
      await expect(people).toHaveCount(2);
      await expect(
        page.getByRole('link', { name: 'LinkedIn profile of Priya Shah' }),
      ).toHaveAttribute('href', 'https://linkedin.com/in/priya-shah-platform-engineering-manager');
      // Long emails and links wrap: the page never scrolls sideways.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBe(0);

      // A reload shows it again.
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Hiring manager interview' })).toBeVisible();

      // Back on the opportunity: in the section and as one line in the history.
      await page.getByRole('link', { name: 'Back to Globex' }).click();
      await expect(section(page).getByRole('list', { name: 'Past interviews' })).toContainText(
        'Hiring manager · Panel · Video',
      );
      await expect(history(page)).toHaveText([
        /^Considering · /,
        /^Interview · .* · Hiring manager · Panel$/,
      ]);
      // Logging an interview never moves the opportunity.
      await expect(stage(page)).toHaveText('Considering');

      // The history's line opens the same page.
      await history(page).getByRole('link').click();
      await expect(page.getByRole('heading', { name: 'Hiring manager interview' })).toBeVisible();
    },
  );

  test('an interview is edited and removed on its page', async ({ page, request }) => {
    const { id } = await seedFarmers(request);
    for (const note of ['Phone', 'Panel']) {
      await addInterview(request, id, {
        note,
        heldAt: new Date(Date.now() - 3 * DAY).toISOString(),
      });
    }
    await openOpportunity(page, 'Globex');

    await section(page)
      .getByRole('list', { name: 'Past interviews' })
      .getByRole('link')
      .first()
      .click();
    await page.getByRole('button', { name: 'Edit interview' }).click();
    const form = page.getByRole('form', { name: 'Change interview' });
    await form.getByLabel('Type').selectOption({ label: 'Engineering' });
    await form.getByRole('button', { name: 'Save interview' }).click();
    await expect(page.getByRole('heading', { name: 'Engineering interview' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove interview' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();

    // Back on the opportunity, with one interview left.
    await expect(page.getByRole('heading', { name: 'Engineer', exact: true })).toBeVisible();
    await expect(
      section(page).getByRole('list', { name: 'Past interviews' }).getByRole('listitem'),
    ).toHaveCount(1);
    await page.goto('/');
    await expect(page.getByRole('article', { name: 'Globex' })).toContainText(
      '1 completed interview',
    );
  });

  test(
    'cards show how many interviews have happened, and when the next one is',
    { tag: ['@overview', '@responsive'] },
    async ({ page, request }) => {
      // Phones open on the Considering tab, so both are seeded there.
      const { id } = await seedFarmers(request);
      await seedInStage(request, { company: 'Acme', title: 'Engineer' }, 'CONSIDERING');
      await addInterview(request, id, { heldAt: new Date(Date.now() - 2 * DAY).toISOString() });
      await addInterview(request, id, { heldAt: new Date(Date.now() - DAY).toISOString() });
      const tomorrow = new Date(Date.now() + DAY);
      tomorrow.setSeconds(0, 0);
      await addInterview(request, id, { heldAt: tomorrow.toISOString(), kind: 'ENGINEERING' });

      await page.goto('/');

      const card = page.getByRole('article', { name: 'Globex' });
      await expect(card).toContainText('2 completed interviews');
      await expect(card).toContainText(
        `Next interview: ${await shownDateTime(page, tomorrow.toISOString())}`,
      );
      await expect(page.getByRole('article', { name: 'Acme' })).not.toContainText('nterview');
    },
  );

  test('an upcoming interview counts once its time has passed', async ({ page, request }) => {
    const { id } = await seedFarmers(request);
    await addInterview(request, id, { heldAt: new Date(Date.now() + DAY).toISOString() });
    const anHourAgo = await browserDateDaysAgo(page, 1 / 24);
    await openOpportunity(page, 'Globex');

    // Upcoming: in the section, not in the history, and not yet counted.
    await expect(section(page).getByRole('list', { name: 'Upcoming interviews' })).toBeVisible();
    await expect(history(page)).toHaveCount(1);
    await section(page)
      .getByRole('list', { name: 'Upcoming interviews' })
      .getByRole('link')
      .click();
    await expect(page.getByText('Upcoming', { exact: true })).toBeVisible();

    // Moved to an hour ago, it has happened.
    await page.getByRole('button', { name: 'Edit interview' }).click();
    const form = page.getByRole('form', { name: 'Change interview' });
    await expect(form.getByLabel('How it went')).toHaveCount(0);
    await form.getByLabel('Date and time').fill(anHourAgo.input);
    await expect(form.getByLabel('How it went')).toBeVisible();
    await form.getByRole('button', { name: 'Save interview' }).click();
    await expect(page.getByText('Upcoming', { exact: true })).toHaveCount(0);

    await page.getByRole('link', { name: 'Back to Globex' }).click();
    await expect(history(page)).toHaveCount(2);
    await page.goto('/');
    await expect(page.getByRole('article', { name: 'Globex' })).toContainText(
      '1 completed interview',
    );
    await expect(page.getByRole('article', { name: 'Globex' })).not.toContainText('Next interview');
  });
});
