// ============================================================================
// src/pages/international/IntlMatchPage.tsx
//
// /international/matches/:slug -- one international, coming or played
// (Chris, 6 Oct 2026: fixtures had no preview, prediction or head-to-head).
// The same layout as the club and NFL match pages: header, result (when
// played), then the shared PreviewTabs --
//   Prediction    form (shared ComparisonCard) with model IP1's win/draw/win,
//                 expected goals, likeliest scores, the two Elo ratings and,
//                 in the Nations League, the group's chances;
//   Head to Head  the all-time record and every meeting;
//   each team     rating, recent results and the current squad in brief.
// For a played game the prediction is what the model expected beforehand
// (Elo ratings before kick-off); for a coming one, today's ratings.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PreviewTabs from '../../components/PreviewTabs';
import { ComparisonCard, type FormEntry } from '../../components/ComparisonCard';
import GroupChances from '../../components/intl/GroupChances';
import { GameList, GameRow, IntlHeader, Section, TeamLink, UpsetBadge } from '../../components/intl/IntlBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { INTL_FIXTURES_PATH, editionPathOf, intlTeamPath, loadIntlMatch, type IntlMatchData } from '../../lib/intlApi';
import { INTL_MATCHES_PATH, ip1Grid, kindOfEdition, summariseGrid, type GridSummary } from '../../lib/intlMatch';
import { ageOn, editionLabel, isReported, outcomeFor, pct, scoreText, shortDate, tournamentByCompetition, ukDateTime, type IntlMatch, type SquadPlayer, type TeamSummary, sideTitle } from '../../lib/intlStats';
import type { PreviewTabId } from '../../lib/previewTabs';

const sectionHeading = 'font-display uppercase tracking-wide text-lg text-ink-900';

function formEntries(team: string, games: IntlMatch[]): FormEntry[] {
  // ComparisonCard reads oldest to newest, left to right.
  return games.slice(0, 5).reverse().map((m) => {
    const home = m.home_team === team;
    const opp = home ? m.away_name : m.home_name;
    const r = outcomeFor(team, m);
    return { result: r, detail: `${r} ${home ? m.home_score : m.away_score}–${home ? m.away_score : m.home_score} v ${opp} (${home ? (m.neutral ? 'N' : 'H') : m.neutral ? 'N' : 'A'}), ${shortDate(m.match_date)}` };
  });
}

/** The prediction: the fixture's stored projection, else IP1 from the right Elo ratings. */
function prediction(d: IntlMatchData): (GridSummary & { eloHome: number; eloAway: number; before: boolean }) | null {
  const m = d.match;
  const before = !!m;
  const eloHome = m?.elo_home_pre ?? d.home.elo;
  const eloAway = m?.elo_away_pre ?? d.away.elo;
  const neutral = m?.neutral ?? false;
  const kind = m?.competition_kind ?? kindOfEdition(d.fixture?.edition_key ?? null);
  if (!m && d.fixture?.p_home != null) {
    const f = d.fixture;
    return {
      pHome: f.p_home!, pDraw: f.p_draw ?? 0, pAway: f.p_away ?? 0, xgHome: f.xg_home ?? 0, xgAway: f.xg_away ?? 0,
      top: (f.scores ?? []).map((s) => ({ h: s.h, a: s.a, p: s.p })), eloHome, eloAway, before,
    };
  }
  if (!d.params) return null;
  return { ...summariseGrid(ip1Grid(d.params, eloHome, eloAway, neutral, kind)), eloHome, eloAway, before };
}

