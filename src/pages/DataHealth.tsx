import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  getFitRunValidationChecks,
  getLeagueFitStatus,
  getRecentFixtureRefreshRuns,
  getRecentFplIngestionRuns,
  getRecentMatchImportRuns,
  getRecentPipelineRuns,
  getPublicReadAudit,
  type FixtureRefreshRun,
  type FplIngestionRun,
  type LeagueFitStatus,
  type MatchImportRun,
  type PipelineRun,
  type PublicReadAuditRow,
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

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Renders one fit's validation_checks jsonb -- shape varies per check (some are just {pass}, others carry bounds/ranges/notes), so this stays generic rather than assuming a fixed schema. */
function ValidationChecksDetail({ checks }: { checks: Record<string, unknown> }) {
  const entries = Object.entries(checks).filter(([k]) => k !== 'note' && k !== 'retroactive_review');
  if (entries.length === 0) {
    return <p className="text-xs text-ink-500">{(checks.note as string) ?? 'No structured check detail recorded for this fit.'}</p>;
  }
  return (
    <div className="space-y-1.5">
      {checks.note !== undefined && <p className="text-xs text-ink-500 italic">{checks.note as string}</p>}
      {entries.map(([key, value]) => {
        if (typeof value !== 'object' || value === null) {
          return (
            <div key={key} className="flex items-start gap-2 text-xs">
              <span className="font-medium text-ink-700 min-w-[14rem]">{humanizeKey(key)}</span>
              <span className="text-ink-500 font-mono">{String(value)}</span>
            </div>
          );
        }
        const v = value as Record<string, unknown>;
        const pass = v.pass;
        const rest = Object.entries(v).filter(([k]) => k !== 'pass');
        return (
          <div key={key} className="flex items-start gap-2 text-xs">
            <span className="font-medium text-ink-700 min-w-[14rem]">{humanizeKey(key)}</span>
            {typeof pass === 'boolean' && (
              <span className={pass ? 'text-pitch-800 font-medium' : 'text-loss-700 font-medium'}>
                {pass ? '\u2713 pass' : '\u2717 fail'}
              </span>
            )}
            {rest.length > 0 && (
              <span className="text-ink-500 font-mono">
                {rest.map(([k, v2]) => `${k}=${Array.isArray(v2) ? `[${v2.join(', ')}]` : String(v2)}`).join('  ')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = {
    accepted: 'bg-pitch-800 text-chalk-100',
    success: 'bg-pitch-800 text-chalk-100',
    rejected: 'bg-loss-700 text-chalk-100',
    failed: 'bg-loss-700 text-chalk-100',
    pending: 'bg-amber-500 text-ink-900',
    running: 'bg-amber-500 text-ink-900',
    warning: 'bg-amber-500 text-ink-900',
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

/** Second table style for runs whose useful detail is a single free-text
 * summary (a matchweek range, a player count) rather than two fixed
 * numeric columns -- pipeline_runs and fpl_ingestion_runs both have
 * genuinely different natural metrics per job, so forcing them into
 * DataLoadTable's Seen/Changed shape would mean losing information or
 * showing misleading blanks. One flexible "Detail" column instead,
 * built by the caller into whatever string makes sense for that job. */
function RunLogTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: { key: string | number; when: string | null; label: string; detail: string | null; status: string; error: string | null }[];
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
              <th className="text-left font-medium text-xs px-3 py-1.5">Job</th>
              <th className="text-left font-medium text-xs px-3 py-1.5">Detail</th>
              <th className="text-left font-medium text-xs px-3 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-3 text-center text-ink-500 text-xs">
                  No runs recorded yet.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.key} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                <td className="px-3 py-1.5 whitespace-nowrap font-mono text-xs">{formatDate(r.when)}</td>
                <td className="px-3 py-1.5 text-xs">{r.label}</td>
                <td className="px-3 py-1.5 text-xs text-ink-700">{r.detail ?? '\u2014'}</td>
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
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
  const [fplIngestionRuns, setFplIngestionRuns] = useState<FplIngestionRun[]>([]);
  const [readAudit, setReadAudit] = useState<PublicReadAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('league_code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedFitRunId, setExpandedFitRunId] = useState<number | null>(null);
  const [checksByFitRun, setChecksByFitRun] = useState<Record<number, Record<string, unknown> | 'loading' | 'error'>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [fitStatus, imports, refreshes, pipelines, fplIngestion, audit] = await Promise.all([
          getLeagueFitStatus(),
          getRecentMatchImportRuns(),
          getRecentFixtureRefreshRuns(),
          getRecentPipelineRuns(),
          getRecentFplIngestionRuns(),
          getPublicReadAudit(),
        ]);
        if (cancelled) return;
        setRows(fitStatus);
        setMatchImportRuns(imports);
        setFixtureRefreshRuns(refreshes);
        setPipelineRuns(pipelines);
        setFplIngestionRuns(fplIngestion);
        setReadAudit(audit);
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

  function toggleExpand(fitRunId: number | null) {
    if (fitRunId === null) return;
    if (expandedFitRunId === fitRunId) {
      setExpandedFitRunId(null);
      return;
    }
    setExpandedFitRunId(fitRunId);
    if (!(fitRunId in checksByFitRun)) {
      setChecksByFitRun((prev) => ({ ...prev, [fitRunId]: 'loading' }));
      getFitRunValidationChecks(fitRunId)
        .then((checks) => {
          setChecksByFitRun((prev) => ({ ...prev, [fitRunId]: checks ?? {} }));
        })
        .catch(() => {
          setChecksByFitRun((prev) => ({ ...prev, [fitRunId]: 'error' }));
        });
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
          Every scheduled job's most recent runs -- results imports, fixtures sync, model fits, and the Fantasy
          projections pipeline -- so it's clear at a glance whether things have actually run, not just that they're
          scheduled to. Click a column header to sort the fit status table.
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
                <th className="font-display uppercase text-xs tracking-wide px-3 py-2 text-left">Details</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => {
                const attemptIsAccepted = row.latest_attempted_fit_run_id === row.accepted_fit_run_id;
                const fitRunId = row.latest_attempted_fit_run_id;
                const isExpanded = fitRunId !== null && expandedFitRunId === fitRunId;
                const checksState = fitRunId !== null ? checksByFitRun[fitRunId] : undefined;
                return (
                  <Fragment key={row.league_id}>
                    <tr className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
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
                      <td className="px-3 py-2">
                        {fitRunId !== null && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(fitRunId)}
                            className="text-xs font-medium text-pitch-800 hover:underline whitespace-nowrap"
                          >
                            {isExpanded ? 'Hide checks \u25b2' : 'Show checks \u25bc'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-chalk-100">
                        <td colSpan={6} className="px-3 py-3">
                          {checksState === 'loading' && <p className="text-xs text-ink-500">Loading checks&hellip;</p>}
                          {checksState === 'error' && <p className="text-xs text-loss-700">Failed to load validation checks.</p>}
                          {checksState && checksState !== 'loading' && checksState !== 'error' && (
                            <ValidationChecksDetail checks={checksState} />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && (() => {
        // Only the genuinely suspicious case is worth showing by default:
        // a SELECT grant with no policy means someone INTENDED this
        // readable and the policy was forgotten. Tables with neither are
        // almost always deliberately internal.
        const suspicious = readAudit.filter((r) => !r.anon_can_read && r.anon_has_select_grant);
        const unreadable = readAudit.filter((r) => !r.anon_can_read);
        return (
          <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-chalk-300">
              <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">Public read access</h2>
              <p className="text-xs text-ink-500">
                Tables the site can&rsquo;t read. This failure is silent &mdash; an empty result, not an error &mdash; so
                it only ever showed up as a blank page. {unreadable.length} of {readAudit.length} tables are unreadable,
                most of them deliberately.
              </p>
            </div>
            <div className="px-3 py-2">
              {suspicious.length === 0 ? (
                <p className="text-xs text-ink-700">
                  No table has a public SELECT grant without a matching policy &mdash; the combination that means one was
                  intended to be readable and the policy was missed.
                </p>
              ) : (
                <>
                  <p className="text-xs text-loss-700 mb-1">
                    {suspicious.length} table(s) granted to the public but blocked by a missing policy &mdash; almost
                    certainly unintended:
                  </p>
                  <ul className="text-xs font-mono text-ink-900 space-y-0.5">
                    {suspicious.map((r) => (
                      <li key={r.table_name}>{r.table_name}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        );
      })()}

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
          <RunLogTable
            title="Fantasy updates"
            description="Twice-daily FPL projections pipeline (refresh, bonus simulation, final table) -- the log that answers 'has this run today'"
            rows={pipelineRuns.map((r) => ({
              key: r.run_id,
              when: r.started_at,
              label: r.job_name,
              detail: r.summary,
              status: r.status,
              error: r.error_message,
            }))}
          />
          <RunLogTable
            title="Fantasy raw data"
            description="private.refresh_fpl() -- official FPL API sync (players, teams, gameweeks, fixtures), every 6 hours"
            rows={fplIngestionRuns.map((r) => ({
              key: r.run_id,
              when: r.started_at,
              label: 'refresh_fpl',
              detail:
                r.status === 'success'
                  ? [
                      r.players_upserted != null ? `${r.players_upserted} players` : null,
                      r.teams_upserted != null ? `${r.teams_upserted} teams` : null,
                      r.fixtures_upserted != null ? `${r.fixtures_upserted} fixtures` : null,
                    ]
                      .filter(Boolean)
                      .join(', ') || null
                  : null,
              status: r.status,
              error: r.error_message,
            }))}
          />
        </div>
      )}
    </div>
  );
}
