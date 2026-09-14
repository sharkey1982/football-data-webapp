import { useEffect, useMemo, useState } from 'react';
import {
  getLeagueFitStatus,
  getRecentFixtureRefreshRuns,
  getRecentMatchImportRuns,
  type FixtureRefreshRun,
  type LeagueFitStatus,
  type MatchImportRun,
} from '../lib/api';

type SortKey = 'league_code' | 'accepted_fitted_at' | 'accepted_matches_used' | 'latest_attempted_status';
type SortDirection = 'asc' | 'desc';

function formatDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    accepted: 'bg-pitch-800 text-chalk-100',
    success: 'bg-pitch-800 text-chalk-100',
    rejected: 'bg-loss-700 text-chalk-100',
    failed: 'bg-loss-700 text-chalk-100',
    pending: 'bg-amber-500 text-ink-900',
  };
  const label = status ?? 'none';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide ${styles[label] ?? 'bg-chalk-300 text-ink-700'}`}>
      {label}
    </span>
  );
}

function DataLoadTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: { key: string | number; when: string | null; label: string; seen: number | null; changed: number | null; status: string; error: string | null }[];
}) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-chalk-300">
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">{title}</h2>
        <p className="text-xs text-ink-500">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-chalk-200 text-ink-500">
            <tr>
              <th className="text-left font-medium text-xs px-3 py-1.5">Run</th>
              <th className="text-left font-medium text-xs px-3 py-1.5">Scope</th>
              <th className="text-right font-medium text-xs px-3 py-1.5">Seen</th>
              <th className="text-right font-medium text-xs px-3 py-1.5">Changed</th>
              <th className="text-left font-medium text-xs px-3 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-center text-ink-500 text-xs">
                  No runs recorded yet.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.key} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                <td className="px-3 py-1.5 whitespace-nowrap font-mono text-xs">{formatDate(r.when)}</td>
                <td className="px-3 py-1.5 text-xs">{r.label}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs">{r.seen ?? '\u2014'}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs">{r.changed ?? '\u2014'}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    {r.status === 'failed' && r.error && <span className="text-xs text-loss-700">{r.error}</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DataHealth() {
  const [rows, setRows] = useState<LeagueFitStatus[]>([]);
  const [matchImportRuns, setMatchImportRuns] = useState<MatchImportRun[]>([]);
  const [fixtureRefreshRuns, setFixtureRefreshRuns] = useState<FixtureRefreshRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('league_code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [fitStatus, imports, refreshes] = await Promise.all([
          getLeagueFitStatus(),
          getRecentMatchImportRuns(),
          getRecentFixtureRefreshRuns(),
        ]);
        if (cancelled) return;
        setRows(fitStatus);
        setMatchImportRuns(imports);
        setFixtureRefreshRuns(refreshes);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data health info');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  const sortedRows = useMemo(() => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // nulls last regardless of direction
      if (bv === null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * dir;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return 0;
    });
  }, [rows, sortKey, sortDirection]);

  const columns: { key: SortKey; label: string; align?: 'left' | 'right' | 'center' }[] = [
    { key: 'league_code', label: 'Competition' },
    { key: 'accepted_fitted_at', label: 'Production fit' },
    { key: 'accepted_matches_used', label: 'Observations', align: 'right' },
    { key: 'latest_attempted_status', label: 'Latest attempt' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Data Health</h1>
        <p className="text-sm text-ink-500 mt-1">
          Every competition's current production model fit, alongside the most recently attempted fit for it --
          including ones that didn't pass and were rejected. Click a column header to sort.
        </p>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {error && <p className="text-loss-700 text-sm">{error}</p>}

      {!loading && !error && (
        <div data-testid="fit-status-table" className="overflow-x-auto border border-chalk-300 rounded-lg bg-white">
          <table className="w-full text-sm">
            <thead className="bg-pitch-900 text-chalk-100">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={[
                      'font-display uppercase text-xs tracking-wide px-3 py-2 cursor-pointer select-none hover:bg-pitch-800',
                      col.align === 'right' ? 'text-right' : 'text-left',
                    ].join(' ')}
                  >
                    {col.label}
                    {sortKey === col.key && <span className="ml-1">{sortDirection === 'asc' ? '\u25b2' : '\u25bc'}</span>}
                  </th>
                ))}
                <th className="font-display uppercase text-xs tracking-wide px-3 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => {
                const attemptIsAccepted = row.latest_attempted_fit_run_id === row.accepted_fit_run_id;
                return (
                  <tr key={row.league_id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-medium">{row.league_code}</span>{' '}
                      <span className="text-ink-500 text-xs">{row.league_name}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.accepted_fit_run_id ? (
                        <>
                          <span className="font-mono text-xs">#{row.accepted_fit_run_id}</span>{' '}
                          {formatDate(row.accepted_fitted_at)}
                        </>
                      ) : (
                        <span className="text-loss-700">No accepted fit</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{row.accepted_matches_used ?? '\u2014'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={row.latest_attempted_status} />
                        {!attemptIsAccepted && (
                          <span className="text-xs text-ink-500 font-mono">
                            #{row.latest_attempted_fit_run_id} &middot; {formatDate(row.latest_attempted_fitted_at)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-700 max-w-md">
                      {row.latest_attempted_status === 'rejected' && row.latest_attempted_rejection_reason && (
                        <p className="text-loss-700">{row.latest_attempted_rejection_reason}</p>
                      )}
                      {row.latest_attempted_validation_warnings && row.latest_attempted_validation_warnings.length > 0 && (
                        <ul className="list-disc list-inside text-amber-700">
                          {row.latest_attempted_validation_warnings.map((w: string, wi: number) => (
                            <li key={wi}>{w}</li>
                          ))}
                        </ul>
                      )}
                      {row.latest_attempted_converged === false && (
                        <p className="text-loss-700">Optimiser did not converge.</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          <DataLoadTable
            title="Results imports"
            description="scripts/import-daily.ts -- completed match results pulled from football-data.co.uk"
            rows={matchImportRuns.map((r) => ({
              key: r.import_run_id,
              when: r.started_at,
              label: r.league_code,
              seen: r.rows_seen,
              changed: r.rows_upserted,
              status: r.status,
              error: r.error_message,
            }))}
          />
          <DataLoadTable
            title="Fixtures sync"
            description="Scheduled fixtures refresh -- separate job from the results import above"
            rows={fixtureRefreshRuns.map((r) => ({
              key: r.refresh_run_id,
              when: r.started_at,
              label: r.competitions?.join(', ') ?? '\u2014',
              seen: r.rows_seen,
              changed: r.rows_updated,
              status: r.status,
              error: r.error_message,
            }))}
          />
        </div>
      )}
    </div>
  );
}
