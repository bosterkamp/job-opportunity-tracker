import { Parser } from 'htmlparser2';

// Turns a posting's description HTML into readable plain text (research.md §3). The input comes
// from another site and is untrusted; the output is text only, so no markup reaches the page.

export const MAX_DESCRIPTION = 20_000;

// Elements that start and end a paragraph.
const BLOCKS = new Set([
  'address',
  'article',
  'blockquote',
  'div',
  'dl',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tr',
  'ul',
]);
const HIDDEN = new Set(['script', 'style', 'template', 'noscript']);

// Decodes HTML entities in a string, for text that was escaped once more than it needed to be.
export function decodeEntities(text: string): string {
  let decoded = '';
  const parser = new Parser({
    ontext(chunk) {
      decoded += chunk;
    },
  });
  parser.write(text.replaceAll('<', '&lt;'));
  parser.end();
  return decoded;
}

export function htmlToText(
  html: string,
  max = MAX_DESCRIPTION,
): { text: string; truncated: boolean } {
  let out = '';
  let hidden = 0;
  const parser = new Parser({
    onopentag(name) {
      if (HIDDEN.has(name)) {
        hidden += 1;
      } else if (name === 'br') {
        out += '\n';
      } else if (name === 'li') {
        out += '\n• ';
      } else if (BLOCKS.has(name)) {
        out += '\n\n';
      }
    },
    onclosetag(name) {
      if (HIDDEN.has(name)) {
        hidden -= 1;
      } else if (BLOCKS.has(name)) {
        out += '\n\n';
      }
    },
    ontext(text) {
      if (hidden === 0) {
        // Line breaks in the source are just spaces; only the markup above makes new lines.
        out += text.replace(/\s/g, ' ');
      }
    },
  });
  parser.write(html);
  parser.end();

  const text = out
    .split('\n')
    .map((line) => line.replace(/ +/g, ' ').trim())
    .join('\n')
    // A paragraph inside a list item stays on the bullet's line.
    .replace(/• *\n+/g, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= max) {
    return { text, truncated: false };
  }
  // Cut at the last space within the limit, so no word is split, unless there is no space.
  // The cut is a prefix of the text; with no space to cut at, it's one character too long.
  const cut = text.slice(0, max + 1).replace(/\s+\S*$/, '');
  return { text: text.slice(0, Math.min(cut.length, max)), truncated: true };
}
