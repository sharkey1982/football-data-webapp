// ============================================================================
// src/pages/international/IntlEditionPage.tsx
//
// /international/tournaments/:competition/:label -- one edition of a major
// tournament: the champions, a knockout bracket, the final, every group table (with who went through, taken
// from who played in a later round, so it is right whatever the tie-breakers),
// every knockout round, the top scorers and the upsets. A Nations League still
// in its league phase shows each group's teams and fixtures.
// ============================================================================

import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FixtureRow, GameList, GameRow, IntlHeader, Section, TeamLink } from '../../components/intl/IntlBits';
import Bracket from '../../components/intl/Bracket';
import GroupChances from '../../components/intl/GroupChances';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { INTL_TOURNAMENTS_PATH, editionPathOf, intlEditionPath, intlTournamentPath, loadIntlEdition, type IntlEditionData } from '../../lib/intlApi';
import { DATA_NOTE, bracketRounds, editionLabel, groupTable, isReported, isUpset, pointsForWin, reportedAsMatch, scoreText, shortDate, teamsAfter, tournamentBySlug, type IntlStage, type TableRow } from '../../lib/intlStats';

function GroupTable({ label, rows, testId }: { label: string; rows: TableRow[]; testId?: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium text-ink-900">{label}</h3>
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden bg-white" data-testid={testId}>
        <thead className="bg-chalk-200 text-ink-500 text-xs">
          <tr>
            <th className="text-left font-medium px-2 py-1">Team</th>
            {['P', 'W', 'D', 'L', 'GD', 'Pts'].map((h) => <th key={h} className="text-right font-medium px-2 py-1">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team} className={r.through ? 'bg-chalk-100' : undefined}>
              <td className="px-2 py-1">
                <TeamLink slug={r.slug} name={r.name} bold={r.through} />
                {r.through && <span className="ml-1.5 text-[10px] font-mono uppercase text-pitch-700">through</span>}
              </td>
              {[r.p, r.w, r.d, r.l, r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga, r.pts].map((v, i) => (
                <td key={i} className="text-right px-2 py-1 font-mono text-xs tabular-nums">{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoundRobin({ data, stage }: { data: IntlEditionData; stage: IntlStage }) {
  // Results the fixture feed reports but the results file hasn't confirmed yet
  // count in a provisional table (league phase only: the feed has groups).
  const reported = stage.code === 'LP' ? data.fixtures.filter(isReported).map(reportedAsMatch) : [];
  const games = [...data.matches.filter((m) => m.stage_code === stage.code), ...reported];
  const advanced = teamsAfter(data.matches, data.stages, stage.stage_order);
  const listed = data.groups.filter((g) => g.stage_code === stage.code);
  const labels = [...new Set([...listed.map((g) => g.label), ...games.map((m) => m.group_label ?? '')])].filter((l) => l !== '').sort();
  if (labels.length === 0 && games.length) labels.push('');
  const isLeague = stage.code === 'LP';
  const leagues = isLeague ? [...new Set(labels.map((l) => l[0]))] : [''];
  const unplayed = data.fixtures.filter((f) => !f.match_key && !isReported(f));
  const odds = isLeague ? data.groupOdds : [];
  return (
    <Section title={stage.name} id={`intl-ed-${stage.code}`} testId={`intl-ed-${stage.code}`}>
      {leagues.map((lg) => (
        <div key={lg} className="space-y-3">
          {isLeague && <h3 className="font-display uppercase tracking-wide text-ink-900">{`League ${lg}`}</h3>}
          <div className="grid gap-4 md:grid-cols-2">
            {labels
              .filter((l) => !isLeague || l[0] === lg)
              .map((label) => {
                const gGames = games.filter((m) => (m.group_label ?? '') === label);
                const members = listed.find((g) => g.label === label)?.teams ?? [];
                const rows = groupTable(gGames, data.edition.edition_key, isLeague ? new Set() : advanced, members);
                const fixtures = unplayed.filter((f) => f.group_label === label);
                const groupReported = reported.filter((m) => m.group_label === label);
                return (
                  <div key={label || 'all'} className="space-y-2 min-w-0">
                    <GroupTable label={label ? `Group ${label}` : stage.name} rows={rows} testId="intl-group-table" />
                    {isLeague && odds.some((o) => o.group_label === label) && (
                      <details className="text-sm" open={fixtures.length > 0}>
                        <summary className="cursor-pointer text-pitch-800">Chances: where each team finishes</summary>
                        <GroupChances odds={odds.filter((o) => o.group_label === label)} testId="intl-group-chances" />
                      </details>
                    )}
                    {groupReported.length + fixtures.length > 0 && (
                      <GameList>
                        {groupReported.map((m) => <GameRow key={m.match_key} m={m} showDate />)}
                        {fixtures.map((f) => <FixtureRow key={f.fixture_key} f={f} showDate />)}
                      </GameList>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
      <p className="text-xs text-ink-500">
        {reported.length > 0 && `Provisional: includes ${reported.length} result${reported.length === 1 ? '' : 's'} reported by the fixture feed and not yet confirmed by the results file. `}
        {odds.length > 0 && `Chances: the rest of the league phase played out 10,000 times with each game’s win/draw/loss and score probabilities from FixtureShark’s model (IP1, built on Elo ratings); ties split by goal difference and goals scored, not head-to-head. `}
        {`${pointsForWin(data.edition.edition_key)} points for a win. Ordered by points, goal difference, then goals scored; the official tie-breakers vary by tournament, so “through” is taken from who played in the next round.`}
      </p>
    </Section>
  );
}

function Knockout({ data, stage }: { data: IntlEditionData; stage: IntlStage }) {
  const games = data.matches.filter((m) => m.stage_code === stage.code);
  if (!games.length) return null;
  return (
    <Section title={stage.code === 'ALL' ? 'Every game' : stage.name} id={`intl-ed-${stage.code}`} testId={`intl-ed-${stage.code}`}>
      {stage.code === 'ALL' && <p className="text-xs text-ink-500">This edition’s format (two-legged ties and play-offs) can’t be worked out from the results alone, so its games are listed in date order.</p>}
      {stage.code === 'PO' && <p className="text-xs text-ink-500">Played to separate teams level at the top of the final round.</p>}
      <GameList>{games.map((m) => <GameRow key={m.match_key} m={m} showDate />)}</GameList>
    </Section>
  );
}

export default function IntlEditionPage() {
  const { competition = '', label = '' } = useParams();
  const t = tournamentBySlug(competition);
  const { data, failed, loading } = useKeyedFetch(`${competition}/${label}`, () => loadIntlEdition(competition, label));
  const e = data?.edition;
  const final = useMemo(() => (data && e?.final_key ? data.matches.find((m) => m.match_key === e.final_key) ?? null : null), [data, e]);
  const scorers = useMemo(() => {
    const n = new Map<string, { team: string; goals: number }>();
    for (const g of data?.goals ?? []) {
      if (g.own_goal || !g.scorer) continue;
      const k = `${g.scorer}|${g.team}`;
      n.set(k, { team: g.team, goals: (n.get(k)?.goals ?? 0) + 1 });
    }
    return [...n.entries()].map(([k, v]) => ({ name: k.split('|')[0], ...v })).sort((a, b) => b.goals - a.goals).slice(0, 10);
  }, [data]);
  const upsets = useMemo(() => (data?.matches ?? []).filter(isUpset), [data]);
  const sameComp = data?.editions ?? [];
  const idx = e ? sameComp.findIndex((x) => x.edition_key === e.edition_key) : -1;
  const prev = idx > 0 ? sameComp[idx - 1] : null;
  const next = idx >= 0 && idx < sameComp.length - 1 ? sameComp[idx + 1] : null;
  const name = t && e ? `${t.short} ${editionLabel(e.label)}` : 'Tournament';

  useDocumentHead({
    title: e && t ? `${t.competition} ${editionLabel(e.label)}: results, groups and scorers` : 'International tournament',
    description:
      e && t
        ? e.winner
          ? `${t.competition} ${editionLabel(e.label)}: ${e.winner} beat ${e.runner_up ?? 'the runners-up'}${final ? ` ${scoreText(final)} in the final` : ''}. Every group, knockout round, scorer and upset.`
          : `${t.competition} ${editionLabel(e.label)}: every group, fixture and result.`
        : 'An international tournament: groups, knockouts and scorers.',
    path: intlEditionPath(competition, label),
  });

  if (!t) return <p className="text-ink-700">No such tournament. <Link to={INTL_TOURNAMENTS_PATH} className="underline">See every tournament</Link>.</p>;
  if (failed) return <p className="text-ink-700">This tournament is unavailable right now.</p>;
  if (loading) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (!data || !e) return <p className="text-ink-700">No such edition. <Link to={intlTournamentPath(t.slug)} className="underline">{`See every ${t.short}`}</Link>.</p>;

  const goalsPerGame = e.matches ? (e.goals / e.matches).toFixed(2) : null;
  return (
    <article className="space-y-6">
      <IntlHeader title={name} crumb={{ to: intlTournamentPath(t.slug), label: t.short }}>
        {e.winner && (
          <div className="inline-flex items-center gap-3 rounded-lg border border-amber-500 bg-amber-400/20 px-4 py-2" data-testid="intl-champions">
            <span aria-hidden className="text-2xl">🏆</span>
            <span>
              <span className="block text-[11px] uppercase tracking-widest text-ink-500">Champions</span>
              <span className="font-display uppercase tracking-wide text-xl text-ink-900"><TeamLink slug={e.winner_slug} name={e.winner} /></span>
            </span>
          </div>
        )}
        <p className="text-ink-900 max-w-prose" data-testid="intl-edition-summary">
          {e.winner ? (
            <>
              <TeamLink slug={e.winner_slug} name={e.winner} bold />
              {e.runner_up ? <>{' won, ahead of '}<TeamLink slug={e.runner_up_slug} name={e.runner_up} /></> : ' won'}
              {final ? ` (${scoreText({ ...final, shootout_name: final.shootout_winner })} in the final, ${shortDate(final.match_date)})` : ''}
              {'. '}
            </>
          ) : (
            'Still to be decided. '
          )}
          {e.matches
            ? `${e.teams} teams, ${e.matches} games${goalsPerGame ? `, ${goalsPerGame} goals a game` : ''}${e.hosts.length ? `; hosted by ${e.hosts.join(', ')}` : ''}.`
            : `${e.teams} teams; ${data.fixtures.filter(isReported).length} of ${data.fixtures.length} games played so far.`}
        </p>
        <nav className="flex gap-4 text-sm" aria-label="Other editions">
          {prev && <Link to={editionPathOf(prev)} className="underline">{`← ${editionLabel(prev.label)}`}</Link>}
          {next && <Link to={editionPathOf(next)} className="underline">{`${editionLabel(next.label)} →`}</Link>}
        </nav>
      </IntlHeader>

      {bracketRounds(data.matches).length > 0 && (
        <Section title="The road to the final" id="intl-ed-bracket">
          <Bracket matches={data.matches} />
        </Section>
      )}

      {data.stages.map((s) => (s.type === 'round_robin' ? <RoundRobin key={s.code} data={data} stage={s} /> : <Knockout key={s.code} data={data} stage={s} />))}

      {scorers.length > 0 && (
        <Section title="Top scorers" id="intl-ed-scorers">
          <ol className="text-sm list-decimal list-inside" data-testid="intl-ed-scorers">
            {scorers.map((s) => (
              <li key={`${s.name}|${s.team}`}>{`${s.name} `}<span className="text-ink-500">{s.team}</span>{' '}<span className="font-mono text-xs">{s.goals}</span></li>
            ))}
          </ol>
        </Section>
      )}

      {upsets.length > 0 && (
        <Section title="Upsets" id="intl-ed-upsets">
          <GameList testId="intl-ed-upsets">{upsets.map((m) => <GameRow key={m.match_key} m={m} showDate />)}</GameList>
          <p className="text-xs text-ink-500">Winners whose Elo expectation before the game was under 30%.</p>
        </Section>
      )}

      <p className="text-xs text-ink-500">{DATA_NOTE}</p>
    </article>
  );
}
