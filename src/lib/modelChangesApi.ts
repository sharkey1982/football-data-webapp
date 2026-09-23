// ============================================================================
// src/lib/modelChangesApi.ts
//
// Model versions (the named settings behind every fit and prediction) and the
// change log (every change to how predictions, fits, returns or their data
// are calculated, with reason and before/after evidence). Both tables are
// written only by reviewed migrations; the site just reads them.
// ============================================================================

import { supabase } from './supabase';

export type ModelVersion = {
  version: string;
  component: 'fit' | 'prediction';
  description: string;
  params: Record<string, unknown>;
  introduced_at: string | null;
  retired_at: string | null;
};

export type ModelChange = {
  change_id: number;
  changed_at: string;
  area: 'fit' | 'prediction' | 'returns' | 'data';
  title: string;
  reason: string;
  detail: string | null;
  before_metrics: Record<string, unknown> | null;
  after_metrics: Record<string, unknown> | null;
  version_from: string | null;
  version_to: string | null;
  reference: string | null;
};

// These tables are newer than the generated types, so the typed client
// can't name them; the row shapes above are the contract.
const db = supabase as unknown as { from: (t: string) => any };

export async function getModelVersions(): Promise<ModelVersion[]> {
  const { data, error } = await db.from('model_versions').select('*').order('introduced_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ModelVersion[];
}

export async function getModelChanges(): Promise<ModelChange[]> {
  const { data, error } = await db.from('model_change_log').select('*').order('changed_at', { ascending: false }).order('change_id', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ModelChange[];
}

/** Flatten a metrics object into label/value lines ("PL goals a game: 2.07"). */
export function metricLines(m: Record<string, unknown> | null): { label: string; value: string }[] {
  if (!m) return [];
  const out: { label: string; value: string }[] = [];
  const walk = (prefix: string, v: unknown) => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(prefix ? `${prefix} \u2014 ${k}` : k, x);
    } else {
      out.push({ label: prefix.replace(/_/g, ' '), value: Array.isArray(v) ? v.join(' vs ') : String(v) });
    }
  };
  walk('', m);
  return out;
}
