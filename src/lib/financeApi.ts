// ============================================================================
// src/lib/financeApi.ts
//
// Club finance data, read from the four PUBLIC finance views (raw filings,
// mappings and XBRL facts are private by design):
//
//   finance_published_periods     one row per club per reporting period
//   finance_published_provenance  where each published figure came from
//   finance_derived_metrics       FixtureShark-derived figures (e.g. ratios)
//   finance_metric_dictionary     plain-English definitions
//
// Rules this module enforces:
//   * Joins to clubs ONLY through team_id -- never by name. Football names and
//     legal names differ (slug "southend", company "Southend United Football
//     Club Limited").
//   * NULL stays NULL. PostgREST may return numeric columns as strings; toNum
//     converts them without ever turning a missing value into 0.
//   * Values and signs are used exactly as published. Nothing is inferred or
//     estimated.
//   * Static generation fetches each view ONCE for all clubs and splits the
//     rows with groupFinanceByTeam -- never one request per club.
// ============================================================================

import { supabase } from './supabase';

export type FinanceMetricKey =
  | 'revenue_total' | 'revenue_matchday' | 'revenue_broadcast' | 'revenue_commercial' | 'revenue_other'
  | 'staff_costs' | 'player_amortisation' | 'player_impairment' | 'profit_on_player_disposals'
  | 'operating_profit' | 'profit_before_tax' | 'profit_after_tax'
  | 'cash' | 'borrowings' | 'total_assets' | 'total_liabilities' | 'net_assets' | 'average_employees';

export const FINANCE_METRIC_KEYS: FinanceMetricKey[] = [
  'revenue_total', 'revenue_matchday', 'revenue_broadcast', 'revenue_commercial', 'revenue_other',
  'staff_costs', 'player_amortisation', 'player_impairment', 'profit_on_player_disposals',
  'operating_profit', 'profit_before_tax', 'profit_after_tax',
  'cash', 'borrowings', 'total_assets', 'total_liabilities', 'net_assets', 'average_employees',
];

export type FinancePeriod = {
  team_id: number;
  period_start: string | null;
  period_end: string;
  period_months: number | null;
  season_id: number | null;
  reporting_entity: string | null;
  company_number: string | null;
  is_consolidated: boolean | null;
  currency: string | null;
  unit_scale: number | null;
  is_latest: boolean;
  is_comparable: boolean;
  filing_date: string | null;
  source_url: string | null;
  validation_status: string | null;
} & Record<FinanceMetricKey, number | null>;

export type FinanceProvenance = {
  team_id: number;
  period_end: string;
  metric_key: string;
  original_xbrl_concept: string | null;
  original_value: string | null;
  original_unit: string | null;
  filing_reference: string | null;
  document_id: string | null;
  source_url: string | null;
  mapping_version: number | null;
};

export type FinanceDerived = {
  team_id: number;
  period_end: string;
  metric_key: string;
  value: number | null;
  definition: string | null;
  calculation_version: number | null;
};

export type FinanceMetricDef = {
  metric_key: string;
  display_name: string;
  definition: string | null;
  metric_type: string | null;
  statement_type: string | null;
  value_kind: string | null;
  expected_sign: string | null;
};

export type FinanceTeam = { team_id: number; slug: string; display_name: string };

export type ClubFinanceData = {
  team: FinanceTeam;
  periods: FinancePeriod[];       // oldest first
  provenance: FinanceProvenance[];
  derived: FinanceDerived[];
  dictionary: FinanceMetricDef[];
};

export type FinanceIndexEntry = {
  team: FinanceTeam;
  latest: FinancePeriod;
  periodCount: number;
};

