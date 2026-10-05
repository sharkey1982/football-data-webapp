// ============================================================================
// src/pages/international/IntlHistoryPage.tsx
//
// /international/history -- international football through time:
//   * the Elo race: the world's top ten at the end of every year since 1872,
//     animated (src/components/Timelapse);
//   * world number ones: who led the ratings each year, as a strip of reigns
//     and the most years on top;
//   * the biggest upsets at the major tournaments, by the winner's Elo
//     expectation before the game.
// Data: intl_team_year_elo and intl_upsets (scripts/intl_import.py, daily).
// ============================================================================

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Timelapse from '../../components/Timelapse';
import { IntlHeader, Section, TeamLink } from '../../components/intl/IntlBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { INTL_HISTORY_PATH, INTL_TOURNAMENTS_PATH, editionPathOf, intlTeamPath, loadIntlHistory, type IntlUpset, type YearElo } from '../../lib/intlApi';
import { DATA_NOTE, shortDate, tournamentByCompetition } from '../../lib/intlStats';

const BASE = 1300; // bars start here so the gaps between the best sides show

type Reign = { team: string; slug: string; name: string; from: number; to: number };

function reigns(years: YearElo[]): Reign[] {
  const out: Reign[] = [];
  for (const y of years.filter((r) => r.rank === 1).sort((a, b) => a.year - b.year)) {
    const last = out[out.length - 1];
    if (last && last.team === y.team && last.to === y.year - 1) last.to = y.year;
    else out.push({ team: y.team, slug: y.slug, name: y.name, from: y.year, to: y.year });
  }
  return out;
}

// A fixed palette for the strip: the most frequent leaders get their own colour.
const PALETTE = ['bg-pitch-700', 'bg-amber-500', 'bg-cup-700', 'bg-loss-600', 'bg-pitch-900', 'bg-amber-600', 'bg-cup-900', 'bg-ink-500'];

