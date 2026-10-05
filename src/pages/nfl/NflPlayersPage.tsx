// ============================================================================
// src/pages/nfl/NflPlayersPage.tsx
//
// /nfl/players -- "Player Scout", as in Fantasy: every QB, RB, WR, TE and
// kicker in a season, with fantasy points in PPR, half-PPR or standard
// scoring, points per game, the last three games, and the usage numbers that
// drive points at each position. Sortable; ?season=&pos=&fmt=&team= keep the
// view shareable. The club filter mirrors Fantasy Football's Player Scout (a
// dropdown: 32 teams are too many for buttons). Client-rendered (head tags at build).
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { NFL_HUB_PATH, NFL_PLAYERS_PATH, NFL_SCORING_PATH, nflPlayerPath, nflTeamPath } from '../../lib/nflApi';
import {
  FANTASY_POSITIONS,
  FORMATS,
  fantasyPosition,
  fmt1,
  last3,
  loadPlayerScout,
  ppg,
  pts,
  type NflPlayerSeason,
  type ScoringFormat,
} from '../../lib/nflFantasyApi';

type Col = { key: string; label: string; value: (r: NflPlayerSeason) => number | null; render?: (r: NflPlayerSeason) => string; hideSm?: boolean };

const pct = (x: number | null) => (x == null ? '–' : `${Math.round(Number(x) * 100)}%`);

function statColumns(pos: string): Col[] {
  const n = (k: keyof NflPlayerSeason) => (r: NflPlayerSeason) => Number(r[k] ?? 0);
  switch (pos) {
    case 'QB':
      return [
        { key: 'passing_yards', label: 'Pass yds', value: n('passing_yards') },
        { key: 'passing_tds', label: 'Pass TD', value: n('passing_tds') },
        { key: 'interceptions', label: 'INT', value: n('interceptions'), hideSm: true },
        { key: 'rushing_yards', label: 'Rush yds', value: n('rushing_yards'), hideSm: true },
        { key: 'rushing_tds', label: 'Rush TD', value: n('rushing_tds'), hideSm: true },
      ];
    case 'RB':
      return [
        { key: 'carries', label: 'Carries', value: n('carries') },
        { key: 'rushing_yards', label: 'Rush yds', value: n('rushing_yards') },
        { key: 'rushing_tds', label: 'Rush TD', value: n('rushing_tds'), hideSm: true },
        { key: 'targets', label: 'Tgt', value: n('targets'), hideSm: true },
        { key: 'receptions', label: 'Rec', value: n('receptions'), hideSm: true },
        { key: 'receiving_yards', label: 'Rec yds', value: n('receiving_yards'), hideSm: true },
      ];
    case 'WR':
    case 'TE':
      return [
        { key: 'targets', label: 'Tgt', value: n('targets') },
        { key: 'target_share', label: 'Tgt share', value: (r) => (r.target_share == null ? null : Number(r.target_share)), render: (r) => pct(r.target_share), hideSm: true },
        { key: 'receptions', label: 'Rec', value: n('receptions') },
        { key: 'receiving_yards', label: 'Rec yds', value: n('receiving_yards'), hideSm: true },
        { key: 'receiving_tds', label: 'Rec TD', value: n('receiving_tds'), hideSm: true },
      ];
    case 'K':
      return [
        { key: 'fg_made', label: 'FG', value: n('fg_made') },
        { key: 'fg_att', label: 'FG att', value: n('fg_att') },
        { key: 'pat_made', label: 'PAT', value: n('pat_made'), hideSm: true },
      ];
    default:
      return [
        { key: 'touchdowns', label: 'TD', value: (r) => Number(r.passing_tds) + Number(r.rushing_tds) + Number(r.receiving_tds) },
        { key: 'rushing_yards', label: 'Rush yds', value: n('rushing_yards'), hideSm: true },
        { key: 'receiving_yards', label: 'Rec yds', value: n('receiving_yards'), hideSm: true },
      ];
  }
}

const PAGE = 100;