/** Numeric from PostgREST (number or string). NULL stays NULL -- never 0. */
export function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Rows are normalised field by field: every metric through toNum, so a
// missing disclosure can never be coerced to zero anywhere downstream.
export function normalisePeriod(r: Record<string, unknown>): FinancePeriod {
  const out = {
    team_id: Number(r.team_id),
    period_start: (r.period_start as string) ?? null,
    period_end: String(r.period_end),
    period_months: toNum(r.period_months),
    season_id: toNum(r.season_id),
    reporting_entity: (r.reporting_entity as string) ?? null,
    company_number: (r.company_number as string) ?? null,
    is_consolidated: r.is_consolidated == null ? null : Boolean(r.is_consolidated),
    currency: (r.currency as string) ?? null,
    unit_scale: toNum(r.unit_scale),
    is_latest: r.is_latest === true,
    // Only an explicit false marks a period non-comparable; the flag is never
    // overridden or inferred here.
    is_comparable: r.is_comparable !== false,
    filing_date: (r.filing_date as string) ?? null,
    source_url: (r.source_url as string) ?? null,
    validation_status: (r.validation_status as string) ?? null,
  } as FinancePeriod;
  for (const k of FINANCE_METRIC_KEYS) (out as Record<string, unknown>)[k] = toNum(r[k]);
  return out;
}

export function normaliseDerived(r: Record<string, unknown>): FinanceDerived {
  return {
    team_id: Number(r.team_id),
    period_end: String(r.period_end),
    metric_key: String(r.metric_key),
    value: toNum(r.value),
    definition: (r.definition as string) ?? null,
    calculation_version: toNum(r.calculation_version),
  };
}

export function normaliseProvenance(r: Record<string, unknown>): FinanceProvenance {
  return {
    team_id: Number(r.team_id),
    period_end: String(r.period_end),
    metric_key: String(r.metric_key),
    original_xbrl_concept: (r.original_xbrl_concept as string) ?? null,
    original_value: r.original_value == null ? null : String(r.original_value),
    original_unit: (r.original_unit as string) ?? null,
    filing_reference: (r.filing_reference as string) ?? null,
    document_id: (r.document_id as string) ?? null,
    source_url: (r.source_url as string) ?? null,
    mapping_version: toNum(r.mapping_version),
  };
}

/**
 * Split bulk rows into per-club finance data. Used by static generation
 * (four queries for every club, not four per club) and by the browser (for
 * one club). Periods are sorted oldest first; teams without periods are
 * dropped, so a club only gets a finance page if it has published data.
 */
export function groupFinanceByTeam(
  teams: FinanceTeam[],
  periods: FinancePeriod[],
  provenance: FinanceProvenance[],
  derived: FinanceDerived[],
  dictionary: FinanceMetricDef[]
): Map<number, ClubFinanceData> {
  const byTeam = new Map<number, ClubFinanceData>();
  const teamById = new Map(teams.map((t) => [t.team_id, t]));
  for (const p of periods) {
    const team = teamById.get(p.team_id);
    if (!team) continue;
    if (!byTeam.has(p.team_id)) byTeam.set(p.team_id, { team, periods: [], provenance: [], derived: [], dictionary });
    byTeam.get(p.team_id)!.periods.push(p);
  }
  for (const r of provenance) byTeam.get(r.team_id)?.provenance.push(r);
  for (const r of derived) byTeam.get(r.team_id)?.derived.push(r);
  for (const d of byTeam.values()) d.periods.sort((a, b) => a.period_end.localeCompare(b.period_end));
  return byTeam;
}

/** The latest period: the one flagged is_latest, else the most recent. */
export function latestPeriod(periods: FinancePeriod[]): FinancePeriod | null {
  if (!periods.length) return null;
  return periods.find((p) => p.is_latest) ?? periods[periods.length - 1];
}

