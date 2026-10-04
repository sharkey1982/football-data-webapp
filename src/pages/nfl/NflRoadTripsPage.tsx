// ============================================================================
// src/pages/nfl/NflRoadTripsPage.tsx
//
// /nfl/road-trips -- how far each team travels this regular season, on a map
// of the US (circle area ~ miles), with the most and fewest miles, late UK
// kick-offs, and where relocated franchises used to play. Server-rendered at
// build (src/entry-server.tsx) so the numbers are in the HTML.
// ============================================================================

import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { NFL_HUB_PATH, NFL_ROAD_TRIPS_PATH, nflTeamPath } from '../../lib/nflApi';
import { loadRoadTrips, roadTripsSentence, type RoadTripTeam, type RoadTrips } from '../../lib/nflPlaces';


const fmt = (n: number) => n.toLocaleString('en-GB');
const cardHeading = 'font-display uppercase text-sm tracking-wide text-ink-500 mb-3';
const num = 'px-2 py-1.5 text-right font-mono text-xs tabular-nums';

function MilesTable({ title, rows, testId }: { title: string; rows: RoadTripTeam[]; testId: string }) {
  return (
    <section className="border border-chalk-300 rounded-lg bg-white p-4" data-testid={testId}>
      <h2 className={cardHeading}>{title}</h2>
      <table className="w-full text-sm">
        <thead className="text-ink-500">
          <tr>
            <th scope="col" className="text-left font-medium text-xs py-1">Team</th>
            <th scope="col" className="text-right font-medium text-xs px-2 py-1">Miles</th>
            <th scope="col" className="text-right font-medium text-xs px-2 py-1">Late UK kick-offs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.franchise} className="border-t border-chalk-200">
              <th scope="row" className="text-left font-normal py-1.5">
                <Link to={nflTeamPath(t.slug)} className="hover:underline">{t.name}</Link>
              </th>
              <td className={num}>{fmt(t.miles)}</td>
              <td className={num}>{t.late}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RoadMap({ d }: { d: RoadTrips }) {
  const placed = d.teams.filter((t) => t.x != null && t.y != null);
  const labelled = new Set([...d.teams.slice(0, 3), d.teams[d.teams.length - 1]].map((t) => t?.franchise));
  return (
    <section className="border border-chalk-300 rounded-lg bg-white p-4" aria-label="Map of miles travelled">
      <div className="flex flex-wrap justify-between gap-3 mb-3">
        <h2 className="font-display uppercase text-sm tracking-wide text-ink-500">{`Regular-season miles, ${d.season}`}</h2>
        <div className="flex flex-wrap gap-4 text-xs text-ink-700 items-center">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-pitch-700" />
            Home stadium, sized by miles
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-pitch-700" style={{ boxShadow: '0 0 0 3px #d4a03c' }} />
            Plays abroad this season
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="relative mx-auto" style={{ width: 900, height: 540 }}>
          <img src="/maps/us-states.svg" alt="" width={900} height={540} className="absolute inset-0" />
          {placed.map((t) => {
            const r = Math.round(4 + Math.sqrt(t.miles) / 12);
            return (
              <Link
                key={t.franchise}
                to={nflTeamPath(t.slug)}
                title={`${t.name}: ${fmt(t.miles)} miles${t.abroad.length ? `, plays in ${[...new Set(t.abroad)].join(' and ')}` : ''}`}
                aria-label={`${t.name}: ${fmt(t.miles)} miles`}
                className="absolute rounded-full hover:opacity-100"
                style={{
                  left: t.x! - r,
                  top: t.y! - r,
                  width: 2 * r,
                  height: 2 * r,
                  background: 'rgba(38,92,67,0.78)',
                  boxShadow: t.abroad.length ? '0 0 0 3px #d4a03c' : '0 0 0 2px #ffffff',
                }}
              />
            );
          })}
          {placed
            .filter((t) => labelled.has(t.franchise))
            .map((t) => (
              <span
                key={`l-${t.franchise}`}
                className="absolute font-mono text-xs font-bold text-ink-900 bg-white/85 px-1 rounded-sm whitespace-nowrap pointer-events-none"
                style={{ left: Math.min(t.x! + 14, 820), top: t.y! - 24 }}
              >
                {`${t.franchise} ${fmt(t.miles)}`}
              </span>
            ))}
        </div>
      </div>
      <p className="text-xs text-ink-500 mt-3">
        Miles from each team&rsquo;s home stadium to every road and neutral-site game and back, as the crow flies. Hover or tap a circle for the team.
      </p>
    </section>
  );
}

export default function NflRoadTripsPage({ initialData }: { initialData?: RoadTrips } = {}) {
  const { data, failed, loading } = useKeyedFetch('road-trips', loadRoadTrips, initialData ? { key: 'road-trips', data: initialData } : undefined);
  useDocumentHead({
    title: 'NFL road trips: miles travelled by every team',
    description: data ? roadTripsSentence(data) : 'How far every NFL team travels this season, on a map, with late UK kick-offs.',
    path: NFL_ROAD_TRIPS_PATH,
  });
  const none = data ? data.teams.filter((t) => t.late === 0).map((t) => t.name) : [];
  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/discover" className="hover:underline">Discover</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Road Trips</h1>
      </header>
      {failed && <p className="text-ink-700">Road trips are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="nfl-road-trips-story">{roadTripsSentence(data)} Bigger circle, more miles.</p>
          <RoadMap d={data} />
          <div className="grid md:grid-cols-2 gap-4">
            <MilesTable title="Most miles" rows={data.teams.slice(0, 5)} testId="nfl-most-miles" />
            <MilesTable title="Fewest miles" rows={data.teams.slice(-5).reverse()} testId="nfl-fewest-miles" />
          </div>
          <p className="text-xs text-ink-500 -mt-2">
            Late UK kick-off: starts between 23:00 and 06:00 UK time.
            {none.length > 0 && ` ${none.length === 1 ? 'One team has' : `${none.length} teams have`} none this season: ${none.join(', ')}.`}
          </p>
          <section className="border border-chalk-300 rounded-lg bg-white p-4">
            <h2 className={cardHeading}>Where they used to be</h2>
            <dl className="grid sm:grid-cols-3 gap-4">
              {[
                ['Raiders', 'Oakland → Las Vegas, 2020'],
                ['Chargers', 'San Diego → Los Angeles, 2017'],
                ['Rams', 'St. Louis → Los Angeles, 2016'],
              ].map(([team, move]) => (
                <div key={team}>
                  <dt className="font-display uppercase tracking-wide text-ink-900">{team}</dt>
                  <dd className="text-sm text-ink-700">{move}</dd>
                </div>
              ))}
            </dl>
          </section>
          {data.unplaced.length > 0 && <p className="text-xs text-ink-500">{`Not yet on the map: ${data.unplaced.join(', ')}.`}</p>}
        </>
      )}
    </article>
  );
}