export default function NflPlayersPage() {
  const [params, setParams] = useSearchParams();
  const seasonParam = params.get('season');
  const season = seasonParam && /^\d{4}$/.test(seasonParam) ? Number(seasonParam) : null;
  const posParam = params.get('pos')?.toUpperCase() ?? 'ALL';
  const pos = (FANTASY_POSITIONS as readonly string[]).includes(posParam) ? posParam : 'ALL';
  const fmtParam = params.get('fmt') as ScoringFormat | null;
  const fmt: ScoringFormat = fmtParam && FORMATS.some((f) => f.key === fmtParam) ? fmtParam : 'ppr';
  const teamParam = params.get('team');
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: 'pts', desc: true });
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  const { data, failed, loading } = useKeyedFetch(String(season ?? 'latest'), () => loadPlayerScout(season));
  const fmtLabel = FORMATS.find((f) => f.key === fmt)!.label;
  const teams = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data?.rows ?? []) if (r.team_slug) m.set(r.team_slug, r.team_short);
    return [...m].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);
  const team = teams.find((t) => t.slug === teamParam) ?? null;

  useDocumentHead({
    title: 'NFL Player Scout: fantasy points and stats for every player',
    description: 'Every NFL quarterback, running back, receiver, tight end and kicker: fantasy points in PPR, half-PPR and standard scoring, per game, recent form and usage.',
    path: NFL_PLAYERS_PATH,
  });

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v == null) p.delete(k);
    else p.set(k, v);
    setParams(p, { replace: true });
    setShown(PAGE);
  };

  const cols: Col[] = useMemo(
    () => [
      { key: 'games', label: 'GP', value: (r) => Number(r.games) },
      { key: 'pts', label: 'Pts', value: (r) => pts(r, fmt), render: (r) => fmt1(pts(r, fmt)) },
      { key: 'ppg', label: 'Per game', value: (r) => ppg(r, fmt), render: (r) => fmt1(ppg(r, fmt)) },
      { key: 'last3', label: 'Last 3', value: (r) => last3(r, fmt), render: (r) => fmt1(last3(r, fmt)), hideSm: true },
      ...statColumns(pos),
    ],
    [fmt, pos]
  );

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered = data.rows.filter((r) => (pos === 'ALL' || fantasyPosition(r.position) === pos) && (!team || r.team_slug === team.slug) && (!q || r.player_name.toLowerCase().includes(q)));
    const col = cols.find((c) => c.key === sort.key) ?? cols[1];
    return [...filtered].sort((a, b) => {
      const v = (col.value(a) ?? -Infinity) - (col.value(b) ?? -Infinity);
      return (sort.desc ? -v : v) || pts(b, fmt) - pts(a, fmt);
    });
  }, [data, pos, team, query, cols, sort, fmt]);

  const th = (c: Col) => (
    <th key={c.key} scope="col" className={`text-right font-medium text-xs px-2 py-2 ${c.hideSm ? 'hidden sm:table-cell' : ''}`} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="hover:underline" onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}>
        {c.label}
        {sort.key === c.key && <span aria-hidden="true">{sort.desc ? ' \u2193' : ' \u2191'}</span>}
      </button>
    </th>
  );

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/fantasy" className="hover:underline">Fantasy</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Player Scout</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Every fantasy-relevant player&rsquo;s season: points, points per game, the last three games and the usage behind them. Regular season only.{' '}
          <Link to={NFL_SCORING_PATH} className="text-pitch-800 underline underline-offset-2">How points are scored</Link>.
        </p>
      </header>

      {failed && <p className="text-ink-700">Player stats are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Season</span>
              <select className="border border-chalk-300 rounded px-2 py-1 bg-white" value={data.season} onChange={(e) => set('season', e.target.value)}>
                {[...data.seasons].reverse().map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Club</span>
              <select className="border border-chalk-300 rounded px-2 py-1 bg-white" value={team?.slug ?? ''} onChange={(e) => set('team', e.target.value || null)} data-testid="nfl-scout-club">
                <option value="">All clubs</option>
                {teams.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </select>
            </label>
            <div role="group" aria-label="Position" className="inline-flex border border-chalk-300 rounded overflow-hidden">
              {['ALL', ...FANTASY_POSITIONS].map((p) => (
                <button key={p} type="button" aria-pressed={pos === p} onClick={() => set('pos', p === 'ALL' ? null : p)} className={`px-2.5 py-1 ${pos === p ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
                  {p === 'ALL' ? 'All' : p}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Scoring" className="inline-flex border border-chalk-300 rounded overflow-hidden">
              {FORMATS.map((f) => (
                <button key={f.key} type="button" aria-pressed={fmt === f.key} onClick={() => set('fmt', f.key === 'ppr' ? null : f.key)} className={`px-2.5 py-1 ${fmt === f.key ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Find a player</span>
              <input className="border border-chalk-300 rounded px-2 py-1 bg-white w-40" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Name" />
            </label>
          </div>

          <p className="text-sm text-ink-700" data-testid="nfl-scout-summary">
            {rows.length > 0
              ? `${rows.length} ${team ? `${team.name} ` : ''}players, ${data.season} regular season, ${fmtLabel} scoring. Top: ${rows[0].player_name} (${rows[0].team_short}), ${fmt1(pts(rows[0], fmt))} points in ${rows[0].games} games.`
              : 'No players match.'}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
              <thead className="bg-chalk-200 text-ink-500">
                <tr>
                  <th scope="col" className="text-right font-medium text-xs px-2 py-2">#</th>
                  <th scope="col" className="text-left font-medium text-xs px-2 py-2">Player</th>
                  <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Team</th>
                  {cols.map(th)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map((r, i) => (
                  <tr key={r.player_id} className={i % 2 ? 'bg-chalk-100/60' : undefined} data-testid="nfl-scout-row">
                    <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{i + 1}</td>
                    <th scope="row" className="text-left px-2 py-1.5 font-normal">
                      <Link to={nflPlayerPath(r.player_slug)} className="hover:underline">{r.player_name}</Link>
                      <span className="text-xs text-ink-500">{` ${fantasyPosition(r.position)}`}</span>
                      <span className="sm:hidden text-xs text-ink-500">{` · ${r.team_short}`}</span>
                    </th>
                    <td className="px-2 py-1.5 text-xs hidden sm:table-cell">
                      <Link to={nflTeamPath(r.team_slug)} className="hover:underline">{r.team_short}</Link>
                    </td>
                    {cols.map((c) => (
                      <td key={c.key} className={`px-2 py-1.5 text-right font-mono text-xs tabular-nums ${c.key === 'ppg' ? 'font-semibold' : ''} ${c.hideSm ? 'hidden sm:table-cell' : ''}`}>
                        {c.render ? c.render(r) : (c.value(r) ?? '–')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > shown && (
            <button type="button" className="text-sm text-pitch-800 underline underline-offset-2" onClick={() => setShown((n) => n + PAGE)}>
              {`Show ${Math.min(PAGE, rows.length - shown)} more`}
            </button>
          )}
          <p className="text-xs text-ink-500 max-w-prose">
            Last 3: points per game over the player&rsquo;s three most recent games. Tgt share: the average share of the team&rsquo;s targets. Team: the team of the player&rsquo;s latest game. Data: nflverse, updated daily.
          </p>
        </>
      )}
    </article>
  );
}
