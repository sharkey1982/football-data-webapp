// ============================================================================
// src/lib/metaFlowApi.ts
//
// The data and calculation flow: what every table, view and function is for,
// what feeds it, and how it has changed.
//
// The structure is derived from the database itself (meta_refresh_flow(), run
// nightly), so it cannot drift from reality the way a hand-written diagram
// does. What people write -- layer, purpose, refresh note, commentary -- is
// never overwritten by that refresh, and every edit is recorded in the
// history alongside the automatic entries.
// ============================================================================

import { supabase } from './supabase';

export type FlowNode = {
  node_key: string;
  kind: 'table' | 'view' | 'matview' | 'function';
  obj_name: string;
  layer: string | null;
  purpose: string | null;
  refresh_note: string | null;
  commentary: string | null;
  row_estimate: number | null;
  feeds_from: number;
  feeds_into: number;
  reads_from: string | null;
  first_seen: string;
  last_seen: string;
  is_present: boolean;
  last_definition_change: string | null;
  definition_changes: number;
};

export type FlowHistoryRow = {
  history_id: number;
  node_key: string;
  changed_at: string;
  change: 'added' | 'definition changed' | 'disappeared' | 'returned' | 'commentary';
  detail: string | null;
  author: string;
};

/** Every object in the flow, present ones first. */
export async function getFlowNodes(): Promise<FlowNode[]> {
  const { data, error } = await supabase
    .from('meta_flow_summary')
    .select('*')
    .order('is_present', { ascending: false })
    .order('obj_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as FlowNode[];
}

/** The timeline for one object: appeared, changed, disappeared, plus notes. */
export async function getFlowHistory(nodeKey: string, limit = 25): Promise<FlowHistoryRow[]> {
  const { data, error } = await supabase
    .from('meta_flow_history')
    .select('*')
    .eq('node_key', nodeKey)
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FlowHistoryRow[];
}

/** Recent changes across everything -- the "what moved lately" view. */
export async function getRecentFlowChanges(limit = 20): Promise<FlowHistoryRow[]> {
  const { data, error } = await supabase
    .from('meta_flow_history')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FlowHistoryRow[];
}

/** Save what a human wrote. Only these four columns are writable, and the
 *  database records the edit in the history itself (trigger), so the page
 *  does not have to remember to log it. */
export async function saveFlowNotes(
  nodeKey: string,
  notes: { layer?: string | null; purpose?: string | null; refresh_note?: string | null; commentary?: string | null },
): Promise<void> {
  const { error } = await supabase.from('meta_flow_nodes').update(notes).eq('node_key', nodeKey);
  if (error) throw error;
}

/** Re-derive the registry now instead of waiting for the nightly run. */
export async function refreshFlow(): Promise<{ nodes: number; edges: number; changes: number }> {
  const { data, error } = await supabase.rpc('meta_refresh_flow');
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { nodes: number; edges: number; changes: number } | null;
  return row ?? { nodes: 0, edges: 0, changes: 0 };
}
