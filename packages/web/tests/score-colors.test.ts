// @module-tag offer
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Feature 013, FR-010 and SC-003a: every offer score's tint keeps the site's text at 4.5:1 or
// more (WCAG 2.1 AA, 1.4.3), in light and dark mode, and no two scores share a tint.

const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'global.css'), 'utf8');

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

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SCORES = [0, 1, 2, 3, 4, 5];

describe.each(Object.entries(schemes))('the score colors in %s mode', (_scheme, tokens) => {
  it('each has its own tint, set in this mode', () => {
    const tints = SCORES.map((score) => tokens[`score-${score}`]);
    expect(tints.every(Boolean)).toBe(true);
    expect(new Set(tints).size).toBe(SCORES.length);
  });

  it.each(SCORES)('score %i keeps the text at 4.5:1 or more', (score) => {
    const tint = tokens[`score-${score}`] as string;
    expect(contrast(tokens['color-text'] as string, tint)).toBeGreaterThanOrEqual(4.5);
  });

  it('dark mode sets its own tints', () => {
    expect(tokensIn(darkBlock)['score-3']).toBeDefined();
  });
});

describe('the contrast formula', () => {
  it('matches WCAG on known colors', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});
