-- FPL joins scoped to one season (audit 2026-09-26 items 11 and 12).
--
-- FPL reuses fpl_player_id and fpl_team_id every season, and fpl_players /
-- fpl_teams are keyed (id, season_id). These objects joined on the id alone.
-- Harmless while one FPL season is loaded; from the 2027/28 bootstrap they
-- would pair each 2027/28 row with the 2026/27 player (or team) who had the
-- same id -- duplicate rows, wrong names, wrong prices.
--
--   get_fpl_market_movers, get_injury_report, get_daily_digest,
--   get_gameweek_digest, get_digest_gameweeks, get_actual_value_table,
--   get_price_change_risk      -- snapshot rows join the player of the
--                                  snapshot's season; day-on-day comparisons
--                                  only pair rows of the same season; the
--                                  p_season_id argument (ignored until now
--                                  by get_daily_digest/get_price_change_risk)
--                                  now selects the season's snapshots
--   get_tactical_role_worklist  -- player and latest snapshot of p_season_id
--   get_team_of_the_week (x2), get_totw_vs_model -- player of the gameweek's
--                                  season
--   get_fpl_optimizer_earliest_matchweek -- current FPL season's fixtures
--                                  only (min(matchweek) over every season
--                                  would return last season's week)
--   fixture_player_lineup_consensus, fixture_player_expected_minutes_v2
--                               -- current FPL season's players (as
--                                  fixture_player_tactical_consensus
--                                  already does)
--   team_strength_current, fpl_team_strength_current -- current FPL
--                                  season's fpl_teams row
--
-- One FPL season is loaded today, so every result is unchanged (checked
-- before/after in the dry run). Edited in place by anchored replacement.

create or replace function pg_temp.anchored_replace(p_src text, p_anchor text, p_repl text, p_expect int default 1)
returns text language plpgsql as $f$
declare n int := (length(p_src) - length(replace(p_src, p_anchor, ''))) / length(p_anchor);
begin
  if n <> p_expect then raise exception 'anchor matched % time(s), expected %: %', n, p_expect, left(p_anchor, 80); end if;
  return replace(p_src, p_anchor, p_repl);
end $f$;

-- Views keep their options and grants: CREATE OR REPLACE VIEW with the same
-- columns; security_invoker re-stated.
create or replace function pg_temp.replace_view(p_view regclass, p_anchor text, p_repl text)
returns void language plpgsql as $f$
declare d text := pg_get_viewdef(p_view); opts text;
begin
  d := pg_temp.anchored_replace(d, p_anchor, p_repl);
  select coalesce(' with (' || array_to_string(reloptions, ', ') || ')', '') into opts from pg_class where oid = p_view;
  execute format('create or replace view %s%s as %s', p_view, opts, d);
end $f$;