function SquadBrief({ team, players }: { team: TeamSummary; players: SquadPlayer[] }) {
  if (!players.length) return <p className="text-sm text-ink-700">No current squad listed.</p>;
  const today = new Date().toISOString().slice(0, 10);
  const ages = players.filter((p) => p.birth_date).map((p) => ageOn(p.birth_date!, today));
  const caps = players.reduce((a, p) => a + (p.caps ?? 0), 0);
  const abroad = players.filter((p) => p.club_league_country && p.club_league_country !== team.team).length;
  const mostCapped = [...players].sort((a, b) => (b.caps ?? 0) - (a.caps ?? 0)).slice(0, 5);
  const scorers = [...players].filter((p) => (p.goals ?? 0) > 0).sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0)).slice(0, 5);
  return (
    <div className="space-y-2 text-sm">
      <p className="text-ink-900">
        {`${players.length} players · average age ${ages.length ? (ages.reduce((x, y) => x + y, 0) / ages.length).toFixed(1) : '–'} · ${caps.toLocaleString('en-GB')} caps between them · ${abroad} play abroad`}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-500">Most capped</p>
          <ol className="list-decimal list-inside">{mostCapped.map((p) => <li key={p.seq}>{`${p.player} `}<span className="font-mono text-xs text-ink-500">{p.caps}</span></li>)}</ol>
        </div>
        {scorers.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-500">Top scorers in the squad</p>
            <ol className="list-decimal list-inside">{scorers.map((p) => <li key={p.seq}>{`${p.player} `}<span className="font-mono text-xs text-ink-500">{p.goals}</span></li>)}</ol>
          </div>
        )}
      </div>
      <p><Link to={intlTeamPath(team.slug)} className="text-pitch-800 underline underline-offset-2">{`${team.team}: full squad, record and rating`}</Link></p>
    </div>
  );
}

function TeamTab({ team, form, players }: { team: TeamSummary; form: IntlMatch[]; players: SquadPlayer[] }) {
  return (
    <div className="space-y-5">
      <p className="text-ink-900">
        {`Elo ${Math.round(team.elo)}${team.elo_rank ? `, ranked ${team.elo_rank} in the world` : ''}; peak ${Math.round(team.elo_peak)} in ${team.elo_peak_date.slice(0, 4)}. Played ${team.played}: won ${team.won}, drawn ${team.drawn}, lost ${team.lost}.`}
      </p>
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-ink-900">Latest results</h3>
        <GameList>{form.map((m) => <GameRow key={m.match_key} m={m} showDate showCompetition team={team.team} />)}</GameList>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-ink-900">Current squad</h3>
        <SquadBrief team={team} players={players} />
      </section>
    </div>
  );
}

