import type { PostingDetails } from '@jot/shared';
import { compact, description, text } from './details.js';
import { formatPay, payAmounts, workArrangementFrom, type Pay } from './format.js';

// Greenhouse's job pages carry no job data, so a Greenhouse link is read through Greenhouse's
// public Job Board API for the same posting instead (research.md §1).

const HOSTS = new Set(['job-boards.greenhouse.io', 'boards.greenhouse.io']);

// The API address for a Greenhouse posting link, or undefined for any other link.
export function greenhouseApiUrl(link: string): string | undefined {
  const url = new URL(link);
  const match = /^\/([\w-]+)\/jobs\/(\d+)\/?$/.exec(url.pathname);
  if (!HOSTS.has(url.hostname.toLowerCase()) || !match) {
    return undefined;
  }
  const [, board, id] = match as unknown as [string, string, string];
  return `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?pay_transparency=true`;
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null;

function pay(range: unknown): Pay {
  if (!isObject(range)) {
    return {};
  }
  const dollars = (cents: unknown) => (typeof cents === 'number' ? cents / 100 : undefined);
  // A missing title reads as "undefined", which matches neither unit.
  const label = String(range.title);
  return {
    currency: text(range.currency_type),
    min: dollars(range.min_cents),
    max: dollars(range.max_cents),
    unit: /annual|year/i.test(label) ? 'YEAR' : /hour/i.test(label) ? 'HOUR' : undefined,
  };
}

// The form's details from the API's JSON, or undefined when it has no title.
export function mapGreenhouse(json: unknown): PostingDetails | undefined {
  if (!isObject(json)) {
    return undefined;
  }
  const title = text(json.title);
  if (!title) {
    return undefined;
  }
  const location = isObject(json.location) ? text(json.location.name) : undefined;
  const stated = Array.isArray(json.pay_input_ranges) ? pay(json.pay_input_ranges[0]) : {};
  const locationType = Array.isArray(json.metadata)
    ? (json.metadata.find((m) => isObject(m) && m.name === 'Location Type') as Json | undefined)
    : undefined;
  return compact({
    company: text(json.company_name),
    title,
    ...description(json.content),
    location,
    workArrangement: workArrangementFrom({
      text: [locationType?.value, location].join(' '),
    }),
    compensation: formatPay(stated),
    ...payAmounts(stated),
    source: 'Greenhouse',
  });
}
