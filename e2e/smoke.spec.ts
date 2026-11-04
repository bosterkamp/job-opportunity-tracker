import { API_URL, expect, test } from './fixtures';

test.describe('App shell', { tag: '@core' }, () => {
  test('app shell renders the title', { tag: '@responsive' }, async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Job Opportunity Tracker');
    await expect(page.getByRole('heading', { name: 'Job Opportunity Tracker' })).toBeVisible();
  });

  test('local API is up', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
