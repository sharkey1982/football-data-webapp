-- Model Returns: division and promoted-team filters. Applied 2026-09-23.

-- How each team arrived in its division each season (from the matches archive):
-- promoted / relegated / stayed / new (not in the five divisions last season:
-- promoted into the National League from step 2) / unknown (first season).
-- is_promoted = promoted or new. Verified: PL promoted clubs 2015/16-2026/27
-- all correct; 3 per season into the Championship, 4 into League One (3 in
-- 2019/20, Bury), 2 into League Two, 4 into the National League (0 in 2021/22,
-- step 2 voided); no team in two divisions in one season.
create or replace view public.team_season_movement as
with ts as (
  select league_id, season_id, home_team_id as team_id from public.matches where league_id between 1 and 5
  union
  select league_id, season_id, away_team_id from public.matches where league_id between 1 and 5
),
first_season as (select min(season_id) as season_id from ts)
select t.league_id, t.season_id, t.team_id, p.league_id as previous_league_id,
  case
    when t.season_id = (select season_id from first_season) then 'unknown'
    when p.league_id is null then 'new'
    when p.league_id > t.league_id then 'promoted'
    when p.league_id < t.league_id then 'relegated'
    else 'stayed'
  end as movement,
  (t.season_id <> (select season_id from first_season) and (p.league_id is null or p.league_id > t.league_id)) as is_promoted
from ts t
left join ts p on p.team_id = t.team_id and p.season_id = t.season_id - 1;
grant select on public.team_season_movement to anon, authenticated;

-- get_betting_bets / get_betting_returns gain p_league_id (null = all) and
-- p_promoted ('all' | 'exclude' | 'only'), and each bet returns league_id,
-- league_name, home_promoted, away_promoted. Rebuilt from the live definitions
-- with anchored edits (each anchor must match exactly once). Verified: with
-- default inputs, all 96 settings x 4 seasons fingerprint identical to before
-- (md5 7f98d49f..., 233 rows, 13,931 bets); exclude + only = all and the
-- per-bet tag agrees with the filter in every case checked; divisions sum to
-- the total. ~0.8 s per call as anon.
do $$
declare
  bets_def text; ret_def text; olds text[]; news text[]; i int; n int;
begin
  if to_regprocedure('public.get_betting_bets(numeric,text,boolean,boolean,numeric,bigint,bigint,text)') is not null then
    return;  -- already applied
  end if;
  bets_def := pg_get_functiondef('public.get_betting_bets(numeric,text,boolean,boolean,numeric,bigint)'::regprocedure);
  ret_def  := pg_get_functiondef('public.get_betting_returns(numeric,text,boolean,boolean,numeric,bigint)'::regprocedure);
  olds := array[
    'p_season_id bigint DEFAULT 13)',
    'predicted_from date, retrofit boolean)',
    '           m.home_team_id, m.away_team_id,
',
    '           m2.home_team_id, m2.away_team_id,
',
    '         c.src, c.pf, c.rf
  from candidates c',
    '  join public.teams at on at.team_id = c.away_team_id
',
    '  where c.px > 1 and c.mp_ between 0 and 1 and c.mp_ - (1.0 / c.px) >= p_edge
',
    'begin
  -- fixture_derived_markets returns PERCENTAGES'];
  news := array[
    'p_season_id bigint DEFAULT 13, p_league_id bigint DEFAULT NULL::bigint, p_promoted text DEFAULT ''all''::text)',
    'predicted_from date, retrofit boolean, league_id bigint, league_name text, home_promoted boolean, away_promoted boolean)',
    '           m.home_team_id, m.away_team_id, m.league_id as lg, m.season_id as sid,
',
    '           m2.home_team_id, m2.away_team_id, m2.league_id, m2.season_id,
',
    '         c.src, c.pf, c.rf,
         c.lg, lgn.name, coalesce(hm.is_promoted, false), coalesce(am.is_promoted, false)
  from candidates c',
    '  join public.teams at on at.team_id = c.away_team_id
  join public.leagues lgn on lgn.league_id = c.lg
  -- Promoted: arrived from a lower division this season (team_season_movement).
  left join public.team_season_movement hm on hm.team_id = c.home_team_id and hm.league_id = c.lg and hm.season_id = c.sid
  left join public.team_season_movement am on am.team_id = c.away_team_id and am.league_id = c.lg and am.season_id = c.sid
',
    '  where c.px > 1 and c.mp_ between 0 and 1 and c.mp_ - (1.0 / c.px) >= p_edge
    and (p_league_id is null or c.lg = p_league_id)
    and (p_promoted = ''all''
      or (p_promoted = ''exclude'' and not (coalesce(hm.is_promoted, false) or coalesce(am.is_promoted, false)))
      or (p_promoted = ''only'' and (coalesce(hm.is_promoted, false) or coalesce(am.is_promoted, false))))
',
    'begin
  if p_promoted not in (''all'', ''exclude'', ''only'') then
    raise exception ''p_promoted must be all, exclude or only (got %)'', p_promoted;
  end if;
  -- fixture_derived_markets returns PERCENTAGES'];
  for i in 1 .. array_length(olds, 1) loop
    n := (length(bets_def) - length(replace(bets_def, olds[i], ''))) / length(olds[i]);
    if n <> 1 then raise exception 'bets anchor % matched % times', i, n; end if;
    bets_def := replace(bets_def, olds[i], news[i]);
  end loop;
  olds := array['p_season_id bigint DEFAULT 13)', 'p_best_price, p_stake, p_season_id) b'];
  news := array['p_season_id bigint DEFAULT 13, p_league_id bigint DEFAULT NULL::bigint, p_promoted text DEFAULT ''all''::text)',
                'p_best_price, p_stake, p_season_id, p_league_id, p_promoted) b'];
  for i in 1 .. 2 loop
    n := (length(ret_def) - length(replace(ret_def, olds[i], ''))) / length(olds[i]);
    if n <> 1 then raise exception 'returns anchor % matched % times', i, n; end if;
    ret_def := replace(ret_def, olds[i], news[i]);
  end loop;
  drop function public.get_betting_returns(numeric,text,boolean,boolean,numeric,bigint);
  drop function public.get_betting_bets(numeric,text,boolean,boolean,numeric,bigint);
  execute bets_def;
  execute ret_def;
  grant execute on function public.get_betting_bets(numeric,text,boolean,boolean,numeric,bigint,bigint,text) to anon, authenticated;
  grant execute on function public.get_betting_returns(numeric,text,boolean,boolean,numeric,bigint,bigint,text) to anon, authenticated;
end $$;
