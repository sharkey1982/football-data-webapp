// ============================================================================
// src/pages/DataFlow.tsx
//
// The data and calculation flow, for admins: what each table, view and
// function is for, what feeds it, and how it has changed over time.
//
// The structure comes from the database (refreshed nightly), so this page
// cannot describe a pipeline that no longer exists. The commentary is
// written here and kept, which is the part a diagram in a document never
// survives.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  getFlowNodes,
  getFlowHistory,
  getRecentFlowChanges,
  saveFlowNotes,
  refreshFlow,
  type FlowNode,
  type FlowHistoryRow,
} from '../lib/metaFlowApi';
import { useAuthOptional } from '../lib/auth';

const LAYER_ORDER = ['source', 'pipeline', 'model', 'fantasy', 'finance', 'api', 'helper', 'scratch'];

function layerStyle(layer: string | null): string {
  const map: Record<string, string> = {
    source: 'bg-pitch-100 text-pitch-800',
    pipeline: 'bg-amber-100 text-amber-800',
    model: 'bg-sky-100 text-sky-800',
    fantasy: 'bg-violet-100 text-violet-800',
    finance: 'bg-emerald-100 text-emerald-800',
    api: 'bg-chalk-200 text-ink-700',
    helper: 'bg-chalk-100 text-ink-500',
    scratch: 'bg-chalk-100 text-ink-400',
  };
  return map[layer ?? ''] ?? 'bg-chalk-100 text-ink-500';
}

