import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FormationPitch from '../components/fpl/FormationPitch';
import type { FplFixtureProjectionPlayer } from '../lib/fplApi';

// Real Everton GW5 (fixture_id=44) data, traced directly from Supabase --
// this is the exact dataset that produced the reported bug (Barry, a real
// CF, rendering as a winger). Fields not relevant to positioning are
// filled with harmless defaults.
function player(overrides: Partial<FplFixtureProjectionPlayer>): FplFixtureProjectionPlayer {
  return {
    fpl_player_id: 0,
    web_name: '',
    fpl_position: 3,
    fpl_position_label: 'MID',
    tactical_role: null,
    tactical_role_sources: null,
    position_signal: null,
    set_piece_roles: [],
    squad_status: null,
    penalty_points_share: null,
    expected_minutes: null,
    expected_goals: null,
    expected_assists: null,
    expected_fpl_points: null,
    price: null,
    value: null,
    start_probability: 0.96,
    sub_appearance_probability: null,
    availability_probability: null,
    lineup_confidence: null,
    clean_sheet_probability: null,
    expected_saves: null,
    expected_bonus: null,
    defensive_contribution_probability: null,
    xpts: {
      appearance: null, goals: null, assists: null, clean_sheet: null, saves: null,
      defensive_contribution: null, goals_conceded: null, cards_own_goals: null, penalties: null, bonus: null,
    },
    status: null,
    news: null,
    season_points_per_game: null,
    season_avg_minutes_per_start: null,
    ...overrides,
  };
}

// Ordered by expected_minutes descending, exactly as fplApi.ts's
// sortPlayers() would hand it to FormationPitch. GK (Pickford) is not
// included -- FormationPitch finds and places the GK itself.
const evertonGw5Starters: FplFixtureProjectionPlayer[] = [
  player({ fpl_player_id: 230, web_name: 'Branthwaite', tactical_role: 'RCB' }),
  player({ fpl_player_id: 233, web_name: 'Mykolenko', tactical_role: 'RB' }),
  player({ fpl_player_id: 242, web_name: 'George', tactical_role: 'LW' }),
  player({ fpl_player_id: 249, web_name: 'Barry', tactical_role: 'CF', fpl_position: 4, fpl_position_label: 'FWD' }),
  player({ fpl_player_id: 236, web_name: 'Dewsbury-Hall', tactical_role: 'AM' }),
  player({ fpl_player_id: 229, web_name: 'Tarkowski', tactical_role: 'LCB', fpl_position: 2, fpl_position_label: 'DEF' }),
  player({ fpl_player_id: 244, web_name: 'Armstrong', tactical_role: 'DM' }),
  // Röhl's tactical_role is the literal string "MID" in the real data --
  // a generic backend fallback, not one of the specific role codes.
  player({ fpl_player_id: 246, web_name: 'Rohl', tactical_role: 'MID' }),
  player({ fpl_player_id: 239, web_name: 'Garner', tactical_role: 'CM' }),
  player({ fpl_player_id: 649, web_name: 'Maitland-Niles', tactical_role: 'LB', fpl_position: 2, fpl_position_label: 'DEF' }),
];

