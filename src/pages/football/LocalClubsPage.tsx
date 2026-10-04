// ============================================================================
// src/pages/football/LocalClubsPage.tsx
//
// /football/local-clubs -- Your Local Clubs. Put in a postcode: your nearest
// club, the nearest in each division from the Premier League to the National
// League, and a map. With no postcode it shows every club on the map, and
// that is what the static build renders.
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
  MAP_H,
  MAP_W,
  loadLocalClubs,
  localSentence,
  lookupPostcode,
  milesText,
  nearestByLevel,
  nearestClubs,
  toMap,
  type LocalClubsData,
  type Place,
} from '../../lib/localClubs';

const cardHeading = 'font-display uppercase text-sm tracking-wide text-ink-500 mb-3';
const teamPath = (slug: string) => `/football/teams/${slug}`;

type View = { k: number; tx: number; ty: number; at: (p: { x: number; y: number }) => { x: number; y: number } };

function zoomTo(centre: { x: number; y: number } | null, show: { x: number; y: number }[]): View {
  if (!centre) return { k: 1, tx: 0, ty: 0, at: (p) => ({ x: p.x, y: p.y }) };
  const far = Math.max(20, ...show.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)));
  const k = Math.min(6, Math.max(1, (Math.min(MAP_W, MAP_H) / 2 - 50) / far));
  const tx = MAP_W / 2 - centre.x * k;
  const ty = MAP_H / 2 - centre.y * k;
  return { k, tx, ty, at: (p) => ({ x: p.x * k + tx, y: p.y * k + ty }) };
}

/** Labels to the right of their marker (left near the right edge), nudged
 * down where they would overlap one already placed. */
