// ============================================================================
// src/pages/football/LocalClubsPage.tsx
//
// /football/local-clubs -- Your Local Clubs. Put in a postcode: your nearest
// club and the nearest in each division from the Premier League to the
// National League, as a table (Chris, 5 Oct: the table is the useful part; the
// map was dropped). With no postcode it lists every club by division with its
// ground, and that is what the static build renders.
//
// The postcode is looked up in the browser on postcodes.io and kept in the
// page only; nothing about it is stored or sent to FixtureShark.
// ============================================================================

import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import {
  LOCAL_CLUBS_PATH,
  loadLocalClubs,
  localSentence,
  lookupPostcode,
  milesText,
  nearestByLevel,
  nearestClubs,
  type LocalClub,
  type LocalClubsData,
  type Place,
} from '../../lib/localClubs';

const cardHeading = 'font-display uppercase text-sm tracking-wide text-ink-500 mb-3';
const teamPath = (slug: string) => `/football/teams/${slug}`;

export default function LocalClubsPage({ initialData }: { initialData?: LocalClubsData } = {}) {
  const { data, failed, loading } = useKeyedFetch('local-clubs', loadLocalClubs, initialData ? { key: 'local-clubs', data: initialData } : undefined);
  const [postcode, setPostcode] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [status, setStatus] = useState<'idle' | 'looking' | 'unknown' | 'error'>('idle');

  useDocumentHead({
    title: 'Your Local Clubs: nearest football club to your postcode',
    description: 'Put in your postcode to find your nearest football club and the nearest in every division from the Premier League to the National League.',
    path: LOCAL_CLUBS_PATH,
  });

  const nearby = useMemo(() => (data && place ? nearestClubs(data.clubs, place) : []), [data, place]);
  const byLevel = useMemo(() => nearestByLevel(nearby), [nearby]);
  const divisions = useMemo(() => {
    const out = new Map<string, LocalClub[]>();
    for (const c of data?.clubs ?? []) out.set(c.league, [...(out.get(c.league) ?? []), c]);
    return [...out.entries()];
  }, [data]);

  async function find(e: FormEvent) {
    e.preventDefault();
    if (!postcode.trim()) return;
    setStatus('looking');
    try {
      const p = await lookupPostcode(postcode);
      if (!p) {
        setPlace(null);
        setStatus('unknown');
        return;
      }
      setPlace(p);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/football" className="hover:underline">Football</Link> &middot; <Link to="/football/discover" className="hover:underline">Discover</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Your Local Clubs</h1>
      </header>
      <p className="text-ink-900 max-w-prose">
        Your nearest club at every level from the Premier League to the National League. Your postcode is looked up in your browser and isn&rsquo;t stored.
      </p>

      <form onSubmit={find} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="postcode" className="text-sm font-medium text-ink-900">Postcode</label>
          <input
            id="postcode"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value)}
            autoComplete="postal-code"
            placeholder="e.g. N7 7AJ"
            className="min-h-11 w-48 px-3 py-2 border border-chalk-300 rounded bg-white uppercase"
          />
        </div>
        <button type="submit" disabled={status === 'looking'} className="min-h-11 px-4 py-2 rounded bg-amber-500 text-pitch-950 font-semibold hover:bg-amber-400 disabled:opacity-60">
          {status === 'looking' ? 'Finding…' : 'Find clubs'}
        </button>
        {place && (
          <button type="button" onClick={() => { setPlace(null); setPostcode(''); }} className="min-h-11 px-3 py-2 text-sm text-pitch-800 underline underline-offset-2">
            Clear
          </button>
        )}
      </form>
      {status === 'unknown' && <p className="text-sm text-loss-600" role="alert">That postcode wasn&rsquo;t found. Try the full postcode, or just the first half (e.g. N7).</p>}
      {status === 'error' && <p className="text-sm text-loss-600" role="alert">The postcode lookup isn&rsquo;t answering right now. Try again in a moment.</p>}
      {failed && <p className="text-ink-700">Club locations are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && place && nearby[0] && (
        <div className="space-y-4" aria-live="polite">
          <div className="border border-chalk-300 rounded-lg bg-white p-4">
            <h2 className={cardHeading}>{`Nearest in each division to ${place.label}`}</h2>
            <table className="w-full text-sm" data-testid="local-by-level">
              <thead className="text-ink-500">
                <tr>
                  <th scope="col" className="text-left font-medium text-xs py-1">Division</th>
                  <th scope="col" className="text-left font-medium text-xs py-1">Club</th>
                  <th scope="col" className="text-left font-medium text-xs py-1 hidden sm:table-cell">Ground</th>
                  <th scope="col" className="text-right font-medium text-xs py-1">Distance</th>
                </tr>
              </thead>
              <tbody>
                {byLevel.map((c) => (
                  <tr key={c.teamId} className="border-t border-chalk-200">
                    <td className="py-2 pr-2 text-xs text-ink-500 whitespace-nowrap">{c.league}</td>
                    <td className="py-2 font-medium"><Link to={teamPath(c.slug)} className="hover:underline">{c.name}</Link></td>
                    <td className="py-2 text-ink-700 hidden sm:table-cell">{c.ground}</td>
                    <td className="py-2 text-right font-mono text-xs tabular-nums whitespace-nowrap">{milesText(c.miles)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-ink-900 max-w-prose" data-testid="local-sentence">{localSentence(place, nearby)}</p>
          <div className="border border-chalk-300 rounded-lg bg-white p-4" data-testid="local-nearest">
            <h2 className={cardHeading}>Closest ten, any division</h2>
            <ol className="text-sm divide-y divide-chalk-200">
              {nearby.slice(0, 10).map((c) => (
                <li key={c.teamId} className="py-1.5 flex justify-between gap-3">
                  <span>
                    <Link to={teamPath(c.slug)} className="hover:underline">{c.name}</Link>
                    <span className="text-xs text-ink-500">{` · ${c.league}`}</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums whitespace-nowrap">{milesText(c.miles)}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-ink-500">Straight-line miles from the centre of your postcode to each ground.</p>
        </div>
      )}

      {data && !place && (
        <section aria-label="Every club by division" className="space-y-4" data-testid="local-directory">
          <p className="text-sm text-ink-700">{`Every club from the Premier League to the National League in ${data.season}/${String((data.season + 1) % 100).padStart(2, '0')}, ${data.clubs.length} in all, with its ground.`}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {divisions.map(([league, clubs]) => (
              <div key={league} className="border border-chalk-300 rounded-lg bg-white p-4">
                <h2 className={cardHeading}>{league}</h2>
                <ul className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  {clubs.map((c) => (
                    <li key={c.teamId} className="py-0.5">
                      <Link to={teamPath(c.slug)} className="hover:underline">{c.name}</Link>
                      <span className="text-xs text-ink-500">{` · ${c.ground}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
