// ============================================================================
// src/components/nfl/StandingsTables.tsx
//
// One season's NFL standings, laid out as NFL.com does: by division, by
// conference (the play-off picture: seeds 1-7 with the cut line), or the whole
// league as one sortable table. With the season's games the order follows the
// NFL's official tie-breaking procedure and the tables add the conference and
// non-conference records, streak and last five (nflTiebreak.ts, checked
// against every real play-off field since 2002). Without games it falls back
// to the standings view's simpler order.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONFERENCES, DIVISIONS, divisionRows, nflTeamPath, pctLabel, type NflGame, type NflStanding } from '../../lib/nflApi';
import { buildStandingsMath, recLabel, type StandingsMath, type TeamExtras } from '../../lib/nflTiebreak';

type SortKey = 'team_name' | 'won' | 'lost' | 'win_pct' | 'points_for' | 'points_against' | 'point_diff';
type View = 'division' | 'conference' | 'league';

const num = 'px-2 py-1.5 text-right font-mono text-xs tabular-nums';
const th = 'text-right font-medium text-xs px-2 py-2';

function split(w: number, l: number, t = 0): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function LastFive({ x }: { x: TeamExtras['last5'] }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Last ${x.length}: ${x.join(' ')}`}>
      {x.map((r, i) => (
        <span key={i} className={`inline-block w-3.5 text-center text-[10px] leading-4 rounded-sm font-mono ${r === 'W' ? 'bg-pitch-800 text-chalk-100' : r === 'L' ? 'bg-loss-600 text-chalk-100' : 'bg-chalk-300 text-ink-700'}`}>
          {r}
        </span>
      ))}
    </span>
  );
}

function Cells({ r, x, showPlayoffs }: { r: NflStanding; x: TeamExtras | undefined; showPlayoffs: boolean }) {
  return (
    <>
      <td className={num}>{r.won}</td>
      <td className={num}>{r.lost}</td>
      <td className={`${num} hidden sm:table-cell`}>{r.tied}</td>
      <td className={`${num} font-semibold`}>{pctLabel(r.win_pct)}</td>
      <td className={`${num} hidden sm:table-cell`}>{r.points_for}</td>
      <td className={`${num} hidden sm:table-cell`}>{r.points_against}</td>
      <td className={num}>{r.point_diff > 0 ? `+${r.point_diff}` : r.point_diff}</td>
      <td className={`${num} hidden md:table-cell`}>{split(r.home_won, r.home_lost)}</td>
      <td className={`${num} hidden md:table-cell`}>{split(r.away_won, r.away_lost)}</td>
      <td className={`${num} hidden md:table-cell`}>{split(r.div_won, r.div_lost, r.div_tied)}</td>
      <td className={`${num} hidden md:table-cell`}>{x ? recLabel(x.conf) : split(r.conf_won, r.conf_lost)}</td>
      {x && <td className={`${num} hidden lg:table-cell`}>{recLabel(x.nonConf)}</td>}
      {x && <td className={`${num} hidden sm:table-cell`}>{x.streak || '–'}</td>}
      {x && <td className="px-2 py-1.5 text-right hidden lg:table-cell"><LastFive x={x.last5} /></td>}
      {showPlayoffs && <td className="px-2 py-1.5 text-xs text-ink-700 hidden sm:table-cell">{r.playoff_result ?? ''}</td>}
    </>
  );
}

function HeadCells({ extras, showPlayoffs }: { extras: boolean; showPlayoffs: boolean }) {
  return (
    <>
      <th scope="col" className={th}>W</th>
      <th scope="col" className={th}>L</th>
      <th scope="col" className={`${th} hidden sm:table-cell`}>T</th>
      <th scope="col" className={th}>Pct</th>
      <th scope="col" className={`${th} hidden sm:table-cell`}>PF</th>
      <th scope="col" className={`${th} hidden sm:table-cell`}>PA</th>
      <th scope="col" className={th}>Diff</th>
      <th scope="col" className={`${th} hidden md:table-cell`}>Home</th>
      <th scope="col" className={`${th} hidden md:table-cell`}>Away</th>
      <th scope="col" className={`${th} hidden md:table-cell`}>Div</th>
      <th scope="col" className={`${th} hidden md:table-cell`}>Conf</th>
      {extras && <th scope="col" className={`${th} hidden lg:table-cell`}>Non-Conf</th>}
      {extras && <th scope="col" className={`${th} hidden sm:table-cell`}>Strk</th>}
      {extras && <th scope="col" className={`${th} hidden lg:table-cell`}>Last 5</th>}
      {showPlayoffs && <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Play-offs</th>}
    </>
  );
}

function ConferenceTable({ conf, rows, math }: { conf: string; rows: NflStanding[]; math: StandingsMath }) {
  const by = new Map(rows.map((r) => [r.franchise, r]));
  const seeded = math.conference.get(conf) ?? [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden" data-testid={`nfl-conference-${conf}`}>
        <caption className="text-left text-xs font-mono uppercase tracking-widest text-ink-500 pb-1">{conf}</caption>
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            <th scope="col" className="text-right font-medium text-xs px-2 py-2">Seed</th>
            <th scope="col" className="text-left font-medium text-xs px-2 py-2">Team</th>
            <th scope="col" className={th}>W</th>
            <th scope="col" className={th}>L</th>
            <th scope="col" className={`${th} hidden sm:table-cell`}>T</th>
            <th scope="col" className={th}>Pct</th>
            <th scope="col" className={`${th} hidden md:table-cell`}>Div</th>
            <th scope="col" className={`${th} hidden sm:table-cell`}>Conf</th>
            <th scope="col" className={`${th} hidden lg:table-cell`} title="Strength of victory: the combined win % of the teams beaten">SoV</th>
            <th scope="col" className={`${th} hidden lg:table-cell`} title="Strength of schedule: the combined win % of every opponent played">SoS</th>
            <th scope="col" className={`${th} hidden sm:table-cell`}>Strk</th>
            <th scope="col" className={`${th} hidden md:table-cell`}>Last 5</th>
          </tr>
        </thead>
        <tbody>
          {seeded.map((s, i) => {
            const r = by.get(s.franchise)!;
            const x = math.extras.get(s.franchise)!;
            const cut = i === math.playoffSpots;
            return (
              <tr key={s.franchise} className={`${cut ? 'border-t-2 border-ink-500' : ''} ${s.seed == null ? 'text-ink-700' : ''} ${i % 2 ? 'bg-chalk-100/60' : ''}`} data-testid="nfl-seed-row">
                <td className={`${num} font-semibold`}>{s.seed ?? ''}</td>
                <th scope="row" className="text-left px-2 py-1.5 font-normal">
                  <Link to={nflTeamPath(r.slug)} className="hover:underline">{r.team_name}</Link>
                  <span className="text-xs text-ink-500">{` ${r.division}${s.divisionWinner ? ' winner' : ''}`}</span>
                  {s.decidedBy && <span className="block text-[11px] text-ink-500" data-testid="nfl-tiebreak">{`Ahead on ${s.decidedBy}`}</span>}
                </th>
                <td className={num}>{r.won}</td>
                <td className={num}>{r.lost}</td>
                <td className={`${num} hidden sm:table-cell`}>{r.tied}</td>
                <td className={`${num} font-semibold`}>{pctLabel(r.win_pct)}</td>
                <td className={`${num} hidden md:table-cell`}>{split(r.div_won, r.div_lost, r.div_tied)}</td>
                <td className={`${num} hidden sm:table-cell`}>{recLabel(x.conf)}</td>
                <td className={`${num} hidden lg:table-cell`}>{pctLabel(x.sov)}</td>
                <td className={`${num} hidden lg:table-cell`}>{pctLabel(x.sos)}</td>
                <td className={`${num} hidden sm:table-cell`}>{x.streak || '–'}</td>
                <td className="px-2 py-1.5 text-right hidden md:table-cell"><LastFive x={x.last5} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StandingsTables({ rows, games }: { rows: NflStanding[]; games?: NflGame[] }) {
  const math = useMemo(() => (games && games.length ? buildStandingsMath(rows, games) : null), [rows, games]);
  const [view, setView] = useState<View>('division');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'win_pct', desc: true });
  const showPlayoffs = rows.some((r) => r.season_complete);
  const sorted = [...rows].sort((a, b) => {
    const v = sort.key === 'team_name' ? a.team_name.localeCompare(b.team_name) : ((a[sort.key] as number) ?? 0) - ((b[sort.key] as number) ?? 0);
    return (sort.desc ? -v : v) || b.point_diff - a.point_diff;
  });
  const sortHeader = (k: SortKey, label: string, cls = 'text-right') => (
    <th scope="col" className={`${cls} font-medium text-xs px-2 py-2`} aria-sort={sort.key === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="hover:underline" onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : k !== 'team_name' && k !== 'lost' && k !== 'points_against' }))}>
        {label}
      </button>
    </th>
  );
  const divisionList = (c: string, d: string): NflStanding[] => {
    const order = math?.divisionOrder.get(`${c} ${d}`);
    if (!order) return divisionRows(rows, c, d);
    const by = new Map(rows.map((r) => [r.franchise, r]));
    return order.map((f) => by.get(f)!).filter(Boolean);
  };
  const views: View[] = math ? ['division', 'conference', 'league'] : ['division', 'league'];
  const label: Record<View, string> = { division: 'By division', conference: 'By conference', league: 'Whole league' };

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Table view" className="inline-flex border border-chalk-300 rounded overflow-hidden text-sm">
        {views.map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`px-3 py-1 ${view === v ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
            {label[v]}
          </button>
        ))}
      </div>

      {view === 'division' && (
        <div className="space-y-8">
          {CONFERENCES.map((c) => (
            <section key={c} aria-labelledby={`conf-${c}`} className="space-y-4">
              <h2 id={`conf-${c}`} className="font-display uppercase tracking-wide text-lg text-ink-900">{c}</h2>
              {DIVISIONS.map((d) => (
                <div key={d} className="overflow-x-auto">
                  <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                    <caption className="text-left text-xs font-mono uppercase tracking-widest text-ink-500 pb-1">{`${c} ${d}`}</caption>
                    <thead className="bg-chalk-200 text-ink-500">
                      <tr>
                        <th scope="col" className="text-left font-medium text-xs px-2 py-2">Team</th>
                        <HeadCells extras={!!math} showPlayoffs={showPlayoffs} />
                      </tr>
                    </thead>
                    <tbody>
                      {divisionList(c, d).map((r, i) => (
                        <tr key={r.franchise} className={r.playoff_result === 'Won Super Bowl' ? 'bg-amber-100/60' : i % 2 ? 'bg-chalk-100/60' : undefined} data-testid="nfl-division-row">
                          <th scope="row" className="text-left px-2 py-1.5 font-normal">
                            <Link to={nflTeamPath(r.slug)} className="hover:underline">{r.team_name}</Link>
                            {r.playoff_result && <span className="sm:hidden text-xs text-ink-500">{` · ${r.playoff_result}`}</span>}
                          </th>
                          <Cells r={r} x={math?.extras.get(r.franchise)} showPlayoffs={showPlayoffs} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {view === 'conference' && math && (
        <div className="space-y-8">
          <p className="text-sm text-ink-700 max-w-prose">
            {`The play-off picture if the season ended today: ${math.playoffSpots} teams from each conference go through. Division winners are seeds 1–4 whatever their record; the next ${math.playoffSpots - 4} are wild cards.${math.playoffSpots === 7 ? ' Seed 1 has a bye through the first round.' : ' Seeds 1 and 2 have a bye through the first round.'} The line marks the cut.`}
          </p>
          {CONFERENCES.map((c) => <ConferenceTable key={c} conf={c} rows={rows} math={math} />)}
        </div>
      )}

      {view === 'league' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                {sortHeader('team_name', 'Team', 'text-left')}
                <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Division</th>
                {sortHeader('won', 'W')}
                {sortHeader('lost', 'L')}
                {sortHeader('win_pct', 'Pct')}
                {sortHeader('points_for', 'PF', 'text-right hidden sm:table-cell')}
                {sortHeader('points_against', 'PA', 'text-right hidden sm:table-cell')}
                {sortHeader('point_diff', 'Diff')}
                {math && <th scope="col" className={`${th} hidden sm:table-cell`}>Strk</th>}
                {math && <th scope="col" className={`${th} hidden md:table-cell`}>Last 5</th>}
                {showPlayoffs && <th scope="col" className="text-left font-medium text-xs px-2 py-2 hidden sm:table-cell">Play-offs</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const x = math?.extras.get(r.franchise);
                return (
                  <tr key={r.franchise} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                    <th scope="row" className="text-left px-2 py-1.5 font-normal">
                      <Link to={nflTeamPath(r.slug)} className="hover:underline">{r.team_name}</Link>
                    </th>
                    <td className="px-2 py-1.5 text-xs text-ink-700 hidden sm:table-cell">{`${r.conference} ${r.division}`}</td>
                    <td className={num}>{r.won}</td>
                    <td className={num}>{r.lost}</td>
                    <td className={`${num} font-semibold`}>{pctLabel(r.win_pct)}</td>
                    <td className={`${num} hidden sm:table-cell`}>{r.points_for}</td>
                    <td className={`${num} hidden sm:table-cell`}>{r.points_against}</td>
                    <td className={num}>{r.point_diff > 0 ? `+${r.point_diff}` : r.point_diff}</td>
                    {math && <td className={`${num} hidden sm:table-cell`}>{x?.streak || '–'}</td>}
                    {math && <td className="px-2 py-1.5 text-right hidden md:table-cell">{x && <LastFive x={x.last5} />}</td>}
                    {showPlayoffs && <td className="px-2 py-1.5 text-xs text-ink-700 hidden sm:table-cell">{r.playoff_result ?? ''}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink-500 max-w-prose" data-testid="nfl-table-notes">
        Regular season only. Pct counts a tie as half a win. Div, Conf, Non-Conf: records against division, conference and other-conference opponents. Strk: current run of wins (W), losses (L) or ties (T). Last 5: oldest to newest.
        {math
          ? ' Teams level on Pct are ordered by the NFL’s tie-breaking procedure: head-to-head, then division record (within a division) or conference record (between divisions), common opponents, strength of victory (SoV) and strength of schedule (SoS). The rarely used points-ranking steps are not modelled. Checked against every play-off field since 2002: the same teams, division winners and seeds every season.'
          : ' Teams level on Pct are ordered by division record, then points difference, which can differ from the official standings.'}{' '}
        Data: nflverse.
      </p>
    </div>
  );
}
