// ============================================================================
// src/pages/FootballHub.tsx
//
// The Club football home page (layout review, 21 Oct 2026). Opens on this
// week -- the coming round with the model's expected goals, what's on TV,
// the top of the table -- then every club page in plain groups, then the
// trivia and the game. Every team and match named links to its own page.
//
// The groups come from HUB_GROUPS in src/lib/journey.ts, which also names
// every page, so the hub and the menu can't disagree.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { BEAT_THE_SHARK } from '../components/GameCard';
import { hubGroups } from '../lib/journey';
import { getFootballTrivia, type TriviaFact } from '../lib/landingApi';
import { getCurrentSeasonId } from '../lib/currentSeason';
import { getLeagueTable, type LeagueTableRow } from '../lib/matchesApi';
import { favoured, getNextRound, getTvNextDay, HUB_LEAGUES, type TvItem } from '../lib/hubApi';
import type { FixtureWithNames } from '../lib/fixturesApi';
import { formatMatchDate } from '../lib/formatDate';
import { MatchLink, TeamLink } from '../components/EntityLinks';
import { useTeamSlugs } from '../lib/teamSlugs';
import { HubCard, HubHeader, HubNote, HubPageList, HubPlayStrip, HUB_LINK } from '../components/hub/HubParts';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const when = (date: string, time: string | null) => `${formatMatchDate(date).split(' ')[0]} ${time ? time.slice(0, 5) : ''}`.trim();

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: T };

