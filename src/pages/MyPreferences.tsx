// ============================================================================
// src/pages/MyPreferences.tsx -- /my
//
// "Make FixtureShark yours" (Chris, 25 Oct 2026, from the approved mockup):
// pick a club, up to three more to follow, an FPL ID, an international team,
// an NFL team and tennis players or a country. Saved in this browser only
// (src/lib/myPrefs.ts); the home page then opens on them. Every picker
// searches data the site already has, so a choice always has a page behind it.
// ============================================================================

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import {
  clearPrefs, EMPTY_PREFS, MAX_FOLLOWED, MAX_TENNIS_PLAYERS, readPrefs, savePrefs,
  type MyClub, type MyPrefs, type MyTennisPlayer,
} from '../lib/myPrefs';
import {
  countryName, getIntlTeamOptions, getMyClubOptions, getNflTeamOptions, getTennisCountries, searchTennisPlayers,
  type ClubOption,
} from '../lib/myHomeApi';
import type { TennisPlayer } from '../lib/tennisStats';

const INPUT = 'w-full min-h-11 rounded-lg border border-chalk-300 bg-white px-3 text-base text-ink-900 focus:outline-none focus:ring-2 focus:ring-amber-500';
const CHIP = 'inline-flex items-center gap-2 min-h-9 rounded-full border border-chalk-300 bg-white pl-3 pr-1 text-sm';
const LINK_BTN = 'inline-flex items-center min-h-11 px-4 rounded-lg text-sm';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-chalk-300 rounded-xl p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="font-display uppercase tracking-wide text-xl text-ink-900">{title}</h2>
        {hint && <p className="text-sm text-ink-700">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function useOptions<T>(fn: () => Promise<T[]>): { list: T[]; failed: boolean } {
  const [state, setState] = useState<{ list: T[]; failed: boolean }>({ list: [], failed: false });
  useEffect(() => {
    let cancelled = false;
    fn().then((list) => { if (!cancelled) setState({ list, failed: false }); }).catch(() => { if (!cancelled) setState({ list: [], failed: true }); });
    return () => { cancelled = true; };
    // Loaded once per page visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

/** A search box over the clubs, showing up to 8 matches as buttons. */
function ClubSearch({ label, options, exclude, onPick, disabled }: {
  label: string; options: ClubOption[]; exclude: number[]; onPick: (c: ClubOption) => void; disabled?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const matches = term.length < 2 ? [] : options.filter((o) => !exclude.includes(o.teamId) && o.name.toLowerCase().includes(term)).slice(0, 8);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">{label}</label>
      <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} disabled={disabled} placeholder="Type a club name" className={INPUT} autoComplete="off" />
      {matches.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Clubs matching ${q}`}>
          {matches.map((o) => (
            <li key={o.teamId}>
              <button type="button" onClick={() => { onPick(o); setQ(''); }} className="min-h-11 rounded-lg border border-chalk-300 bg-chalk-100 hover:border-amber-500 px-3 text-sm text-left">
                <span className="font-medium">{o.name}</span> <span className="text-ink-500">{o.league}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {term.length >= 2 && matches.length === 0 && options.length > 0 && <p className="text-sm text-ink-700">No club in our leagues matches &ldquo;{q}&rdquo;.</p>}
    </div>
  );
}

function TennisSearch({ chosen, onPick }: { chosen: MyTennisPlayer[]; onPick: (p: MyTennisPlayer) => void }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ q: string; list: TennisPlayer[] }>({ q: '', list: [] });
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchTennisPlayers(term).then((list) => { if (!cancelled) setFound({ q: term, list }); }).catch(() => { if (!cancelled) setFound({ q: term, list: [] }); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [term]);
  const list = term.length >= 2 && found.q === term ? found.list.filter((p) => !chosen.some((c) => c.tour === p.tour && c.slug === p.slug)) : [];
  const full = chosen.length >= MAX_TENNIS_PLAYERS;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">Add a player{full ? ` (up to ${MAX_TENNIS_PLAYERS})` : ''}</label>
      <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} disabled={full} placeholder="Type a player's name" className={INPUT} autoComplete="off" />
      {list.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Players matching ${q}`}>
          {list.map((p) => (
            <li key={`${p.tour}/${p.slug}`}>
              <button type="button" onClick={() => { onPick({ tour: p.tour, slug: p.slug, name: p.name }); setQ(''); }} className="min-h-11 rounded-lg border border-chalk-300 bg-chalk-100 hover:border-amber-500 px-3 text-sm">
                <span className="font-medium">{p.name}</span> <span className="text-ink-500">{p.tour}{p.latest_rank ? ` · ${p.latest_rank}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ children, onRemove, removeLabel }: { children: ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <li className={CHIP}>
      {children}
      <button type="button" onClick={onRemove} aria-label={removeLabel} className="w-8 h-8 rounded-full hover:bg-chalk-200 text-ink-700">&times;</button>
    </li>
  );
}

const toClub = (o: ClubOption): MyClub => ({ teamId: o.teamId, name: o.name, slug: o.slug, league: o.league });

export default function MyPreferences() {
  useDocumentHead({
    title: 'Make FixtureShark yours',
    description: 'Choose your club, FPL ID, international and NFL teams and tennis players, and the FixtureShark home page opens on them. Saved in your browser only.',
    path: '/my',
  });
  const navigate = useNavigate();
  const [p, setP] = useState<MyPrefs>(readPrefs);
  const [saved, setSaved] = useState<string | null>(null);
  const clubs = useOptions(getMyClubOptions);
  const intl = useOptions(getIntlTeamOptions);
  const nfl = useOptions(getNflTeamOptions);
  const countries = useOptions(getTennisCountries);
  const countryLabels = useMemo(() => countries.list.map((c) => ({ code: c, name: countryName(c) })).sort((a, b) => a.name.localeCompare(b.name)), [countries.list]);
  const ids = useMemo(() => ({ fpl: 'my-fpl', intl: 'my-intl', nfl: 'my-nfl', country: 'my-country' }), []);
  const fplValid = p.fplId.trim() === '' || /^\d{1,9}$/.test(p.fplId.trim());

  const update = (patch: Partial<MyPrefs>) => { setP((cur) => ({ ...cur, ...patch })); setSaved(null); };
  // The radio's own state: "A country" is chosen before a country is.
  const [tennisMode, setTennisMode] = useState<'none' | 'country' | 'players'>(p.tennis?.mode ?? 'none');

  function save(goHome: boolean) {
    if (!fplValid) return;
    savePrefs({ ...p, fplId: p.fplId.trim() });
    if (goHome) navigate('/');
    else setSaved('Saved in this browser.');
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-widest text-amber-700">My FixtureShark</p>
        <h1 className="font-display uppercase tracking-wide text-3xl sm:text-5xl text-ink-900">Make FixtureShark yours</h1>
        <p className="text-ink-700">
          Choose what you follow and the home page opens on it: your club&rsquo;s next game with our prediction, its last result and the table around it, then your FPL team and the rest.
          Everything is kept in this browser only. There&rsquo;s no account and nothing is sent to us.
        </p>
      </div>

      <Section title="Your club" hint="The club your home page is built around.">
        {clubs.failed && <p className="text-sm text-ink-700">The club list didn&rsquo;t load. Try again shortly.</p>}
        {p.club ? (
          <ul className="flex flex-wrap gap-2" aria-label="Your club">
            <Chip onRemove={() => update({ club: null })} removeLabel={`Remove ${p.club.name}`}>
              <span className="font-medium">{p.club.name}</span>{p.club.league && <span className="text-ink-500">{p.club.league}</span>}
            </Chip>
          </ul>
        ) : (
          <ClubSearch label="Search clubs" options={clubs.list} exclude={p.followed.map((c) => c.teamId)} onPick={(o) => update({ club: toClub(o) })} />
        )}
        <p className="text-xs text-ink-500">Premier League to National League, the Scottish Premiership and Serie A.</p>
      </Section>

      <Section title="Also following" hint={`Up to ${MAX_FOLLOWED} more clubs, shown in a row under your club.`}>
        {p.followed.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Clubs you follow">
            {p.followed.map((c) => (
              <Chip key={c.teamId} onRemove={() => update({ followed: p.followed.filter((x) => x.teamId !== c.teamId) })} removeLabel={`Stop following ${c.name}`}>
                <span className="font-medium">{c.name}</span>
              </Chip>
            ))}
          </ul>
        )}
        {p.followed.length < MAX_FOLLOWED ? (
          <ClubSearch
            label="Add a club"
            options={clubs.list}
            exclude={[p.club?.teamId ?? -1, ...p.followed.map((c) => c.teamId)]}
            onPick={(o) => update({ followed: [...p.followed, toClub(o)].slice(0, MAX_FOLLOWED) })}
          />
        ) : (
          <p className="text-sm text-ink-700">That&rsquo;s the most. Remove one to add another.</p>
        )}
      </Section>

      <Section title="Fantasy Premier League" hint="Your FPL ID shows your live score during a gameweek, and the next deadline otherwise.">
        <label htmlFor={ids.fpl} className="block text-sm font-medium text-ink-900">FPL ID</label>
        <input
          id={ids.fpl} inputMode="numeric" value={p.fplId} onChange={(e) => update({ fplId: e.target.value })}
          placeholder="e.g. 1234567" className={`${INPUT} max-w-xs`} aria-invalid={!fplValid} aria-describedby={`${ids.fpl}-help`}
        />
        <p id={`${ids.fpl}-help`} className={`text-sm ${fplValid ? 'text-ink-500' : 'text-red-700'}`}>
          {fplValid ? 'The number in your team’s address on the FPL site: fantasy.premierleague.com/entry/1234567/. Shared with Rate My Team and FPL Live.' : 'An FPL ID is numbers only.'}
        </p>
      </Section>

      <Section title="International team">
        <label htmlFor={ids.intl} className="block text-sm font-medium text-ink-900">Team</label>
        <select
          id={ids.intl} className={`${INPUT} max-w-sm`} value={p.intl?.slug ?? ''}
          onChange={(e) => { const t = intl.list.find((x) => x.slug === e.target.value); update({ intl: t ? { slug: t.slug, name: t.name } : null }); }}
        >
          <option value="">None</option>
          {p.intl && !intl.list.some((t) => t.slug === p.intl?.slug) && <option value={p.intl.slug}>{p.intl.name}</option>}
          {intl.list.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
      </Section>

      <Section title="NFL team">
        <label htmlFor={ids.nfl} className="block text-sm font-medium text-ink-900">Team</label>
        <select
          id={ids.nfl} className={`${INPUT} max-w-sm`} value={p.nfl?.slug ?? ''}
          onChange={(e) => { const t = nfl.list.find((x) => x.slug === e.target.value); update({ nfl: t ? { slug: t.slug, name: t.name } : null }); }}
        >
          <option value="">None</option>
          {p.nfl && !nfl.list.some((t) => t.slug === p.nfl?.slug) && <option value={p.nfl.slug}>{p.nfl.name}</option>}
          {nfl.list.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
      </Section>

      <Section title="Tennis" hint="Follow a country's top five players, or pick up to five players yourself.">
        <fieldset className="space-y-2">
          <legend className="sr-only">What to follow in tennis</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {(['none', 'country', 'players'] as const).map((m) => (
              <label key={m} className="inline-flex items-center gap-2 min-h-11">
                <input
                  type="radio" name="tennis-mode" value={m} checked={tennisMode === m}
                  onChange={() => { setTennisMode(m); update({ tennis: m === 'players' ? { mode: 'players', players: [] } : null }); }}
                  className="w-5 h-5 accent-amber-600"
                />
                {m === 'none' ? 'None' : m === 'country' ? 'A country' : 'Players'}
              </label>
            ))}
          </div>
        </fieldset>
        {tennisMode === 'country' && (
          <div className="space-y-1">
            <label htmlFor={ids.country} className="block text-sm font-medium text-ink-900">Country</label>
            <select
              id={ids.country} className={`${INPUT} max-w-sm`} value={p.tennis?.mode === 'country' ? p.tennis.country : ''}
              onChange={(e) => update({ tennis: e.target.value ? { mode: 'country', country: e.target.value, label: countryName(e.target.value) } : null })}
            >
              <option value="">Choose a country</option>
              {countryLabels.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
        )}
        {p.tennis?.mode === 'players' && (
          <>
            {p.tennis.players.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Your tennis players">
                {p.tennis.players.map((pl) => (
                  <Chip key={`${pl.tour}/${pl.slug}`} removeLabel={`Remove ${pl.name}`}
                    onRemove={() => update({ tennis: p.tennis?.mode === 'players' ? { mode: 'players', players: p.tennis.players.filter((x) => !(x.tour === pl.tour && x.slug === pl.slug)) } : null })}>
                    <span className="font-medium">{pl.name}</span><span className="text-ink-500">{pl.tour}</span>
                  </Chip>
                ))}
              </ul>
            )}
            <TennisSearch
              chosen={p.tennis.players}
              onPick={(pl) => update({ tennis: { mode: 'players', players: [...(p.tennis?.mode === 'players' ? p.tennis.players : []), pl].slice(0, MAX_TENNIS_PLAYERS) } })}
            />
          </>
        )}
      </Section>

      <Section title="Home page">
        <label className="flex items-start gap-3 min-h-11 text-sm text-ink-900">
          <input type="checkbox" checked={p.openMyPage} onChange={(e) => update({ openMyPage: e.target.checked })} className="mt-0.5 w-5 h-5 accent-amber-600" />
          <span>Open FixtureShark on my page{p.club ? '' : ' (once you’ve chosen a club)'}. The full home page stays one click away.</span>
        </label>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => save(true)} disabled={!fplValid} className={`${LINK_BTN} bg-amber-500 hover:bg-amber-400 text-ink-900 font-semibold disabled:opacity-50`}>Save and go to my page</button>
        <button type="button" onClick={() => save(false)} disabled={!fplValid} className={`${LINK_BTN} border border-chalk-300 bg-white hover:bg-chalk-200 text-ink-900 disabled:opacity-50`}>Save</button>
        <button type="button" onClick={() => { clearPrefs(); setP(EMPTY_PREFS); setTennisMode('none'); setSaved('Everything cleared from this browser.'); }} className={`${LINK_BTN} text-ink-700 hover:bg-chalk-200`}>Clear everything</button>
        <Link to="/?view=all" className={`${LINK_BTN} text-ink-700 hover:underline`}>Back to the home page</Link>
        <p role="status" className="text-sm text-pitch-700 w-full">{saved ?? ''}</p>
      </div>
    </div>
  );
}
