-- Line-ups v model: count FPL's own 'starts' as the starters; clear expired
-- X drafts (follow-ups from 1-2 Nov 2026).
--
-- 1. private.social_lineup_fixture (the line-ups detector and
--    social_lineup_checks) and private.social_lineup_starters (the "same XI as
--    the last league game" baseline) took the 11 players with most minutes as
--    the starters. A starter taken off at half-time and the sub who played the
--    other 45 tie on minutes, so the sub could be counted instead (34 such
--    cases in GW1-9). Now the same rule as the admin team sheets
--    (20261101100000_fpl_team_sheets_expected_v_actual.sql): FPL's 'starts'
--    stat (fpl_live_elements.stats) first when it is the team's only fixture
--    that gameweek, then minutes; in a double gameweek, minutes alone. Only
--    the starter selection changes. While a game is live and 'starts' is not
--    yet filled in, every player has 0 and the order falls back to minutes,
--    as before.
-- 2. Recompute this season's social_lineup_checks rows whose numbers change
--    under the new rule (4 team-games on 2 Nov). A fixture is re-recorded only
--    when a stored value differs, so re-running does nothing.
-- 3. Drafts past their expiry date that were never approved or published
--    (e.g. candidate 3, an fpl_captaincy draft that expired on 17 Oct) are
--    marked superseded, so they no longer sit in the approval queue.
-- Safe to re-run.

create or replace function private.social_lineup_fixture(p_season bigint, p_fpl_fixture_id integer)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  with fx as (
    select ff.fpl_fixture_id, ff.fpl_event_id ev, ff.canonical_fixture_id cf, ff.fpl_home_team_id th, ff.fpl_away_team_id ta
      from public.fpl_fixtures ff where ff.season_id = p_season and ff.fpl_fixture_id = p_fpl_fixture_id),
  mins as (
    select e.fpl_player_id, p.fpl_team_id, (s->>'value')::int m,
           -- FPL's 'starts' is a gameweek total: use it only when this is the team's one fixture that gameweek
           case when (select count(*) from public.fpl_fixtures g
                       where g.season_id = p_season and g.fpl_event_id = fx.ev
                         and p.fpl_team_id in (g.fpl_home_team_id, g.fpl_away_team_id)) = 1
                then coalesce((e.stats->>'starts')::int, 0) else 0 end st
      from fx
      join public.fpl_live_elements e on e.season_id = p_season and e.fpl_event_id = fx.ev
      cross join lateral jsonb_array_elements(coalesce(e.explain, '[]')) x
      cross join lateral jsonb_array_elements(coalesce(x->'stats', '[]')) s
      join public.fpl_players p on p.season_id = p_season and p.fpl_player_id = e.fpl_player_id
     where (x->>'fixture')::int = fx.fpl_fixture_id and s->>'identifier' = 'minutes' and (s->>'value')::int > 0
       and p.fpl_team_id in (fx.th, fx.ta)),
  starters as (
    select * from (select mins.*, row_number() over (partition by fpl_team_id order by st desc, m desc, fpl_player_id) rn from mins) z where rn <= 11),
  snap as (
    select distinct on (h.fpl_player_id) h.fpl_player_id, p.fpl_team_id, h.start_probability sp
      from fx
      join public.fpl_deadline_player_horizon h on h.season_id = p_season and h.fpl_event_id = fx.ev
                                                and h.snapshot_kind = 'pre_deadline' and h.fixture_id = fx.cf
      join public.fpl_players p on p.season_id = p_season and p.fpl_player_id = h.fpl_player_id
     where p.fpl_team_id in (fx.th, fx.ta)
     order by h.fpl_player_id, h.snapshot_at desc),
  model as (
    select * from (select snap.*, row_number() over (partition by fpl_team_id order by sp desc, fpl_player_id) rn from snap) z where rn <= 11),
  teams as (select fx.th tid, 'home' side from fx union all select fx.ta, 'away' from fx)
  select jsonb_build_object(
    'fpl_fixture_id', p_fpl_fixture_id,
    'teams', jsonb_agg(jsonb_build_object(
      'side', t.side,
      'team', (select ft.name from public.fpl_teams ft where ft.season_id = p_season and ft.fpl_team_id = t.tid),
      'started', (select count(*) from starters s where s.fpl_team_id = t.tid),
      'model', (select count(*) from model m where m.fpl_team_id = t.tid),
      'matched', (select count(*) from starters s join model m using (fpl_player_id) where s.fpl_team_id = t.tid),
      'ins', (select coalesce(jsonb_agg(jsonb_build_object('id', s.fpl_player_id, 'name', p.web_name,
                                                           'sp', round(coalesce(sn.sp, 0), 2), 'own', p.selected_by_percent)
                                        order by coalesce(sn.sp, 0), p.web_name), '[]')
                from starters s join public.fpl_players p on p.season_id = p_season and p.fpl_player_id = s.fpl_player_id
                left join snap sn on sn.fpl_player_id = s.fpl_player_id
               where s.fpl_team_id = t.tid and not exists (select 1 from model m where m.fpl_player_id = s.fpl_player_id)),
      'outs', (select coalesce(jsonb_agg(jsonb_build_object('id', m.fpl_player_id, 'name', p.web_name,
                                                            'sp', round(m.sp, 2), 'own', p.selected_by_percent)
                                         order by p.selected_by_percent desc nulls last, m.sp desc), '[]')
                 from model m join public.fpl_players p on p.season_id = p_season and p.fpl_player_id = m.fpl_player_id
                where m.fpl_team_id = t.tid and not exists (select 1 from starters s where s.fpl_player_id = m.fpl_player_id))
    ) order by t.side desc))
  from teams t
$function$;

create or replace function private.social_lineup_starters(p_season bigint, p_fpl_fixture_id integer)
returns table(fpl_team_id integer, fpl_player_id integer) language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select z.fpl_team_id, z.fpl_player_id from (
    select p.fpl_team_id, e.fpl_player_id,
           row_number() over (partition by p.fpl_team_id
                              order by case when (select count(*) from public.fpl_fixtures g
                                                   where g.season_id = p_season and g.fpl_event_id = ff.fpl_event_id
                                                     and p.fpl_team_id in (g.fpl_home_team_id, g.fpl_away_team_id)) = 1
                                            then coalesce((e.stats->>'starts')::int, 0) else 0 end desc,
                                       (s->>'value')::int desc, e.fpl_player_id) rn
      from public.fpl_fixtures ff
      join public.fpl_live_elements e on e.season_id = p_season and e.fpl_event_id = ff.fpl_event_id
      cross join lateral jsonb_array_elements(coalesce(e.explain, '[]')) x
      cross join lateral jsonb_array_elements(coalesce(x->'stats', '[]')) s
      join public.fpl_players p on p.season_id = p_season and p.fpl_player_id = e.fpl_player_id
     where ff.season_id = p_season and ff.fpl_fixture_id = p_fpl_fixture_id
       and (x->>'fixture')::int = ff.fpl_fixture_id and s->>'identifier' = 'minutes' and (s->>'value')::int > 0
       and p.fpl_team_id in (ff.fpl_home_team_id, ff.fpl_away_team_id)) z
  where z.rn <= 11
$function$;

-- 2. Re-record this season's checks whose numbers change under the new rule.
do $recompute$
declare
  v_season bigint := public.fpl_current_season_id();
  r record; v_fx jsonb; v_changed boolean; v_n integer := 0;
begin
  for r in select distinct c.fpl_fixture_id from public.social_lineup_checks c
            where c.season_id = v_season order by 1 loop
    v_fx := private.social_lineup_fixture(v_season, r.fpl_fixture_id);
    -- incomplete now (should not happen for a recorded game): leave it alone
    if exists (select 1 from jsonb_array_elements(v_fx->'teams') e where (e->>'started')::int < 11 or (e->>'model')::int < 11) then
      continue;
    end if;
    select exists (
      select 1
        from jsonb_array_elements(v_fx->'teams') e
        join public.fpl_fixtures ff on ff.season_id = v_season and ff.fpl_fixture_id = r.fpl_fixture_id
        join public.social_lineup_checks c
          on c.season_id = v_season and c.fpl_fixture_id = r.fpl_fixture_id
         and c.fpl_team_id = case e->>'side' when 'home' then ff.fpl_home_team_id else ff.fpl_away_team_id end
        left join lateral (
          select p.fpl_fixture_id prev from public.fpl_fixtures p
           where p.season_id = v_season and c.fpl_team_id in (p.fpl_home_team_id, p.fpl_away_team_id)
             and p.kickoff_time < ff.kickoff_time
           order by p.kickoff_time desc limit 1) pv on true
       where c.starters is distinct from (e->>'started')::int
          or c.model_matched is distinct from (e->>'matched')::int
          or (select coalesce(array_agg((i->>'id')::int order by (i->>'id')::int), '{}') from jsonb_array_elements(c.surprise_starters) i)
             is distinct from
             (select coalesce(array_agg((i->>'id')::int order by (i->>'id')::int), '{}') from jsonb_array_elements(e->'ins') i)
          or (pv.prev is not null and c.last_xi_matched is distinct from (
                select count(*)::int from private.social_lineup_starters(v_season, r.fpl_fixture_id) s
                  join private.social_lineup_starters(v_season, pv.prev) l using (fpl_team_id, fpl_player_id)
                 where s.fpl_team_id = c.fpl_team_id))
    ) into v_changed;
    if v_changed then
      delete from public.social_lineup_checks where season_id = v_season and fpl_fixture_id = r.fpl_fixture_id;
      perform private.social_record_lineup_checks(v_season, jsonb_build_array(v_fx));
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'social_lineup_checks: % fixture(s) re-recorded', v_n;
end
$recompute$;

-- 3. Expired drafts leave the queue.
update public.social_post_candidates
   set approval_status = 'superseded', updated_at = now()
 where approval_status = 'pending' and publication_status = 'unpublished'
   and expires_at is not null and expires_at < now();
