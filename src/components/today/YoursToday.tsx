// ============================================================================
// src/components/today/YoursToday.tsx
//
// "Yours today" on the Today page: built from the My FixtureShark
// preferences in this browser (src/lib/myPrefs.ts). Your club's game today
// (or next) with our model's chance and the market's, your FPL gameweek
// (live points and projection while a gameweek is on, else the next
// deadline and any flagged players in your squad), then the other teams you
// follow. With nothing chosen it is one line and a "Choose your teams" link.
// ============================================================================

import { Link } from 'react-router-dom';
import { matchPath, teamPath } from '../EntityLinks';
import { getIntlCard, getMyClubCards, type ClubCard, type IntlCardData } from '../../lib/myHomeApi';
import { hasAnyPrefs, type MyPrefs } from '../../lib/myPrefs';
import { fetchFplLive, toScoreInput } from '../../lib/fplLiveApi';
import { scoreLiveTeam } from '../../lib/fplLiveScore';
import { formatDeadline } from '../../lib/hubApi';
import { intlTeamPath } from '../../lib/intlApi';
import { pctOf as pct, type DayGame } from '../../lib/todayApi';
import { getSquadFlags, liveGameweek, type FplToday } from '../../lib/todayFpl';
import { clubGame, tableLine, whenLabel, type ClubGame } from '../../lib/todayYours';
import { useLoad, type Load } from '../../hooks/useLoad';
import { BUTTON, Card, EYEBROW, LINK, ProbRow, SectionHead, Skeleton, TAP_LINK } from './TodayParts';

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });

function ClubToday({ card, game, day }: { card: ClubCard; game: ClubGame | null; day: string }) {
  const ours = game?.model ? (game.isHome ? game.model.home : game.model.away) : null;
  const theirs = game?.market ? (game.isHome ? game.market.home : game.market.away) : null;
  const scored = game && game.hg != null && game.ag != null;
  return (
    <Card testId="today-my-club" label={card.team.name}>
      {game ? (
        <>
          <p className={EYEBROW}>{[game.league, whenLabel(game.date, game.time, day)].filter(Boolean).join(' · ')}</p>
          <p className="text-lg font-semibold text-ink-900">
            {game.slug ? <Link to={matchPath(game.slug)} className="hover:underline">{game.home} v {game.away}</Link> : <>{game.home} v {game.away}</>}
            {scored && <span className="ml-2 font-mono tabular-nums">{game.hg}–{game.ag}</span>}
          </p>
          {game.model ? (
            <div className="space-y-1.5">
              <ProbRow label={game.home} p={game.model.home} strong={game.isHome} />
              <ProbRow label="Draw" p={game.model.draw} />
              <ProbRow label={game.away} p={game.model.away} strong={!game.isHome} />
            </div>
          ) : (
            <p className="text-sm text-ink-700">No prediction for this game yet.</p>
          )}
          <p className="text-sm text-ink-700">
            {ours != null ? 'Our model. ' : ''}
            {theirs != null ? `The market has ${card.team.name} ${pct(theirs)}. ` : ''}
            {tableLine(card) ?? ''}
          </p>
          {game.tv && <p className="text-sm text-ink-700">{game.tv}</p>}
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-ink-900">{card.team.name}</p>
          <p className="text-sm text-ink-700">No fixture scheduled yet.</p>
        </>
      )}
      <Link to={teamPath(card.team.slug)} className={`${TAP_LINK} text-sm`}>{card.team.name} fixtures and results</Link>
    </Card>
  );
}

