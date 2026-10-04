// ============================================================================
// src/pages/nfl/NflPickMyTeamPage.tsx
//
// /nfl/pick-my-team -- four questions for a UK fan without a team: winners or
// underdogs, early or late kick-offs, London games, weather. Matched on last
// season's record, this season's UK kick-off times, London games since 2007
// and whether the team plays outdoors in the cold (src/lib/nflPlaces.ts).
// The answers stay in the page; nothing is stored.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { NFL_HUB_PATH, NFL_PICK_PATH, nflTeamPath } from '../../lib/nflApi';
import { PICKER_QUESTIONS, loadPicker, pickReasons, rankTeams, type PickerAnswers, type PickerData } from '../../lib/nflPlaces';


export default function NflPickMyTeamPage({ initialData }: { initialData?: PickerData } = {}) {
  const { data, failed, loading } = useKeyedFetch('picker', loadPicker, initialData ? { key: 'picker', data: initialData } : undefined);
  const [answers, setAnswers] = useState<PickerAnswers>({});
  useDocumentHead({
    title: 'Which NFL team should I support? Pick My Team',
    description: 'Four questions for UK fans: winners or underdogs, kick-off times, London games and weather. Matched to all 32 NFL teams on real data.',
    path: NFL_PICK_PATH,
  });
  const answered = PICKER_QUESTIONS.filter((q) => answers[q.id]).length;
  const done = answered === PICKER_QUESTIONS.length;
  const ranked = useMemo(() => (data && done ? rankTeams(data.teams, answers) : []), [data, done, answers]);
  const top = ranked[0]?.team;

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/discover" className="hover:underline">Discover</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Pick My Team</h1>
      </header>
      <p className="text-ink-900 max-w-prose">
        Four questions, 32 teams. Matched on last season&rsquo;s record, this season&rsquo;s UK kick-off times, London games and the weather.
      </p>
      {failed && <p className="text-ink-700">The team picker is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {data && (
        <div className="flex flex-wrap gap-6 items-start">
          <div className="space-y-4" style={{ flex: '999 1 520px', minWidth: 0 }}>
            {PICKER_QUESTIONS.map((q) => (
              <fieldset key={q.id} className="border border-chalk-300 rounded-lg bg-white p-4">
                <legend className="sr-only">{q.title}</legend>
                <p className="font-display uppercase tracking-wide text-lg text-ink-900" aria-hidden="true">{q.title}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {q.options.map(([value, label]) => {
                    const on = answers[q.id] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: value }))}
                        className={`min-h-11 px-4 py-2 rounded text-sm border transition-colors ${on ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'bg-white text-ink-900 border-chalk-300 hover:border-pitch-700'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <aside aria-live="polite" aria-label="Your team" className="rounded-lg bg-pitch-950 text-chalk-100 p-5 space-y-4" style={{ flex: '1 1 300px', minWidth: 0 }} data-testid="nfl-pick-result">
            <p className="font-mono text-xs tracking-widest text-amber-400">YOUR TEAM</p>
            {top ? (
              <>
                <h2 className="font-display uppercase tracking-wide text-3xl leading-tight">{top.name}</h2>
                <ul className="space-y-2 text-sm">
                  {pickReasons(top, answers, data.season).map((r) => (
                    <li key={r} className="pl-3 border-l-2 border-pitch-600">{r}</li>
                  ))}
                </ul>
                <Link to={nflTeamPath(top.slug)} className="inline-block bg-amber-500 text-pitch-950 font-semibold px-4 py-2.5 rounded hover:bg-amber-400">
                  {`${top.name}: season and history`}
                </Link>
                <div className="border-t border-pitch-700 pt-3 text-sm">
                  <p className="text-chalk-300 text-xs">Close behind</p>
                  <p>
                    {ranked.slice(1, 3).map((r, i) => (
                      <span key={r.team.franchise}>
                        {i > 0 && ' and '}
                        <Link to={nflTeamPath(r.team.slug)} className="underline underline-offset-2">{r.team.name}</Link>
                      </span>
                    ))}
                  </p>
                </div>
                <button type="button" onClick={() => setAnswers({})} className="min-h-11 px-4 py-2 rounded border border-amber-400 text-amber-400 text-sm hover:bg-pitch-900">
                  Start again
                </button>
              </>
            ) : (
              <p className="text-chalk-300">{`${PICKER_QUESTIONS.length - answered} question${PICKER_QUESTIONS.length - answered === 1 ? '' : 's'} to go.`}</p>
            )}
          </aside>
        </div>
      )}
    </article>
  );
}
