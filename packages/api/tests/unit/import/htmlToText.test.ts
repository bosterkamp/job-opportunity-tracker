// @module-tag import
import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, MAX_DESCRIPTION } from '../../../src/import/htmlToText.js';

const text = (html: string) => htmlToText(html).text;

describe('htmlToText', () => {
  it('separates paragraphs with a blank line', () => {
    expect(text('<p>One</p><p>Two</p>')).toBe('One\n\nTwo');
    expect(text('<h2>About</h2><div>We build</div>')).toBe('About\n\nWe build');
  });

  it.each([
    'p',
    'div',
    'h2',
    'ol',
    'ul',
    'address',
    'article',
    'blockquote',
    'dl',
    'footer',
    'header',
    'pre',
    'section',
    'table',
  ])('treats <%s> as a paragraph', (tag) => {
    expect(text(`Before<${tag}>Inside</${tag}>After`)).toBe('Before\n\nInside\n\nAfter');
  });

  it.each(['h1', 'h3', 'h4', 'h5', 'h6'])('treats <%s> as a paragraph', (tag) => {
    expect(text(`<${tag}>Heading</${tag}>Body`)).toBe('Heading\n\nBody');
  });

  it('puts each table row on its own lines', () => {
    expect(text('<table><tr><td>A</td></tr><tr><td>B</td></tr></table>')).toBe('A\n\nB');
  });

  it('starts a new line at <br>', () => {
    expect(text('<p>Line one<br>Line two<br/>Line three</p>')).toBe(
      'Line one\nLine two\nLine three',
    );
  });

  it('starts each list item with a bullet, one per line', () => {
    expect(text('<p>Duties:</p><ul><li>Build</li><li>Ship</li></ul><ol><li>First</li></ol>')).toBe(
      'Duties:\n\n• Build\n• Ship\n\n• First',
    );
  });

  it('keeps a paragraph inside a list item on the bullet line', () => {
    expect(text('<ul><li><p>Run the platform</p></li><li>Mentor</li></ul>')).toBe(
      '• Run the platform\n\n• Mentor',
    );
  });

  it('decodes entities', () => {
    expect(text('<p>R&amp;D &lt;3 caf&eacute; &#8212; &nbsp;done</p>')).toBe('R&D <3 café — done');
  });

  it.each(['script', 'style', 'template', 'noscript'])('drops what is inside <%s>', (tag) => {
    expect(text(`<p>Keep</p><${tag}>drop me</${tag}><p>Also keep</p>`)).toBe('Keep\n\nAlso keep');
  });

  it('keeps text after a hidden element closes, even when nested', () => {
    expect(text('<div><script>a<style>b</style>c</script>Shown</div>')).toBe('Shown');
  });

  it('collapses whitespace, including line breaks in the source, and trims', () => {
    expect(text('\n  <p>  Lots   of\n\n  space  </p>\n\n\n<p>\tend </p>  ')).toBe(
      'Lots of space\n\nend',
    );
  });

  it('never leaves more than one blank line', () => {
    expect(text('<div><div><p>A</p></div></div><div><p>B</p></div>')).toBe('A\n\nB');
  });

  it('returns plain text unchanged', () => {
    expect(htmlToText('Just words.')).toEqual({ text: 'Just words.', truncated: false });
  });

  it('allows 20,000 characters by default', () => {
    expect(MAX_DESCRIPTION).toBe(20_000);
    expect(htmlToText('a'.repeat(20_000))).toEqual({ text: 'a'.repeat(20_000), truncated: false });
    expect(htmlToText('a '.repeat(10_001)).truncated).toBe(true);
  });

  it('keeps text exactly at the limit whole', () => {
    expect(htmlToText('abcd efgh', 9)).toEqual({ text: 'abcd efgh', truncated: false });
  });

  it('cuts longer text at the last word that fits', () => {
    expect(htmlToText('abcd efgh ijkl', 11)).toEqual({ text: 'abcd efgh', truncated: true });
    expect(htmlToText('abcd efgh ijkl', 10)).toEqual({ text: 'abcd efgh', truncated: true });
    expect(htmlToText('abcd efgh ijkl', 9)).toEqual({ text: 'abcd efgh', truncated: true });
  });

  it('cuts several words back, not just the last one, to fit', () => {
    expect(htmlToText('aa bb cc dd ee', 7)).toEqual({ text: 'aa bb', truncated: true });
  });

  it('cuts a single long word at the limit, since there is no space to cut at', () => {
    expect(htmlToText('a'.repeat(30), 10)).toEqual({ text: 'a'.repeat(10), truncated: true });
    expect(htmlToText('x'.repeat(20_001)).text).toHaveLength(20_000);
  });

  it('keeps an entity at the very end', () => {
    expect(htmlToText('Fish &amp').text).toBe('Fish &');
  });

  it('cuts at a line break too', () => {
    expect(htmlToText('<p>abcd</p><p>efgh</p>', 8)).toEqual({ text: 'abcd', truncated: true });
  });
});

describe('decodeEntities', () => {
  it('decodes a string that was escaped once too often, without reading it as markup', () => {
    expect(decodeEntities('&lt;p&gt;Fish &amp;amp; chips&lt;/p&gt;')).toBe(
      '<p>Fish &amp; chips</p>',
    );
    expect(decodeEntities('a < b and <b>not a tag</b>')).toBe('a < b and <b>not a tag</b>');
    expect(decodeEntities('Fish &amp')).toBe('Fish &');
  });
});
