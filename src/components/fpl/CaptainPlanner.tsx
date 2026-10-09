// ============================================================================
// src/components/fpl/CaptainPlanner.tsx
//
// Captain planner on Player Projections (9 Oct 2026): pick up to three
// players; for each gameweek in the page's range the armband goes to the
// one projected highest. Shows captain points, the gain over captaining
// the best single option every week, cost and average start chance.
// Pure arithmetic on the projections the page has already loaded
// (src/lib/captainPartners.ts); the method is in the article.
// ============================================================================

import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { captainPlan, type PartnerInput } from '../../lib/captainPartners';

export type PlannerPlayer = PartnerInput & { team: string };

type Props = {
  players: PlannerPlayer[];
  gws: number[];
  /** Pre-selected player ids (e.g. the two highest projected in the range). */
  defaults: number[];
};

const MAX = 3;
const fmt = (v: number) => v.toFixed(1);

export default function CaptainPlanner({ players, gws, defaults }: Props) {
  const listId = useId();
  const [chosen, setChosen] = useState<number[] | null>(null);
  const [draft, setDraft] = useState('');
  const ids = chosen ?? defaults.slice(0, MAX);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const label = (p: PlannerPlayer) => `${p.name} (${p.team})`;
  const byLabel = useMemo(() => new Map(players.map((p) => [label(p), p.id])), [players]);
  const selected = ids.map((id) => byId.get(id)).filter((p): p is PlannerPlayer => !!p);
  const plan = useMemo(() => captainPlan(selected, gws), [selected, gws]);

  const add = (value: string) => {
    const id = byLabel.get(value);
    if (id == null || ids.includes(id) || ids.length >= MAX) return;
    setChosen([...ids, id]);
    setDraft('');
  };
  const remove = (id: number) => setChosen(ids.filter((x) => x !== id));
  const bestName = plan.best ? byId.get(plan.best.id)?.name : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-chalk-300 bg-chalk-100 px-2 py-0.5 text-xs text-ink-900">
            {label(p)}
            <button type="button" onClick={() => remove(p.id)} className="text-ink-500 hover:text-loss-600" aria-label={`Remove ${p.name}`}>
              &times;
            </button>
          </span>
        ))}
        {ids.length < MAX && (
          <>
            <input
              type="text"
              list={listId}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); add(e.target.value); }}
              placeholder="Add player"
              aria-label="Add a player to the captain planner"
              className="px-2 py-1 text-xs rounded border border-chalk-300 bg-white text-ink-900 placeholder:text-ink-500 w-44"
            />
            <datalist id={listId}>
              {players.filter((p) => !ids.includes(p.id)).map((p) => <option key={p.id} value={label(p)} />)}
            </datalist>
          </>
        )}
      </div>

      {selected.length === 0 || gws.length === 0 ? (
        <p className="text-sm text-ink-500">Add a player.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="text-xs border border-chalk-300 rounded-lg overflow-hidden">
              <caption className="sr-only">Projected points by gameweek; the captain each week is marked C</caption>
              <thead className="bg-chalk-200 text-ink-500">
                <tr>
                  <th scope="col" className="text-left font-medium px-2 py-1.5">Player</th>
                  {gws.map((gw) => <th key={gw} scope="col" className="font-medium px-2 py-1.5 text-right">GW{gw}</th>)}
                  <th scope="col" className="font-medium px-2 py-1.5 text-right">Total</th>
                  <th scope="col" className="font-medium px-2 py-1.5 text-right">Armband</th>
                  <th scope="col" className="font-medium px-2 py-1.5 text-right">Start</th>
                  <th scope="col" className="font-medium px-2 py-1.5 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {selected.map((p) => (
                  <tr key={p.id} className="border-t border-chalk-200">
                    <th scope="row" className="text-left font-normal px-2 py-1.5 whitespace-nowrap">{p.name}</th>
                    {plan.weeks.map((w) => {
                      const v = p.xp.get(w.gw);
                      const cap = w.captainId === p.id;
                      return (
                        <td key={w.gw} className={`px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap ${cap ? 'bg-pitch-700 text-white font-semibold' : 'text-ink-700'}`}>
                          {v == null ? '—' : fmt(v)}{cap && <span className="ml-0.5 text-[9px] align-top">C</span>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmt(gws.reduce((t, gw) => t + (p.xp.get(gw) ?? 0), 0))}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{plan.armbands.get(p.id) ?? 0}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{plan.avgStart.get(p.id) == null ? '—' : `${Math.round(plan.avgStart.get(p.id)! * 100)}%`}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{p.price == null ? '—' : `£${p.price.toFixed(1)}m`}</td>
                  </tr>
                ))}
                {selected.length > 1 && (
                  <tr className="border-t border-chalk-300 bg-chalk-100/60">
                    <th scope="row" className="text-left font-medium px-2 py-1.5">Margin</th>
                    {plan.weeks.map((w) => (
                      <td key={w.gw} className={`px-2 py-1.5 text-right font-mono tabular-nums ${w.margin != null && w.margin < 1 ? 'text-amber-600' : 'text-ink-500'}`}>
                        {w.margin == null ? '—' : fmt(w.margin)}
                      </td>
                    ))}
                    <td colSpan={4} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div><dt className="inline text-ink-500">Captain points </dt><dd className="inline font-mono text-ink-900">{fmt(plan.captainPoints)}</dd></div>
            {selected.length > 1 && bestName && (
              <div>
                <dt className="inline text-ink-500">Gain over {bestName} every week </dt>
                <dd className="inline font-mono text-pitch-800">+{fmt(plan.gain)}</dd>
              </div>
            )}
            {plan.cost != null && <div><dt className="inline text-ink-500">Cost </dt><dd className="inline font-mono text-ink-900">&pound;{plan.cost.toFixed(1)}m</dd></div>}
          </dl>
          {selected.length > 1 && (
            <p className="text-xs text-ink-500">
              Margin: how far the captain is ahead of the next option. Under 1 point (amber) is close to a coin flip.{' '}
              <Link to="/fpl/articles/one-captain-or-two" className="text-pitch-800 underline underline-offset-2">One captain or two?</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
