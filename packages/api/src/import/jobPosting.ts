import type { PostingDetails } from '@jot/shared';
import { DomUtils, parseDocument } from 'htmlparser2';
import { compact, description, text } from './details.js';
import {
  formatLocation,
  formatPay,
  payAmounts,
  siteName,
  workArrangementFrom,
  type Pay,
  type Place,
} from './format.js';

// Reads schema.org JobPosting data from a page's JSON-LD scripts (research.md §1–2).

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);

// "@type" may be a string or a list, and may be a full IRI ("http://schema.org/JobPosting").
const isJobPosting = (node: Json) =>
  asList(node['@type']).some((t) => typeof t === 'string' && /(^|[/:])JobPosting$/.test(t));

function collect(node: unknown, found: Json[]) {
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, found));
  } else if (isObject(node)) {
    if (isJobPosting(node)) {
      found.push(node);
    }
    collect(node['@graph'], found);
  }
}

// Every JobPosting on the page. A script that isn't valid JSON is skipped. Script contents
// are raw text to the parser, so entities inside them stay as written.
export function extractJobPostings(html: string): Json[] {
  const scripts = DomUtils.findAll(
    // A missing type reads as "undefined", which doesn't match.
    (element) => element.name === 'script' && /ld\+json/i.test(String(element.attribs.type)),
    parseDocument(html).children,
  );
  const found: Json[] = [];
  for (const script of scripts) {
    try {
      collect(JSON.parse(DomUtils.textContent(script)), found);
    } catch {
      // One broken script shouldn't hide a JobPosting in another.
    }
  }
  return found;
}

const name = (v: unknown) => (isObject(v) ? text(v.name) : text(v));

function places(jobLocation: unknown): Place[] {
  return asList(jobLocation).map((place) => {
    const address = isObject(place) ? place.address : undefined;
    if (!isObject(address)) {
      return { locality: text(address) };
    }
    return {
      locality: text(address.addressLocality),
      region: text(address.addressRegion),
      country: name(address.addressCountry),
    };
  });
}

function pay(baseSalary: unknown): Pay {
  if (!isObject(baseSalary)) {
    return {};
  }
  const value = baseSalary.value;
  const amount = (v: unknown) => (typeof v === 'number' ? v : undefined);
  const range = isObject(value)
    ? {
        min: amount(value.minValue) ?? amount(value.value),
        max: amount(value.maxValue),
        unit: text(value.unitText),
      }
    : { min: amount(value) };
  return { currency: text(baseSalary.currency), ...range };
}

// The date in validThrough as the posting states it (feature 009): a date, or a date and time in
// any time zone, keeps its first ten characters when they're a real day.
function calendarDate(value: unknown): string | undefined {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim()) : null;
  if (!match) {
    return undefined;
  }
  const [date, year, month, day] = match as unknown as [string, string, string, string];
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.toISOString().startsWith(date) ? date : undefined;
}

// The form's details from one JobPosting, or undefined when it has no title.
export function mapJobPosting(posting: Json, pageUrl: string): PostingDetails | undefined {
  const title = text(posting.title);
  if (!title) {
    return undefined;
  }
  const location = formatLocation(places(posting.jobLocation));
  const stated = pay(posting.baseSalary);
  return compact({
    company: name(posting.hiringOrganization),
    title,
    ...description(posting.description),
    location,
    workArrangement: workArrangementFrom({
      telecommute: asList(posting.jobLocationType).includes('TELECOMMUTE'),
      text: location,
    }),
    compensation: formatPay(stated),
    ...payAmounts(stated),
    source: siteName(pageUrl),
    postedUntil: calendarDate(posting.validThrough),
  });
}
