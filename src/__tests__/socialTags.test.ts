import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDocument, DEFAULT_OG_IMAGE } from '../entry-server';

// The real shell, so a change to index.html that drops the social markers
// (and would leave generated pages with the generic block) fails here.
const shell = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

const page = {
  html: '<p>x</p>',
  title: 'Arsenal v Brighton — prediction | FixtureShark',
  description: 'The model gives Arsenal a 60% chance "of winning".',
  canonical: 'https://fixtureshark.com/football/matches/arsenal-v-brighton-2027-05-30',
  structuredData: [],
};

describe('social preview tags', () => {
  it('replaces the shell defaults with exactly one page-specific block', () => {
    const out = buildDocument(shell, page);
    expect(out.match(/<!-- social:start -->/g)).toHaveLength(1);
    expect(out.match(/property="og:title"/g)).toHaveLength(1);
    expect(out).toContain('<meta property="og:title" content="Arsenal v Brighton — prediction | FixtureShark" />');
    expect(out).toContain(`<meta property="og:url" content="${page.canonical}" />`);
    expect(out).toContain(`<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`);
    expect(out).toContain('name="twitter:card" content="summary_large_image"');
  });

  it('escapes quotes in the description', () => {
    const out = buildDocument(shell, page);
    expect(out).not.toContain('content="The model gives Arsenal a 60% chance "of');
  });

  it('is stable when applied twice', () => {
    const twice = buildDocument(buildDocument(shell, page), page);
    expect(twice.match(/property="og:title"/g)).toHaveLength(1);
  });
});