function placeLabels(items: { teamId: number; name: string; x: number; y: number }[]) {
  const placed: { teamId: number; name: string; x: number; y: number; right: boolean }[] = [];
  for (const it of [...items].sort((a, b) => a.y - b.y)) {
    const right = it.x > MAP_W - 160;
    let y = it.y;
    for (const p of placed) if (p.right === right && Math.abs(p.x - it.x) < 140 && Math.abs(p.y - y) < 18) y = p.y + 18;
    placed.push({ ...it, y, right });
  }
  return placed;
}

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
  const you = place ? toMap(place) : null;
  // With a postcode, zoom the map in on it far enough to show the nearest
  // club in every division; the base map scales, the markers stay their size.
  const view = useMemo(() => zoomTo(you, byLevel.map((c) => ({ x: c.x, y: c.y }))), [you?.x, you?.y, byLevel]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useMemo(() => placeLabels(byLevel.map((c) => ({ teamId: c.teamId, name: c.name, ...view.at(c) }))), [byLevel, view]);

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
            placeholder="e.g. SS1 3JB"
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
      {status === 'unknown' && <p className="text-sm text-loss-600" role="alert">That postcode wasn&rsquo;t found. Try the full postcode, or just the first half (e.g. SS1).</p>}
      {status === 'error' && <p className="text-sm text-loss-600" role="alert">The postcode lookup isn&rsquo;t answering right now. Try again in a moment.</p>}
      {failed && <p className="text-ink-700">Club locations are unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <div className="flex flex-wrap gap-6 items-start">
          <section aria-label="Map of clubs" className="border border-chalk-300 rounded-lg bg-white p-3" style={{ flex: '999 1 520px', minWidth: 0 }}>
            <div className="overflow-x-auto">
              <div className="relative mx-auto overflow-hidden" style={{ width: MAP_W, height: MAP_H }}>
                <img
                  src="/maps/england-wales.svg"
                  alt=""
                  width={MAP_W}
                  height={MAP_H}
                  className="absolute left-0 top-0 origin-top-left"
                  style={{ transform: view.k === 1 ? undefined : `translate(${view.tx}px, ${view.ty}px) scale(${view.k})` }}
                />
                {data.clubs.map((c) => {
                  const league = c.tier <= 4;
                  const size = league ? 10 : 9;
                  const at = view.at(c);
                  return (
                    <Link
                      key={c.teamId}
                      to={teamPath(c.slug)}
                      title={`${c.name} · ${c.ground} · ${c.league}`}
                      aria-label={`${c.name}, ${c.league}`}
                      className="absolute"
                      style={{
                        left: at.x - size / 2,
                        top: at.y - size / 2,
                        width: size,
                        height: size,
                        borderRadius: league ? '50%' : 0,
                        transform: league ? undefined : 'rotate(45deg)',
                        background: league ? '#1b4332' : '#2b4f74',
                        boxShadow: '0 0 0 1.5px #ffffff',
                      }}
                    />
                  );
                })}
                {you && (
                  <span
                    title={`You: ${place!.label}`}
                    className="absolute rounded-full pointer-events-none"
                    style={{ left: view.at(you).x - 6, top: view.at(you).y - 6, width: 12, height: 12, background: '#d4a03c', boxShadow: '0 0 0 2px #0d2018' }}
                  />
                )}
                {labels.map((l) => (
                  <span
                    key={`l-${l.teamId}`}
                    className="absolute text-xs font-semibold text-ink-900 bg-white/90 px-1 rounded-sm whitespace-nowrap pointer-events-none"
                    style={l.right ? { right: MAP_W - l.x + 8, top: l.y - 9 } : { left: l.x + 8, top: l.y - 9 }}
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-ink-700 mt-2">
              <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-pitch-800" />Premier League to League Two</span>
              <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rotate-45" style={{ background: '#2b4f74' }} />National League</span>
              {place && <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />You</span>}
            </div>
          </section>

          <aside className="space-y-4" style={{ flex: '1 1 300px', minWidth: 0 }} aria-live="polite">
            {place && nearby[0] ? (
              <>
                <div className="rounded-lg bg-pitch-950 text-chalk-100 p-5 space-y-2" data-testid="local-nearest">
                  <p className="font-mono text-xs tracking-widest text-amber-400">YOUR NEAREST CLUB</p>
                  <h2 className="font-display uppercase tracking-wide text-3xl leading-tight">{nearby[0].name}</h2>
                  <p className="text-sm text-chalk-300">{`${nearby[0].ground} · ${milesText(nearby[0].miles)} · ${nearby[0].league}`}</p>
                  <Link to={teamPath(nearby[0].slug)} className="inline-block mt-2 bg-amber-500 text-pitch-950 font-semibold px-4 py-2.5 rounded hover:bg-amber-400">
                    Fixtures, form and history
                  </Link>
                </div>
                <div className="border border-chalk-300 rounded-lg bg-white p-4">
                  <h2 className={cardHeading}>Nearest in each division</h2>
                  <table className="w-full text-sm" data-testid="local-by-level">
                    <tbody>
                      {byLevel.map((c) => (
                        <tr key={c.teamId} className="border-t border-chalk-200 first:border-t-0">
                          <td className="py-1.5 pr-2 text-xs text-ink-500 whitespace-nowrap">{c.league}</td>
                          <td className="py-1.5"><Link to={teamPath(c.slug)} className="hover:underline">{c.name}</Link></td>
                          <td className="py-1.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">{milesText(c.miles)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-ink-700" data-testid="local-sentence">{localSentence(place, nearby)}</p>
                <p className="text-xs text-ink-500">Straight-line miles from the centre of your postcode to each ground.</p>
              </>
            ) : (
              <div className="border border-chalk-300 rounded-lg bg-white p-4 text-sm text-ink-700 space-y-2">
                <p>{`${data.clubs.length} clubs on the map: every club from the Premier League to the National League in ${data.season}/${String((data.season + 1) % 100).padStart(2, '0')}.`}</p>
                <p>Put in a postcode to see the nearest. Tap a club for its fixtures, form and history.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </article>
  );
}
