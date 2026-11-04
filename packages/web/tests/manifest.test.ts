// @module-tag installable
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// What makes the tracker installable on a phone (feature 006): the manifest, its icons, and
// the tags iPhones read from the page's head.

const web = join(__dirname, '..');
const read = (path: string) => readFileSync(join(web, path), 'utf8');
const publicFile = (url: string) => join(web, 'public', url);

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

// A PNG's width and height, from its header.
function pngSize(path: string): string {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

// A colour from the design tokens: the first definition, which is the light theme's (or the
// banner's, which is the same in both themes).
function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(read('src/styles/global.css'));
  return (match?.[1] ?? '').toLowerCase();
}

describe('the web app manifest', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as Record<string, unknown> & {
    icons: ManifestIcon[];
  };

  it('names the app and opens it full screen on the board', () => {
    expect(manifest).toMatchObject({
      name: 'Job Tracker',
      short_name: 'Job Tracker',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
  });

  it("uses the banner's colour for the theme, and the page's for the splash screen", () => {
    expect(String(manifest.theme_color).toLowerCase()).toBe(token('banner-sky'));
    expect(String(manifest.background_color).toLowerCase()).toBe(token('color-bg'));
  });

  it('lists its icons, which exist at the stated sizes', () => {
    expect(
      manifest.icons.map(({ sizes, type, purpose }) => [sizes, type, purpose ?? 'any']),
    ).toEqual([
      ['192x192', 'image/png', 'any'],
      ['512x512', 'image/png', 'any'],
      ['512x512', 'image/png', 'maskable'],
    ]);
    for (const icon of manifest.icons) {
      expect(existsSync(publicFile(icon.src))).toBe(true);
      expect(pngSize(publicFile(icon.src))).toBe(icon.sizes);
    }
  });
});

describe('the page head', () => {
  const html = read('index.html');
  const tag = (pattern: RegExp) => pattern.exec(html)?.[0];

  it('links the manifest and the iPhone home-screen icon', () => {
    expect(tag(/<link rel="manifest" href="\/manifest\.webmanifest" \/>/)).toBeDefined();
    const appleIcon = /<link rel="apple-touch-icon" href="([^"]+)" \/>/.exec(html)?.[1];
    expect(appleIcon).toBeDefined();
    expect(pngSize(publicFile(appleIcon as string))).toBe('180x180');
  });

  it('names the app on the iPhone home screen and lets it open full screen', () => {
    expect(tag(/<meta name="apple-mobile-web-app-title" content="Job Tracker" \/>/)).toBeDefined();
    expect(tag(/<meta name="apple-mobile-web-app-capable" content="yes" \/>/)).toBeDefined();
    expect(tag(/<meta name="mobile-web-app-capable" content="yes" \/>/)).toBeDefined();
  });

  it("runs the banner's sky up behind the iPhone's status bar (feature 008)", () => {
    expect(
      tag(/<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" \/>/),
    ).toBeDefined();
    expect(
      tag(
        /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover" \/>/,
      ),
    ).toBeDefined();
  });

  it("tints the browser's toolbar like the banner in both colour schemes", () => {
    const themes = [
      ...html.matchAll(
        /<meta name="theme-color" content="(#[0-9a-f]{6})" media="\(prefers-color-scheme: (light|dark)\)" \/>/gi,
      ),
    ].map(([, color, scheme]) => [scheme, color?.toLowerCase()]);
    expect(themes).toEqual([
      ['light', token('banner-sky')],
      ['dark', token('banner-sky')],
    ]);
  });

  it('keeps the page title for the website', () => {
    expect(tag(/<title>Job Opportunity Tracker<\/title>/)).toBeDefined();
  });
});
