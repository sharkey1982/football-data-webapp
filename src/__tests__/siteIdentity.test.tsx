import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../pages/Landing';
import { HOME_FAQ, SISTER_SITES, homeStructuredData, homeSummary } from '../lib/siteIdentity';
import { renderStaticRouteHead, STATIC_ROUTES } from '../entry-server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON-LD shape in tests
type Ld = Record<string, any>;

describe('site identity (AI search audit, 1 Nov 2026)', () => {
  it('home summary is answer-first and dated', () => {
    expect(homeSummary(new Date('2026-11-01T12:00:00Z'))).toMatch(/^As of 1 November 2026, FixtureShark is a free UK sports data site/);
  });

  it('home JSON-LD: Organization naming the sister sites, WebSite, and FAQPage matching the page', () => {
    const ld = homeStructuredData(new Date('2026-11-01T12:00:00Z')) as Ld[];
    const org = ld.find((o) => o['@type'] === 'Organization')!;
    expect(org.url).toBe('https://fixtureshark.com/');
    expect(org.parentOrganization.subOrganization.map((s: { url: string }) => s.url)).toEqual(SISTER_SITES.map((s) => s.url));
    expect(ld.find((o) => o['@type'] === 'WebSite')!.dateModified).toBe('2026-11-01');
    const faq = ld.find((o) => o['@type'] === 'FAQPage')!;
    expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(HOME_FAQ.map((f) => f.q));
    expect(faq.mainEntity[0].acceptedAnswer.text).toBe(HOME_FAQ[0].a);
    // Valid JSON, no undefined values.
    expect(JSON.parse(JSON.stringify(ld))).toEqual(ld);
  });

  it('the static home page carries the JSON-LD; other routes do not', () => {
    const home = renderStaticRouteHead(STATIC_ROUTES.find((r) => r.path === '/')!);
    expect(home.structuredData.map((o: Ld) => o['@type'])).toEqual(['Organization', 'WebSite', 'FAQPage']);
    const fpl = renderStaticRouteHead(STATIC_ROUTES.find((r) => r.path === '/fpl/start')!);
    expect(fpl.structuredData.map((o: Ld) => o['@type'])).not.toContain('Organization');
    expect(home.html).toContain('Common questions');
    expect(home.html).toContain('As of ');
    expect(home.html).toContain('Also from the shark family');
    expect(home.html).toContain('https://moatshark.com');
  });

  it('Landing shows every common question', () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    for (const f of HOME_FAQ) expect(screen.getByText(f.q)).toBeTruthy();
  });
});
