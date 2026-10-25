import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPrefs, dismissStrip, EMPTY_PREFS, hasAnyPrefs, opensMyPage, parsePrefs, readPrefs, savePrefs, stripDismissed, type MyPrefs,
} from '../lib/myPrefs';

const club = (teamId: number, name = `Club ${teamId}`) => ({ teamId, name, slug: `club-${teamId}` });

describe('My FixtureShark preferences', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty, and opening on my page needs a club', () => {
    const p = readPrefs();
    expect(p).toEqual(EMPTY_PREFS);
    expect(hasAnyPrefs(p)).toBe(false);
    expect(opensMyPage(p)).toBe(false);
    expect(opensMyPage({ ...p, club: club(70) })).toBe(true);
    expect(opensMyPage({ ...p, club: club(70), openMyPage: false })).toBe(false);
  });

  it('saves and reads back, keeping the FPL ID under its existing key', () => {
    const p: MyPrefs = {
      ...EMPTY_PREFS,
      club: club(70, 'Southend United'),
      followed: [club(1), club(2)],
      fplId: ' 1234567 ',
      intl: { slug: 'england', name: 'England' },
      nfl: { slug: 'kansas-city-chiefs', name: 'Kansas City Chiefs' },
      tennis: { mode: 'players', players: [{ tour: 'ATP', slug: 'jack-draper', name: 'Jack Draper' }] },
    };
    savePrefs(p);
    expect(localStorage.getItem('fixtureshark.fplId')).toBe('1234567');
    expect(localStorage.getItem('fixtureshark.myPrefs')).not.toContain('1234567');
    expect(readPrefs()).toEqual({ ...p, fplId: '1234567' });
  });

  it('reads an FPL ID saved by Rate My Team before preferences existed', () => {
    localStorage.setItem('fixtureshark.fplId', '42');
    expect(readPrefs().fplId).toBe('42');
    expect(hasAnyPrefs(readPrefs())).toBe(true);
  });

  it('drops malformed values, extra follows and a followed copy of the main club', () => {
    const raw = JSON.stringify({
      club: club(70),
      followed: [club(70), club(1), { teamId: 'x' }, club(2), club(3), club(4)],
      intl: { slug: 5 },
      tennis: { mode: 'country', country: 'gbr' },
      openMyPage: 'yes',
    });
    const p = parsePrefs(raw);
    expect(p.followed.map((c) => c.teamId)).toEqual([1, 2, 3]);
    expect(p.intl).toBeNull();
    expect(p.tennis).toBeNull();
    expect(p.openMyPage).toBe(true);
    expect(parsePrefs('{not json')).toEqual(EMPTY_PREFS);
  });

  it('clear removes everything, the FPL ID included', () => {
    savePrefs({ ...EMPTY_PREFS, club: club(70), fplId: '99' });
    clearPrefs();
    expect(readPrefs()).toEqual(EMPTY_PREFS);
    expect(localStorage.getItem('fixtureshark.fplId')).toBeNull();
  });

  it('remembers that the strip was dismissed', () => {
    expect(stripDismissed()).toBe(false);
    dismissStrip();
    expect(stripDismissed()).toBe(true);
  });
});
