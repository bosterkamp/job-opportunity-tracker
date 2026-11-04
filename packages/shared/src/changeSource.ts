// Where a change came from (feature 003). Changes made in the web app carry no mark, so
// existing data needs no migration; only changes made through Claude are marked.
export const VIA = ['CLAUDE'] as const;
export type Via = (typeof VIA)[number];
