// @module-tag core
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WIDE_QUERY, useMediaQuery } from '../src/useMediaQuery';
import { listenerCount, setWideScreen } from './media';

function Probe() {
  return <p>{useMediaQuery(WIDE_QUERY) ? 'wide' : 'narrow'}</p>;
}

describe('useMediaQuery', () => {
  it('reports the current match and follows changes', () => {
    render(<Probe />);
    expect(screen.getByText('narrow')).toBeInTheDocument();

    act(() => setWideScreen(true));

    expect(screen.getByText('wide')).toBeInTheDocument();
  });

  it('listens for "change" events while mounted and stops on unmount', () => {
    const { unmount } = render(<Probe />);
    expect(listenerCount()).toBe(1);

    unmount();

    expect(listenerCount()).toBe(0);
  });

  it('switches to columns at 1280 px', () => {
    expect(WIDE_QUERY).toBe('(min-width: 1280px)');
  });
});
