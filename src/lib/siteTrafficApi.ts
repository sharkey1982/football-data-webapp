// ============================================================================
// src/lib/siteTrafficApi.ts
//
// Data for /admin/traffic: Google Search Console (gsc schema) and Google
// Analytics 4 (ga schema), loaded daily by scripts/gsc_import.py and
// scripts/ga_import.py. One admin-only RPC, public.get_site_traffic(p_days);
// the tables themselves are not reachable through the Data API.
// ============================================================================

import { supabase } from './supabase';

// Not in the generated types until the next schema snapshot (same pattern as
// lineupCompareApi.ts).
const rpc = (supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
}).rpc.bind(supabase);

export type TrafficPeriod = {
  clicks: number;
  impressions: number;
  position: number | null;
  sessions: number;
  engaged: number;
  views: number;
  eng_s: number;
  /** Daily active users summed over the days -- not unique visitors. */
  user_days: number;
  new_users: number;
};

export type TrafficDay = {
  date: string;
  clicks: number;
  impressions: number;
  users: number;
  sessions: number;
  views: number;
  /** False while Google may still revise the day. */
  final: boolean;
};

export type SiteTraffic = {
  start: string;
  end: string;
  days: number;
  periods: { current?: TrafficPeriod; previous?: TrafficPeriod } | null;
  daily: TrafficDay[];
  sections: { section: string; views: number; sessions: number; eng_s: number }[];
  pages: { page: string; views: number; sessions: number; eng_s: number }[];
  landing: { page: string; sessions: number; engaged: number; views: number }[];
  sources: { channel_group: string; source: string; medium: string; sessions: number; engaged: number; views: number }[];
  devices: { device: string; sessions: number; views: number }[];
  countries: { country: string; sessions: number; views: number }[];
  search_queries: { query: string; clicks: number; impressions: number; position: number | null }[];
  search_pages: { page: string; clicks: number; impressions: number; position: number | null }[];
  search_countries: { country: string; clicks: number; impressions: number }[];
  loaded: { gsc_last_date: string | null; gsc_last_run: string | null; ga_last_date: string | null; ga_last_run: string | null };
};

export async function getSiteTraffic(days: number): Promise<SiteTraffic> {
  const { data, error } = await rpc('get_site_traffic', { p_days: days });
  if (error) throw error;
  return data as SiteTraffic;
}

/** Percentage change, or null when there is nothing to compare with. */
export function pctChange(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

/** Search Console page URLs are absolute; show them as site paths. */
export function sitePath(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?fixtureshark\.com/, '') || '/';
}

/** ISO 3166-1 alpha-3 (Search Console's country codes) to a display name. */
export function countryName(alpha3: string): string {
  const names: Record<string, string> = {
    gbr: 'United Kingdom', usa: 'United States', irl: 'Ireland', ind: 'India', can: 'Canada', aus: 'Australia',
    nga: 'Nigeria', deu: 'Germany', fra: 'France', esp: 'Spain', ita: 'Italy', nld: 'Netherlands',
    nor: 'Norway', swe: 'Sweden', zaf: 'South Africa', bmu: 'Bermuda', pak: 'Pakistan', bgd: 'Bangladesh',
    ken: 'Kenya', gha: 'Ghana', uga: 'Uganda', bel: 'Belgium', prt: 'Portugal', pol: 'Poland', dnk: 'Denmark',
  };
  return names[alpha3.toLowerCase()] ?? alpha3.toUpperCase();
}
