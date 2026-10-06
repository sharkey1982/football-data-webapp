// Unit tests for squadWatch (src/lib/intlStats.ts): squads grouped by intro,
// caps gained while a squad stood, players leaving, gaining and losing a place.
import { describe, it, expect } from 'vitest';
import { squadWatch, type SnapshotPlayer, type SquadVersion } from '../lib/intlStats';

const v = (version_at: string, intro_signature: string): SquadVersion => ({ team: 'England', slug: 'england', version_at, intro: intro_signature, intro_signature, players: 3 });
const p = (version_at: string, key: string, list: 'current' | 'recent', caps: number, extra: Partial<SnapshotPlayer> = {}): SnapshotPlayer => ({
  team: 'England', version_at, list, player_key: key, player: key, wiki_title: key, position: 'MF', number: null, caps, goals: 0, club: null, club_slug: null,
  status: null, latest_date: null, latest_text: null, ...extra,
});

describe('squadWatch', () => {
  const versions = [v('2026-10-06', 'oct'), v('2026-10-09', 'oct'), v('2026-11-06', 'nov'), v('2026-11-19', 'nov')];
  const players = [
    // October squad: A and B; B played twice, A not at all.
    p('2026-10-06', 'A', 'current', 10), p('2026-10-06', 'B', 'current', 5), p('2026-10-06', 'C', 'recent', 30, { status: 'INJ', latest_date: '2026-09-01' }),
    p('2026-10-09', 'A', 'current', 10), p('2026-10-09', 'B', 'current', 7), p('2026-10-09', 'C', 'recent', 30, { status: 'INJ', latest_date: '2026-09-01' }),
    // November squad: C back from injury, B dropped; A withdraws injured mid-window; C plays once.
    p('2026-11-06', 'A', 'current', 10), p('2026-11-06', 'C', 'current', 30), p('2026-11-06', 'B', 'recent', 7, { latest_date: '2026-10-09' }),
    p('2026-11-19', 'A', 'recent', 10, { status: 'INJ', latest_date: '2026-11-15' }), p('2026-11-19', 'C', 'current', 31), p('2026-11-19', 'B', 'recent', 7, { latest_date: '2026-10-09' }),
  ];
  const w = squadWatch(versions, players);

  it('groups versions into squads by announcement', () => {
    expect(w.squads.map((s) => [s.from, s.to])).toEqual([['2026-10-06', '2026-10-09'], ['2026-11-06', '2026-11-19']]);
  });

  it('shows caps gained, players leaving and injured call-ups', () => {
    const row = (k: string) => w.rows.find((r) => r.key === k)!;
    expect(row('B').cells).toEqual([{ kind: 'in', played: 2, number: null }, null]);
    expect(row('A').cells).toEqual([{ kind: 'in', played: 0, number: null }, { kind: 'left', status: 'INJ' }]);
    expect(row('C').cells).toEqual([{ kind: 'out', status: 'INJ' }, { kind: 'in', played: 1, number: null }]);
  });

  it('lists who gained and lost a place, who played and who is missing out', () => {
    expect(w.gaining.map((r) => r.key)).toEqual(['C']);
    expect(w.losing.map((r) => r.key).sort()).toEqual(['A', 'B']);
    expect(w.played.map((r) => r.key)).toEqual(['C']);
    expect(w.missing.map((r) => r.key)).toEqual(['A']);
  });

  it('with one snapshot, caps gained are unknown rather than zero', () => {
    const one = squadWatch([v('2026-10-06', 'oct')], players.filter((x) => x.version_at === '2026-10-06'));
    expect(one.rows.find((r) => r.key === 'A')!.cells[0]).toEqual({ kind: 'in', played: null, number: null });
    expect(one.unused).toEqual([]);
  });
});
