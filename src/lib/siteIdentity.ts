// ============================================================================
// src/lib/siteIdentity.ts
//
// Who FixtureShark is, in one place: the home page's opening sentence and
// common questions, the sister sites in the footer, and the Organization /
// WebSite / FAQPage JSON-LD on the home page (AI search audit, 1 Nov 2026).
// The FAQ text is shown on the page AND emitted as FAQPage JSON-LD from the
// same array, so the two can never disagree.
// ============================================================================

import { BRAND_NAME, SITE_URL } from './siteConfig';
import { COVERAGE } from './dataCoverage';

/** The other "shark" sites. Names and addresses only. */
export const SISTER_SITES = [
  { name: 'MoatShark', url: 'https://moatshark.com' },
  { name: 'LocationShark', url: 'https://locationshark.com' },
] as const;

/** FixtureShark's own profiles elsewhere (schema.org sameAs). */
export const SAME_AS = ['https://x.com/FixtureSharkHQ'] as const;

/** "1 November 2026", UK style, for "As of ..." sentences. */
export function ukLongDate(d: Date = new Date()): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

/** The home page's answer-first sentence: what the site is, dated. */
export function homeSummary(d: Date = new Date()): string {
  return (
    `As of ${ukLongDate(d)}, ${BRAND_NAME} is a free UK sports data site: football results, tables and ` +
    `model predictions for the Premier League, the EFL, the National League and ${COVERAGE.otherTopFlights} other top flights, ` +
    `Fantasy Premier League projections, international football since 1872, club finances, the NFL and tennis.`
  );
}

export type Faq = { q: string; a: string };

/** Real questions about the site, answered from what it actually does. */
export const HOME_FAQ: Faq[] = [
  {
    q: `What is ${BRAND_NAME}?`,
    a: `${BRAND_NAME} is a free UK sports data site. It covers club football (results, tables and match predictions), Fantasy Premier League (player projections, predicted line-ups, injuries and prices), club finances from filed accounts, every men's international since 1872, the NFL and tennis.`,
  },
  {
    q: `How does ${BRAND_NAME} predict football matches?`,
    a: `Match predictions come from a Dixon-Coles model fitted to past results. Each prediction is shown beside the betting market's view, and the model scorecard reports how the two compare on games the model had not seen.`,
  },
  {
    q: 'How often is the data updated?',
    a: 'Every day. Fixtures, results, predictions and FPL projections refresh daily, with extra FPL updates around gameweek deadlines and price changes.',
  },
  {
    q: 'Where does the data come from?',
    a: `From public sources: published fixtures and results (England from ${COVERAGE.englandLeagueFrom}), the official Fantasy Premier League data, betting market prices, and clubs' accounts filed at Companies House.`,
  },
  {
    q: `Is ${BRAND_NAME} free?`,
    a: `Yes. Every page is free to read, with no sign-up. ${BRAND_NAME} shows model and market probabilities; it does not give betting tips.`,
  },
];

export function faqJsonLd(faq: Faq[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

/** Organization (naming the sister sites) and WebSite, for the home page. */
export function homeStructuredData(d: Date = new Date()): object[] {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: BRAND_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/icon-512.png`,
    description: 'A free UK sports data site: football results, tables and model predictions, Fantasy Premier League projections, club finances, international football, the NFL and tennis.',
    sameAs: [...SAME_AS],
    // The "shark" family of sites, of which FixtureShark is one.
    parentOrganization: {
      '@type': 'Organization',
      name: 'The Shark family of sites',
      subOrganization: SISTER_SITES.map((s) => ({ '@type': 'Organization', name: s.name, url: s.url })),
    },
  };
  const site = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: BRAND_NAME,
    url: `${SITE_URL}/`,
    inLanguage: 'en-GB',
    publisher: { '@id': `${SITE_URL}/#organization` },
    dateModified: d.toISOString().slice(0, 10),
  };
  return [org, site, faqJsonLd(HOME_FAQ)];
}
