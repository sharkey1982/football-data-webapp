-- Live definition exported from the database (function refresh_fpl_projection_fixture_v6_impl(p_fixture_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_fpl_projection_fixture_v6_impl(p_fixture_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer;
  v_has_mc boolean;
begin
  select exists(select 1 from public.fpl_fixture_bonus_montecarlo_v1 where fixture_id = p_fixture_id) into v_has_mc;

  if v_has_mc then
    insert into public.fpl_player_projections(season_id,fixture_id,fpl_player_id,generated_at,model_version,expected_minutes,expected_goals,expected_assists,clean_sheet_probability,expected_saves,defensive_contribution_probability,expected_bonus,xpts_appearance,xpts_goals,xpts_assists,xpts_clean_sheet,xpts_saves,xpts_defensive_contribution,xpts_cards_own_goals,xpts_bonus,expected_fpl_points,start_probability,sub_appearance_probability,xpts_goals_conceded,xpts_penalties,availability_probability,lineup_confidence,tactical_role,minutes_source)
    select public.fpl_current_season_id(),p.fixture_id,p.fpl_player_id,now(),'leaguewide_v6',p.expected_minutes,p.expected_goals,p.expected_assists,p.clean_sheet_probability,case when p.element_type=1 then s.xpts_saves*3 else 0 end,p.defensive_contribution_probability,
      coalesce(mc.expected_bonus_points, p.expected_bonus),
      p.xpts_appearance,p.xpts_goals,p.xpts_assists,p.xpts_clean_sheet,s.xpts_saves,p.xpts_defensive_contribution,s.xpts_cards_own_goals,
      coalesce(mc.expected_bonus_points, p.xpts_bonus),
      (p.xpts_appearance + p.xpts_goals + p.xpts_assists + p.xpts_clean_sheet + p.xpts_defensive_contribution + coalesce(mc.expected_bonus_points, p.xpts_bonus) + s.xpts_saves + s.xpts_goals_conceded + s.xpts_cards_own_goals + s.xpts_penalties) as expected_fpl_points,
      p.prob_starting_xi,p.prob_sub_appearance,s.xpts_goals_conceded,s.xpts_penalties,coalesce(m.availability_probability,1),case m.minutes_source when 'consensus_v3' then .90 when 'squad_state_override' then .95 when 'nailed_history_v6' then .80 when 'strong_history_v6' then .70 else .55 end,coalesce(tc.tactical_role,m.tactical_role,td.tactical_role,case p.element_type when 1 then 'GK' when 2 then 'DEF' when 3 then 'MID' when 4 then 'CF' else 'TBC' end),m.minutes_source
    from public.fpl_projection_leaguewide_final p
      join public.fpl_projection_secondary_scoring s on s.fixture_id=p.fixture_id and s.fpl_player_id=p.fpl_player_id
      left join public.fixture_player_expected_minutes_resolved_v3 m on m.fixture_id=p.fixture_id and m.fpl_player_id=p.fpl_player_id
      left join public.fixture_player_tactical_consensus tc on tc.fixture_id=p.fixture_id and tc.fpl_player_id=p.fpl_player_id
      left join public.team_player_tactical_defaults td on td.season_id = (SELECT public.fpl_current_season_id()) and td.team_id=p.team_id and td.fpl_player_id=p.fpl_player_id
      left join public.fpl_fixture_bonus_montecarlo_v1 mc on mc.fixture_id=p.fixture_id and mc.fpl_player_id=p.fpl_player_id
    where p.fixture_id=p_fixture_id
    on conflict(fixture_id,fpl_player_id,model_version) do update set generated_at=excluded.generated_at,expected_minutes=excluded.expected_minutes,expected_goals=excluded.expected_goals,expected_assists=excluded.expected_assists,clean_sheet_probability=excluded.clean_sheet_probability,expected_saves=excluded.expected_saves,defensive_contribution_probability=excluded.defensive_contribution_probability,expected_bonus=excluded.expected_bonus,xpts_appearance=excluded.xpts_appearance,xpts_goals=excluded.xpts_goals,xpts_assists=excluded.xpts_assists,xpts_clean_sheet=excluded.xpts_clean_sheet,xpts_saves=excluded.xpts_saves,xpts_defensive_contribution=excluded.xpts_defensive_contribution,xpts_cards_own_goals=excluded.xpts_cards_own_goals,xpts_bonus=excluded.xpts_bonus,expected_fpl_points=excluded.expected_fpl_points,start_probability=excluded.start_probability,sub_appearance_probability=excluded.sub_appearance_probability,xpts_goals_conceded=excluded.xpts_goals_conceded,xpts_penalties=excluded.xpts_penalties,availability_probability=excluded.availability_probability,lineup_confidence=excluded.lineup_confidence,tactical_role=excluded.tactical_role,minutes_source=excluded.minutes_source;
  else
    insert into public.fpl_player_projections(season_id,fixture_id,fpl_player_id,generated_at,model_version,expected_minutes,expected_goals,expected_assists,clean_sheet_probability,expected_saves,defensive_contribution_probability,expected_bonus,xpts_appearance,xpts_goals,xpts_assists,xpts_clean_sheet,xpts_saves,xpts_defensive_contribution,xpts_cards_own_goals,xpts_bonus,expected_fpl_points,start_probability,sub_appearance_probability,xpts_goals_conceded,xpts_penalties,availability_probability,lineup_confidence,tactical_role,minutes_source)
    select public.fpl_current_season_id(),p.fixture_id,p.fpl_player_id,now(),'leaguewide_v6',p.expected_minutes,p.expected_goals,p.expected_assists,p.clean_sheet_probability,case when p.element_type=1 then s.xpts_saves*3 else 0 end,p.defensive_contribution_probability,
      coalesce(bv4.expected_bonus_points, p.expected_bonus),
      p.xpts_appearance,p.xpts_goals,p.xpts_assists,p.xpts_clean_sheet,s.xpts_saves,p.xpts_defensive_contribution,s.xpts_cards_own_goals,
      coalesce(bv4.expected_bonus_points, p.xpts_bonus),
      (p.xpts_appearance + p.xpts_goals + p.xpts_assists + p.xpts_clean_sheet + p.xpts_defensive_contribution + coalesce(bv4.expected_bonus_points, p.xpts_bonus) + s.xpts_saves + s.xpts_goals_conceded + s.xpts_cards_own_goals + s.xpts_penalties) as expected_fpl_points,
      p.prob_starting_xi,p.prob_sub_appearance,s.xpts_goals_conceded,s.xpts_penalties,coalesce(m.availability_probability,1),case m.minutes_source when 'consensus_v3' then .90 when 'squad_state_override' then .95 when 'nailed_history_v6' then .80 when 'strong_history_v6' then .70 else .55 end,coalesce(tc.tactical_role,m.tactical_role,td.tactical_role,case p.element_type when 1 then 'GK' when 2 then 'DEF' when 3 then 'MID' when 4 then 'CF' else 'TBC' end),m.minutes_source
    from public.fpl_projection_leaguewide_final p
      join public.fpl_projection_secondary_scoring s on s.fixture_id=p.fixture_id and s.fpl_player_id=p.fpl_player_id
      left join public.fixture_player_expected_minutes_resolved_v3 m on m.fixture_id=p.fixture_id and m.fpl_player_id=p.fpl_player_id
      left join public.fixture_player_tactical_consensus tc on tc.fixture_id=p.fixture_id and tc.fpl_player_id=p.fpl_player_id
      left join public.team_player_tactical_defaults td on td.season_id = (SELECT public.fpl_current_season_id()) and td.team_id=p.team_id and td.fpl_player_id=p.fpl_player_id
      left join public.get_fpl_fixture_bonus_v4(p_fixture_id) bv4 on bv4.fpl_player_id=p.fpl_player_id
    where p.fixture_id=p_fixture_id
    on conflict(fixture_id,fpl_player_id,model_version) do update set generated_at=excluded.generated_at,expected_minutes=excluded.expected_minutes,expected_goals=excluded.expected_goals,expected_assists=excluded.expected_assists,clean_sheet_probability=excluded.clean_sheet_probability,expected_saves=excluded.expected_saves,defensive_contribution_probability=excluded.defensive_contribution_probability,expected_bonus=excluded.expected_bonus,xpts_appearance=excluded.xpts_appearance,xpts_goals=excluded.xpts_goals,xpts_assists=excluded.xpts_assists,xpts_clean_sheet=excluded.xpts_clean_sheet,xpts_saves=excluded.xpts_saves,xpts_defensive_contribution=excluded.xpts_defensive_contribution,xpts_cards_own_goals=excluded.xpts_cards_own_goals,xpts_bonus=excluded.xpts_bonus,expected_fpl_points=excluded.expected_fpl_points,start_probability=excluded.start_probability,sub_appearance_probability=excluded.sub_appearance_probability,xpts_goals_conceded=excluded.xpts_goals_conceded,xpts_penalties=excluded.xpts_penalties,availability_probability=excluded.availability_probability,lineup_confidence=excluded.lineup_confidence,tactical_role=excluded.tactical_role,minutes_source=excluded.minutes_source;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;
