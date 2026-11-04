// @module-tag capture
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_VALUES,
  OpportunityForm,
  fieldForPath,
  leadLabel,
  toInput,
  validate,
} from '../src/components/OpportunityForm';
import { fill } from './user';

function renderForm(props: Partial<Parameters<typeof OpportunityForm>[0]> = {}) {
  const onSubmit = vi.fn();
  render(<OpportunityForm submitLabel="Save opportunity" onSubmit={onSubmit} {...props} />);
  return { onSubmit };
}

const field = (name: string) => screen.getByLabelText(name, { exact: false });
const save = () => userEvent.click(screen.getByRole('button', { name: 'Save opportunity' }));

describe('OpportunityForm', () => {
  it('shows every field at once when adding, with no "More details" section (feature 011)', () => {
    renderForm();

    expect(field('Company')).toBeVisible();
    expect(field('Job title')).toBeVisible();
    expect(field('Job description')).toBeVisible();
    expect(field('Lead')).toBeVisible();
    expect(screen.queryByText('More details')).not.toBeInTheDocument();
  });

  it('marks Company and Job title as required', () => {
    renderForm();

    expect(field('Company')).toHaveAttribute('aria-required', 'true');
    expect(field('Job title')).toHaveAttribute('aria-required', 'true');
    expect(field('Location')).not.toHaveAttribute('aria-required');
  });

  it('submits trimmed company and title only, dropping every blank optional field', async () => {
    const { onSubmit } = renderForm();

    await fill(field('Company'), '  Acme ');
    await fill(field('Job title'), 'Senior Engineer');
    await save();

    // Unrated is sent as null, the schema's "not rated".
    expect(onSubmit).toHaveBeenCalledWith({
      company: 'Acme',
      title: 'Senior Engineer',
      interest: null,
    });
  });

  it.each([
    ['Company', 'Company is required'],
    ['Job title', 'Job title is required'],
  ])('shows "%s" errors and does not submit when it is empty', async (label, message) => {
    const { onSubmit } = renderForm();
    const other = label === 'Company' ? 'Job title' : 'Company';

    await fill(field(other), 'Something');
    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field(label)).toHaveAttribute('aria-invalid', 'true');
    expect(field(label)).toHaveAccessibleDescription(message);
    expect(field(other)).not.toHaveAttribute('aria-invalid');
    await waitFor(() => expect(field(label)).toHaveFocus());
  });

  it('submits every field when filled in', async () => {
    const { onSubmit } = renderForm();

    await fill(field('Company'), 'Initech');
    await fill(field('Job title'), 'Principal Engineer');
    await userEvent.click(screen.getByRole('radio', { name: '4 of 5' }));
    const contact = screen.getByRole('group', { name: 'Point of contact' });
    await fill(within(contact).getByLabelText('Name'), 'Sam Lee');
    await fill(within(contact).getByLabelText('Role'), 'Recruiter');
    await fill(within(contact).getByLabelText('Email'), 'sam@initech.example');
    await fill(within(contact).getByLabelText('Phone'), '555 0100');
    await fill(field('Job description'), 'Line one\n\nLine two');
    await fill(field('Job posting link'), 'https://initech.example/jobs/42');
    await fill(field('Location'), 'Austin, TX');
    await userEvent.selectOptions(field('Work arrangement'), 'Hybrid');
    await fill(field('Salary minimum'), '$180k');
    await fill(field('Salary maximum'), '210,000');
    await fill(field('Pay notes'), 'Plus equity');
    await fill(field('Where you found it'), 'Referral');
    await fill(field('Follow-up date'), '2026-10-24');
    await fill(screen.getByLabelText('Notes'), 'Ask about on-call');
    await save();

    expect(onSubmit).toHaveBeenCalledWith({
      company: 'Initech',
      title: 'Principal Engineer',
      contact: {
        name: 'Sam Lee',
        role: 'Recruiter',
        email: 'sam@initech.example',
        phone: '555 0100',
      },
      description: 'Line one\n\nLine two',
      interest: 4,
      postingUrl: 'https://initech.example/jobs/42',
      location: 'Austin, TX',
      workArrangement: 'HYBRID',
      salaryMin: 180_000,
      salaryMax: 210_000,
      compensation: 'Plus equity',
      source: 'Referral',
      followUpDate: '2026-10-24',
      notes: 'Ask about on-call',
    });
  });

  describe('salary', () => {
    async function enter(min: string, max = '') {
      const form = renderForm();
      await fill(field('Company'), 'Initech');
      await fill(field('Job title'), 'Engineer');
      if (min) await fill(field('Salary minimum'), min);
      if (max) await fill(field('Salary maximum'), max);
      await save();
      return form;
    }

    it('offers a minimum and a maximum for typing numbers, before "Pay notes"', () => {
      renderForm();

      for (const name of ['Salary minimum', 'Salary maximum']) {
        expect(field(name)).toHaveAttribute('type', 'text');
        expect(field(name)).toHaveAttribute('inputmode', 'numeric');
      }
      const labels = [...document.querySelectorAll('label')].map((l) => l.textContent);
      expect(
        labels.slice(labels.indexOf('Salary minimum'), labels.indexOf('Salary minimum') + 3),
      ).toEqual(['Salary minimum', 'Salary maximum', 'Pay notes']);
      expect(screen.queryByLabelText('Compensation')).not.toBeInTheDocument();
    });

    it('sends either end alone', async () => {
      const { onSubmit } = await enter('150k');

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ salaryMin: 150_000 }));
      expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('salaryMax');
    });

    it.each(['abc', '150.5', '-1', '20000000'])(
      'refuses %j with the message, on the field',
      async (typed) => {
        const { onSubmit } = await enter(typed);

        expect(onSubmit).not.toHaveBeenCalled();
        expect(field('Salary minimum')).toHaveAccessibleDescription(
          'Enter a whole number, like 150000',
        );
        await waitFor(() => expect(field('Salary minimum')).toHaveFocus());
      },
    );

    it('refuses a minimum above the maximum, on the minimum', async () => {
      const { onSubmit } = await enter('200k', '150k');

      expect(onSubmit).not.toHaveBeenCalled();
      expect(field('Salary minimum')).toHaveAccessibleDescription(
        "The minimum can't be more than the maximum",
      );
      expect(field('Salary maximum')).not.toHaveAttribute('aria-invalid');
    });

    it('shows a salary problem when adding', async () => {
      const { onSubmit } = renderForm({
        initialValues: { ...EMPTY_VALUES, company: 'A', title: 'B', salaryMax: 'lots' },
      });

      await save();

      expect(onSubmit).not.toHaveBeenCalled();
      expect(field('Salary maximum')).toBeVisible();
    });
  });

  it('offers the work arrangements with "Not specified" first', () => {
    renderForm();

    expect(
      within(field('Work arrangement'))
        .getAllByRole('option')
        .map((o) => [o.textContent, o.getAttribute('value')]),
    ).toEqual([
      ['Not specified', ''],
      ['On-site', 'ONSITE'],
      ['Hybrid', 'HYBRID'],
      ['Remote', 'REMOTE'],
    ]);
  });

  it('sets the star rating and clears it again, so cleared means not rated', async () => {
    const { onSubmit } = renderForm({
      initialValues: { ...EMPTY_VALUES, company: 'Acme', title: 'Engineer', interest: 3 },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Clear rating' }));
    await save();

    expect(screen.getByText('Not rated')).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledWith({ company: 'Acme', title: 'Engineer', interest: null });
  });

  it('focuses a detail field when it has the error', async () => {
    const { onSubmit } = renderForm();
    await fill(field('Company'), 'Acme');
    await fill(field('Job title'), 'Engineer');
    await fill(field('Email'), 'not-an-email');

    await save();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field('Email')).toBeVisible();
    expect(field('Email')).toHaveAccessibleDescription('Enter a valid email address');
    await waitFor(() => expect(field('Email')).toHaveFocus());
  });

  it('does not move focus before the first submit', () => {
    renderForm();

    expect(document.body).toHaveFocus();
  });

  it('handles the submit itself instead of letting the browser submit the form', async () => {
    let prevented: boolean | undefined;
    const listener = (event: Event) => {
      prevented = event.defaultPrevented;
    };
    window.addEventListener('submit', listener);
    renderForm({ initialValues: { ...EMPTY_VALUES, company: 'Acme', title: 'Engineer' } });

    await save();

    window.removeEventListener('submit', listener);
    expect(prevented).toBe(true);
  });

  it('focuses the first problem when a required field and a detail field have errors', async () => {
    renderForm({ initialValues: { ...EMPTY_VALUES, company: 'Acme', contactEmail: 'nope' } });

    await save();

    expect(field('Job title')).toHaveAttribute('aria-invalid', 'true');
    expect(field('Email')).toBeVisible();
    // Focus goes to the first problem in form order: the job title.
    await waitFor(() => expect(field('Job title')).toHaveFocus());
  });

  it('focuses a bad link when adding, at the top of the form', async () => {
    renderForm({
      initialValues: { ...EMPTY_VALUES, company: 'Acme', title: 'Engineer', postingUrl: 'nope' },
    });

    await save();

    expect(field('Job posting link')).toHaveAccessibleDescription('Must be an http or https link');
    await waitFor(() => expect(field('Job posting link')).toHaveFocus());
  });

  it('shows a required marker on Company and Job title only', () => {
    renderForm();

    const markers = screen.getAllByText('*');
    expect(markers.map((marker) => marker.closest('label')?.getAttribute('for'))).toEqual([
      'field-company',
      'field-title',
    ]);
    expect(markers.every((marker) => marker.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('shows an invalid contact email next to the email field', async () => {
    renderForm({
      initialValues: { ...EMPTY_VALUES, company: 'A', title: 'B', contactEmail: 'nope' },
    });

    await save();

    expect(field('Email')).toHaveAccessibleDescription('Enter a valid email address');
  });

  it('clears an error once the field is fixed and the form is submitted again', async () => {
    const { onSubmit } = renderForm();
    await save();
    expect(field('Company')).toHaveAttribute('aria-invalid', 'true');

    await fill(field('Company'), 'Acme');
    await fill(field('Job title'), 'Engineer');
    await save();

    expect(field('Company')).not.toHaveAttribute('aria-invalid');
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('starts from the given values', () => {
    renderForm({ initialValues: { ...EMPTY_VALUES, company: 'Globex', notes: 'Hi' } });

    expect(field('Company')).toHaveValue('Globex');
    expect(screen.getByLabelText('Notes')).toHaveValue('Hi');
  });

  it('shows a server error and a busy, disabled button while submitting', () => {
    renderForm({ submitting: true, serverError: 'Something went wrong' });

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('enables the button and shows no alert by default', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Save opportunity' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses the right input types', () => {
    renderForm();

    expect(field('Company')).toHaveAttribute('type', 'text');
    expect(field('Email')).toHaveAttribute('type', 'email');
    expect(field('Phone')).toHaveAttribute('type', 'tel');
    expect(field('Job posting link')).toHaveAttribute('type', 'url');
    expect(field('Follow-up date')).toHaveAttribute('type', 'date');
    expect(field('Job description').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA');
  });
});

describe('editing shows every field at once (issue #18)', () => {
  function renderEdit() {
    const onSubmit = vi.fn();
    render(
      <OpportunityForm
        mode="edit"
        submitLabel="Save changes"
        initialValues={{ ...EMPTY_VALUES, company: 'Acme', title: 'Engineer' }}
        onSubmit={onSubmit}
      />,
    );
    return { onSubmit };
  }

  it('has no "More details" section, and every field is visible', () => {
    renderEdit();

    expect(screen.queryByText('More details')).not.toBeInTheDocument();
    expect(document.querySelector('details')).toBeNull();
    for (const name of [
      'Company',
      'Job title',
      'Job description',
      'Job posting link',
      'Location',
      'Work arrangement',
      'Salary minimum',
      'Salary maximum',
      'Pay notes',
      'Where you found it',
      'Posted until',
      'Follow-up date',
      'Date added',
    ]) {
      expect(field(name)).toBeVisible();
    }
    expect(screen.getByLabelText('Notes')).toBeVisible();
    expect(screen.getByRole('group', { name: 'Point of contact' })).toBeVisible();
    expect(screen.getByRole('radio', { name: '4 of 5' })).toBeVisible();
  });

  it('focuses a field with a problem straight away', async () => {
    const { onSubmit } = renderEdit();

    await fill(field('Location'), 'x'.repeat(201));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(field('Location')).toHaveFocus());
  });
});

describe('form helpers', () => {
  it('maps form values to the API input shape', () => {
    expect(toInput({ ...EMPTY_VALUES, company: 'A', contactPhone: '1' })).toEqual({
      company: 'A',
      title: '',
      contact: { name: '', role: '', email: '', phone: '1' },
      description: '',
      interest: null,
      postingUrl: '',
      location: '',
      workArrangement: '',
      salaryMin: '',
      salaryMax: '',
      compensation: '',
      source: '',
      postedUntil: '',
      leadId: '',
      followUpDate: '',
      notes: '',
    });
    expect(toInput({ ...EMPTY_VALUES, salaryMin: '$1,500', salaryMax: 'many' })).toMatchObject({
      salaryMin: 1_500,
      salaryMax: 'many',
    });
  });

  it('maps schema paths to form fields', () => {
    expect(fieldForPath(['title'])).toBe('title');
    expect(fieldForPath(['contact', 'name'])).toBe('contactName');
    expect(fieldForPath(['contact', 'role'])).toBe('contactRole');
    expect(fieldForPath(['contact', 'email'])).toBe('contactEmail');
    expect(fieldForPath(['contact', 'phone'])).toBe('contactPhone');
    expect(fieldForPath(['contact'])).toBe('contactName');
  });

  it('keeps the first message when a field has several problems', () => {
    expect(validate({ ...EMPTY_VALUES, company: 'A', title: 'x'.repeat(201) }).errors).toEqual({
      title: 'Must be 200 characters or fewer',
    });
  });

  it('returns the parsed input and no errors for valid values', () => {
    expect(validate({ ...EMPTY_VALUES, company: ' A ', title: 'B' })).toEqual({
      input: { company: 'A', title: 'B', interest: null },
      errors: {},
    });
  });
});

describe('posted until (feature 009)', { tags: ['deadline'] }, () => {
  it('is a date field, sent when adding', async () => {
    const { onSubmit } = renderForm();
    await fill(field('Company'), 'Initech');
    await fill(field('Job title'), 'Engineer');

    expect(field('Posted until')).toHaveAttribute('type', 'date');
    await fill(field('Posted until'), '2026-11-30');
    await save();

    expect(onSubmit).toHaveBeenCalledWith({
      company: 'Initech',
      title: 'Engineer',
      interest: null,
      postedUntil: '2026-11-30',
    });
  });
});

describe('the lead (feature 010)', { tags: ['leads'] }, () => {
  const lead = (id: string, name: string, more: { email?: string; phone?: string } = {}) => ({
    id,
    name,
    ...more,
    createdAt: '2026-10-31T12:00:00.000Z',
    updatedAt: '2026-10-31T12:00:00.000Z',
  });
  const leads = [lead('l1', 'Dana Ruiz'), lead('l2', 'Sam Lee', { email: 'sam@example.com' })];
  const options = () =>
    within(field('Lead'))
      .getAllByRole('option')
      .map((option) => [option.getAttribute('value'), option.textContent]);

  it('offers "No lead" and every lead, and sends the one picked when adding', async () => {
    const { onSubmit } = renderForm({ leads });
    await fill(field('Company'), 'Initech');
    await fill(field('Job title'), 'Engineer');

    expect(options()).toEqual([
      ['', 'No lead'],
      ['l1', 'Dana Ruiz'],
      ['l2', 'Sam Lee'],
    ]);
    expect(field('Lead')).toHaveValue('');
    await userEvent.selectOptions(field('Lead'), 'Sam Lee');
    await save();

    expect(onSubmit).toHaveBeenCalledWith({
      company: 'Initech',
      title: 'Engineer',
      interest: null,
      leadId: 'l2',
    });
  });

  it('sends no lead when none is picked, and offers only "No lead" without leads', async () => {
    const { onSubmit } = renderForm();
    await fill(field('Company'), 'Initech');
    await fill(field('Job title'), 'Engineer');

    expect(options()).toEqual([['', 'No lead']]);
    await save();

    expect(onSubmit).toHaveBeenCalledWith({
      company: 'Initech',
      title: 'Engineer',
      interest: null,
    });
  });

  it('starts on the linked lead when editing, and "No lead" clears it', async () => {
    const onSubmit = vi.fn();
    render(
      <OpportunityForm
        mode="edit"
        submitLabel="Save changes"
        initialValues={{ ...EMPTY_VALUES, company: 'Initech', title: 'Engineer', leadId: 'l1' }}
        leads={leads}
        onSubmit={onSubmit}
      />,
    );

    expect(field('Lead')).toHaveValue('l1');
    await userEvent.selectOptions(field('Lead'), 'No lead');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ leadId: null }));
  });

  it('tells apart leads with the same name by their email, or else their phone', () => {
    const twins = [
      lead('a', 'Alex', { email: 'alex@one.example', phone: '555 1' }),
      lead('b', 'Alex', { phone: '555 2' }),
      lead('c', 'Alex'),
      lead('d', 'Robin', { email: 'robin@example.com' }),
    ];

    expect(twins.map((l) => leadLabel(l, twins))).toEqual([
      'Alex (alex@one.example)',
      'Alex (555 2)',
      'Alex',
      'Robin',
    ]);
  });
});