describe('FormationPitch -- tactical_role positioning', () => {
  it('places Barry (real CF) centrally and most advanced, not out on the wing', () => {
    render(
      <FormationPitch players={evertonGw5Starters} formation="4-2-3-1" selectedPlayerId={null} onSelectPlayer={() => {}} />
    );

    const barryButton = screen.getByText('Barry').closest('button');
    expect(barryButton).not.toBeNull();
    const style = (barryButton as HTMLButtonElement).style;
    // The 4-2-3-1 template's CF slot is { top: 10, left: 50 } -- central,
    // most advanced. This is the exact assertion the bug would fail.
    expect(style.top).toBe('10%');
    expect(style.left).toBe('50%');
  });

  it('keeps CF, LW and RW at visibly different coordinates', () => {
    render(
      <FormationPitch players={evertonGw5Starters} formation="4-2-3-1" selectedPlayerId={null} onSelectPlayer={() => {}} />
    );

    const cfLeft = (screen.getByText('Barry').closest('button') as HTMLButtonElement).style.left;
    const lwLeft = (screen.getByText('George').closest('button') as HTMLButtonElement).style.left;
    // Whoever lands in the RW slot (Garner, the only unassigned player left
    // once every exact match is placed) should not share Barry's coordinates.
    const rwButton = screen.getByText('Garner').closest('button') as HTMLButtonElement;

    expect(cfLeft).not.toBe(lwLeft);
    expect(rwButton.style.left).not.toBe((screen.getByText('Barry').closest('button') as HTMLButtonElement).style.left);
    expect(rwButton.style.top).not.toBe('10%'); // not at the CF slot
  });

  it('shows Rohl (generic "MID" role) with the role-not-confirmed treatment, not a confident tactical label', () => {
    render(
      <FormationPitch players={evertonGw5Starters} formation="4-2-3-1" selectedPlayerId={null} onSelectPlayer={() => {}} />
    );
    expect(screen.getByText('role tbc')).toBeInTheDocument();
  });

  it('does not crash when a starter has a null tactical_role', () => {
    const withNullRole = [...evertonGw5Starters.slice(0, 9), player({ fpl_player_id: 999, web_name: 'Unknown Player', tactical_role: null })];
    expect(() =>
      render(<FormationPitch players={withNullRole} formation="4-2-3-1" selectedPlayerId={null} onSelectPlayer={() => {}} />)
    ).not.toThrow();
    expect(screen.getByText('Unknown Player')).toBeInTheDocument();
  });
});

describe('FormationPitch -- 3-4-3 sides', () => {
  const back3Wingback: FplFixtureProjectionPlayer[] = [
    player({ fpl_player_id: 1, web_name: 'LeftCB', tactical_role: 'LCB' }),
    player({ fpl_player_id: 2, web_name: 'CentreCB', tactical_role: 'CB' }),
    player({ fpl_player_id: 3, web_name: 'RightCB', tactical_role: 'RCB' }),
    player({ fpl_player_id: 4, web_name: 'LeftWB', tactical_role: 'LWB' }),
    player({ fpl_player_id: 5, web_name: 'RightWB', tactical_role: 'RWB' }),
    player({ fpl_player_id: 6, web_name: 'CM1', tactical_role: 'CM' }),
    player({ fpl_player_id: 7, web_name: 'CM2', tactical_role: 'CM' }),
    player({ fpl_player_id: 8, web_name: 'LeftForward', tactical_role: 'LF' }),
    player({ fpl_player_id: 9, web_name: 'CentreForward', tactical_role: 'CF' }),
    player({ fpl_player_id: 10, web_name: 'RightForward', tactical_role: 'RF' }),
  ];

  it('places LWB/RWB and LCB/RCB on their correct real-world sides', () => {
    render(
      <FormationPitch players={back3Wingback} formation="3-4-3" selectedPlayerId={null} onSelectPlayer={() => {}} />
    );

    const leftOf = (name: string) => Number((screen.getByText(name).closest('button') as HTMLButtonElement).style.left.replace('%', ''));

    expect(leftOf('LeftWB')).toBeLessThan(leftOf('RightWB'));
    expect(leftOf('LeftCB')).toBeLessThan(leftOf('RightCB'));
    expect(leftOf('CentreForward')).toBeCloseTo(50, 0);
  });

  it('places a CM in the 4-2-3-1 pivot, not in a defensive slot', () => {
    // The 4-2-3-1 template calls its double pivot DM, but players are
    // usually assigned CM. With no CM slot, a CM found no exact match,
    // fell to fuzzy matching, and could land in a DEFENDER'S slot -- a
    // central midfielder drawn next to the goalkeeper.
    const partialSquad = [
      player({ fpl_player_id: 301, web_name: 'Keeper', tactical_role: 'GK', fpl_position: 1 }),
      player({ fpl_player_id: 302, web_name: 'Pivot', tactical_role: 'CM', fpl_position: 3 }),
    ];
    render(
      <FormationPitch players={partialSquad} formation="4-2-3-1" selectedPlayerId={null} onSelectPlayer={() => {}} />
    );

    const pivot = screen.getByText('Pivot').closest('[style]') as HTMLElement | null;
    expect(pivot).not.toBeNull();
    // The pivot slots sit at top: 54; defenders at 70-74. Anything at or
    // below 65 means the CM was dropped into the back line.
    const top = Number((pivot!.style.top || '').replace('%', ''));
    expect(top).toBeLessThan(65);
  });
});
