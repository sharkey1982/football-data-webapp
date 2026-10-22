// Audit 22 Oct 2026, S-12: clickable rows work from the keyboard.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { rowKeys } from '../lib/rowKeys';

function Row({ onActivate, enabled }: { onActivate: () => void; enabled?: boolean }) {
  return (
    <ul>
      <li data-testid="row" onClick={onActivate} {...rowKeys(onActivate, enabled)}>
        Arsenal v Chelsea <a href="/watch">Watch</a>
      </li>
    </ul>
  );
}

describe('rowKeys', () => {
  it('puts the row in the tab order; Enter and Space activate it', () => {
    const onActivate = vi.fn();
    render(<Row onActivate={onActivate} />);
    const row = screen.getByTestId('row');
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    fireEvent.keyDown(row, { key: 'a' });
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('leaves keys on a link inside the row to the link', () => {
    const onActivate = vi.fn();
    render(<Row onActivate={onActivate} />);
    fireEvent.keyDown(screen.getByRole('link', { name: 'Watch' }), { key: 'Enter' });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    render(<Row onActivate={vi.fn()} enabled={false} />);
    expect(screen.getByTestId('row')).not.toHaveAttribute('tabindex');
  });
});
