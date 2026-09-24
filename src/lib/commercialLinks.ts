// ============================================================================
// src/lib/commercialLinks.ts
//
// Resolves a canonical destination URL (e.g. a broadcast's watch_url) to
// either that same URL unchanged, or an active affiliate version of it --
// see the affiliate_partners migration for the schema this reads.
//
// The guiding rule, same one the site already applies to broadcast data:
// the ordinary destination must keep working if there's no affiliate
// relationship, or if one ends. This module never fabricates a link --
// with no active, in-window partner row for a domain, it hands back
// exactly the canonical URL it was given.
//
// Deliberately generic: any canonical URL and any category (streaming,
// tickets, merchandise, travel, stadium_experiences) goes through the same
// resolveCommercialLink, so tickets/merch reuse this without changes here.
// ============================================================================

import { supabase } from './supabase';

export type AffiliateCategory = 'streaming' | 'tickets' | 'merchandise' | 'travel' | 'stadium_experiences';

export type AffiliatePartner = {
  partnerId: number;
  name: string;
  category: AffiliateCategory;
  network: string | null;
  canonicalDomain: string;
  affiliateUrlTemplate: string | null;
  market: string;
};

export type CommercialLink = {
  /** The URL to actually use for the href. */
  url: string;
  /** Whether `url` is an affiliate link -- drives rel="sponsored" and the disclosure tag. */
  isAffiliate: boolean;
  /** Present only when isAffiliate is true. */
  partner?: { name: string; network: string | null };
};

const COLUMNS = 'partner_id,name,category,network,canonical_domain,affiliate_url_template,market';

// Newer than the generated types; the row shape above is the contract.
const db = supabase as unknown as { from: (t: string) => any };

function toPartner(r: Record<string, unknown>): AffiliatePartner {
  return {
    partnerId: Number(r.partner_id),
    name: String(r.name),
    category: r.category as AffiliateCategory,
    network: (r.network as string | null) ?? null,
    canonicalDomain: String(r.canonical_domain),
    affiliateUrlTemplate: (r.affiliate_url_template as string | null) ?? null,
    market: String(r.market),
  };
}

/** Active, in-date-window partner rows for a category (and market, default
 * GB). A small table (a handful of rows) -- no caching layer, a fresh
 * fetch each time is cheap and always correct if a row changes. */
export async function getActivePartners(category: AffiliateCategory, market = 'GB'): Promise<AffiliatePartner[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from('affiliate_partners')
    .select(COLUMNS)
    .eq('category', category)
    .eq('market', market)
    .eq('active', true)
    .or(`valid_from.is.null,valid_from.lte.${today}`)
    .or(`valid_to.is.null,valid_to.gte.${today}`);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toPartner);
}

/** Pure matching logic, kept separate from the fetch so it's testable
 * without mocking Supabase. Matches by hostname (a canonical URL on
 * "www.nowtv.com" or "watch.nowtv.com" both match a partner row for
 * "nowtv.com"), never by guessing -- an unparseable canonicalUrl or no
 * matching partner both fall back to the canonical URL unchanged. */
export function resolveCommercialLink(canonicalUrl: string, partners: AffiliatePartner[]): CommercialLink {
  let hostname: string;
  try {
    hostname = new URL(canonicalUrl).hostname.toLowerCase();
  } catch {
    return { url: canonicalUrl, isAffiliate: false };
  }

  const partner = partners.find((p) => hostname === p.canonicalDomain || hostname.endsWith(`.${p.canonicalDomain}`));
  if (!partner || !partner.affiliateUrlTemplate) {
    return { url: canonicalUrl, isAffiliate: false };
  }

  const url = partner.affiliateUrlTemplate.replace('{url}', encodeURIComponent(canonicalUrl));
  return { url, isAffiliate: true, partner: { name: partner.name, network: partner.network } };
}

/** Convenience wrapper: fetch + resolve in one call. Prefer
 * getActivePartners once per page (e.g. once for a whole fixture list)
 * and resolveCommercialLink per link when resolving many links on one
 * page, to avoid a fetch per fixture. */
export async function getCommercialLink(
  canonicalUrl: string,
  category: AffiliateCategory,
  market = 'GB'
): Promise<CommercialLink> {
  const partners = await getActivePartners(category, market);
  return resolveCommercialLink(canonicalUrl, partners);
}