export default function FootballHub() {
  useDocumentHead({
    title: 'Club football: fixtures, predictions and tables',
    description: 'This week in English football: every fixture with the model’s expected goals, what’s on TV, the league tables, and the history behind them.',
    path: '/football',
  });

  const slugs = useTeamSlugs();
  const [leagueId, setLeagueId] = useState<number>(HUB_LEAGUES[0].id);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [round, setRound] = useState<Load<{ matchweek: number | null; fixtures: FixtureWithNames[] }>>({ status: 'loading' });
  const [table, setTable] = useState<Load<LeagueTableRow[]>>({ status: 'loading' });
  const [tv, setTv] = useState<Load<{ date: string; items: TvItem[] } | null>>({ status: 'loading' });
  const [trivia, setTrivia] = useState<TriviaFact[]>([]);

  useEffect(() => {
    getCurrentSeasonId().then(setSeasonId).catch(() => {
      setRound({ status: 'error' });
      setTable({ status: 'error' });
    });
    getTvNextDay(todayIso()).then((data) => setTv({ status: 'ok', data })).catch(() => setTv({ status: 'error' }));
    getFootballTrivia().then(setTrivia).catch(() => setTrivia([]));
  }, []);

  useEffect(() => {
    if (seasonId == null) return;
    let live = true;
    setRound({ status: 'loading' });
    setTable({ status: 'loading' });
    getNextRound(leagueId, seasonId, todayIso())
      .then((data) => live && setRound({ status: 'ok', data }))
      .catch(() => live && setRound({ status: 'error' }));
    getLeagueTable(leagueId, seasonId)
      .then((data) => live && setTable({ status: 'ok', data }))
      .catch(() => live && setTable({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [leagueId, seasonId]);

  const leagueName = HUB_LEAGUES.find((l) => l.id === leagueId)?.name ?? '';
  const roundTitle = round.status === 'ok' && round.data.matchweek != null ? `Matchweek ${round.data.matchweek}` : 'Next seven days';
  const tvTitle = tv.status === 'ok' && tv.data && tv.data.date !== todayIso() ? `On TV ${formatMatchDate(tv.data.date).split(' ')[0]}` : 'On TV today';

  return (
    <div className="space-y-8">
      <HubHeader eyebrow="FixtureShark · Club football" title="This week">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          League
          <select
            value={leagueId}
            onChange={(e) => setLeagueId(Number(e.target.value))}
            className="border border-chalk-300 rounded px-2 py-2 bg-white text-ink-900 min-h-10"
          >
            {HUB_LEAGUES.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
      </HubHeader>

      <div className="flex flex-wrap gap-6 items-start">
        <HubCard
          title={`${roundTitle} · predictions`}
          more={{ to: `/fixtures?league=${leagueId}${seasonId ? `&season=${seasonId}` : ''}`, label: 'All fixtures' }}
          className="flex-[999_1_34rem] min-w-0"
          testId="hub-round"
        >
          {round.status === 'loading' && <HubNote>Loading the {leagueName} fixtures&hellip;</HubNote>}
          {round.status === 'error' && <HubNote>The fixtures didn&rsquo;t load. <Link to="/fixtures" className={HUB_LINK}>Open Fixtures</Link>.</HubNote>}
          {round.status === 'ok' && round.data.fixtures.length === 0 && <HubNote>No {leagueName} games in the next seven days.</HubNote>}
          {round.status === 'ok' && round.data.fixtures.length > 0 && (
            <>
              <ul className="divide-y divide-chalk-200">
                {round.data.fixtures.map((f) => {
                  const side = favoured(f.predicted_home_goals, f.predicted_away_goals);
                  const hasXg = f.predicted_home_goals != null && f.predicted_away_goals != null;
                  return (
                    <li key={f.fixture_id} className="px-4 py-2.5 sm:grid sm:grid-cols-[6rem_minmax(0,1fr)_5.5rem_minmax(0,1fr)_5rem] sm:items-center sm:gap-2 text-sm">
                      <span className="block font-mono text-xs text-ink-500 mb-1 sm:mb-0">{when(f.kickoff_date, f.kickoff_time)}</span>
                      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] items-center gap-2 sm:contents">
                        <span className={`text-right truncate ${side === 'home' ? 'font-semibold' : ''}`}>
                          <TeamLink slug={slugs.get(f.home_team_id)} from="club_hub">{f.home_team_name}</TeamLink>
                        </span>
                        <span className="text-center font-mono text-xs bg-pitch-900 text-chalk-100 rounded py-1" title="The model's expected goals">
                          {hasXg ? `${Number(f.predicted_home_goals).toFixed(1)}–${Number(f.predicted_away_goals).toFixed(1)}` : 'v'}
                        </span>
                        <span className={`truncate ${side === 'away' ? 'font-semibold' : ''}`}>
                          <TeamLink slug={slugs.get(f.away_team_id)} from="club_hub">{f.away_team_name}</TeamLink>
                        </span>
                      </div>
                      <span className="hidden sm:block text-right">
                        <MatchLink slug={f.slug} from="club_hub" className={HUB_LINK}>Preview</MatchLink>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="px-4 py-2.5 border-t border-chalk-200 text-xs text-ink-500">
                Expected goals from the model; bold is the side it favours. Every team and match opens its own page.
              </p>
            </>
          )}
        </HubCard>

        <div className="flex-[1_1_18rem] min-w-0 space-y-6">
          <HubCard title={tvTitle} more={{ to: '/tv-guide', label: 'TV guide' }} testId="hub-tv">
            {tv.status === 'loading' && <HubNote>Loading&hellip;</HubNote>}
            {tv.status === 'error' && <HubNote>The TV listings didn&rsquo;t load.</HubNote>}
            {tv.status === 'ok' && !tv.data && <HubNote>No confirmed UK broadcasts coming up.</HubNote>}
            {tv.status === 'ok' && tv.data && (
              <ul className="divide-y divide-chalk-200">
                {tv.data.items.map((t) => (
                  <li key={t.fixtureId} className="px-4 py-2.5">
                    <MatchLink slug={t.slug} from="club_hub" className="font-medium text-ink-900 hover:text-pitch-700 hover:underline underline-offset-2">
                      {t.home} v {t.away}
                    </MatchLink>
                    <p className="font-mono text-xs text-ink-500 mt-0.5">
                      {[t.time?.slice(0, 5), t.competition, t.channels.join(', ')].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </HubCard>

          <HubCard title="Top of the table" more={{ to: `/table?league=${leagueId}${seasonId ? `&season=${seasonId}` : ''}`, label: 'Full table' }} testId="hub-table">
            {table.status === 'loading' && <HubNote>Loading&hellip;</HubNote>}
            {table.status === 'error' && <HubNote>The table didn&rsquo;t load.</HubNote>}
            {table.status === 'ok' && table.data.length === 0 && <HubNote>No games played yet this season.</HubNote>}
            {table.status === 'ok' && table.data.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="font-mono text-[11px] uppercase text-ink-500">
                    <th className="text-left font-normal px-4 py-1.5 w-8">#</th>
                    <th className="text-left font-normal py-1.5">Team</th>
                    <th className="text-right font-normal py-1.5 w-10">P</th>
                    <th className="text-right font-normal px-4 py-1.5 w-12">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-chalk-200">
                  {table.data.slice(0, 5).map((r, i) => (
                    <tr key={r.team_id}>
                      <td className="px-4 py-2 font-mono text-xs text-ink-500">{i + 1}</td>
                      <td className="py-2"><TeamLink slug={slugs.get(r.team_id)} from="club_hub">{r.team_name}</TeamLink></td>
                      <td className="py-2 text-right font-mono text-xs text-ink-500">{r.played}</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </HubCard>
        </div>
      </div>

      <HubPageList title="All club pages" groups={hubGroups('football')} />

      <HubPlayStrip trivia={trivia} game={BEAT_THE_SHARK.football} />
    </div>
  );
}
