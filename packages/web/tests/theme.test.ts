// @module-tag theme
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The site's colours (feature 008), read from the design tokens in global.css: every pair used
// together must meet WCAG 2.1 AA, in light and dark mode, and warnings must not look like the
// accent. axe checks the pages too, but it can't see text on the banner's background image.

const src = join(__dirname, '..', 'src');
const css = readFileSync(join(src, 'styles', 'global.css'), 'utf8');

// The custom properties set to a hex colour in a block of CSS.
function tokensIn(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(
      ([, name, value]): [string, string] => [name as string, (value as string).toLowerCase()],
    ),
  );
}

const lightBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const darkBlock =
  /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const light = tokensIn(lightBlock);
const schemes = { light, dark: { ...light, ...tokensIn(darkBlock) } };

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

// WCAG 2.1 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Hue in degrees, 0–360.
function hue(hex: string): number {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const hueGap = (a: string, b: string) => {
  const gap = Math.abs(hue(a) - hue(b));
  return Math.min(gap, 360 - gap);
};

describe('the contrast helpers', () => {
  it('match WCAG on known colours', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrast('#ffffff', '#777777')).toBeCloseTo(4.48, 2);
  });

  it('measure hues and the gap between them', () => {
    expect(hue('#ff0000')).toBe(0);
    expect(hue('#00ff00')).toBe(120);
    expect(hue('#0000ff')).toBe(240);
    expect(hue('#ff00ff')).toBe(300);
    expect(hue('#808080')).toBe(0);
    expect(hueGap('#ff0000', '#ff00ff')).toBe(60);
    expect(hueGap('#ff00ff', '#ff0000')).toBe(60);
  });
});

describe.each(Object.entries(schemes))('the %s colours', (_scheme, t) => {
  const pairs = (min: number, list: [string, string][]): [string, string, number][] =>
    list.map(([fg, bg]) => [fg, bg, min]);

  it.each([
    ...pairs(4.5, [
      ['color-text', 'color-bg'],
      ['color-text', 'color-surface'],
      ['color-text', 'color-column'],
      ['color-text-muted', 'color-bg'],
      ['color-text-muted', 'color-surface'],
      ['color-text-muted', 'color-column'],
      ['color-accent', 'color-bg'],
      ['color-accent', 'color-surface'],
      ['color-accent', 'color-column'],
      ['color-accent-text', 'color-accent'],
      // The remove button.
      ['color-accent-text', 'color-danger'],
      ['color-danger', 'color-bg'],
      ['color-danger', 'color-surface'],
      ['color-danger', 'color-column'],
    ]),
    ...pairs(3, [
      ['color-control-border', 'color-surface'],
      ['color-control-border', 'color-bg'],
      ['color-focus', 'color-bg'],
      ['color-focus', 'color-surface'],
    ]),
  ])('%s on %s is at least %d:1', (fg, bg, min) => {
    expect(t[fg], fg).toBeDefined();
    expect(t[bg], bg).toBeDefined();
    expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(min);
  });

  it("keeps warnings clearly apart from the accent's hue", () => {
    expect(hueGap(t['color-danger'] as string, t['color-accent'] as string)).toBeGreaterThanOrEqual(
      40,
    );
  });
});

describe('the banner', () => {
  // The text sits on the sky above the scene, which runs from banner-sky to banner-sky-mid.
  it.each([
    ['banner-text', 'banner-sky', 4.5],
    ['banner-text', 'banner-sky-mid', 4.5],
    ['banner-button-text', 'banner-button', 4.5],
    ['banner-focus', 'banner-sky', 3],
    ['banner-focus', 'banner-sky-mid', 3],
  ] as const)('%s on %s is at least %d:1', (fg, bg, min) => {
    expect(contrast(light[fg] as string, light[bg] as string)).toBeGreaterThanOrEqual(min);
  });

  it('is the same in light and dark mode', () => {
    expect(Object.keys(tokensIn(darkBlock)).filter((name) => name.startsWith('banner-'))).toEqual(
      [],
    );
  });
});

describe('the old colours', () => {
  const stylesheets = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? stylesheets(join(dir, entry.name))
        : entry.name.endsWith('.css')
          ? [join(dir, entry.name)]
          : [],
    );

  it('are gone: no stylesheet uses the old blue accent', () => {
    const files = stylesheets(src);
    expect(files.length).toBeGreaterThan(5);
    const blue = files.filter((file) => /#2f5bd3|#7e9bff/i.test(readFileSync(file, 'utf8')));
    expect(blue).toEqual([]);
  });

  it('are replaced in the head and the manifest too', () => {
    const web = join(__dirname, '..');
    for (const file of ['index.html', 'public/manifest.webmanifest']) {
      expect(readFileSync(join(web, file), 'utf8')).not.toMatch(/#f7f7f8|#121316/i);
    }
  });
});