function FollowLine({ card, day, games }: { card: ClubCard; day: string; games: DayGame[] }) {
  const g = clubGame(card.team.teamId, day, games, card.next);
  const ours = g?.model ? (g.isHome ? g.model.home : g.model.away) : null;
  return (
    <li className="py-2 min-w-0">
      <Link to={teamPath(card.team.slug)} className="font-semibold text-ink-900 hover:underline">{card.team.name}</Link>
      <p className="text-sm text-ink-700">
        {g
          ? `${whenLabel(g.date, g.time, day)}: ${g.home} v ${g.away}${g.hg != null && g.ag != null ? ` (${g.hg}–${g.ag})` : ''}${g.tv && g.tv !== 'Not on UK TV' ? `, ${g.tv}` : ''}.${ours != null ? ` We give ${card.team.name} ${pct(ours)}.` : ''}`
          : 'No fixture scheduled yet.'}
      </p>
    </li>
  );
}

function IntlLine({ slug, name }: { slug: string; name: string }) {
  const load = useLoad<IntlCardData | null>(`intl:${slug}`, () => getIntlCard(slug));
  const next = load.status === 'ok' && load.data?.next ? load.data.next : null;
  return (
    <li className="py-2 min-w-0">
      <Link to={intlTeamPath(slug)} className="font-semibold text-ink-900 hover:underline">{name}</Link>
      <p className="text-sm text-ink-700">
        {load.status === 'loading' ? '…' : next ? `Next: ${next.home} v ${next.away}, ${dayFmt.format(new Date(next.kickoff))}.` : 'No fixture scheduled yet.'}
      </p>
    </li>
  );
}

function FplLive({ fplId, gw }: { fplId: string; gw: number }) {
  const load = useLoad(`live:${fplId}`, () => fetchFplLive(Number(fplId)));
  const link = `/fpl/live?id=${encodeURIComponent(fplId)}`;
  if (load.status === 'loading') return <Skeleton rows={2} />;
  if (load.status === 'error') return <p className="text-sm text-ink-700">Your team (ID {fplId}) didn&rsquo;t load. <Link to={link} className={LINK}>FPL Live</Link></p>;
  const score = scoreLiveTeam(toScoreInput(load.data));
  const counted = score.players.filter((p) => p.multiplier > 0);
  const toPlay = counted.filter((p) => p.hasFixture && !p.done).length;
  const captain = score.players.find((p) => p.element === score.captain);
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  return (
    <>
      <p className={EYEBROW}>Your FPL · Gameweek {gw} live</p>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
        <p><span className="font-display text-4xl text-ink-900 tabular-nums" data-testid="today-fpl-points">{fmt(score.net)}</span> <span className="text-sm text-ink-500">so far</span></p>
        {load.data.projections.size > 0 && !score.allDone && (
          <p><span className="font-display text-2xl text-ink-900 tabular-nums">{score.projectedFinal.toFixed(1)}</span> <span className="text-sm text-ink-500">projected</span></p>
        )}
      </div>
      <p className="text-sm text-ink-700">
        {captain ? `Captain ${captain.webName} · ` : ''}
        {score.allDone ? 'every player has played' : `${toPlay} of ${counted.length} still to play`}
      </p>
      <Link to={link} className={`${TAP_LINK} text-sm`}>Full live score &rarr;</Link>
    </>
  );
}

function FplFlags({ fplId, fpl }: { fplId: string; fpl: Load<FplToday> }) {
  const flags = useLoad(`flags:${fplId}`, () => getSquadFlags(fplId));
  const next = fpl.status === 'ok' ? fpl.data.next : null;
  return (
    <>
      <p className={EYEBROW}>Your FPL{next ? ` · Gameweek ${next.gw}` : ''}</p>
      {fpl.status === 'loading' ? <Skeleton rows={1} /> : (
        <p className="text-sm text-ink-900">{next ? <>Deadline <strong>{formatDeadline(next.deadline)}</strong></> : 'No deadline coming up.'}</p>
      )}
      {flags.status === 'ok' && (
        <p className="text-sm text-ink-700" data-testid="today-fpl-flags">
          {flags.data.flags.length === 0
            ? 'No one in your squad is flagged.'
            : `Flagged in your squad: ${flags.data.flags.map((f) => `${f.name} (${f.status.toLowerCase()}${f.chance != null ? `, ${f.chance}%` : ''})`).join(', ')}.`}
        </p>
      )}
      <Link to={`/fpl/rate-my-team?id=${encodeURIComponent(fplId)}`} className={`${TAP_LINK} text-sm`}>Your team&rsquo;s projected points &rarr;</Link>
    </>
  );
}

