// ============================================================================
// src/pages/fpl/ScoringRulesPage.tsx
//
// Reference page for how FPL points are actually scored. Reads directly
// from fpl_scoring_rules (the official rule set already stored in the DB)
// -- no rules duplicated or hand-typed here. Filterable by player: picking
// a player narrows the table to the rules that actually apply to them
// (universal rules plus their own position's specific ones), since e.g. a
// goalkeeper's clean sheet points and a forward's don't match.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { getFplScoringRules, getFplPlayerListLite, type FplScoringRule, type FplPlayerLite } from '../../lib/fplScoringRulesApi';
import { getErrorMessage } from '../../lib/errorMessage';
import type { FplElementType } from '../../types/database';

// fpl_scoring_rules' own position codes -- distinct from this app's usual
// display labels (FPL_POSITION_LABEL uses 'GKP', the rules table uses 'GK').
const ELEMENT_TYPE_TO_RULE_POSITION: Record<FplElementType, FplScoringRule['player_position']> = {
  1: 'GK',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};
const POSITION_DISPLAY: Record<NonNullable<FplScoringRule['player_position']>, string> = {
  GK: 'Goalkeepers',
  DEF: 'Defenders',
  MID: 'Midfielders',
  FWD: 'Forwards',
};

const RULE_GROUP: Record<string, string> = {
  appearance_under_60: 'Appearance',
  appearance_60_plus: 'Appearance',
  goal: 'Attacking',
  assist: 'Attacking',
  clean_sheet: 'Defensive',
  defensive_contribution: 'Defensive',
  goals_conceded: 'Defensive',
  save: 'Goalkeeping',
  penalty_save: 'Goalkeeping',
  penalty_miss: 'Discipline',
  yellow_card: 'Discipline',
  red_card: 'Discipline',
  own_goal: 'Discipline',
  bonus_first: 'Bonus',
  bonus_second: 'Bonus',
  bonus_third: 'Bonus',
};
const GROUP_ORDER = ['Appearance', 'Attacking', 'Defensive', 'Goalkeeping', 'Discipline', 'Bonus'];

function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : `${points}`;
}

export default function ScoringRulesPage() {
  const [rules, setRules] = useState<FplScoringRule[]>([]);
  const [players, setPlayers] = useState<FplPlayerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<FplPlayerLite | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getFplScoringRules(), getFplPlayerListLite()])
      .then(([r, p]) => {
        if (cancelled) return;
        setRules(r);
        setPlayers(p);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load scoring rules'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    if (query.trim().length < 1) return [];
    const q = query.trim().toLowerCase();
    return players.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, players]);

  const selectedRulePosition = selectedPlayer ? ELEMENT_TYPE_TO_RULE_POSITION[selectedPlayer.position] : null;
  const visibleRules = useMemo(() => {
    if (!selectedRulePosition) return rules;
    return rules.filter((r) => r.player_position === null || r.player_position === selectedRulePosition);
  }, [rules, selectedRulePosition]);

  const grouped = useMemo(() => {
    const map = new Map<string, FplScoringRule[]>();
    for (const r of visibleRules) {
      const group = RULE_GROUP[r.rule_code] ?? 'Other';
      map.set(group, [...(map.get(group) ?? []), r]);
    }
    return map;
  }, [visibleRules]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Scoring Rules</h1>
        <p className="text-sm text-ink-500 mt-1">
          How FPL points are actually awarded. Search a player to see just the rules that apply to their position.
        </p>
      </div>

      <div className="relative max-w-sm">
        <input
          type="text"
          value={selectedPlayer ? selectedPlayer.name : query}
          onChange={(e) => {
            setSelectedPlayer(null);
            setQuery(e.target.value);
          }}
          placeholder="Search a player (e.g. Haaland)&hellip;"
          className="w-full border border-chalk-300 rounded-lg px-3 py-2 text-sm"
        />
        {selectedPlayer && (
          <button
            onClick={() => {
              setSelectedPlayer(null);
              setQuery('');
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-500 hover:text-ink-900"
          >
            Clear
          </button>
        )}
        {!selectedPlayer && matches.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-chalk-300 rounded-lg shadow-lg overflow-hidden">
            {matches.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedPlayer(p);
                  setQuery('');
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-chalk-100"
              >
                {p.name} <span className="text-ink-500 font-mono text-xs">{ELEMENT_TYPE_TO_RULE_POSITION[p.position]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedRulePosition && (
        <p className="text-sm text-ink-700">
          Showing rules for <span className="font-semibold">{POSITION_DISPLAY[selectedRulePosition]}</span> &mdash; universal rules plus this position&rsquo;s
          own. Position-specific rules for other positions are hidden.
        </p>
      )}

      {loading && <p className="text-ink-500 font-mono text-sm">{'Loading\u2026'}</p>}
      {error && <p className="text-loss-700 text-sm">{error}</p>}

      {!loading && !error && (
        <div className="space-y-4">
          {GROUP_ORDER.filter((g) => grouped.has(g)).map((group) => (
            <div key={group} className="bg-white border border-chalk-300 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-chalk-200 bg-chalk-100 text-xs font-medium text-ink-500 uppercase tracking-wide">
                {group}
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {grouped.get(group)!.map((r) => (
                    <tr key={r.rule_id} className="border-b border-chalk-200 last:border-b-0">
                      <td className="px-3 py-2 text-ink-900">
                        {r.notes ?? r.rule_code}
                        {r.player_position && (
                          <span className="ml-2 text-xs font-mono text-ink-500 uppercase">({r.player_position})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap w-20 text-pitch-800">
                        {formatPoints(r.points)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
