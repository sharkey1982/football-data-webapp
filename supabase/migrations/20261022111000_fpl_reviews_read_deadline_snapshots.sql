-- FPL reviews read the deadline snapshot, not the live projections
-- (22 Oct 2026; audit DQ-07, second half).
--
-- The "model vs actual" consumers read fpl_player_projections for past
-- gameweeks. Until migration 20261022110000 those rows were rewritten for
-- hours after kick-off (4,591 of 4,662 v6 rows on played fixtures), and even
-- now they are frozen at kick-off, not at the FPL deadline, so they can hold
-- team news that broke after the deadline. The gameweek report already
-- reads fpl_projection_snapshots ('pre_deadline', else 'late'); these did not:
--   get_totw_vs_model          (Team of the Week page)
--   get_model_xi_players       (Model XI page)
--   get_model_xi_history       (Model XI page)
--   fpl_prediction_actual_start_comparison (FPL season / start-accuracy pages)
--
-- New view fpl_review_projections_v6: per gameweek, the leaguewide_v6
-- 'pre_deadline' snapshot (else 'late') when that gameweek has one, else the
-- live baseline rows, with the source named. GW6 and GW7 are snapshotted;
-- GW1-5 have no snapshot for any model and fall back to the live rows, as
-- before. Gameweeks are FPL's (fpl_fixtures.fpl_event_id), so a rearranged
-- fixture is reviewed in the gameweek it was played in for FPL.
--
-- fpl_projection_snapshots has a public-read RLS policy but anon and
-- authenticated had no SELECT grant; granted here so the (invoker) view
-- works for the site. The rows are the same projections the site shows.

grant select on public.fpl_projection_snapshots to anon, authenticated;

create or replace view public.fpl_review_projections_v6 with (security_invoker = true) as
with snap as (
  select distinct on (s.season_id, s.fpl_event_id, s.fixture_id, s.fpl_player_id)
         s.season_id, s.fpl_event_id, s.fixture_id, s.fpl_player_id,
         s.start_probability, s.expected_minutes, s.expected_fpl_points,
         s.projection_generated_at as generated_at, s.snapshot_kind as source
    from public.fpl_projection_snapshots s
   where s.model_version = 'leaguewide_v6' and s.snapshot_kind in ('pre_deadline', 'late')
   order by s.season_id, s.fpl_event_id, s.fixture_id, s.fpl_player_id,
            (s.snapshot_kind = 'pre_deadline') desc, s.snapshot_row_id desc
), snap_events as (
  select distinct season_id, fpl_event_id from snap
)
select snap.season_id, snap.fpl_event_id, snap.fixture_id, snap.fpl_player_id,
       snap.start_probability, snap.expected_minutes, snap.expected_fpl_points,
       snap.generated_at, snap.source
  from snap
union all
select p.season_id, ff.fpl_event_id, p.fixture_id, p.fpl_player_id,
       p.start_probability, p.expected_minutes, p.expected_fpl_points,
       p.generated_at, 'live'::text
  from public.fpl_player_projections p
  join public.fpl_fixtures ff on ff.canonical_fixture_id = p.fixture_id and ff.season_id = p.season_id
 where p.model_version = 'leaguewide_v6' and coalesce(p.scenario_key, 'baseline') = 'baseline'
   and not exists (select 1 from snap_events e where e.season_id = p.season_id and e.fpl_event_id = ff.fpl_event_id);

comment on view public.fpl_review_projections_v6 is
  'leaguewide_v6 projections as they stood at the FPL deadline: the pre_deadline (else late) snapshot for gameweeks that have one, else the live baseline rows (source = live). Read this, not fpl_player_projections, when comparing projections with what happened (DQ-07, 22 Oct 2026).';

grant select on public.fpl_review_projections_v6 to anon, authenticated;

