import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import NotFoundPage from '../pages/NotFoundPage';

// The SPA fallback serves every unknown URL with HTTP 200, so this page's
// noindex tag is the only thing stopping mistyped URLs being indexed.
describe('NotFoundPage', () => {
  it('marks itself noindex while mounted and cleans up after', () => {
    const { unmount } = render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});