export function YoursToday({ prefs, day, games, fpl, quiet }: { prefs: MyPrefs; day: string; games: DayGame[]; fpl: Load<FplToday>; quiet?: boolean }) {
  const ids = [prefs.club, ...prefs.followed].filter((c): c is NonNullable<typeof c> => !!c).map((c) => c.teamId);
  const clubs = useLoad<ClubCard[]>(ids.length ? `clubs:${ids.join(',')}` : null, () => getMyClubCards(ids));

  if (!hasAnyPrefs(prefs)) {
    return (
      <section aria-labelledby="today-yours" data-testid="today-yours-empty" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed border-chalk-300 px-4 py-2">
        <h2 id="today-yours" className="sr-only">Yours today</h2>
        <p className="flex-1 min-w-[14rem] text-sm text-ink-700">Pick your club, FPL ID and teams, and their games show here first.</p>
        <Link to="/my" className={`${BUTTON} border-amber-500 bg-amber-500 hover:bg-amber-400 text-ink-900 font-semibold`}>Choose your teams</Link>
      </section>
    );
  }

  const main = clubs.status === 'ok' && prefs.club ? clubs.data.find((c) => c.team.teamId === prefs.club!.teamId) ?? null : null;
  const others = clubs.status === 'ok' ? clubs.data.filter((c) => c.team.teamId !== prefs.club?.teamId) : [];
  const playingToday = (c: ClubCard) => games.some((g) => g.homeId === c.team.teamId || g.awayId === c.team.teamId);
  const live = fpl.status === 'ok' ? liveGameweek(fpl.data.open) : null;
  const anyToday = ids.some((id) => games.some((g) => g.homeId === id || g.awayId === id));

  return (
    <section aria-labelledby="today-yours" className="space-y-3" data-testid="today-yours">
      <SectionHead id="today-yours" title={quiet ? 'Yours' : 'Yours today'}>
        <Link to="/my" className={`${TAP_LINK} text-sm`}>Edit preferences</Link>
      </SectionHead>
      {quiet && ids.length > 0 && !anyToday && <p className="text-sm text-ink-700">Nothing from your teams today.</p>}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {prefs.club && (
          clubs.status === 'loading' ? <Card><Skeleton rows={4} /></Card>
          : clubs.status === 'error' ? <Card><p className="text-sm text-ink-700">{prefs.club.name}&rsquo;s games didn&rsquo;t load.</p></Card>
          : main ? <ClubToday card={main} game={clubGame(main.team.teamId, day, games, main.next)} day={day} />
          : <Card><p className="text-sm text-ink-700">No games for {prefs.club.name} in the leagues we cover this season.</p></Card>
        )}
        {prefs.fplId && (
          <Card testId="today-my-fpl" label="Your FPL">
            {live != null ? <FplLive fplId={prefs.fplId} gw={live} /> : <FplFlags fplId={prefs.fplId} fpl={fpl} />}
          </Card>
        )}
        {(others.length > 0 || prefs.intl) && (
          <Card testId="today-my-following" label="Also following">
            <p className={EYEBROW}>Also following{others.length > 0 && !others.some(playingToday) ? ' · not today' : ''}</p>
            <ul className="divide-y divide-chalk-200">
              {others.map((c) => <FollowLine key={c.team.teamId} card={c} day={day} games={games} />)}
              {prefs.intl && <IntlLine slug={prefs.intl.slug} name={prefs.intl.name} />}
            </ul>
          </Card>
        )}
      </div>
    </section>
  );
}