create or replace function public.get_totw_vs_model(p_event_id integer default null::integer, p_season_id bigint default fpl_current_season_id())
 returns table(fpl_event_id integer, actual_xi_points integer, model_xi_actual_points integer, overlap_count integer, model_xi_projected numeric, overlap_names text[])
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  with totw as (
    select * from public.get_team_of_the_week(p_event_id, p_season_id)
  ),
  ev as (select coalesce(p_event_id, (select max(fpl_event_id) from totw)) as e),
  -- The model's preferred XI for the same gameweek, by projected points at
  -- the deadline (fpl_review_projections_v6, 22 Oct 2026), under the same
  -- formation minimums.
  proj as (
    select pr.fpl_player_id, p.element_type,
      sum(pr.expected_fpl_points) as proj_pts,
      row_number() over (
        partition by p.element_type order by sum(pr.expected_fpl_points) desc
      ) as rn
    from public.fpl_review_projections_v6 pr
    join public.fpl_players p on p.fpl_player_id = pr.fpl_player_id and p.season_id = pr.season_id
    join ev on pr.fpl_event_id = ev.e
    where pr.season_id = p_season_id
    group by pr.fpl_player_id, p.element_type
  ),
  model_xi as (
    select * from (
      select *, true as mand from proj
      where (element_type=1 and rn<=1) or (element_type=2 and rn<=3)
         or (element_type=3 and rn<=3) or (element_type=4 and rn<=1)
      union all
      select * from (
        select *, false from proj
        where (element_type=2 and rn between 4 and 5) or (element_type=3 and rn between 4 and 5)
           or (element_type=4 and rn between 2 and 3)
        order by proj_pts desc limit 3
      ) f2
    ) m
  ),
  model_actual as (
    select mx.fpl_player_id, coalesce(g.total_points, 0) as pts, mx.proj_pts
    from model_xi mx
    left join public.fpl_player_gameweeks g
      on g.fpl_player_id = mx.fpl_player_id and g.season_id = p_season_id
     and g.fpl_event_id = (select e from ev)
  )
  select
    (select e from ev)::integer,
    (select sum(points)::integer from totw),
    (select sum(pts)::integer from model_actual),
    (select count(*)::integer from totw t where t.fpl_player_id in (select fpl_player_id from model_xi)),
    (select round(sum(proj_pts)::numeric, 1) from model_actual),
    (select array_agg(t.web_name order by t.points desc) from totw t where t.fpl_player_id in (select fpl_player_id from model_xi));
$function$;

create or replace function public.get_model_xi_players(p_event_id integer, p_season_id bigint default fpl_current_season_id())
 returns table(fpl_player_id bigint, web_name text, team_name text, position_label text, element_type integer, projected_points numeric, actual_points integer, minutes integer, in_perfect_xi boolean)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  -- Projected points at the deadline (fpl_review_projections_v6, 22 Oct 2026).
  with proj as (
    select pr.fpl_player_id, p.element_type, p.web_name,
      sum(pr.expected_fpl_points) as proj_pts,
      row_number() over (partition by p.element_type order by sum(pr.expected_fpl_points) desc) as rn
    from public.fpl_review_projections_v6 pr
    join public.fpl_players p on p.fpl_player_id = pr.fpl_player_id and p.season_id = p_season_id
    where pr.season_id = p_season_id and pr.fpl_event_id = p_event_id
    group by pr.fpl_player_id, p.element_type, p.web_name
  ),
  model_xi as (
    select * from proj
    where (element_type=1 and rn<=1) or (element_type=2 and rn<=3)
       or (element_type=3 and rn<=3) or (element_type=4 and rn<=1)
    union all
    select * from (
      select * from proj
      where (element_type=2 and rn between 4 and 5) or (element_type=3 and rn between 4 and 5)
         or (element_type=4 and rn between 2 and 3)
      order by proj_pts desc limit 3
    ) rest
  ),
  totw as (select fpl_player_id from public.get_team_of_the_week(p_event_id, p_season_id))
  select mx.fpl_player_id::bigint,
         mx.web_name,
         coalesce(t.name, '')::text as team_name,
         (case mx.element_type when 1 then 'GK' when 2 then 'DEF' when 3 then 'MID' else 'FWD' end)::text,
         mx.element_type,
         round(mx.proj_pts, 1) as projected_points,
         coalesce(g.total_points, 0)::integer as actual_points,
         coalesce(g.minutes, 0)::integer as minutes,
         (mx.fpl_player_id in (select fpl_player_id from totw)) as in_perfect_xi
  from model_xi mx
  left join public.fpl_players p on p.fpl_player_id = mx.fpl_player_id and p.season_id = p_season_id
  left join public.fpl_teams t on t.fpl_team_id = p.fpl_team_id and t.season_id = p_season_id
  left join public.fpl_player_gameweeks g
    on g.fpl_player_id = mx.fpl_player_id and g.season_id = p_season_id and g.fpl_event_id = p_event_id
  order by mx.element_type, mx.proj_pts desc;
