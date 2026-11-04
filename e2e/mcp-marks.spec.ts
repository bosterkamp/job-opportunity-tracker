import type { APIRequestContext } from '@playwright/test';
import { API_URL, expect, test } from './fixtures';

// Feature 003: the web app shows which changes were made through Claude. Changes are seeded
// through the local API with x-test-via, which only Playwright's copy of the API honors.
const viaClaude = { 'x-test-via': 'CLAUDE' };

async function seed(request: APIRequestContext): Promise<string> {
  const created = await request.post(`${API_URL}/opportunities`, {
    data: { company: 'Farmers', title: 'Engineer' },
  });
  const { id } = (await created.json()) as { id: string };
  // A move in the web app, then a move and a details change through Claude.
  await request.post(`${API_URL}/opportunities/${id}/stage-changes`, {
    data: { toStage: 'APPLIED', expectedChangeCount: 1 },
  });
  await request.post(`${API_URL}/opportunities/${id}/stage-changes`, {
    headers: viaClaude,
    data: { toStage: 'CONTACTED', note: 'Expecting a call from Joel', expectedChangeCount: 2 },
  });
  await request.patch(`${API_URL}/opportunities/${id}`, {
    headers: viaClaude,
    data: { notes: 'Call Joel back' },
  });
  return id;
}

test.describe('Changes made through Claude (feature 003)', { tag: '@mcp' }, () => {
  test(
    'are marked in the history, and in the details until the next edit in the web app',
    { tag: '@responsive' },
    async ({ page, request }) => {
      // Straight to the page: on phones the board opens on Considering, not Contacted.
      await page.goto(`/opportunities/${await seed(request)}`);

      const history = page.getByRole('region', { name: 'History' }).getByRole('listitem');
      await expect(history).toHaveCount(3);
      await expect(history.nth(1)).not.toContainText('via Claude');
      await expect(history.nth(2)).toContainText('Contacted');
      await expect(history.nth(2)).toContainText('via Claude · Expecting a call from Joel');
      await expect(page.getByText(/Details last changed through Claude on/)).toBeVisible();

      await page.getByRole('button', { name: 'Edit details' }).click();
      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Engineer' })).toBeVisible();
      await expect(page.getByText(/Details last changed through Claude/)).toHaveCount(0);
      await expect(history.nth(2)).toContainText('via Claude');
    },
  );
});
