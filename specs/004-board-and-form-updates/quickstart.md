# Quickstart: Board and Form Updates

## Prerequisites

The local stack from the README: `npm install`, DynamoDB Local, then `npm run dev`. Nothing
here needs AWS until the deployed checks.

## Automated checks (run locally before any push)

```sh
npm run lint && npm run typecheck
npm run test:coverage           # ≥ 80% across packages
npm run test:mutation:full      # zero surviving mutants (static ones included, as on master)
npm run test:e2e                # the full suite, since the shared schema changed
```

## Manual checks

### Salary (US1)

1. **Card text**: Add "Acme / Engineer" with salary 150000 to 180000. Its card reads
   "$150k–$180k".
2. **Lenient input and one-ended ranges**: Add one with a minimum of "$150k" and no maximum. The
   card reads "$150k+".
3. **Range rule**: Enter a minimum of 200000 and a maximum of 100000. "The minimum can't be more
   than the maximum" shows, and nothing is saved.
4. **Sort**: Sort by "Salary (maximum)". The highest is first, and those without a salary come
   last.
5. **Filter**: Choose "Salary at least $150k". Only matching opportunities show, along with
   "n hidden because they have no salary". The address has `?salary=150000`.
6. **Pay notes**: An older opportunity's text shows under "Pay notes", unchanged.
7. **Fill from link**: Use a fixture posting with `baseSalary`. The minimum, maximum, and pay
   notes fill.

### Date added (US2)

1. **Default**: The add form shows today under "Date added".
2. **Backdating**: Set it to three months ago and save. The detail page shows that date, and so
   does the first history entry. The card reads "Last change 3 months ago".
3. **Future date**: Set a date in the future. "The date can't be in the future" shows.
4. **After the first move**: Move the opportunity to Applied, then edit its date added to after
   that move. "The date added can't be after the first stage change" shows.

### Closed (US3)

1. **Wide screen**: Close an opportunity as Rejected. On a wide screen the last column is
   "Closed", with its count, and the card shows "Rejected" and no "Move to…".
2. **Phone**: On a phone-sized window, a "Closed (n)" tab follows the stage tabs.
3. **Stage filter**: Choose "Closed". Only the Closed column shows.

### Full edit page (US4)

1. **Edit form**: Choose "Edit details". Every field is visible, with no "More details".
2. **Add form**: The add form still shows only the link, company, and title until "More details"
   is opened.

### Through Claude

After deploying, ask Claude to set the salary for an opportunity, for example "Farmers pays
150 to 180k". Its card shows "$150k–$180k". The detail page shows "Details last changed through
Claude".