function NumberOnes({ years }: { years: YearElo[] }) {
  const list = useMemo(() => reigns(years), [years]);
  const totals = useMemo(() => {
    const n = new Map<string, { team: string; slug: string; years: number }>();
    for (const r of list) {
      const cur = n.get(r.team) ?? { team: r.team, slug: r.slug, years: 0 };
      cur.years += r.to - r.from + 1;
      n.set(r.team, cur);
    }
    return [...n.values()].sort((a, b) => b.years - a.years);
  }, [list]);
  if (!list.length) return null;
  const colour = new Map(totals.slice(0, PALETTE.length - 1).map((t, i) => [t.team, PALETTE[i]]));
  const first = list[0].from, last = list[list.length - 1].to;
  const span = last - first + 1;
  const longest = [...list].sort((a, b) => b.to - b.from - (a.to - a.from))[0];
  const max = totals[0].years;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-900 max-w-prose">
        {`${totals.length} nations have ended a year top of the ratings. ${totals[0].team} most often (${totals[0].years} years); the longest unbroken reign is ${longest.name}, ${longest.from}–${longest.to}. `}
        {`Top now: ${list[list.length - 1].name}.`}
      </p>
      <div className="flex h-8 w-full overflow-hidden rounded border border-chalk-300" role="img" aria-label={`World number one by year, ${first} to ${last}`} data-testid="intl-number-ones">
        {list.map((r) => (
          <Link
            key={`${r.team}-${r.from}`}
            to={intlTeamPath(r.slug)}
            className={`${colour.get(r.team) ?? PALETTE[PALETTE.length - 1]} h-full border-r border-white/60 last:border-r-0 hover:opacity-80`}
            style={{ width: `${(100 * (r.to - r.from + 1)) / span}%` }}
            title={`${r.name}: ${r.from === r.to ? r.from : `${r.from}–${r.to}`}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] font-mono text-ink-500">
        <span>{first}</span>
        <span>{Math.round((first + last) / 2)}</span>
        <span>{last}</span>
      </div>
      <ol className="grid gap-1 sm:grid-cols-2">
        {totals.slice(0, 10).map((t) => (
          <li key={t.team} className="grid grid-cols-[1rem_8rem_1fr] items-center gap-2 text-sm">
            <span className={`h-3 w-3 rounded-sm ${colour.get(t.team) ?? PALETTE[PALETTE.length - 1]}`} aria-hidden />
            <span className="truncate"><TeamLink slug={t.slug} name={t.team} /></span>
            <span className="flex items-center gap-2">
              <span className="h-3 rounded-sm bg-chalk-300" style={{ width: `${(100 * t.years) / max}%` }} aria-hidden />
              <span className="font-mono text-xs">{`${t.years} yr${t.years === 1 ? '' : 's'}`}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function UpsetCard({ m }: { m: IntlUpset }) {
  const homeWon = m.home_score > m.away_score;
  const t = tournamentByCompetition(m.competition);
  const winner = homeWon ? { slug: m.home_slug, name: m.home_name } : { slug: m.away_slug, name: m.away_name };
  const loser = homeWon ? { slug: m.away_slug, name: m.away_name } : { slug: m.home_slug, name: m.home_name };
  const label = m.edition_key ? `${t?.short ?? m.competition} ${m.edition_key.replace(/^[A-Z]+-/, '').replace(/-.*/, '')}` : m.competition;
  return (
    <li className="rounded-lg border border-chalk-300 bg-white p-3 flex items-start gap-3" data-testid="intl-big-upset">
      <span className="shrink-0 rounded bg-amber-400 px-2 py-1 font-mono text-sm font-semibold text-pitch-950" title="The winner's Elo expectation before the game">
        {`${Math.round(m.expectation * 100)}%`}
      </span>
      <span className="min-w-0 text-sm">
        <span className="block">
          <TeamLink slug={winner.slug} name={winner.name} bold />
          <span className="font-mono mx-1.5">{`${Math.max(m.home_score, m.away_score)}–${Math.min(m.home_score, m.away_score)}${m.went_extra_time ? ' aet' : ''}`}</span>
          <TeamLink slug={loser.slug} name={loser.name} />
        </span>
        <span className="block text-xs text-ink-500">
          {m.edition_key && t ? <Link to={editionPathOf({ competition: m.competition, label: m.edition_key.slice(t.code.length + 1) })} className="hover:underline">{label}</Link> : label}
          {`${m.stage_name && m.stage_code !== 'GRP' && m.stage_code !== 'ALL' ? ` · ${m.stage_name}` : ''} · ${shortDate(m.match_date)}`}
        </span>
      </span>
    </li>
  );
}

export default function IntlHistoryPage() {
  const { data, failed, loading } = useKeyedFetch('intl-history', () => loadIntlHistory());
  useDocumentHead({
    title: 'International football through time: the Elo race since 1872, world number ones and the biggest upsets',
    description: 'Watch the world’s top ten national teams change year by year since 1872, see every world number one, and the biggest shocks at the World Cup, Euros, Copa América and AFCON.',
    path: INTL_HISTORY_PATH,
  });

  const race = useMemo(() => {
    if (!data) return null;
    const years = [...new Set(data.years.map((y) => y.year))].sort((a, b) => a - b);
    const idx = new Map(years.map((y, i) => [y, i]));
    const series = new Map<string, { id: string; name: string; href: string; values: (number | null)[] }>();
    for (const r of data.years) {
      const s = series.get(r.team) ?? { id: r.team, name: r.team, href: intlTeamPath(r.slug), values: years.map(() => null) };
      s.values[idx.get(r.year)!] = r.elo - BASE;
      series.set(r.team, s);
    }
    return { years, series: [...series.values()] };
  }, [data]);

  return (
    <article className="space-y-8">
      <IntlHeader title="Through time">
        <p className="text-ink-700 max-w-prose">More than 150 years of international football in three pictures: who was best, year by year; who held the top spot; and the days the ratings got it most wrong.</p>
      </IntlHeader>
      {failed && <p className="text-ink-700">History is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && race && (
        <>
          <Section title="The Elo race since 1872" id="intl-elo-race" testId="intl-elo-race">
            <p className="text-sm text-ink-700 max-w-prose">The world’s ten best national teams at the end of every year, by World Football Elo rating. Press play to watch Scotland and England give way to Uruguay, Hungary’s Golden Team, Brazil, the great West German and Spanish sides and the rest.</p>
            <Timelapse series={race.series} frameLabel={(i) => String(race.years[i])} measure="Elo rating" valueLabel={(v) => String(Math.round(v + BASE))} top={10} stepMs={260} />
          </Section>

          <Section title="World number ones" id="intl-number-ones">
            <NumberOnes years={data.years} />
          </Section>

          {data.upsets.length > 0 && (
            <Section title="The biggest upsets at major tournaments" id="intl-upsets" testId="intl-upsets">
              <p className="text-sm text-ink-700 max-w-prose">Ranked by the winner’s chance before kick-off, from the two sides’ Elo ratings (a draw counts as half; home advantage included). Shoot-out wins don’t count.</p>
              <ul className="grid gap-2 md:grid-cols-2">{data.upsets.slice(0, 20).map((m) => <UpsetCard key={m.match_key} m={m} />)}</ul>
            </Section>
          )}

          <p className="text-sm">
            <Link to={INTL_TOURNAMENTS_PATH} className="text-pitch-800 underline underline-offset-2">The race for major titles, and every tournament’s roll of honour</Link>
          </p>
        </>
      )}
      <p className="text-xs text-ink-500">{`Ratings: World Football Elo, computed by FixtureShark from every result (start 1500; weighted by competition and margin). A nation counts in a year if it played that year or in the three before; teams are filed under today’s nation (West Germany under Germany). ${DATA_NOTE}`}</p>
    </article>
  );
}
