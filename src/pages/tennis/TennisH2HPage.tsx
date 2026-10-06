// ============================================================================
// src/pages/tennis/TennisH2HPage.tsx
//
// /tennis/head-to-head?tour=atp&a=sinner-j&b=alcaraz-c -- two players side by
// side: the model's chance of each winning on a chosen surface (best of three
// or five) and what drives it, the chance on every surface, their record
// against each other (overall, by surface and level, finals, current run),
// every meeting with the model's pre-match call, and their ratings.
// Static at build for the default pairs (ATP and WTA world No. 1 v No. 2).
// ============================================================================

import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { FilterSelect, LevelBadge, PlayerLink, Section, TennisHeader } from '../../components/tennis/TennisBits';
import TourToggle from '../../components/tennis/TourToggle';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { TENNIS_H2H_PATH, loadTennisH2H, loadTennisPlayers, tennisH2HCanonicalPath, tennisH2HPath, type TennisH2HData } from '../../lib/tennisApi';
import { h2hSentence, h2hSummary } from '../../lib/tennisH2H';
import { BACKTEST, DEFAULT_PAIR, MODEL_SURFACES, fairOdds, predict, sideFor, type RatingRow } from '../../lib/tennisModel';
import { DATA_NOTE, parseTour, pctLabel, scoreLabel, shortDate, type TennisMatch, type TennisPlayer, type Tour } from '../../lib/tennisStats';


function PlayerPicker({ label, tour, value, players, onPick, testId }: { label: string; tour: Tour; value: string; players: TennisPlayer[]; onPick: (slug: string) => void; testId: string }) {
  const [text, setText] = useState('');
  const current = players.find((p) => p.slug === value);
  const listId = `${testId}-list`;
  return (
    <label className="text-sm flex flex-col gap-1">
      <span className="text-ink-500">{label}</span>
      <input
        list={listId}
        value={text}
        placeholder={current ? current.name : `Search ${tour} players`}
        onChange={(e) => {
          setText(e.target.value);
          const hit = players.find((p) => p.name.toLowerCase() === e.target.value.trim().toLowerCase());
          if (hit) {
            onPick(hit.slug);
            setText('');
          }
        }}
        className="border border-chalk-300 rounded px-2 py-1 bg-white w-56"
        data-testid={testId}
      />
      <datalist id={listId}>
        {players.slice(0, 600).map((p) => (
          <option key={p.player_id} value={p.name} />
        ))}
      </datalist>
    </label>
  );
}

function Chance({ nameA, nameB, pA }: { nameA: string; nameB: string; pA: number }) {
  return (
    <div className="space-y-1" data-testid="tennis-h2h-chance">
      <div className="flex justify-between text-sm font-semibold text-ink-900">
        <span>{`${nameA} ${pctLabel(pA)}`}</span>
        <span>{`${pctLabel(1 - pA)} ${nameB}`}</span>
      </div>
      <div className="flex h-4 rounded overflow-hidden" role="img" aria-label={`${nameA} ${pctLabel(pA)}, ${nameB} ${pctLabel(1 - pA)}`}>
        <div className="bg-pitch-700" style={{ width: `${pA * 100}%` }} />
        <div className="bg-amber-500 border-l-2 border-white" style={{ width: `${(1 - pA) * 100}%` }} />
      </div>
      <p className="text-xs text-ink-500 flex justify-between font-mono">
        <span>{`fair odds ${fairOdds(pA).toFixed(2)}`}</span>
        <span>{`fair odds ${fairOdds(1 - pA).toFixed(2)}`}</span>
      </p>
    </div>
  );
}