function when(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function NodeDetail({ node, onSaved }: { node: FlowNode; onSaved: (n: FlowNode) => void }) {
  const [history, setHistory] = useState<FlowHistoryRow[] | null>(null);
  const [purpose, setPurpose] = useState(node.purpose ?? '');
  const [refreshNote, setRefreshNote] = useState(node.refresh_note ?? '');
  const [commentary, setCommentary] = useState(node.commentary ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getFlowHistory(node.node_key)
      .then((h) => live && setHistory(h))
      .catch(() => live && setHistory([]));
    return () => {
      live = false;
    };
  }, [node.node_key]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveFlowNotes(node.node_key, {
        purpose: purpose.trim() || null,
        refresh_note: refreshNote.trim() || null,
        commentary: commentary.trim() || null,
      });
      onSaved({ ...node, purpose: purpose.trim() || null, refresh_note: refreshNote.trim() || null, commentary: commentary.trim() || null });
      setHistory(await getFlowHistory(node.node_key));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-chalk-50 border-t border-chalk-300 px-3 py-3 space-y-3">
      <div className="text-xs text-ink-600">
        <span className="font-medium">Reads from:</span>{' '}
        <span className="font-mono">{node.reads_from ?? 'nothing (a source, or a function with no table reads)'}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-ink-700">
          Purpose
          <input
            aria-label="Purpose"
            className="mt-1 w-full border border-chalk-300 rounded px-2 py-1 text-xs"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="What is this for?"
          />
        </label>
        <label className="text-xs text-ink-700">
          How it refreshes
          <input
            aria-label="How it refreshes"
            className="mt-1 w-full border border-chalk-300 rounded px-2 py-1 text-xs"
            value={refreshNote}
            onChange={(e) => setRefreshNote(e.target.value)}
            placeholder="Nightly job, on demand, manual..."
          />
        </label>
      </div>
      <label className="text-xs text-ink-700 block">
        Commentary
        <textarea
          aria-label="Commentary"
          className="mt-1 w-full border border-chalk-300 rounded px-2 py-1 text-xs"
          rows={2}
          value={commentary}
          onChange={(e) => setCommentary(e.target.value)}
          placeholder="Anything worth knowing next time someone looks at this."
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-1 rounded bg-pitch-700 text-white text-xs font-medium disabled:opacity-50"
        >
          {saving ? 'Saving\u2026' : 'Save notes'}
        </button>
        {error && <span className="text-xs text-loss-700">{error}</span>}
      </div>

      <div>
        <div className="text-xs font-medium text-ink-700 mb-1">History</div>
        {history === null && <p className="text-xs text-ink-500">Loading\u2026</p>}
        {history?.length === 0 && <p className="text-xs text-ink-500">No entries yet.</p>}
        <ul className="space-y-1">
          {(history ?? []).map((h) => (
            <li key={h.history_id} className="text-xs flex gap-2">
              <span className="text-ink-500 font-mono whitespace-nowrap">{when(h.changed_at)}</span>
              <span className={h.change === 'definition changed' ? 'text-amber-700 font-medium' : h.change === 'disappeared' ? 'text-loss-700 font-medium' : 'text-ink-700'}>
                {h.change}
              </span>
              {h.detail && <span className="text-ink-500">{h.detail}</span>}
              {h.author !== 'automatic' && <span className="text-ink-400">({h.author})</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function DataFlow() {
  const isAdmin = useAuthOptional()?.isAdmin ?? false;
  const [nodes, setNodes] = useState<FlowNode[] | null>(null);
  const [recent, setRecent] = useState<FlowHistoryRow[]>([]);
  const [layer, setLayer] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([getFlowNodes(), getRecentFlowChanges()])
      .then(([n, r]) => {
        if (!live) return;
        setNodes(n);
        setRecent(r);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load the flow'));
    return () => {
      live = false;
    };
  }, []);

  const layers = useMemo(() => {
    const present = new Set((nodes ?? []).map((n) => n.layer ?? 'unset'));
    return LAYER_ORDER.filter((l) => present.has(l)).concat([...present].filter((l) => !LAYER_ORDER.includes(l)));
  }, [nodes]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (nodes ?? []).filter(
      (n) =>
        (layer === 'all' || (n.layer ?? 'unset') === layer) &&
        (q === '' || n.obj_name.toLowerCase().includes(q) || (n.purpose ?? '').toLowerCase().includes(q)),
    );
  }, [nodes, layer, search]);

  async function runRefresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await refreshFlow();
      const [n, r] = await Promise.all([getFlowNodes(), getRecentFlowChanges()]);
      setNodes(n);
      setRecent(r);
      setError(res.changes > 0 ? `Refreshed: ${res.changes} change(s) recorded.` : 'Refreshed: nothing had changed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return <p className="text-sm text-ink-600">This page is for admins.</p>;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Data flow</h1>
        <p className="text-sm text-ink-600">
          Every table, view and function, where it sits in the flow and what feeds it. The structure is read from the database each night, so it
          cannot drift; the notes are yours and are kept.
        </p>
      </header>

      {recent.length > 0 && (
        <section className="border border-chalk-300 rounded-lg bg-white p-3">
          <h2 className="text-sm font-medium text-ink-800 mb-1">Changed lately</h2>
          <ul className="space-y-0.5">
            {recent.slice(0, 6).map((h) => (
              <li key={h.history_id} className="text-xs flex gap-2">
                <span className="text-ink-500 font-mono whitespace-nowrap">{when(h.changed_at)}</span>
                <span className="font-mono text-ink-700">{h.node_key.replace(/^(object|function):/, '')}</span>
                <span className={h.change === 'definition changed' ? 'text-amber-700' : h.change === 'disappeared' ? 'text-loss-700' : 'text-ink-500'}>
                  {h.change}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Layer"
          className="border border-chalk-300 rounded px-2 py-1 text-sm"
          value={layer}
          onChange={(e) => setLayer(e.target.value)}
        >
          <option value="all">All layers</option>
          {layers.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <input
          aria-label="Search"
          className="border border-chalk-300 rounded px-2 py-1 text-sm flex-1 min-w-[10rem]"
          placeholder="Search by name or purpose"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={runRefresh} disabled={busy} className="px-3 py-1 rounded border border-chalk-300 text-sm disabled:opacity-50">
          {busy ? 'Refreshing\u2026' : 'Refresh now'}
        </button>
      </div>

      {error && <p className="text-xs text-ink-600">{error}</p>}
      {nodes === null && <p className="text-sm text-ink-500">Loading\u2026</p>}

      {nodes !== null && (
        <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-chalk-100 text-ink-700">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Object</th>
                <th className="text-left px-3 py-2 font-medium">Layer</th>
                <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Purpose</th>
                <th className="text-right px-3 py-2 font-medium">Feeds</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((n) => (
                <>
                  <tr
                    key={n.node_key}
                    onClick={() => setOpen(open === n.node_key ? null : n.node_key)}
                    className="border-t border-chalk-200 cursor-pointer hover:bg-chalk-50"
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-ink-900">{n.obj_name}</span>
                      <span className="ml-2 text-[11px] text-ink-400">{n.kind}</span>
                      {!n.is_present && <span className="ml-2 text-[11px] text-loss-700">gone</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${layerStyle(n.layer)}`}>{n.layer ?? 'unset'}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-600 hidden sm:table-cell">{n.purpose ?? '\u2014'}</td>
                    <td className="px-3 py-2 text-right text-xs text-ink-600 whitespace-nowrap">
                      {n.feeds_from} in / {n.feeds_into} out
                    </td>
                  </tr>
                  {open === n.node_key && (
                    <tr key={`${n.node_key}-detail`}>
                      <td colSpan={4} className="p-0">
                        <NodeDetail node={n} onSaved={(u) => setNodes((prev) => (prev ?? []).map((p) => (p.node_key === u.node_key ? u : p)))} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="text-sm text-ink-500 p-3">Nothing matches that.</p>}
        </div>
      )}
    </div>
  );
}
