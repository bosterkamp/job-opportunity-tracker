// @module-tag capture
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StarDisplay, StarRating, ratingText } from '../src/components/StarRating';

function Controlled({ initial = null as number | null, onChange = vi.fn() }) {
  const [value, setValue] = useState(initial);
  return (
    <StarRating
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('StarRating', () => {
  it('shows five unselected stars and "Not rated" when unset, with no clear button', () => {
    render(<Controlled />);

    expect(screen.getByRole('group', { name: 'Interest' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(
      radios.map(
        (radio) => radio.getAttribute('aria-label') ?? radio.closest('label')?.textContent,
      ),
    ).toEqual(['☆1 of 5', '☆2 of 5', '☆3 of 5', '☆4 of 5', '☆5 of 5']);
    expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText('Not rated')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear rating' })).not.toBeInTheDocument();
  });

  it('selects a rating and fills that many stars', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    await userEvent.click(screen.getByRole('radio', { name: '4 of 5' }));

    expect(onChange).toHaveBeenCalledWith(4);
    expect(screen.getByRole('radio', { name: '4 of 5' })).toBeChecked();
    expect(screen.getByText('Interest: 4 of 5')).toBeInTheDocument();
    expect(
      screen.getAllByRole('radio').map((radio) => radio.closest('label')?.textContent?.[0]),
    ).toEqual(['★', '★', '★', '★', '☆']);
  });

  it('clears the rating back to not rated', async () => {
    const onChange = vi.fn();
    render(<Controlled initial={3} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear rating' }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByText('Not rated')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false,
    );
  });

  it('changes the rating with the arrow keys', async () => {
    render(<Controlled initial={2} />);

    screen.getByRole('radio', { name: '2 of 5' }).focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: '3 of 5' })).toBeChecked();
  });

  it('names the radio group after the given name', () => {
    render(<StarRating value={null} onChange={vi.fn()} name="rating-2" />);

    expect(
      screen.getAllByRole('radio').every((radio) => radio.getAttribute('name') === 'rating-2'),
    ).toBe(true);
  });

  it('uses "interest" as the default radio name', () => {
    render(<StarRating value={null} onChange={vi.fn()} />);

    expect(screen.getAllByRole('radio')[0]).toHaveAttribute('name', 'interest');
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
  });
});

describe('StarDisplay', () => {
  it('shows the stars with an accessible label', () => {
    render(<StarDisplay value={4} />);

    expect(screen.getByRole('img', { name: 'Interest: 4 of 5' })).toHaveTextContent('★★★★☆');
  });

  it.each([null, undefined])('shows "Not rated" for %s, not zero stars', (value) => {
    render(<StarDisplay value={value} />);

    expect(screen.getByText('Not rated')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('ratingText', () => {
  it('describes a rating or its absence', () => {
    expect(ratingText(5)).toBe('Interest: 5 of 5');
    expect(ratingText(null)).toBe('Not rated');
  });
});
