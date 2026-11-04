import type { PostingDetails } from '@jot/shared';
import { MAX_SHORT_TEXT } from './format.js';
import { decodeEntities, htmlToText } from './htmlToText.js';

// Helpers shared by the JobPosting and Greenhouse mappers.

// A clean single-line string, or undefined when there's nothing usable.
export function text(value: unknown, max = MAX_SHORT_TEXT): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const cleaned = decodeEntities(value).replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

// A description as plain text. Some sites escape the HTML once more than needed, so markup
// that arrives without any tags is decoded first.
export function description(
  value: unknown,
): Pick<PostingDetails, 'description' | 'descriptionTruncated'> {
  if (typeof value !== 'string') {
    return {};
  }
  const html = value.includes('<') ? value : decodeEntities(value);
  const { text: plain, truncated } = htmlToText(html);
  if (!plain) {
    return {};
  }
  return truncated ? { description: plain, descriptionTruncated: true } : { description: plain };
}

// Leaves out the fields the posting didn't state.
export function compact(details: Record<string, unknown>): PostingDetails {
  return Object.fromEntries(
    Object.entries(details).filter(([, v]) => v !== undefined),
  ) as PostingDetails;
}
