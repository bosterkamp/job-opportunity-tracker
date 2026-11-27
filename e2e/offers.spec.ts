import type { Page } from '@playwright/test';
import { addOffer, expect, scoreOffer, seedInStage, test } from './fixtures';

// Offers (feature 013): recording one with its history, picking offers on the Offers page and
// the board, comparing and scoring them, custom fields, and respond-by dates.

// A YYYY-MM-DD date `days` from today in the browser's time zone, the app's "today".
function browserDate(page: Page, days: number): Promise<string> {
  return page.evaluate((offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }, days);
}

const offerSection = (page: Page) => page.getByRole('region', { name: 'Offer', exact: true });
const historyList = (page: Page) => page.getByRole('list', { name: 'Offer history' });

// The page itself never scrolls sideways (the comparison scrolls inside its frame).
async function expectNoPageScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function seedOffers(request: Parameters<typeof seedInStage>[0]) {
  const acme = await seedInStage(request, { company: 'Acme', title: 'Staff Engineer' }, 'OFFER');
  const bolt = await seedInStage(request, { company: 'Bolt', title: 'Principal' }, 'OFFER');
  const cove = await seedInStage(request, { company: 'Cove', title: 'Lead' }, 'OFFER');
  const dune = await seedInStage(request, { company: 'Dune', title: 'Architect' }, 'OFFER');
  await addOffer(request, acme.id, { baseSalary: 165000, equity: 'RSUs', pto: '20 days' });
  await addOffer(request, bolt.id, { baseSalary: 170000, pto: '25 days' });
  await addOffer(request, cove.id, { baseSalary: 150000 });
  return { acme, bolt, cove, dune };
}

