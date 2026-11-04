import type { Locator, Page } from '@playwright/test';
import { addOpportunity, expect, openOpportunity, test } from './fixtures';

// The banner (feature 008): the icon's synthwave scene across the top of every page, with the
// icon, title, nav and add button on the dark sky above the scene's strip of sun and grid, so
// white text never sits on the bright parts.

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// The banner's visible content: the home link (icon and title), the add button, and the nav
// links when they're in the banner (from 640 px; on phones they're in the bottom bar).
async function contentBoxes(page: Page): Promise<Record<string, Box>> {
  const banner = page.getByRole('banner');
  const items: [string, Locator][] = [
    ['title', banner.getByRole('link', { name: 'Job Opportunity Tracker' })],
    ['add', banner.getByRole('link', { name: 'Add opportunity' })],
  ];
  if ((page.viewportSize()?.width ?? 0) >= 640) {
    items.push(
      ['overview', banner.getByRole('link', { name: 'Overview' })],
      ['archive', banner.getByRole('link', { name: 'Archive' })],
    );
  }
  const boxes: Record<string, Box> = {};
  for (const [name, locator] of items) {
    const box = await locator.boundingBox();
    expect(box, name).not.toBeNull();
    boxes[name] = box as Box;
  }
  return boxes;
}

async function expectContentOnTheSky(page: Page) {
  const banner = page.getByRole('banner');
  const bannerBox = (await banner.boundingBox()) as Box;
  // The scene's strip (sun, glow and grid) along the banner's bottom.
  const scene = await banner.evaluate((el) =>
    parseFloat(getComputedStyle(el).getPropertyValue('--banner-scene-height')),
  );
  expect(scene).toBeGreaterThan(40);
  const width = page.viewportSize()?.width ?? 0;
  const boxes = await contentBoxes(page);
  for (const [name, box] of Object.entries(boxes)) {
    expect(box.y + box.height, `${name} is above the scene`).toBeLessThanOrEqual(
      bannerBox.y + bannerBox.height - scene + 1,
    );
    expect(box.x, `${name} starts on screen`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} ends on screen`).toBeLessThanOrEqual(width);
  }
  const entries = Object.entries(boxes);
  for (const [i, [a, boxA]] of entries.entries()) {
    for (const [b, boxB] of entries.slice(i + 1)) {
      expect(overlaps(boxA, boxB), `${a} and ${b} overlap`).toBe(false);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
}

test.describe('the banner', { tag: ['@theme', '@responsive'] }, () => {
  test('is on every page, with the scene, icon, title and add button', async ({ page }) => {
    await addOpportunity(page, { company: 'Initech', title: 'Engineer' });
    await openOpportunity(page, 'Initech');
    const pages = [
      ['/', 'Overview'],
      ['/archive', 'Archive'],
      [page.url(), 'Engineer'],
      ['/opportunities/new', 'Add opportunity'],
    ];
    for (const [url, heading] of pages) {
      await page.goto(url as string);
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
      const banner = page.getByRole('banner');
      expect(await banner.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('url(');
      await expect(banner.locator('img')).toHaveAttribute('src', '/icon.svg');
      await expect(banner.getByRole('link', { name: 'Add opportunity' })).toBeVisible();
    }
  });

  test('is about 150 px tall on a computer and 120 px on a phone', async ({ page }) => {
    await page.goto('/');
    const phone = (page.viewportSize()?.width ?? 0) < 640;
    const box = (await page.getByRole('banner').boundingBox()) as Box;
    expect(Math.abs(box.height - (phone ? 120 : 150))).toBeLessThanOrEqual(10);
    await expect(
      page
        .getByRole('banner')
        .getByText(phone ? 'Job Tracker' : 'Job Opportunity Tracker', { exact: true }),
    ).toBeVisible();
  });

  for (const width of [320, 390, 640, 1024, 1280, 1920, 2560]) {
    test(`at ${width} px nothing overlaps, and the content is on the sky`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chromium', 'widths are set directly');
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      await expectContentOnTheSky(page);
      const banner = page.getByRole('banner');
      // The short title until the full one fits beside the nav and button.
      await expect(
        banner.getByText(width < 1024 ? 'Job Tracker' : 'Job Opportunity Tracker', {
          exact: true,
        }),
      ).toBeVisible();
    });
  }

  test('grows with larger text', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'one browser is enough');
    await page.goto('/');
    const before = ((await page.getByRole('banner').boundingBox()) as Box).height;

    await page.addStyleTag({ content: 'html { font-size: 200% }' });

    const after = ((await page.getByRole('banner').boundingBox()) as Box).height;
    expect(after).toBeGreaterThan(before);
    await expectContentOnTheSky(page);
  });

  test('shows a cyan focus outline on its links and button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'keyboard focus on a computer');
    await page.goto('/');
    const banner = page.getByRole('banner');
    for (const name of ['Job Opportunity Tracker', 'Overview', 'Archive', 'Add opportunity']) {
      const link = banner.getByRole('link', { name });
      await link.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      const outline = await link.evaluate((el) => {
        const style = getComputedStyle(el);
        return { width: parseFloat(style.outlineWidth), color: style.outlineColor };
      });
      expect(outline.width).toBeGreaterThan(0);
      expect(outline.color).toBe('rgb(0, 240, 255)');
    }
  });
});
