// ============================================================================
// src/components/tennis/TitleRaces.tsx
//
// Phase 3, F1: timelapse races on Past seasons, with From and To seasons.
// Titles race (one frame per season, optional level filter) and Grand Slam
// race (one frame per Slam final). Uses the site's Timelapse bar race
// (Play/Pause, slider, reduced motion, "Show as a table").
// ============================================================================

import { useMemo, useState } from 'react';
import Timelapse from '../Timelapse';
import { tennisPlayerPath } from '../../lib/tennisApi';
import { RACE_LEVELS, slamRace, titlesRace, type FinalLite, type RaceLevel } from '../../lib/tennisEvents';
import type { Tour } from '../../lib/tennisStats';
import { FilterSelect, Section } from './TennisBits';

export default function TitleRaces({ tour, finals }: { tour: Tour; finals: FinalLite[] }) {
  const years = useMemo(() => [...new Set(finals.map((f) => f.year))].sort((a, b) => a - b), [finals]);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [kind, setKind] = useState<'titles' | 'slams'>('slams');
  const [level, setLevel] = useState<RaceLevel>('all');
  const y0 = from ?? years[0];
  const y1 = to ?? years[years.length - 1];
  const race = useMemo(() => (kind === 'slams' ? slamRace(finals, y0, y1) : titlesRace(finals, y0, y1, level)), [finals, kind, level, y0, y1]);
  if (!years.length) return null;
  const opts = years.map((y) => ({ value: String(y), label: String(y) }));
  const leader = [...race.series].sort((a, b) => (b.values[race.frames.length - 1] ?? 0) - (a.values[race.frames.length - 1] ?? 0))[0];
  const measure = kind === 'slams' ? 'Grand Slam titles' : level === 'all' ? 'Titles' : `${RACE_LEVELS[level]} titles`;

  return (
    <Section title="The title race, season by season" id="ts-race">
      <div className="flex flex-wrap gap-3 items-center" data-testid="tennis-race-controls">
        <div role="group" aria-label="Race" className="inline-flex rounded-md border border-chalk-300 overflow-hidden text-sm">
          {(['slams', 'titles'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
              className={`px-3 py-1 font-medium ${kind === k ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-pitch-800 hover:bg-chalk-200'}`}>
              {k === 'slams' ? 'Grand Slams' : 'All titles'}
            </button>
          ))}
        </div>
        {kind === 'titles' && (
          <FilterSelect label="Count" value={level} onChange={(v) => setLevel(v as RaceLevel)} options={Object.entries(RACE_LEVELS).map(([value, label]) => ({ value, label }))} />
        )}
        <FilterSelect label="From" value={String(y0)} onChange={(v) => { const n = Number(v); setFrom(n); if (n > y1) setTo(n); }} options={opts} testId="tennis-race-from" />
        <FilterSelect label="To" value={String(y1)} onChange={(v) => { const n = Number(v); setTo(n); if (n < y0) setFrom(n); }} options={opts} testId="tennis-race-to" />
      </div>
      {leader && (
        <p className="text-sm text-ink-700" data-testid="tennis-race-story">
          {`${measure} won from ${y0} to ${y1}: ${leader.name} leads with ${leader.values[race.frames.length - 1]}. Press Play to watch it build${kind === 'slams' ? ', one Slam at a time' : ', season by season'}.`}
        </p>
      )}
      {race.series.length > 0 ? (
        <Timelapse
          key={`${kind}-${level}-${y0}-${y1}`}
          series={race.series.map((s) => ({ id: s.id, name: s.name, values: s.values, href: tennisPlayerPath(tour, s.slug) }))}
          frameLabel={(i) => race.frames[i]}
          measure={measure}
          stepMs={kind === 'slams' ? 450 : 800}
        />
      ) : (
        <p className="text-sm text-ink-500">No titles in those seasons.</p>
      )}
    </Section>
  );
}
