# Quickstart: Retro Theme

How to check the feature works. Commands are from the repository root.

## Automated

```sh
npm run lint && npm run typecheck && npm run build
npx vitest run packages/web/tests/theme.test.ts packages/web/tests/App.test.tsx
npx playwright test e2e/theme.spec.ts      # the banner at seven widths, desktop and iPhone
npx playwright test e2e/accessibility.spec.ts   # axe on every page, light and dark
```

Expected:

- Everything passes.
- `theme.test.ts` lists each colour pair it checked.
- The `@theme` spec checks widths 320, 390, 640, 1,024, 1,280, 1,920 and 2,560: the banner's
  content is above the horizon, nothing overlaps, and the page doesn't scroll sideways.

## Locally, by eye

```sh
npm run dev
```

1. **Desktop**: open the overview. The banner is about 150 px tall. It shows the sky, the striped
   sun, the grid and the sparkles. The icon has a cyan glow, then the title, Overview and
   Archive, and the pink "Add opportunity" button at the right.
2. **Each page** (archive, an opportunity, add, edit, interviews, the offline message): the
   page is lavender, the cards are white, and the buttons and links are magenta. Nothing is
   blue.
3. **Dark mode**: switch the computer to dark mode. The page turns deep purple with pink accents
   at once. The banner is unchanged.
4. **Due follow-up**: an opportunity with a due follow-up has an orange (light) or amber (dark)
   border and badge.
5. **Phone size**: in the browser's device mode at 390 px, the banner is about 120 px. It reads
   "Job Tracker", the button is on the banner, and Overview and Archive are in the bottom bar.
6. **Keyboard**: tab through the banner. The focus outline is clearly visible on the title,
   links and button.

## On the iPhone (after deploy; needs the owner)

1. **The banner**: open the installed app. The purple sky runs up behind the clock and battery,
   with no white or black strip. The banner and colours match the icon.
2. **The bottom bar**: it sits above the home indicator, not under it.
3. **Offline**: turn on airplane mode and open the app. The banner, icon and colours all appear.
4. **Safari**: open the website in Safari. The toolbar is tinted purple.
