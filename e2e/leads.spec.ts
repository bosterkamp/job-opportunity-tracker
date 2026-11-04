import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { addLeadNote, addOpportunity, createLead, expect, test } from './fixtures';

// Feature 010: networking leads on their own page, linked from opportunities (spec.md US1–US2;
// quickstart.md).

async function openLeads(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Networking leads' })
    .click();
  await expect(page.getByRole('heading', { level: 2, name: 'Networking leads' })).toBeVisible();
}

async function expectNoAxeViolations(page: Page, where: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((v) => ({ where, colorScheme, rule: v.id }))).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: null });
}

test.describe('networking leads (feature 010)', { tag: ['@leads', '@responsive'] }, () => {
  test('adding a lead from the Networking leads page', async ({ page }) => {
    await page.goto('/');
    await openLeads(page);
    await expect(page.getByText('No networking leads yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Add lead' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add lead' });
    await expect(dialog.getByLabel('Name')).toBeFocused();
    await expectNoAxeViolations(page, 'the add dialog');
    await dialog.getByLabel('Name').fill('Dana Ruiz');
    await dialog.getByLabel('Email').fill('dana@example.com');
    await dialog.getByLabel('Phone').fill('+1 555 0100');
    await dialog.getByRole('button', { name: 'Save' }).click();

    const card = page.getByRole('article', { name: 'Dana Ruiz' });
    await expect(card).toContainText('dana@example.com');
    await expect(card).toContainText('+1 555 0100');
    // Plain text, never mailto: or tel: links (spec FR-003).
    await expect(card.getByRole('link')).toHaveCount(0);
    await expectNoAxeViolations(page, 'the leads page');

    // Phones: the bottom bar says "Leads", and the page never scrolls sideways.
    const label = page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Networking leads' });
    const phone = test.info().project.name === 'mobile-webkit';
    await expect(label).toHaveText(phone ? 'Leads' : 'Networking leads', { useInnerText: true });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });

  test("a lead's buttons are the same size with or without opportunities, each on one line", async ({
    page,
    request,
  }) => {
    await createLead(request, { name: 'Brian Ng' });
    await createLead(request, { name: 'Scott Diaz', email: 'scott@example.com' });
    await addOpportunity(page, { company: 'Acme', title: 'Staff Engineer', lead: 'Scott Diaz' });

    await openLeads(page);
    const heights = [];
    for (const name of ['Brian Ng', 'Scott Diaz']) {
      for (const label of [`Add a note for ${name}`, `Edit ${name}`, `Delete ${name}`]) {
        const box = await page.getByRole('button', { name: label }).boundingBox();
        heights.push(Math.round(box?.height ?? 0));
      }
    }
    expect(new Set(heights).size).toBe(1);
    // One line of text: the card's wrapping once split "Edit" and "Delete" over two (44px is
    // the touch target).
    expect(heights[0]).toBeLessThanOrEqual(46);
  });

  test('linking an opportunity, unlinking it, and deleting the lead', async ({ page, request }) => {
    await createLead(request, { name: 'Dana Ruiz', email: 'dana@example.com' });

    // Link it when adding.
    await addOpportunity(page, { company: 'Acme', title: 'Staff Engineer', lead: 'Dana Ruiz' });
    await expect(page.getByRole('definition').filter({ hasText: 'Dana Ruiz' })).toHaveText(
      'Dana Ruiz · dana@example.com',
    );

    // The lead lists it, and its link opens it.
    await openLeads(page);
    const card = page.getByRole('article', { name: 'Dana Ruiz' });
    await expect(card.getByRole('listitem')).toHaveText(['Acme: Staff Engineer (Considering)']);
    await card.getByRole('link', { name: 'Acme: Staff Engineer' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Staff Engineer' })).toBeVisible();

    // Unlink it.
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByLabel('Lead', { exact: true }).selectOption({ label: 'No lead' });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Staff Engineer' })).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: /^Lead$/ })).toHaveCount(0);
    await openLeads(page);
    await expect(card.getByRole('list')).toHaveCount(0);

    // Link it again, then delete the lead: the opportunity stays, without it.
    await page.goto('/');
    await page.getByRole('article', { name: 'Acme' }).getByRole('link', { name: 'Acme' }).click();
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByLabel('Lead', { exact: true }).selectOption({ label: 'Dana Ruiz' });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('definition').filter({ hasText: 'Dana Ruiz' })).toBeVisible();

    await openLeads(page);
    await card.getByRole('button', { name: 'Delete Dana Ruiz' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete Dana Ruiz?' });
    await expect(confirm).toContainText('1 opportunity will stay, without a lead.');
    await expectNoAxeViolations(page, 'the delete dialog');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No networking leads yet.')).toBeVisible();

    await page.goto('/');
    await page.getByRole('article', { name: 'Acme' }).getByRole('link', { name: 'Acme' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Staff Engineer' })).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: /^Lead$/ })).toHaveCount(0);
  });

  test('notes on a lead: add, show all, edit and delete (feature 011)', async ({
    page,
    request,
  }) => {
    const lead = await createLead(request, { name: 'Dana Ruiz' });
    await addLeadNote(request, lead.id, {
      text: 'First call',
      heldAt: '2026-10-12T17:00:00.000Z',
    });

    await page.goto('/');
    await openLeads(page);
    const card = page.getByRole('article', { name: 'Dana Ruiz' });
    await card.getByRole('button', { name: 'Add a note for Dana Ruiz' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a note for Dana Ruiz' });
    await expect(dialog.getByLabel('Note')).toBeFocused();
    await expectNoAxeViolations(page, 'the note dialog');
    // A long word wraps instead of widening the page.
    const long = `Coffee chat. Intro to Acme next week.\n${'x'.repeat(120)}`;
    await dialog.getByLabel('Note').fill(long);
    await dialog.getByRole('button', { name: 'Save' }).click();

    const notes = card.getByRole('region', { name: 'Notes with Dana Ruiz' });
    await expect(notes.getByRole('listitem')).toHaveCount(1);
    await expect(notes.getByRole('listitem')).toContainText('Coffee chat.');
    await card.getByRole('button', { name: 'Show all 2 notes' }).click();
    await expect(notes.getByRole('listitem')).toHaveCount(2);
    await expect(notes.getByRole('listitem').last()).toContainText('First call');
    await expectNoAxeViolations(page, 'the notes, all shown');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);

    // Edit the older one, then delete it.
    await notes.getByRole('button', { name: /^Edit the note on Oct 12, 2026/ }).click();
    const edit = page.getByRole('dialog', { name: 'Edit note' });
    await edit.getByLabel('Note').fill('First call, about platform roles');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(notes).toContainText('First call, about platform roles');

    await notes.getByRole('button', { name: /^Delete the note on Oct 12, 2026/ }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Delete this note?' });
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(notes.getByRole('listitem')).toHaveCount(1);
    await expect(card.getByRole('button', { name: /Show all/ })).toHaveCount(0);

    // Deleting the lead says its note goes too.
    await card.getByRole('button', { name: 'Delete Dana Ruiz' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Delete Dana Ruiz?' })).toContainText(
      '1 note will be deleted.',
    );
  });
});