/** Latest filing date across a club's periods -- the sitemap's lastmod. */
export function latestFilingDate(periods: FinancePeriod[]): string | null {
  const dates = periods.map((p) => p.filing_date).filter((d): d is string => !!d).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

export function buildFinanceIndex(data: Iterable<ClubFinanceData>): FinanceIndexEntry[] {
  const out: FinanceIndexEntry[] = [];
  for (const d of data) {
    const latest = latestPeriod(d.periods);
    if (latest) out.push({ team: d.team, latest, periodCount: d.periods.length });
  }
  return out.sort((a, b) => a.team.display_name.localeCompare(b.team.display_name));
}

// ---- runtime fetchers (the browser, for pages not pre-rendered) -----------

export async function getFinanceDictionary(): Promise<FinanceMetricDef[]> {
  const { data, error } = await supabase.from('finance_metric_dictionary').select('metric_key, display_name, definition, metric_type, statement_type, value_kind, expected_sign');
  if (error) throw error;
  return (data ?? []) as FinanceMetricDef[];
}

/** team_ids with published finance data -- one query, all clubs. */
export async function getTeamIdsWithFinance(): Promise<Set<number>> {
  const { data, error } = await supabase.from('finance_published_periods').select('team_id');
  if (error) throw error;
  return new Set((data ?? []).map((r) => Number((r as { team_id: number }).team_id)));
}

export async function teamHasFinance(teamId: number): Promise<boolean> {
  const { count, error } = await supabase
    .from('finance_published_periods')
    .select('team_id', { count: 'exact', head: true })
    .eq('team_id', teamId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** One club's finance data by team slug. Null if the team does not exist. */
export async function getClubFinanceBySlug(slug: string): Promise<ClubFinanceData | null> {
  const { data: team, error: tErr } = await supabase.from('teams').select('team_id, slug, display_name').eq('slug', slug).maybeSingle();
  if (tErr) throw tErr;
  if (!team) return null;
  const t = team as FinanceTeam;
  const [pRes, provRes, dRes, dict] = await Promise.all([
    supabase.from('finance_published_periods').select('*').eq('team_id', t.team_id),
    supabase.from('finance_published_provenance').select('*').eq('team_id', t.team_id),
    supabase.from('finance_derived_metrics').select('*').eq('team_id', t.team_id),
    getFinanceDictionary(),
  ]);
  if (pRes.error) throw pRes.error;
  if (provRes.error) throw provRes.error;
  if (dRes.error) throw dRes.error;
  const grouped = groupFinanceByTeam(
    [t],
    (pRes.data ?? []).map((r) => normalisePeriod(r as Record<string, unknown>)),
    (provRes.data ?? []).map((r) => normaliseProvenance(r as Record<string, unknown>)),
    (dRes.data ?? []).map((r) => normaliseDerived(r as Record<string, unknown>)),
    dict
  );
  // A real team with no published periods returns empty periods -- the page
  // shows an explanatory empty state rather than a 404.
  return grouped.get(t.team_id) ?? { team: t, periods: [], provenance: [], derived: [], dictionary: dict };
}

/** Every club with published data, for the /finance index. */
export async function getFinanceIndex(): Promise<FinanceIndexEntry[]> {
  const { data: rows, error } = await supabase.from('finance_published_periods').select('*');
  if (error) throw error;
  const periods = (rows ?? []).map((r) => normalisePeriod(r as Record<string, unknown>));
  const ids = [...new Set(periods.map((p) => p.team_id))];
  if (!ids.length) return [];
  const { data: teams, error: tErr } = await supabase.from('teams').select('team_id, slug, display_name').in('team_id', ids);
  if (tErr) throw tErr;
  return buildFinanceIndex(groupFinanceByTeam((teams ?? []) as FinanceTeam[], periods, [], [], []).values());
}

/** Every club's published periods, for the comparison page. Two queries in
 *  total (periods, then the teams they reference), however many clubs. */
export async function getAllClubFinance(): Promise<ClubFinanceData[]> {
  const { data: rows, error } = await supabase.from('finance_published_periods').select('*');
  if (error) throw error;
  const periods = (rows ?? []).map((r) => normalisePeriod(r as Record<string, unknown>));
  const ids = [...new Set(periods.map((p) => p.team_id))];
  if (!ids.length) return [];
  const { data: teams, error: tErr } = await supabase.from('teams').select('team_id, slug, display_name').in('team_id', ids);
  if (tErr) throw tErr;
  return [...groupFinanceByTeam((teams ?? []) as FinanceTeam[], periods, [], [], []).values()];
}
