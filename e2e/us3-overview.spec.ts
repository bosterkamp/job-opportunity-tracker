import type { APIRequestContext, Page } from '@playwright/test';
import { API_URL, expect, seedInStage, test } from './fixtures';

// User Story 3: see all opportunities and where they stand (spec.md US3; quickstart.md step 3).

async function seedBoard(request: APIRequestContext) {
  await seedInStage(
    request,
    { company: 'Acme', title: 'Senior Engineer', interest: 2 },
    'CONSIDERING',
  );
  await seedInStage(
    request,
    { company: 'Globex', title: 'Staff Developer', interest: 5 },
    'APPLIED',
  );
  await seedInStage(request, { company: 'Initech', title: 'Engineer' }, 'APPLIED');
  await seedInStage(request, { company: 'Hooli', title: 'Architect', interest: 3 }, 'OFFER');
  await seedInStage(request, { company: 'Umbrella', title: 'Engineer' }, 'REJECTED');
}

const cards = (page: Page) => page.getByRole('article');
const column = (page: Page, stage: string) =>
  page.getByRole('region', { name: new RegExp(`^${stage}`) });

test.describe('Overview (US3)', { tag: '@overview' }, () => {
  test(
    'the board is one column per stage on desktop, and stage tabs on phones',
    { tag: '@responsive' },
    async ({ page, request }) => {
      await seedBoard(request);

      await page.goto('/');

      const wide = (page.viewportSize()?.width ?? 0) >= 1280;
      if (wide) {
        // The open stages, then Closed (feature 004).
        await expect(page.getByRole('region')).toHaveCount(6);
        await expect(column(page, 'Applied')).toContainText('Applied2');
        await expect(column(page, 'Applied').getByRole('article')).toHaveCount(2);
        await expect(column(page, 'Contacted')).toContainText('Nothing in Contacted');
      } else {
        const tabs = page.getByRole('tab');
        await expect(tabs).toHaveText([
          'Considering (1)',
          'Applied (2)',
          'Contacted (0)',
          'Interviewing (0)',
          'Offer (1)',
          'Closed (1)',
        ]);
        await expect(page.getByRole('tabpanel').getByRole('article')).toHaveCount(1);
        await page.getByRole('tab', { name: 'Applied (2)' }).click();
        await expect(page.getByRole('tabpanel').getByRole('article')).toHaveCount(2);
        await expect(page.getByRole('tabpanel')).not.toContainText('Acme');
      }
    },
  );

  test(
    'an open "Move to…" dialog covers the other cards\' buttons',
    { tag: '@responsive' },
    async ({ page, request }) => {
      await seedBoard(request);
      await page.goto('/');
      await expect(cards(page).filter({ hasText: 'Acme' })).toBeVisible();
      // Phones show one stage at a time.
      const tab = page.getByRole('tab', { name: 'Applied (2)' });
      if (await tab.isVisible()) {
        await tab.click();
      }
      const applied = cards(page).filter({ hasText: /Globex|Initech/ });
      await expect(applied).toHaveCount(2);

      await applied
        .first()
        .getByRole('button', { name: /^Move .* to another stage$/ })
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Whatever is drawn over the other card's button is the dialog or its dimmed backdrop.
      const other = applied.last().getByRole('button', { name: /^Move .* to another stage$/ });
      const box = await other.boundingBox();
      expect(box).toBeTruthy();
      if (!box) return;
      const onTop = await page.evaluate(
        ([x, y]) => {
          const hit = document.elementFromPoint(x as number, y as number);
          return hit?.closest('[role="dialog"]') ? 'dialog' : (hit?.tagName ?? 'nothing');
        },
        [box.x + box.width / 2, box.y + box.height / 2],
      );
      expect(onTop).not.toBe('BUTTON');
    },
  );

  test('each card shows company, title, stars, and the time since the last change', async ({
    page,
    request,
  }) => {
    await seedBoard(request);
    await page.goto('/');

    const card = page.getByRole('article', { name: 'Globex' });
    await expect(card.getByRole('link', { name: 'Globex' })).toBeVisible();
    await expect(card).toContainText('Staff Developer');
    await expect(card.getByRole('img', { name: 'Interest: 5 of 5' })).toBeVisible();
    await expect(card).toContainText('Last change today');
    await expect(page.getByRole('article', { name: 'Initech' })).toContainText('Not rated');

    await card.getByRole('link', { name: 'Globex' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Staff Developer' })).toBeVisible();
  });

  test('filter, sort, and search narrow and order the board, and survive a reload', async ({
    page,
    request,
  }) => {
    await seedBoard(request);
    await page.goto('/');

    await page.getByLabel('Stage', { exact: true }).selectOption({ label: 'Applied' });
    await expect(page.getByRole('region')).toHaveCount(1);
    await expect(cards(page)).toHaveCount(2);

    await page.getByLabel('Sort by', { exact: true }).selectOption({ label: 'Interest' });
    // High to low, unrated last.
    await expect(column(page, 'Applied').getByRole('article')).toHaveText([/^Globex/, /^Initech/]);

    await page.getByLabel('Stage', { exact: true }).selectOption({ label: 'All stages' });
    await page.getByLabel('Search', { exact: true }).fill('GLOBEX');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page)).toHaveAccessibleName('Globex');

    await page.reload();
    await expect(page.getByLabel('Search', { exact: true })).toHaveValue('GLOBEX');
    await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('interest');
    await expect(cards(page)).toHaveCount(1);

    await page.getByLabel('Search', { exact: true }).fill('nobody');
    await expect(page.getByText('No opportunities match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(cards(page)).toHaveCount(5);
  });

  test('closed opportunities appear in the Closed column and in the Archive', async ({
    page,
    request,
  }) => {
    await seedBoard(request);

    await page.goto('/');
    await expect(cards(page)).toHaveCount(5);
    await expect(column(page, 'Closed').getByRole('article')).toHaveText([/^Umbrella/]);

    await page.goto('/archive');
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByRole('article', { name: 'Umbrella' })).toContainText('Rejected');
  });

  test('with 200 opportunities, the board renders and search responds within 1 second (SC-004)', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const stages = ['CONSIDERING', 'APPLIED', 'CONTACTED', 'INTERVIEWING', 'OFFER'];
    for (let i = 0; i < 200; i++) {
      const created = await request.post(`${API_URL}/opportunities`, {
        data: {
          company: `Company ${String(i).padStart(3, '0')}`,
          title: 'Engineer',
          interest: (i % 5) + 1,
        },
      });
      const { id } = (await created.json()) as { id: string };
      const stage = stages[i % stages.length] as string;
      if (stage !== 'CONSIDERING') {
        await request.post(`${API_URL}/opportunities/${id}/stage-changes`, {
          data: { toStage: stage, expectedChangeCount: 1 },
        });
      }
    }

    // Timed from the list arriving to all 200 cards on screen: the app's own rendering, not the
    // dev server's first load of unbundled modules.
    const listed = page.waitForResponse((response) =>
      response.url().includes('/opportunities?status=OPEN'),
    );
    await page.goto('/');
    await listed;
    const renderStart = Date.now();
    await expect(cards(page)).toHaveCount(200);
    expect(Date.now() - renderStart).toBeLessThan(1000);

    const searchStart = Date.now();
    await page.getByLabel('Search', { exact: true }).fill('Company 042');
    await expect(cards(page)).toHaveCount(1);
    expect(Date.now() - searchStart).toBeLessThan(1000);
  });
});
