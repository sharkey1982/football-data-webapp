import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { PageErrorBoundary, isChunkLoadError } from '../components/PageErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('render failed');
}

describe('page error boundary (audit S-02)', () => {
  it('shows a way out instead of a blank page when a page throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PageErrorBoundary><Boom /></PageErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('This page didn’t load');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    // The error itself, so a screenshot says what broke.
    expect(screen.getByTestId('page-error-detail')).toHaveTextContent('Error: render failed');
    spy.mockRestore();
  });

  it('recognises a stale-deploy chunk failure', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(true);
    expect(isChunkLoadError(new TypeError("undefined is not an object (evaluating 'e.default')"))).toBe(true);
    expect(isChunkLoadError(new Error('render failed'))).toBe(false);
  });
});

describe('no page hard-codes a season id (audit CODE-05)', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f)) files.push(p);
    }
  };
  walk(join(__dirname, '..', 'pages'));
  it('calls the data functions without a literal season id', () => {
    const offenders = files.filter((f) => /\bget[A-Z]\w*\((1[0-9])\)/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
