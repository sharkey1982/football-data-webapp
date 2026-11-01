// ============================================================================
// src/components/my/MyHome.tsx
//
// "My FixtureShark": the personal part of the home page, built from the
// preferences in this browser (src/lib/myPrefs.ts; Chris, 25 Oct 2026, from
// the approved mockup). Club card first, then FPL, international, NFL and
// tennis cards for whatever is set; "Also following" sits under the club card. Each card loads
// on its own and says so if it fails; nothing is invented -- a field the site
// doesn't have is left out.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HubCard, HubNote, HubSkeleton, HUB_LINK } from '../hub/HubParts';
import { MyLiveScore } from '../fpl/MyLiveScore';
import { matchPath, teamPath } from '../EntityLinks';
import {
  chanceOfResult, countryName, getIntlCard, getMyClubCards, getNflCard, getTennisCard, resultFor,
  type ClubCard, type ClubCardGame, type IntlCardData, type NflCardData, type Probs, type TennisCardRow,
} from '../../lib/myHomeApi';
import type { MyPrefs } from '../../lib/myPrefs';
import { getOpenGameweek } from '../../lib/fplGameweekState';
import { formatDeadline, getNextDeadline } from '../../lib/hubApi';
import { intlTeamPath } from '../../lib/intlApi';
import { nflTeamPath } from '../../lib/nflApi';
import { tennisPlayerPath } from '../../lib/tennisApi';

type Load<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error' };

const EYEBROW = 'font-mono text-[11px] uppercase tracking-widest text-ink-500';
const BUTTON = 'inline-flex items-center min-h-11 px-4 rounded-lg text-sm';

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const dayTimeFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

/** "Tue 27 Oct" from a UK calendar date. */
function ukDay(date: string): string {
  return dayFmt.format(new Date(`${date}T12:00:00Z`));
}
const pct = (p: number | null | undefined) => (p == null ? '' : `${Math.round(p * 100)}%`);

