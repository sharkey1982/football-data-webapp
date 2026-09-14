import { useState } from 'react';
import type { FplFixtureProjectionTeam } from '../../lib/fplApi';
import FormationPitch from './FormationPitch';
import PlayerProjectionTable from './PlayerProjectionTable';

function pct(v: number | null): string {
  return v === null ? '\u2014' : `${Math.round(v * 100)}%`;
}

export default function TeamProjectionPanel({ team }: { team: FplFixtureProjectionTeam }) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [view, setView] = useState<'pitch' | 'table'>('pitch');

  const toggleSelect = (fplPlayerId: number) => {
    setSelectedPlayerId((prev) => (prev === fplPlayerId ? null : fplPlayerId));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 bg-white border border-chalk-300 rounded-lg p-3">
        <div>
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
            {team.team_name}
            <span className="ml-2 text-xs font-sans font-normal text-ink-500 uppercase tracking-normal">
              {team.is_home ? 'Home' : 'Away'}
            </span>
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-500 font-mono mt-1">
            <span>
              Formation: <strong className="text-ink-900">{team.formation ?? 'Unknown'}</strong>
              {team.formation_source_count !== null && (
                <span className="text-ink-500"> ({team.formation_source_count} source{team.formation_source_count === 1 ? '' : 's'})</span>
              )}
            </span>
            <span>
              xG: <strong className="text-ink-900">{team.team_expected_goals?.toFixed(2) ?? '\u2014'}</strong>
            </span>
            <span>
              Clean sheet: <strong className="text-ink-900">{pct(team.clean_sheet_probability)}</strong>
            </span>
          </div>
        </div>

        <div className="flex rounded-md overflow-hidden border border-chalk-300 sm:hidden">
          {(['pitch', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={[
                'px-3 py-1 text-xs font-medium capitalize',
                view === v ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700',
              ].join(' ')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-[220px_minmax(0,1fr)] gap-3 items-start">
        <div className={view === 'pitch' ? 'block' : 'hidden sm:block'}>
          <FormationPitch
            players={team.players}
            formation={team.formation}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={toggleSelect}
          />
        </div>
        <div className={['min-w-0', view === 'table' ? 'block' : 'hidden sm:block'].join(' ')}>
          <PlayerProjectionTable players={team.players} selectedPlayerId={selectedPlayerId} onSelectPlayer={toggleSelect} />
        </div>
      </div>
    </div>
  );
}