export default function TennisH2HPage({ initialData }: { initialData?: TennisH2HData }) {
  const [params] = useSearchParams();
  // /tennis/head-to-head/:tour/:a/:b, or the older ?tour=&a=&b= form.
  const path = useParams<{ tour?: string; a?: string; b?: string }>();
  const navigate = useNavigate();
  const tour = parseTour(path.tour ?? params.get('tour')) ?? initialData?.tour ?? 'ATP';
  const slugA = path.a ?? params.get('a') ?? initialData?.a.slug ?? DEFAULT_PAIR[tour][0];
  const slugB = path.b ?? params.get('b') ?? initialData?.b.slug ?? DEFAULT_PAIR[tour][1];
  const key = `${tour}/${slugA}/${slugB}`;
  const { data, failed, loading } = useKeyedFetch(
    key,
    () => loadTennisH2H(tour, slugA, slugB),
    initialData ? { key: `${initialData.tour}/${initialData.a.slug}/${initialData.b.slug}`, data: initialData } : undefined
  );
  const playersData = useKeyedFetch(tour, () => loadTennisPlayers(tour)).data;
  const sorted = useMemo(() => [...(playersData?.players ?? [])].sort((x, y) => y.recent_matches - x.recent_matches || y.won + y.lost - (x.won + x.lost)), [playersData]);
  const [surface, setSurface] = useState<string>('Hard');
  const [bestOf, setBestOf] = useState<3 | 5>(3);

  const s = useMemo(() => (data ? h2hSummary(data.meetings, data.a.player_id, data.b.player_id) : null), [data]);
  const go = (a: string, b: string) => navigate(tennisH2HPath(tour, a, b));
  const title = data ? `${data.a.name} v ${data.b.name}` : 'Head to head';
  useDocumentHead({
    title: data ? `${data.a.name} v ${data.b.name}: head to head and prediction` : `${tour} head to head`,
    description: data && s ? `${h2hSentence(data.a.name, data.b.name, s)} Who the model makes favourite on each surface.` : `Any two ${tour} players: their record against each other and who the model makes favourite on each surface.`,
    path: data ? tennisH2HCanonicalPath(tour, data.a.slug, data.b.slug) : TENNIS_H2H_PATH,
  });

  const sideA = data ? sideFor(data.ratingsA, surface) : null;
  const sideB = data ? sideFor(data.ratingsB, surface) : null;
  const pred = sideA && sideB && s ? predict(sideA, sideB, bestOf, s.a, s.b) : null;
  const bySurface = data && s
    ? MODEL_SURFACES.map((sf) => {
        const a = sideFor(data.ratingsA, sf);
        const b = sideFor(data.ratingsB, sf);
        return { surface: sf, p3: a && b ? predict(a, b, 3, s.a, s.b).pA : null, p5: a && b ? predict(a, b, 5, s.a, s.b).pA : null };
      })
    : [];

  const meetingColumns = (t: Tour, d: TennisH2HData): Column<TennisMatch>[] => [
    { key: 'date', label: 'Date', render: (m) => shortDate(m.match_date), sortValue: (m) => m.match_date, descFirst: true },
    { key: 'where', label: 'Tournament', render: (m) => <span>{m.tournament} <LevelBadge level={m.level} /></span>, sortValue: (m) => m.tournament, className: 'hidden sm:table-cell' },
    { key: 'round', label: 'Round', render: (m) => m.round.replace('The Final', 'Final'), sortValue: (m) => m.round_order },
    { key: 'surface', label: 'Surface', render: (m) => m.surface_group ?? '–', sortValue: (m) => m.surface_group, className: 'hidden md:table-cell' },
    { key: 'winner', label: 'Winner', render: (m) => <PlayerLink tour={t} slug={m.winner_slug} name={m.winner} rank={m.w_rank} />, sortValue: (m) => m.winner },
    { key: 'score', label: 'Score', render: (m) => scoreLabel(m), className: 'hidden sm:table-cell' },
    {
      key: 'model',
      label: 'Model said',
      render: (m) => {
        const p = d.modelP[m.source_key];
        if (p == null) return '–';
        return <span className={p < 0.5 ? 'text-loss-700 font-semibold' : ''} title="The model's pre-match chance for the eventual winner">{pctLabel(p)}</span>;
      },
      sortValue: (m) => d.modelP[m.source_key] ?? null,
      align: 'right',
      className: 'hidden md:table-cell',
    },
  ];

  const ratingRow = (rows: RatingRow[], sf: string) => rows.find((r) => r.surface === sf);

  return (
    <article className="space-y-6">
      <TennisHeader title={title} toggle={<TourToggle tour={tour} to={(t) => tennisH2HPath(t, ...DEFAULT_PAIR[t])} />}>
        <p className="text-ink-700 max-w-prose">Pick any two players for their record against each other and who our model makes favourite, on each surface.</p>
      </TennisHeader>
      <div className="flex flex-wrap items-end gap-4" data-testid="tennis-h2h-pickers">
        <PlayerPicker label="Player" tour={tour} value={slugA} players={sorted} onPick={(x) => go(x, slugB)} testId="tennis-h2h-a" />
        <button type="button" className="text-sm text-pitch-800 underline underline-offset-2 pb-1" onClick={() => go(slugB, slugA)}>Swap</button>
        <PlayerPicker label="Opponent" tour={tour} value={slugB} players={sorted} onPick={(x) => go(slugA, x)} testId="tennis-h2h-b" />
      </div>
      {failed && <p className="text-ink-700">This head to head is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {!loading && !failed && !data && <p className="text-ink-700">Pick two different {tour} players.</p>}
      {data && s && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="tennis-h2h-story">{h2hSentence(data.a.name, data.b.name, s)}</p>

          <Section title="Who wins?" id="h2h-model">
            <div className="flex flex-wrap gap-3">
              <FilterSelect label="Surface" value={surface} onChange={setSurface} options={MODEL_SURFACES.map((x) => ({ value: x, label: x }))} testId="tennis-h2h-surface" />
              <FilterSelect label="Match" value={String(bestOf)} onChange={(v) => setBestOf(v === '5' ? 5 : 3)} options={[{ value: '3', label: 'Best of 3' }, { value: '5', label: 'Best of 5 (men’s Slams)' }]} testId="tennis-h2h-bestof" />
            </div>
            {pred ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 border border-chalk-300 rounded-lg bg-white p-4">
                <div className="space-y-3">
                  <Chance nameA={data.a.name} nameB={data.b.name} pA={pred.pA} />
                  <p className="text-sm text-ink-700">{`On ${surface.toLowerCase()}, best of ${bestOf}, if they met now.`}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink-900 mb-1">What drives it</p>
                  <ul className="space-y-1 text-sm" data-testid="tennis-h2h-factors">
                    {pred.factors.filter((f) => Math.abs(f.logit) >= 0.005).map((f) => {
                      const width = Math.min(50, Math.abs(f.logit) * 60);
                      const forA = f.logit > 0;
                      return (
                        <li key={f.key} className="grid grid-cols-[11rem_1fr] items-center gap-2">
                          <span className="text-ink-700">{f.label}</span>
                          <span className="relative h-3 bg-chalk-200 rounded" title={`Favours ${forA ? data.a.name : data.b.name}`}>
                            <span className="absolute inset-y-0 left-1/2 w-px bg-ink-500" />
                            <span className={`absolute inset-y-0 rounded ${forA ? 'bg-pitch-700' : 'bg-amber-500'}`} style={forA ? { right: '50%', width: `${width}%` } : { left: '50%', width: `${width}%` }} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-ink-500 mt-1">{`Bars to the left favour ${data.a.name} (green), to the right ${data.b.name} (gold).`}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-500">No rating yet for one of these players.</p>
            )}
            {bySurface.length > 0 && (
              <table className="text-sm" data-testid="tennis-h2h-surfaces">
                <caption className="sr-only">{`${data.a.name}'s chance on each surface`}</caption>
                <thead>
                  <tr className="text-ink-500 text-xs">
                    <th scope="col" className="text-left font-normal pr-4">{`${data.a.name} wins`}</th>
                    {bySurface.map((r) => <th key={r.surface} scope="col" className="font-normal px-3 text-right">{r.surface}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr><th scope="row" className="text-left font-normal pr-4">Best of 3</th>{bySurface.map((r) => <td key={r.surface} className="px-3 text-right font-mono">{r.p3 == null ? '–' : pctLabel(r.p3)}</td>)}</tr>
                  <tr><th scope="row" className="text-left font-normal pr-4">Best of 5</th>{bySurface.map((r) => <td key={r.surface} className="px-3 text-right font-mono">{r.p5 == null ? '–' : pctLabel(r.p5)}</td>)}</tr>
                </tbody>
              </table>
            )}
          </Section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Section title="Their record" id="h2h-record">
              <table className="text-sm w-full" data-testid="tennis-h2h-record">
                <caption className="sr-only">Head-to-head record</caption>
                <thead><tr className="text-ink-500 text-xs"><th scope="col" className="text-left font-normal" /><th scope="col" className="text-right font-normal">{data.a.name}</th><th scope="col" className="text-right font-normal">{data.b.name}</th></tr></thead>
                <tbody>
                  <tr className="font-semibold"><th scope="row" className="text-left">All meetings</th><td className="text-right font-mono">{s.a}</td><td className="text-right font-mono">{s.b}</td></tr>
                  {s.bySurface.map((x) => <tr key={x.key}><th scope="row" className="text-left font-normal">{x.key}</th><td className="text-right font-mono">{x.a}</td><td className="text-right font-mono">{x.b}</td></tr>)}
                  {s.byLevel.map((x) => <tr key={x.key}><th scope="row" className="text-left font-normal">{x.key === 'Finals' ? 'Tour Finals' : x.key}</th><td className="text-right font-mono">{x.a}</td><td className="text-right font-mono">{x.b}</td></tr>)}
                  {s.finals.a + s.finals.b > 0 && <tr><th scope="row" className="text-left font-normal">In finals</th><td className="text-right font-mono">{s.finals.a}</td><td className="text-right font-mono">{s.finals.b}</td></tr>}
                </tbody>
              </table>
              {s.walkovers > 0 && <p className="text-xs text-ink-500">{`Plus ${s.walkovers} walkover${s.walkovers === 1 ? '' : 's'}, not counted.`}</p>}
            </Section>
            <Section title="Ratings now" id="h2h-ratings">
              <table className="text-sm w-full" data-testid="tennis-h2h-ratings">
                <caption className="sr-only">Elo ratings overall and by surface</caption>
                <thead><tr className="text-ink-500 text-xs"><th scope="col" className="text-left font-normal" /><th scope="col" className="text-right font-normal">{data.a.name}</th><th scope="col" className="text-right font-normal">{data.b.name}</th></tr></thead>
                <tbody>
                  {['All', ...MODEL_SURFACES].map((sf) => {
                    const ra = ratingRow(data.ratingsA, sf);
                    const rb = ratingRow(data.ratingsB, sf);
                    return (
                      <tr key={sf}>
                        <th scope="row" className="text-left font-normal">{sf === 'All' ? 'Overall' : sf}</th>
                        <td className="text-right font-mono">{ra ? Math.round(ra.rating) : '–'}<span className="text-xs text-ink-500">{ra ? ` (${ra.matches})` : ''}</span></td>
                        <td className="text-right font-mono">{rb ? Math.round(rb.rating) : '–'}<span className="text-xs text-ink-500">{rb ? ` (${rb.matches})` : ''}</span></td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th scope="row" className="text-left font-normal">Ranking at last match</th>
                    <td className="text-right font-mono">{ratingRow(data.ratingsA, 'All')?.latest_rank ?? '–'}</td>
                    <td className="text-right font-mono">{ratingRow(data.ratingsB, 'All')?.latest_rank ?? '–'}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-ink-500">Elo ratings from every tour-level match (matches in brackets). 1500 is a newcomer; the very best are above 2200.</p>
            </Section>
          </div>

          <Section title={`Every meeting (${s.meetings.length})`} id="h2h-meetings">
            <SortableTable columns={meetingColumns(tour, data)} rows={s.meetings} rowKey={(m) => m.source_key} initialSort={{ key: 'date', dir: 'desc' }} testId="tennis-h2h-meetings" empty="They haven't met at tour level." />
            <p className="text-xs text-ink-500">"Model said" is the chance the model gave the eventual winner before the match; red marks an upset.</p>
          </Section>

          <p className="text-xs text-ink-500" data-testid="tennis-h2h-model-note">
            {`How the model works: Elo ratings overall and on each surface, built from every tour-level match since ${tour === 'ATP' ? 2000 : 2007}, plus ranking, experience, best of five and previous meetings. Tested on ${BACKTEST.matches.toLocaleString('en-GB')} matches since ${BACKTEST.from}: it called ${(BACKTEST.modelRight * 100).toFixed(1)}% right, against ${(BACKTEST.marketRight * 100).toFixed(1)}% for the bookmakers' favourite, and when it says 70% the favourite has won about 70% of the time. It doesn't know about injuries or who's playing well this week. ${DATA_NOTE}`}
          </p>
        </>
      )}
    </article>
  );
}
