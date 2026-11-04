// Renders the app icon (packages/web/public/icon.svg) to the PNGs phones use when the tracker is
// installed (feature 006). Run it after changing the icon, and commit the PNGs:
//
//   node scripts/make-icons.mjs
//
// It uses the Chromium that Playwright already installs, so there's no image tool to add.
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const publicDir = fileURLToPath(new URL('../packages/web/public/', import.meta.url));
const svg = readFileSync(`${publicDir}icon.svg`, 'utf8');

// The rounded tile suits "any" icons. The iPhone and maskable icons are cut to the phone's own
// shape, so they fill the whole square instead.
const maskable = svg.replace(/rx="112"/, 'rx="0"');

const ICONS = [
  { file: 'icon-180.png', size: 180, source: maskable }, // iPhone rounds its own corners
  { file: 'icon-192.png', size: 192, source: svg },
  { file: 'icon-512.png', size: 512, source: svg },
  { file: 'icon-maskable-512.png', size: 512, source: maskable },
];

mkdirSync(`${publicDir}icons`, { recursive: true });
const browser = await chromium.launch();
try {
  for (const { file, size, source } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<html><body style="margin:0">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
    );
    await page.screenshot({ path: `${publicDir}icons/${file}`, omitBackground: true });
    await page.close();
    console.log(`icons/${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