export default function IntlMatchPage() {
  const { slug = '' } = useParams();
  const { data, failed, loading } = useKeyedFetch(slug, () => loadIntlMatch(slug));
  const [tab, setTab] = useState<PreviewTabId>('prediction');
  const pred = useMemo(() => (data ? prediction(data) : null), [data]);
  const d = data;
  const title = d ? `${d.home.team} v ${d.away.team}` : 'International match';
  useDocumentHead({
    title: sideTitle(d ? `${title}, ${shortDate(d.date)}: ${d.match ? 'result, ' : ''}prediction and head to head` : 'International match'),
    description: d
      ? `${title} on ${shortDate(d.date)}: ${pred ? `${d.home.team} ${pct(pred.pHome)}, draw ${pct(pred.pDraw)}, ${d.away.team} ${pct(pred.pAway)}; ` : ''}form, head-to-head record and both squads.`
      : 'An international match: prediction, form and head to head.',
    path: `${INTL_MATCHES_PATH}/${slug}`,
  });

  if (failed) return <p className="text-ink-700">This match is unavailable right now.</p>;
  if (loading) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (!d) return <p className="text-ink-700">No such match. <Link to={INTL_FIXTURES_PATH} className="underline">See every fixture and result</Link>.</p>;

  const m = d.match;
  const f = d.fixture;
  const reported = !m && f && isReported(f);
  const competition = m?.competition ?? (f?.edition_key?.startsWith('UNL-') ? 'UEFA Nations League' : 'International');
  const t = tournamentByCompetition(competition);
  const editionKey = m?.edition_key ?? f?.edition_key ?? null;
  const editionLabelText = editionKey ? editionLabel(editionKey.replace(/^[A-Z]+-/, '')) : null;
  const when = f ? ukDateTime(f.kickoff_utc) : null;
  const where = m ? [m.city, m.country].filter(Boolean).join(', ') : f?.venue ?? '';
  const stage = m?.stage_name && m.stage_code !== 'GRP' && m.stage_code !== 'ALL' ? m.stage_name : null;
  const group = m?.group_label ?? f?.group_label ?? null;

  // Head to head from the home side's point of view.
  const pr = d.pair;
  const homeIsA = pr ? pr.team_a === d.home.team : true;
  const h2h = pr && { played: pr.played, w: homeIsA ? pr.a_won : pr.b_won, dr: pr.drawn, l: homeIsA ? pr.b_won : pr.a_won, gf: homeIsA ? pr.a_goals : pr.b_goals, ga: homeIsA ? pr.b_goals : pr.a_goals, first: pr.first_meeting, last: pr.last_meeting };

  const goalsBy = (team: string) => d.goals.filter((g) => g.team === team);

  return (
    <article className="space-y-6" data-testid="intl-match">
      <IntlHeader title={title} crumb={{ to: INTL_FIXTURES_PATH, label: 'Fixtures & Results' }}>
        <p className="text-sm text-ink-700">
          {t && editionKey ? <Link to={editionPathOf({ competition, label: editionKey.slice(t.code.length + 1) })} className="underline underline-offset-2">{`${t.short} ${editionLabelText}`}</Link> : competition}
          {stage ? ` · ${stage}` : ''}
          {group ? ` · Group ${group}` : ''}
          {` · ${shortDate(d.date)}${when && !m ? `, ${when.time} UK` : ''}`}
          {where ? ` · ${where}` : ''}
          {m?.neutral ? ' (neutral)' : ''}
        </p>
      </IntlHeader>

      {(m || reported) && (
        <section className="space-y-2" aria-labelledby="intl-m-result">
          <h2 id="intl-m-result" className={sectionHeading}>Result</h2>
          <div className="rounded-lg border border-chalk-300 bg-white p-4" data-testid="intl-match-result">
            <p className="font-display text-2xl text-ink-900">
              <TeamLink slug={d.home.slug} name={m?.home_name ?? d.home.team} />
              <span className="mx-3 font-mono">{m ? scoreText({ ...m, shootout_winner: null }) : `${f!.home_score}–${f!.away_score}`}</span>
              <TeamLink slug={d.away.slug} name={m?.away_name ?? d.away.team} />
              {m && <UpsetBadge m={m} />}
            </p>
            {m?.shootout_winner && <p className="text-sm text-ink-700">{`${m.shootout_winner} won on penalties.`}</p>}
            {reported && <p className="text-xs text-ink-500">Reported by the fixture feed; not yet in the results file.</p>}
            {d.goals.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-4 text-sm text-ink-700">
                {[d.home.team, d.away.team].map((team, i) => (
                  <ul key={team} className={i === 1 ? 'text-right' : ''}>
                    {goalsBy(team).map((g) => <li key={g.seq}>{`${g.scorer ?? 'Unknown'}${g.minute ? ` ${g.minute}′` : ''}${g.penalty ? ' (pen)' : ''}${g.own_goal ? ' (og)' : ''}`}</li>)}
                  </ul>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <PreviewTabs active={tab} onChange={setTab} labels={{ home: d.home.team, away: d.away.team }} />

      {tab === 'prediction' && (
        <section className="space-y-4" data-testid="intl-match-prediction">
          <h2 className={sectionHeading}>{pred?.before ? 'What the model expected beforehand' : 'Prediction'}</h2>
          <ComparisonCard
            homeTeamName={d.home.team}
            awayTeamName={d.away.team}
            homeForm={formEntries(d.home.team, d.homeForm)}
            awayForm={formEntries(d.away.team, d.awayForm)}
            homeWinPct={pred ? pred.pHome * 100 : undefined}
            drawPct={pred ? pred.pDraw * 100 : undefined}
            awayWinPct={pred ? pred.pAway * 100 : undefined}
          />
          {pred && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-chalk-300 bg-white p-3 text-sm space-y-1">
                <p className="text-ink-900">{`${d.home.team} ${pct(pred.pHome)} · draw ${pct(pred.pDraw)} · ${d.away.team} ${pct(pred.pAway)}`}</p>
                <p className="text-ink-700">{`Expected goals ${pred.xgHome.toFixed(1)}–${pred.xgAway.toFixed(1)}`}</p>
                <p className="text-ink-700">{`Elo ${Math.round(pred.eloHome)} v ${Math.round(pred.eloAway)}${pred.before ? ' before kick-off' : ' today'}`}</p>
              </div>
              <div className="rounded-lg border border-chalk-300 bg-white p-3 text-sm">
                <p className="text-[11px] uppercase tracking-wide text-ink-500 mb-1">Likeliest scores</p>
                <ul className="grid grid-cols-3 gap-1 font-mono text-xs" data-testid="intl-match-scores">
                  {pred.top.slice(0, 6).map((s) => <li key={`${s.h}-${s.a}`} className="rounded bg-chalk-100 px-2 py-1 text-center">{`${s.h}–${s.a} `}<span className="text-ink-500">{pct(s.p)}</span></li>)}
                </ul>
              </div>
            </div>
          )}
          {d.groupOdds.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-ink-900">{`Group ${group}: chances`}</h3>
              <GroupChances odds={d.groupOdds} highlight={d.home.team} />
            </div>
          )}
          <p className="text-xs text-ink-500">Form: each side’s last five internationals before this one, oldest to newest. Prediction: FixtureShark’s model (IP1), built on World Football Elo ratings, home advantage and the type of game; a shoot-out counts as a draw.</p>
        </section>
      )}

      {tab === 'overview' && (
        <Section title="Head to head" id="intl-m-h2h" testId="intl-match-h2h">
          {h2h ? (
            <>
              <p className="text-ink-900" data-testid="intl-match-h2h-record">
                {`Played ${h2h.played}: ${d.home.team} won ${h2h.w}, drawn ${h2h.dr}, ${d.away.team} won ${h2h.l}; goals ${h2h.gf}–${h2h.ga}. First met ${shortDate(h2h.first)}${h2h.last !== h2h.first ? `, last ${shortDate(h2h.last)}` : ''}.`}
              </p>
              <div className="flex h-3 max-w-md overflow-hidden rounded-full bg-chalk-200" aria-hidden>
                <span className="bg-pitch-700" style={{ width: `${(100 * h2h.w) / h2h.played}%` }} />
                <span className="bg-chalk-300" style={{ width: `${(100 * h2h.dr) / h2h.played}%` }} />
                <span className="bg-loss-600" style={{ width: `${(100 * h2h.l) / h2h.played}%` }} />
              </div>
              <GameList testId="intl-match-meetings">{d.meetings.slice(0, 20).map((g) => <GameRow key={g.match_key} m={g} showDate showCompetition />)}</GameList>
              {d.meetings.length > 20 && <p className="text-xs text-ink-500">{`Latest 20 of ${d.meetings.length} meetings.`}</p>}
            </>
          ) : (
            <p className="text-ink-700">{`${d.home.team} and ${d.away.team} have never met.`}</p>
          )}
        </Section>
      )}

      {tab === 'home' && <TeamTab team={d.home} form={d.homeForm} players={d.homeSquad} />}
      {tab === 'away' && <TeamTab team={d.away} form={d.awayForm} players={d.awaySquad} />}
    </article>
  );
}
