// ============================================================================
// src/lib/siteConfig.ts
//
// Central brand/canonical-origin config, read once from Vite env vars.
// Nothing else in the app should hardcode a brand name, a Netlify hostname,
// or build an absolute URL by string-pasting -- go through here so a future
// domain/brand cutover (fixtureshark.com or otherwise) is a config change,
// not a grep-and-replace across every page.
//
// VITE_SITE_URL / VITE_BRAND_NAME are optional in .env.local -- the
// defaults below keep local dev and any preview deploy working without
// them. Set both in Netlify's environment once a canonical production
// domain is live (see .env.local.example).
// ============================================================================

const DEFAULT_SITE_URL = 'https://footballdatashark.netlify.app';
const DEFAULT_BRAND_NAME = 'FixtureShark';

const rawSiteUrl = (import.meta.env.VITE_SITE_URL as string | undefined) || DEFAULT_SITE_URL;

/** Canonical production origin, no trailing slash. */
export const SITE_URL = rawSiteUrl.replace(/\/+$/, '');

/** Brand name used in <title> suffixes, meta tags, and any on-page copy. */
export const BRAND_NAME = (import.meta.env.VITE_BRAND_NAME as string | undefined) || DEFAULT_BRAND_NAME;

/** Builds an absolute URL from an app-relative path (leading slash optional). */
export function absoluteUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}
