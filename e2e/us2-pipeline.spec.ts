import { browserDateDaysAgo, expect, moveTo, seedOpportunities, test } from './fixtures';

// User Story 2: move an opportunity through the pipeline (spec.md US2; quickstart.md step 2).

async function openSeeded(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
) {
  const [created] = await seedOpportunities(request, 1, () => ({
    company: 'Acme',
    title: 'Senior Engineer',
  }));
  await page.goto(`/opportunities/${created?.id}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Senior Engineer' })).toBeVisible();
}

const currentStage = (page: import('@playwright/test').Page) =>
  page.getByRole('definition').first();
const history = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'History' }).getByRole('listitem');

test.describe('Pipeline (US2)', { tag: '@pipeline' }, () => {
  test('moving to Applied with a note and an earlier date records both in the history', async ({
    page,
    request,
  }) => {
    await openSeeded(page, request);
    const threeDaysAgo = await browserDateDaysAgo(page, 3);

    await moveTo(page, 'Applied', {
      note: 'Applied via the company site',
      when: threeDaysAgo.input,
    });

    await expect(currentStage(page)).toHaveText('Applied');
    // History is in date order, so the backdated move comes before today's "added" entry.
    await expect(history(page)).toHaveText([
      `Applied · ${threeDaysAgo.shown} · Applied via the company site`,
      /^Considering · /,
    ]);
  });

  test('stages can be skipped and moved back, and each move is recorded', async ({
    page,
    request,
  }) => {
    await openSeeded(page, request);

    await moveTo(page, 'Interviewing');
    await expect(currentStage(page)).toHaveText('Interviewing');
    await moveTo(page, 'Contacted');

    await expect(currentStage(page)).toHaveText('Contacted');
    await expect(history(page)).toHaveCount(3);
    await expect(history(page).nth(1)).toContainText('Interviewing');
    await expect(history(page).nth(2)).toContainText('Contacted');
  });

  test('closing moves it to the Archive, and reopening brings it back', async ({
    page,
    request,
  }) => {
    await openSeeded(page, request);

    await moveTo(page, 'Rejected');
    await expect(currentStage(page)).toHaveText('Rejected');

    // Closed opportunities stay on the board, in the Closed column (feature 004).
    await page.goto('/');
    await expect(
      page.getByRole('region', { name: /^Closed/ }).getByRole('article', { name: 'Acme' }),
    ).toContainText('Rejected');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Archive' })
      .click();
    const archived = page.getByRole('list', { name: 'Closed opportunities' }).getByRole('article');
    await expect(archived).toHaveCount(1);
    await expect(archived).toContainText('Rejected');

    await archived.getByRole('link', { name: 'Acme' }).click();
    await moveTo(page, 'Applied');
    await expect(currentStage(page)).toHaveText('Applied');
    await expect(history(page).last()).toContainText('Applied');

    await page.goto('/');
    await expect(
      page.getByRole('region', { name: /^Applied/ }).getByRole('article', { name: 'Acme' }),
    ).toBeVisible();
  });

  test('the current stage is not offered, and a future date is rejected', async ({
    page,
    request,
  }) => {
    await openSeeded(page, request);
    const tomorrow = await browserDateDaysAgo(page, -1);

    await page.getByRole('button', { name: 'Move to…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('radio', { name: 'Considering', exact: true })).toHaveCount(0);
    await dialog.getByRole('radio', { name: 'Applied', exact: true }).check();
    await dialog.getByLabel('When?').fill(tomorrow.input);
    await dialog.getByRole('button', { name: 'Move', exact: true }).click();

    await expect(dialog.getByRole('alert')).toHaveText("The date can't be in the future");
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(currentStage(page)).toHaveText('Considering');
    await expect(history(page)).toHaveCount(1);
  });

  test(
    '"Move to…" is a bottom sheet on phones and a centered dialog on desktop',
    { tag: '@responsive' },
    async ({ page, request }) => {
      await openSeeded(page, request);

      await page.getByRole('button', { name: 'Move to…' }).click();
      const box = await page.getByRole('dialog').boundingBox();
      const viewport = page.viewportSize();

      expect(box && viewport).toBeTruthy();
      if (!box || !viewport) return;
      if (viewport.width < 640) {
        // Full width, anchored to the bottom of the screen.
        expect(Math.round(box.width)).toBe(viewport.width);
        expect(Math.round(box.y + box.height)).toBe(viewport.height);
      } else {
        // Fully inside the window, horizontally centered.
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
      }

      // Still usable with touch or mouse: move and see the result.
      await page.getByRole('dialog').getByRole('radio', { name: 'Offer', exact: true }).check();
      await page.getByRole('dialog').getByRole('button', { name: 'Move', exact: true }).click();
      await expect(currentStage(page)).toHaveText('Offer');
    },
  );
});