do $mig$
declare d text;
begin
  -- get_fpl_market_movers
  d := pg_get_functiondef('public.get_fpl_market_movers(integer)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '           max(snapshot_date) - (p_days || '' days'')::interval as cutoff',
    '           max(snapshot_date) - (p_days || '' days'')::interval as cutoff,
           (select s2.season_id from public.fpl_player_snapshots s2 order by s2.snapshot_date desc limit 1) as season_id');
  d := pg_temp.anchored_replace(d,
    '    where s.snapshot_date >= b.cutoff::date',
    '    where s.snapshot_date >= b.cutoff::date and s.season_id = b.season_id');
  d := pg_temp.anchored_replace(d,
    '  join public.fpl_players p on p.fpl_player_id = l.fpl_player_id',
    '  join public.fpl_players p on p.fpl_player_id = l.fpl_player_id and p.season_id = l.season_id');
  execute d;

  -- get_injury_report
  d := pg_get_functiondef('public.get_injury_report(bigint)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '    select max(snapshot_date) as d from public.fpl_player_snapshots',
    '    select max(snapshot_date) as d from public.fpl_player_snapshots where season_id = p_season_id');
  d := pg_temp.anchored_replace(d,
    '  join public.fpl_players p on p.fpl_player_id = pa.fpl_player_id',
    '  join public.fpl_players p on p.fpl_player_id = pa.fpl_player_id and p.season_id = pa.season_id');
  execute d;

  -- get_daily_digest
  d := pg_get_functiondef('public.get_daily_digest(bigint)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '           (select max(snapshot_date) from public.fpl_player_snapshots
            where snapshot_date < (select max(snapshot_date) from public.fpl_player_snapshots)) as from_d
    from public.fpl_player_snapshots',
    '           (select max(snapshot_date) from public.fpl_player_snapshots
            where season_id = p_season_id
              and snapshot_date < (select max(snapshot_date) from public.fpl_player_snapshots where season_id = p_season_id)) as from_d
    from public.fpl_player_snapshots
    where season_id = p_season_id');
  d := pg_temp.anchored_replace(d,
    '    join prev p on p.fpl_player_id = c.fpl_player_id',
    '    join prev p on p.fpl_player_id = c.fpl_player_id and p.season_id = c.season_id');
  d := pg_temp.anchored_replace(d,
    '    join public.fpl_players pl on pl.fpl_player_id = c.fpl_player_id',
    '    join public.fpl_players pl on pl.fpl_player_id = c.fpl_player_id and pl.season_id = c.season_id');
  execute d;

  -- get_gameweek_digest
  d := pg_get_functiondef('public.get_gameweek_digest(bigint,integer)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    'with days as (select distinct snapshot_date as d from public.fpl_player_snapshots),',
    'with days as (select distinct snapshot_date as d from public.fpl_player_snapshots where season_id = p_season_id),');
  d := pg_temp.anchored_replace(d,
    'pv.snapshot_date = s.from_d and pv.fpl_player_id = c.fpl_player_id',
    'pv.snapshot_date = s.from_d and pv.fpl_player_id = c.fpl_player_id and pv.season_id = c.season_id');
  d := pg_temp.anchored_replace(d,
    '    join public.fpl_players pl on pl.fpl_player_id = c.fpl_player_id',
    '    join public.fpl_players pl on pl.fpl_player_id = c.fpl_player_id and pl.season_id = c.season_id');
  execute d;

  -- get_digest_gameweeks
  d := pg_get_functiondef('public.get_digest_gameweeks(bigint)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    'with days as (select distinct snapshot_date as d from public.fpl_player_snapshots),',
    'with days as (select distinct snapshot_date as d from public.fpl_player_snapshots where season_id = p_season_id),');
  execute d;

  -- get_actual_value_table
  d := pg_get_functiondef('public.get_actual_value_table(bigint)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '    select max(snapshot_date) as d from public.fpl_player_snapshots',
    '    select max(snapshot_date) as d from public.fpl_player_snapshots where season_id = p_season_id');
  d := pg_temp.anchored_replace(d,
    '  join public.fpl_players p on p.fpl_player_id = sn.fpl_player_id',
    '  join public.fpl_players p on p.fpl_player_id = sn.fpl_player_id and p.season_id = sn.season_id');
  execute d;

  -- get_price_change_risk
  d := pg_get_functiondef('public.get_price_change_risk(bigint)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '    select max(snapshot_date) as d from public.fpl_player_snapshots',
    '    select max(snapshot_date) as d from public.fpl_player_snapshots where season_id = p_season_id');
  d := pg_temp.anchored_replace(d,
    '  join public.fpl_players p on p.fpl_player_id = c.fpl_player_id',
    '  join public.fpl_players p on p.fpl_player_id = c.fpl_player_id and p.season_id = c.season_id');
  execute d;

  -- get_tactical_role_worklist
  d := pg_get_functiondef('public.get_tactical_role_worklist(bigint)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '    from public.fpl_player_snapshots s
    order by s.fpl_player_id, s.snapshot_date desc',
    '    from public.fpl_player_snapshots s
    where s.season_id = p_season_id
    order by s.fpl_player_id, s.snapshot_date desc');
  d := pg_temp.anchored_replace(d,
    '  join public.fpl_players p on p.fpl_player_id = d.fpl_player_id',
    '  join public.fpl_players p on p.fpl_player_id = d.fpl_player_id and p.season_id = d.season_id');
  execute d;

  -- get_team_of_the_week (both branches)
  d := pg_get_functiondef('public.get_team_of_the_week(integer,bigint)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    'join public.fpl_players p on p.fpl_player_id = g.fpl_player_id',
    'join public.fpl_players p on p.fpl_player_id = g.fpl_player_id and p.season_id = g.season_id', 2);
  execute d;

  -- get_totw_vs_model
  d := pg_get_functiondef('public.get_totw_vs_model(integer,bigint)'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '    join public.fpl_players p on p.fpl_player_id = pr.fpl_player_id',
    '    join public.fpl_players p on p.fpl_player_id = pr.fpl_player_id and p.season_id = f.season_id');
  execute d;

  -- get_fpl_optimizer_earliest_matchweek
  d := pg_get_functiondef('public.get_fpl_optimizer_earliest_matchweek()'::regprocedure);
  d := pg_temp.anchored_replace(d,
    '  where pr.model_version = ''leaguewide_v6'';',
    '  where pr.model_version = ''leaguewide_v6''
    and f.season_id = (select public.fpl_current_season_id());');
  execute d;

  -- views
  perform pg_temp.replace_view('public.fixture_player_lineup_consensus',
    'JOIN fpl_players p ON ((p.canonical_team_id = st.team_id)))',
    'JOIN fpl_players p ON (((p.canonical_team_id = st.team_id) AND (p.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)))))');
  perform pg_temp.replace_view('public.fixture_player_expected_minutes_v2',
    'JOIN fpl_players p ON ((p.fpl_player_id = c.fpl_player_id)))',
    'JOIN fpl_players p ON (((p.fpl_player_id = c.fpl_player_id) AND (p.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)))))');
  perform pg_temp.replace_view('public.team_strength_current',
    'LEFT JOIN fpl_teams ft ON ((ft.canonical_team_id = r.team_id)));',
    'LEFT JOIN fpl_teams ft ON (((ft.canonical_team_id = r.team_id) AND (ft.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)))));');
  perform pg_temp.replace_view('public.fpl_team_strength_current',
    'JOIN fpl_teams ft ON ((ft.canonical_team_id = tr.team_id)))',
    'JOIN fpl_teams ft ON (((ft.canonical_team_id = tr.team_id) AND (ft.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)))))');
end $mig$;