$function$;

create or replace function public.get_model_xi_history(p_season_id bigint default fpl_current_season_id(), p_league_id bigint default 1)
 returns table(fpl_event_id integer, actual_xi_points integer, model_xi_actual_points integer, model_xi_projected numeric, overlap_count integer, players_projected integer, generated_before_deadline boolean, deadline_time timestamp with time zone)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  -- p_league_id is kept for callers; FPL gameweeks are Premier League only.
  -- generated_before_deadline is true for a gameweek reviewed from its
  -- pre_deadline snapshot (fpl_review_projections_v6, 22 Oct 2026).
  with weeks as (
    select gw.fpl_event_id as e, gw.deadline_time
    from public.fpl_gameweeks gw
    where gw.season_id = p_season_id and gw.finished and gw.data_checked
  ),
  cover as (
    select pr.fpl_event_id as e,
           count(distinct pr.fpl_player_id)::int as players_projected,
           max(pr.generated_at) as last_generated
    from public.fpl_review_projections_v6 pr
    where pr.season_id = p_season_id
    group by pr.fpl_event_id
  )
  select w.e::integer, t.actual_xi_points, t.model_xi_actual_points, t.model_xi_projected,
         t.overlap_count, c.players_projected,
         (c.last_generated < w.deadline_time) as generated_before_deadline,
         w.deadline_time
  from weeks w
  join cover c on c.e = w.e
  cross join lateral public.get_totw_vs_model(w.e::int, p_season_id) t
  where c.players_projected > 0
  order by w.e;
$function$;

create or replace view public.fpl_prediction_actual_start_comparison with (security_invoker = true) as
 SELECT f.fixture_id,
    f.matchweek,
    f.kickoff_date,
    f.kickoff_time,
    a.team_id,
    a.fpl_player_id,
    a.player_name_source,
    a.web_name,
    a.starter AS actual_started,
    a.minutes AS actual_minutes,
    p.model_version,
    p.start_probability AS predicted_start_probability,
    p.expected_minutes AS predicted_minutes,
    p.generated_at,
    (p.generated_at < ((f.kickoff_date)::timestamp without time zone + (COALESCE(f.kickoff_time, '00:00:00'::time without time zone))::interval)) AS generated_pre_kickoff
   FROM ((fixture_actual_lineup_players a
     JOIN fixtures f ON ((f.fixture_id = a.fixture_id)))
     -- The deadline version (fpl_review_projections_v6) first (22 Oct 2026),
     -- else, as before, the newest row of any model.
     LEFT JOIN LATERAL ( SELECT q.model_version, q.start_probability, q.expected_minutes, q.generated_at
           FROM ( SELECT 'leaguewide_v6'::text AS model_version, rp.start_probability, rp.expected_minutes, rp.generated_at, 0 AS pri
                   FROM fpl_review_projections_v6 rp
                  WHERE ((rp.fixture_id = a.fixture_id) AND (rp.fpl_player_id = a.fpl_player_id))
                UNION ALL
                 SELECT pp.model_version, pp.start_probability, pp.expected_minutes, pp.generated_at, 1 AS pri
                   FROM fpl_player_projections pp
                  WHERE ((pp.fixture_id = a.fixture_id) AND (pp.fpl_player_id = a.fpl_player_id))) q
          ORDER BY q.pri, q.generated_at DESC
         LIMIT 1) p ON (true))
  WHERE (a.starter OR (a.minutes > 0));

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select '2026-10-22', 'data',
  'FPL reviews use the deadline snapshot',
  'Team of the Week vs model, Model XI and the start-accuracy comparison read the live projections for past gameweeks, which were rewritten after kick-off (audit DQ-07).',
  'New view fpl_review_projections_v6 (pre_deadline, else late, snapshot per gameweek; live rows only where a gameweek has no snapshot, GW1-5). get_totw_vs_model, get_model_xi_players, get_model_xi_history and fpl_prediction_actual_start_comparison read it. Gameweeks are FPL''s (fpl_fixtures.fpl_event_id).',
  'leaguewide_v6', 'leaguewide_v6', 'migration 20261022111000'
where not exists (select 1 from public.model_change_log where reference = 'migration 20261022111000');