test.describe('offers', { tag: '@offer' }, () => {
  test(
    'an offer is recorded and changed, its history kept, and removed after asking',
    { tag: '@responsive' },
    async ({ page, request }) => {
      const { id } = await seedInStage(
        request,
        {
          company: 'Acme',
          title: 'Staff Engineer',
          location: 'Denver',
          salaryMin: 150000,
          salaryMax: 180000,
        },
        'OFFER',
      );
      const respondBy = await browserDate(page, 2);
      await page.goto(`/opportunities/${id}`);

      await offerSection(page).getByRole('link', { name: 'Add offer' }).click();
      await expect(page.getByRole('heading', { name: 'Add an offer from Acme' })).toBeVisible();
      await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Staff Engineer');
      await expect(page.getByLabel('Location', { exact: true })).toHaveValue('Denver');
      await page.getByLabel('Base salary', { exact: true }).fill('165k');
      await page.getByLabel('Bonus (%)').fill('10');
      await page.getByLabel('PTO', { exact: true }).fill('20 days');
      await page.getByLabel('Respond by', { exact: true }).fill(respondBy);
      await page.getByRole('button', { name: 'Save offer' }).click();

      await expect(offerSection(page)).toContainText('165,000');
      await expect(offerSection(page)).toContainText('10%');
      await expect(page.getByText('$150k–$180k')).toBeVisible();
      await expect(historyList(page)).toContainText('Offer recorded');

      await offerSection(page).getByRole('link', { name: 'Edit offer' }).click();
      await page.getByLabel('Base salary', { exact: true }).fill('170000');
      await page.getByLabel('Sign-on bonus').fill('10,000');
      await page.getByRole('button', { name: 'Save offer' }).click();
      await expect(historyList(page)).toContainText('Base salary: 165,000 → 170,000');
      await expect(historyList(page)).toContainText('Sign-on bonus added: 10,000');

      // Saving without a change adds nothing.
      await offerSection(page).getByRole('link', { name: 'Edit offer' }).click();
      await page.getByRole('button', { name: 'Save offer' }).click();
      await expect(offerSection(page).getByRole('link', { name: 'Edit offer' })).toBeVisible();
      await expect(historyList(page).locator(':scope > li')).toHaveCount(2);

      await offerSection(page).getByRole('button', { name: 'Remove offer' }).click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toContainText('Its scores and its history go too');
      await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(offerSection(page).getByRole('link', { name: 'Add offer' })).toBeVisible();
      await expectNoPageScroll(page);
    },
  );

  test(
    'offers are picked on the Offers page and compared, and the comparison reloads',
    { tag: '@responsive' },
    async ({ page, request }) => {
      await seedOffers(request);
      await page.goto('/');
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Offers' })
        .click();

      await page.getByRole('checkbox', { name: 'Compare Bolt, Principal' }).check();
      await page.getByRole('checkbox', { name: 'Compare Acme, Staff Engineer' }).check();
      await page.getByRole('checkbox', { name: 'Compare Cove, Lead' }).check();
      await expect(page.getByRole('checkbox', { name: 'Compare Dune, Architect' })).toBeDisabled();
      await expect(page.getByRole('status')).toHaveText('You can compare up to 3 offers');
      await page.getByRole('checkbox', { name: 'Compare Cove, Lead' }).uncheck();
      await page.getByRole('link', { name: 'Compare 2' }).click();

      const headers = page.getByRole('columnheader');
      await expect(headers).toHaveText(['Detail', /Bolt/, /Acme/]);
      await page.reload();
      await expect(headers).toHaveText(['Detail', /Bolt/, /Acme/]);
      await expectNoPageScroll(page);
    },
  );

  test("offers are picked on the board's Offer column", async ({ page, request }) => {
    await seedOffers(request);
    await page.goto('/');

    const column = page.getByRole('region', { name: /^Offer/ });
    await column.getByRole('checkbox', { name: 'Compare Acme, Staff Engineer' }).check();
    await column.getByRole('checkbox', { name: 'Compare Dune, Architect' }).check();
    await column.getByRole('link', { name: 'Compare 2' }).click();
    await expect(page.getByRole('columnheader')).toHaveText(['Detail', /Acme/, /Dune/]);
    // Dune has no details yet: its column offers to add them, and has no scores.
    await expect(
      page.getByRole('columnheader', { name: /Dune/ }).getByRole('link', { name: 'Add offer' }),
    ).toBeVisible();
    await expect(page.getByRole('combobox', { name: /for Dune$/ })).toHaveCount(0);
  });

  test(
    'details are scored, colored and averaged, and the scores stay after a reload',
    { tag: '@responsive' },
    async ({ page, request }) => {
      const { acme, bolt } = await seedOffers(request);
      await page.goto(`/offers/compare?ids=${acme.id},${bolt.id}`);

      const score = (detail: string, company: string) =>
        page.getByRole('combobox', { name: `Score ${detail} for ${company}` });
      await score('Base salary', 'Acme').selectOption({ label: '4 · Good' });
      await score('Equity', 'Acme').selectOption({ label: '0 · Not offered' });
      await score('Base salary', 'Bolt').selectOption({ label: '5 · Best' });
      await score('Equity', 'Bolt').selectOption({ label: '2 · Poor' });

      const overall = page
        .getByRole('row')
        .filter({ has: page.getByRole('rowheader', { name: 'Overall' }) });
      await expect(overall.getByRole('cell')).toHaveText(['2.0 · Poor', '3.5 · Good']);
      // Each tint is the page's own, not the select's default.
      const tint = await score('Base salary', 'Bolt').evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      expect(tint).not.toBe(
        await score('Equity', 'Acme').evaluate((el) => getComputedStyle(el).backgroundColor),
      );
      await expect(
        page.getByRole('list', { name: 'Score scale' }).getByRole('listitem'),
      ).toHaveCount(6);

      await page.reload();
      await expect(score('Base salary', 'Acme')).toHaveValue('4');
      await expect(overall.getByRole('cell')).toHaveText(['2.0 · Poor', '3.5 · Good']);

      // On phones the table scrolls inside its frame, with the detail names in view.
      if ((page.viewportSize()?.width ?? 0) < 640) {
        const frame = page.getByRole('region', { name: 'Offers side by side' });
        await frame.evaluate((el) => el.scrollBy({ left: 400 }));
        await expect(page.getByRole('rowheader', { name: 'Base salary' })).toBeInViewport();
        await expectNoPageScroll(page);
      }
    },
  );

  test('a custom field is added on Settings, filled, scored, weighed, renamed and removed', async ({
    page,
    request,
  }) => {
    const { acme, bolt } = await seedOffers(request);
    await page.goto('/settings');

    await page.getByLabel('New field').fill('Commute');
    await page.getByRole('button', { name: 'Add field' }).click();
    await expect(page.getByLabel('How much Commute counts')).toHaveValue('1');
    await page.getByLabel('How much Commute counts').selectOption('2');
    await expect(page.getByRole('status')).toHaveText('Saved');

    await page.goto(`/offers/compare?ids=${acme.id},${bolt.id}`);
    await expect(page.getByRole('rowheader', { name: 'Commute · Important' })).toBeVisible();
    await expect(page.getByLabel('New field')).toHaveCount(0);
    await page
      .getByRole('combobox', { name: 'Score Commute for Acme' })
      .selectOption({ label: '3 · Okay' });

    await page.goto(`/opportunities/${acme.id}/offer`);
    await page.getByLabel('Commute').fill('20 min');
    await page.getByRole('button', { name: 'Save offer' }).click();
    await expect(offerSection(page)).toContainText('20 min');

    await page.goto('/offers');
    await page
      .getByRole('link', { name: 'Custom fields and what each detail counts are in Settings' })
      .click();
    await page.getByRole('button', { name: 'Rename Commute' }).click();
    await page.getByLabel('New name for Commute').fill('Commute time');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('list', { name: 'Custom fields' })).toContainText('Commute time');
    // Renaming keeps how much it counts.
    await expect(page.getByLabel('How much Commute time counts')).toHaveValue('2');

    await page.getByRole('button', { name: 'Remove Commute time' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('1 offer has a value for it');
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Remove', exact: true })
      .click();
    await expect(page.getByRole('list', { name: 'Custom fields' })).toHaveCount(0);
    await expect(page.getByLabel(/How much Commute/)).toHaveCount(0);

    await page.goto(`/offers/compare?ids=${acme.id},${bolt.id}`);
    await expect(page.getByRole('rowheader', { name: 'Overall' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: /Commute/ })).toHaveCount(0);
  });

  test(
    'a respond-by date close by is in the warning color on the card and the Offers page',
    { tag: '@responsive' },
    async ({ page, request }) => {
      const acme = await seedInStage(request, { company: 'Acme', title: 'Engineer' }, 'OFFER');
      await page.goto('/');
      await addOffer(request, acme.id, { respondBy: await browserDate(page, 2) });
      await scoreOffer(request, acme.id, { respondBy: 3 });

      await page.reload();
      const card = page.getByRole('article', { name: 'Acme' });
      if ((page.viewportSize()?.width ?? 0) < 1280) {
        await page.getByRole('tab', { name: /^Offer/ }).click();
      }
      const warning = await card
        .getByText(/^Respond by/)
        .evaluate((el) => getComputedStyle(el).color);
      const muted = await card
        .getByText(/^Last change/)
        .evaluate((el) => getComputedStyle(el).color);
      expect(warning).not.toBe(muted);

      await page.goto('/offers');
      await expect(page.getByText(/^Respond by/)).toBeVisible();
    },
  );

  test('the overall score follows how much each detail counts, set on Settings', async ({
    page,
    request,
  }) => {
    const { acme, bolt } = await seedOffers(request);
    await scoreOffer(request, acme.id, { baseSalary: 5, pto: 1 });
    await scoreOffer(request, bolt.id, { baseSalary: 3, pto: 5 });
    const overall = page.getByRole('rowheader', { name: 'Overall' }).locator('..');

    await page.goto(`/offers/compare?ids=${acme.id},${bolt.id}`);
    await expect(overall).toContainText('3.0 · Okay');
    await expect(overall).toContainText('4.0 · Good');

    await page.goto('/settings');
    await page.getByLabel('How much Base salary counts').selectOption('3');
    await expect(page.getByRole('status')).toHaveText('Saved');

    // Acme (3×5 + 1) ÷ 4 = 4.0; Bolt (3×3 + 5) ÷ 4 = 3.5.
    await page.goto(`/offers/compare?ids=${acme.id},${bolt.id}`);
    await expect(overall.getByRole('cell')).toHaveText(['4.0 · Good', '3.5 · Good']);
    await page.goto('/offers');
    await expect(page.getByRole('listitem').filter({ hasText: 'Acme' })).toContainText(
      'Overall4.0 · Good',
    );
    await expect(page.getByRole('listitem').filter({ hasText: 'Bolt' })).toContainText(
      'Overall3.5 · Good',
    );
  });

  test(
    "nothing on the comparison or the board's Offer tab is drawn over the main navigation",
    { tag: ['@responsive', '@overview'] },
    async ({ page, request }) => {
      const { acme, bolt, cove } = await seedOffers(request);
      for (const company of ['Eden', 'Fern', 'Gale', 'Hale']) {
        await seedInStage(request, { company, title: 'Engineer' }, 'OFFER');
      }

      await page.goto(`/offers/compare?ids=${acme.id},${bolt.id},${cove.id}`);
      await expect(page.getByRole('table')).toBeVisible();
      await expectNavOnTop(page);

      await page.goto('/');
      if ((page.viewportSize()?.width ?? 0) < 1280) {
        await page.getByRole('tab', { name: /^Offer/ }).click();
      }
      await expect(page.getByRole('article', { name: 'Hale' })).toBeVisible();
      await expectNavOnTop(page);

      // Settings, the longest page, with a custom field (feature 014).
      await page.goto('/settings');
      await expect(page.getByLabel('How much Respond by counts')).toBeVisible();
      await expectNavOnTop(page);
    },
  );
});

// On phones the main navigation is a bar fixed to the bottom of the screen. Whatever is under
// the middle of each of its links must be that link, not the page scrolling beneath it.
async function expectNavOnTop(page: Page) {
  const links = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
  await expect(links).toHaveCount(5);
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;
    const name = await link.textContent();
    // Both edges and the middle: the comparison's first column is at the left.
    for (const x of [box.x + 4, box.x + box.width / 2, box.x + box.width - 4]) {
      const onTop = await page.evaluate(
        ([px, py]) => {
          const hit = document.elementFromPoint(px as number, py as number);
          return hit?.closest('a')?.textContent ?? hit?.tagName ?? 'nothing';
        },
        [x, box.y + box.height / 2],
      );
      expect(onTop, `what's under "${name}"`).toBe(name);
    }
  }
}