function useLoad<T>(key: string, fn: () => Promise<T>): Load<T> {
  const [state, setState] = useState<{ key: string; load: Load<T> }>({ key, load: { status: 'loading' } });
  useEffect(() => {
    let cancelled = false;
    fn()
      .then((data) => { if (!cancelled) setState({ key, load: { status: 'ok', data } }); })
      .catch(() => { if (!cancelled) setState({ key, load: { status: 'error' } }); });
    return () => { cancelled = true; };
    // fn is recreated each render; the key says when the request changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state.load : { status: 'loading' };
}

function ProbRow({ label, p, strong }: { label: string; p: number; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
      <span className={`truncate ${strong ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>{label}</span>
      <span className="h-2.5 rounded-full bg-chalk-200" aria-hidden="true">
        <span className={`block h-2.5 rounded-full ${strong ? 'bg-amber-600' : 'bg-pitch-700'}`} style={{ width: `${Math.round(p * 100)}%` }} />
      </span>
      <span className={`font-mono text-right tabular-nums ${strong ? 'font-semibold' : ''}`}>{pct(p)}</span>
    </div>
  );
}

function FormBadge({ r }: { r: 'W' | 'D' | 'L' }) {
  const label = r === 'W' ? 'Win' : r === 'D' ? 'Draw' : 'Loss';
  const cls = r === 'W' ? 'bg-pitch-700 text-white' : r === 'D' ? 'bg-chalk-300 text-ink-900' : 'bg-ink-700 text-white';
  return (
    <span className={`inline-flex w-8 h-8 items-center justify-center rounded-md font-semibold text-sm ${cls}`} title={label}>
      <span aria-hidden="true">{r}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

const scoreLine = (g: ClubCardGame) => `${g.home} ${g.hg}–${g.ag} ${g.away}`;

function ClubCardView({ card }: { card: ClubCard }) {
  const { team, next, recent, table, league } = card;
  const last = recent[0];
  const form = recent.map(resultFor).filter((r): r is 'W' | 'D' | 'L' => r != null);
  return (
    <HubCard title={league ? `${team.name} · ${league.name}` : team.name} more={{ to: teamPath(team.slug), label: 'Club page' }} testId="my-club">
      <div className="p-4 grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 min-w-0" data-testid="my-club-next">
          {next ? (
            <>
              <p className={EYEBROW}>
                Next game · {ukDay(next.date)}{next.time ? `, ${next.time.slice(0, 5)}` : ''}
                {next.league && league && next.league !== league.name ? ` · ${next.league}` : ''}
              </p>
              <p className="text-xl font-semibold text-ink-900">{next.home} v {next.away}</p>
              {next.model ? (
                <div className="space-y-1.5">
                  <ProbRow label={next.home} p={next.model.home} strong={next.isHome} />
                  <ProbRow label="Draw" p={next.model.draw} />
                  <ProbRow label={next.away} p={next.model.away} strong={!next.isHome} />
                </div>
              ) : (
                <p className="text-sm text-ink-700">No prediction for this game yet.</p>
              )}
              <p className="text-sm text-ink-700">
                {next.model && next.xg ? `Our model, expected goals ${next.xg[0]}–${next.xg[1]}. ` : ''}
                {next.market
                  ? `Betting market: ${pct(next.market.home)} / ${pct(next.market.draw)} / ${pct(next.market.away)}.`
                  : next.model ? 'The betting market’s view appears when prices are published, a few days before kick-off.' : ''}
              </p>
              {next.tv && <p className="text-sm text-ink-700">Where to watch: {next.tv}</p>}
              {next.slug && <Link to={matchPath(next.slug)} className={`${HUB_LINK} text-sm`}>Match preview &rarr;</Link>}
            </>
          ) : (
            <p className="text-sm text-ink-700">No fixture scheduled yet.</p>
          )}
        </div>

        <div className="space-y-2 min-w-0" data-testid="my-club-last">
          {last ? (
            <>
              <p className={EYEBROW}>Last result · {ukDay(last.date)}</p>
              <p className="text-xl font-semibold text-ink-900">{scoreLine(last)}</p>
              {(last.model || last.market) && (
                <p className="text-sm text-ink-700">
                  {last.model ? `Our model gave this result ${pct(chanceOfResult(last.model, last))}` : ''}
                  {last.model && last.market ? ', the market ' : last.market ? 'The market gave this result ' : ''}
                  {last.market ? pct(chanceOfResult(last.market, last)) : ''}.
                </p>
              )}
              {form.length > 0 && (
                <>
                  <p className={`${EYEBROW} pt-1`}>Form, last {form.length}</p>
                  <div className="flex gap-1.5">{form.slice().reverse().map((r, i) => <FormBadge key={i} r={r} />)}</div>
                  <p className="text-xs text-ink-500">{recent.slice().reverse().map(scoreLine).join(' · ')}</p>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-700">No results yet this season.</p>
          )}
        </div>
      </div>

      {table.length > 0 && league && (
        <div className="border-t border-chalk-200 px-4 py-3 space-y-2">
          <p className={EYEBROW}>{league.name} · around {team.name}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-500 text-left">
                <th scope="col" className="py-1 pr-2 font-normal w-8">#</th>
                <th scope="col" className="py-1 font-normal">Club</th>
                <th scope="col" className="py-1 font-normal text-right">P</th>
                <th scope="col" className="py-1 font-normal text-right">GD</th>
                <th scope="col" className="py-1 font-normal text-right">Pts</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {table.map((r) => (
                <tr key={r.teamId} className={`border-t border-chalk-200 ${r.teamId === team.teamId ? 'bg-amber-400/20 font-semibold' : ''}`}>
                  <td className="py-1 pr-2">{r.position}</td>
                  <td className="py-1 font-sans"><Link to={teamPath(r.slug)} className="hover:underline">{r.name}</Link></td>
                  <td className="py-1 text-right">{r.played}</td>
                  <td className="py-1 text-right">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td className="py-1 text-right">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-500">From confirmed results, deductions included, as on the full table.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <Link to={`/table?league=${league.leagueId}`} className={HUB_LINK}>Full table</Link>
            <Link to={teamPath(team.slug)} className={HUB_LINK}>{team.name} fixtures and results</Link>
            {league.leagueId <= 4 && <Link to={`${teamPath(team.slug)}/finances`} className={HUB_LINK}>Club finances</Link>}
          </div>
        </div>
      )}
    </HubCard>
  );
}

function FollowRow({ card }: { card: ClubCard }) {
  const { team, next, recent, league } = card;
  const last = recent[0];
  const ourChance = next?.model ? (next.isHome ? next.model.home : next.model.away) : null;
  return (
    <li className="bg-white border border-chalk-300 rounded-lg px-4 py-3 space-y-1 min-w-0">
      <Link to={teamPath(team.slug)} className="font-semibold text-ink-900 hover:underline">{team.name}</Link>
      <p className="text-sm text-ink-700">
        {next ? `Next: ${next.isHome ? `v ${next.away}` : `at ${next.home}`}, ${ukDay(next.date)}${ourChance != null ? ` · we give ${team.name} ${pct(ourChance)}` : ''}` : 'No fixture scheduled yet'}
      </p>
      {last && <p className="text-sm text-ink-700">Last: {scoreLine(last)}, {ukDay(last.date)}</p>}
      {league && (
        <p className="text-sm">
          <Link to={`/table?league=${league.leagueId}`} className={HUB_LINK}>{league.name} table</Link>
        </p>
      )}
    </li>
  );
}

function ProbsLine({ home, away, p }: { home: string; away: string; p: Probs }) {
  return <>{home} {pct(p.home)} · draw {pct(p.draw)} · {away} {pct(p.away)}</>;
}

function IntlCard({ slug }: { slug: string }) {
  const load = useLoad<IntlCardData | null>(`intl:${slug}`, () => getIntlCard(slug));
  const name = load.status === 'ok' && load.data ? load.data.name : 'International';
  return (
    <HubCard title={name} more={{ to: intlTeamPath(slug), label: 'Team page' }} testId="my-intl">
      {load.status === 'loading' && <HubSkeleton rows={2} rowClass="h-8" />}
      {(load.status === 'error' || (load.status === 'ok' && !load.data)) && <HubNote>This team didn&rsquo;t load.</HubNote>}
      {load.status === 'ok' && load.data && (
        <div className="px-4 py-3 space-y-1.5 text-sm">
          {load.data.next ? (
            <>
              <p className={EYEBROW}>Next · {dayTimeFmt.format(new Date(load.data.next.kickoff))}</p>
              <p className="text-lg font-semibold text-ink-900">{load.data.next.home} v {load.data.next.away}</p>
              {load.data.next.pHome != null && load.data.next.pDraw != null && load.data.next.pAway != null && (
                <p className="text-ink-700">Our prediction: <ProbsLine home={load.data.next.home} away={load.data.next.away} p={{ home: load.data.next.pHome, draw: load.data.next.pDraw, away: load.data.next.pAway }} /></p>
              )}
            </>
          ) : (
            <p className="text-ink-700">No fixture scheduled yet.</p>
          )}
          {load.data.last && (
            <p className="text-ink-700">Last: {load.data.last.home} {load.data.last.hs}–{load.data.last.as} {load.data.last.away}, {ukDay(load.data.last.date)}</p>
          )}
        </div>
      )}
    </HubCard>
  );
}

function NflCard({ slug, name }: { slug: string; name: string }) {
  const load = useLoad<NflCardData>(`nfl:${slug}`, () => getNflCard(slug));
  return (
    <HubCard title={name} more={{ to: nflTeamPath(slug), label: 'Team page' }} testId="my-nfl">
      {load.status === 'loading' && <HubSkeleton rows={2} rowClass="h-8" />}
      {load.status === 'error' && <HubNote>This team didn&rsquo;t load.</HubNote>}
      {load.status === 'ok' && !load.data && <HubNote>No game scheduled.</HubNote>}
      {load.status === 'ok' && load.data && (
        <div className="px-4 py-3 space-y-1.5 text-sm">
          <p className={EYEBROW}>Next · {load.data.game.kickoff_at ? dayTimeFmt.format(new Date(load.data.game.kickoff_at)) : ukDay(load.data.game.gameday)}</p>
          <p className="text-lg font-semibold text-ink-900">{load.data.game.away_name} at {load.data.game.home_name}</p>
          {load.data.pTeam != null && <p className="text-ink-700">We give the {name} {pct(load.data.pTeam)} to win.</p>}
        </div>
      )}
    </HubCard>
  );
}

function TennisCard({ prefs }: { prefs: NonNullable<MyPrefs['tennis']> }) {
  const key = prefs.mode === 'country' ? `tennis:c:${prefs.country}` : `tennis:p:${prefs.players.map((p) => `${p.tour}/${p.slug}`).join(',')}`;
  const load = useLoad<TennisCardRow[]>(key, () => getTennisCard(prefs));
  const title = prefs.mode === 'country' ? `${countryName(prefs.country)} tennis` : 'Your tennis players';
  return (
    <HubCard title={title} more={{ to: '/tennis', label: 'Tennis' }} testId="my-tennis">
      {load.status === 'loading' && <HubSkeleton rows={3} rowClass="h-8" />}
      {load.status === 'error' && <HubNote>The players didn&rsquo;t load.</HubNote>}
      {load.status === 'ok' && load.data.length === 0 && <HubNote>No ranked players to show.</HubNote>}
      {load.status === 'ok' && load.data.length > 0 && (
        <ul className="divide-y divide-chalk-200 text-sm">
          {load.data.map(({ player, last }) => {
            const won = last ? last.winner_slug === player.slug : null;
            const opp = last ? (won ? last.loser : last.winner) : null;
            return (
              <li key={`${player.tour}/${player.slug}`} className="px-4 py-2.5 space-y-0.5">
                <p>
                  <Link to={tennisPlayerPath(player.tour, player.slug)} className="font-medium text-ink-900 hover:underline">{player.name}</Link>
                  {player.latest_rank ? <span className="text-ink-500"> · ranked {player.latest_rank}</span> : null}
                </p>
                {last && (
                  <p className="text-ink-700">
                    Latest: {won ? 'beat' : 'lost to'} {opp}, {last.round}, {last.tournament} ({ukDay(last.match_date)})
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="px-4 py-2 border-t border-chalk-200 text-xs text-ink-500">Results as they reach our data; upcoming matches aren&rsquo;t listed yet.</p>
    </HubCard>
  );
}

function FplCard({ fplId }: { fplId: string }) {
  const load = useLoad(`fpl:${fplId}`, async () => {
    const [open, deadline] = await Promise.all([getOpenGameweek().catch(() => null), getNextDeadline().catch(() => null)]);
    return { live: !!open && open.state.showToggle && open.state.gamesRemaining > 0, deadline };
  });
  if (load.status === 'ok' && load.data.live) return <MyLiveScore fplId={fplId} onForget={() => undefined} />;
  return (
    <HubCard title="Your FPL" more={{ to: `/fpl/rate-my-team?id=${encodeURIComponent(fplId)}`, label: 'Rate My Team' }} testId="my-fpl">
      {load.status === 'loading' && <HubSkeleton rows={2} rowClass="h-8" />}
      {load.status === 'error' && <HubNote>FPL didn&rsquo;t load.</HubNote>}
      {load.status === 'ok' && (
        <div className="px-4 py-3 space-y-1.5 text-sm">
          {load.data.deadline ? (
            <>
              <p className={EYEBROW}>Gameweek {load.data.deadline.gw}</p>
              <p className="text-ink-900">Deadline <strong>{formatDeadline(load.data.deadline.deadline)}</strong></p>
            </>
          ) : (
            <p className="text-ink-700">No deadline coming up.</p>
          )}
          <p className="text-ink-700">
            <Link to={`/fpl/rate-my-team?id=${encodeURIComponent(fplId)}`} className={HUB_LINK}>Your team&rsquo;s projected points and transfers</Link>
            {' · '}
            <Link to={`/fpl/live?id=${encodeURIComponent(fplId)}`} className={HUB_LINK}>Live score</Link>
          </p>
        </div>
      )}
    </HubCard>
  );
}

export function MyHome({ prefs }: { prefs: MyPrefs }) {
  const ids = [prefs.club, ...prefs.followed].filter((c): c is NonNullable<typeof c> => !!c).map((c) => c.teamId);
  const clubs = useLoad<ClubCard[]>(`clubs:${ids.join(',')}`, () => getMyClubCards(ids));
  const main = clubs.status === 'ok' ? clubs.data.find((c) => c.team.teamId === prefs.club?.teamId) ?? null : null;
  const others = clubs.status === 'ok' ? clubs.data.filter((c) => c.team.teamId !== prefs.club?.teamId) : [];
  const following = [
    prefs.club?.name,
    ...prefs.followed.map((c) => c.name),
    prefs.intl?.name,
    prefs.nfl?.name,
    prefs.fplId ? 'your FPL team' : null,
    prefs.tennis ? (prefs.tennis.mode === 'country' ? `${countryName(prefs.tennis.country)} tennis` : 'your tennis players') : null,
  ].filter(Boolean).join(' · ');
  const missing = [!prefs.intl && 'an international team', !prefs.nfl && 'an NFL team', !prefs.tennis && 'tennis players', !prefs.fplId && 'your FPL ID'].filter(Boolean) as string[];

  return (
    <div className="space-y-6" data-testid="my-home">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-700">Your FixtureShark</p>
          <h1 className="font-display uppercase tracking-wide text-3xl sm:text-5xl text-ink-900">{prefs.club?.name ?? 'My FixtureShark'}</h1>
          {following && <p className="text-sm text-ink-700">Following: {following}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/my" className={`${BUTTON} bg-amber-500 hover:bg-amber-400 text-ink-900 font-semibold`}>Edit preferences</Link>
          <Link to="/?view=all" className={`${BUTTON} border border-chalk-300 bg-white hover:bg-chalk-200 text-ink-900`}>Show the full home page</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <div className="flex-[999_1_36rem] min-w-0">
          {clubs.status === 'loading' && <HubCard title={prefs.club?.name ?? 'Your club'}><HubSkeleton rows={6} rowClass="h-9" /></HubCard>}
          {clubs.status === 'error' && <HubCard title={prefs.club?.name ?? 'Your club'}><HubNote>Your club&rsquo;s games didn&rsquo;t load. Try again shortly.</HubNote></HubCard>}
          {clubs.status === 'ok' && main && <ClubCardView card={main} />}
          {clubs.status === 'ok' && !main && prefs.club && (
            <HubCard title={prefs.club.name} more={{ to: teamPath(prefs.club.slug), label: 'Club page' }}>
              <HubNote>No games for {prefs.club.name} in the leagues we cover this season.</HubNote>
            </HubCard>
          )}
          {/* Other followed clubs sit with the main club (Chris, 1 Nov 2026), not below everything else. */}
          {prefs.followed.length > 0 && clubs.status !== 'error' && !(clubs.status === 'ok' && others.length === 0) && (
            <section aria-labelledby="my-also" className="space-y-3 mt-6">
              <h2 id="my-also" className="font-display uppercase tracking-wide text-xl text-ink-900">Also following</h2>
              {clubs.status === 'ok' ? (
                <ul className="grid gap-3 sm:grid-cols-2" data-testid="my-following">
                  {others.map((c) => <FollowRow key={c.team.teamId} card={c} />)}
                </ul>
              ) : clubs.status === 'loading' ? (
                <HubSkeleton rows={1} rowClass="h-16" />
              ) : null}
            </section>
          )}
        </div>
        <div className="flex-[1_1_22rem] min-w-0 space-y-6">
          {prefs.fplId && <FplCard fplId={prefs.fplId} />}
          {prefs.intl && <IntlCard slug={prefs.intl.slug} />}
          {prefs.nfl && <NflCard slug={prefs.nfl.slug} name={prefs.nfl.name} />}
          {prefs.tennis && <TennisCard prefs={prefs.tennis} />}
          {missing.length > 0 && (
            <p className="text-sm text-ink-700 border border-dashed border-chalk-300 rounded-lg px-4 py-3">
              Add {missing.join(', ').replace(/, ([^,]*)$/, ' or $1')} in <Link to="/my" className={HUB_LINK}>your preferences</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
