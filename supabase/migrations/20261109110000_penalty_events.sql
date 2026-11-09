-- Penalty goals from ESPN's free public scoreboard JSON (Chris, 9 Nov 2026:
-- "You shouldn't need a subscription to harvest penalty goals"; "Non penalty
-- xg and penalty goals are good concepts ... They make the set piece takers
-- very important").
--
-- FPL gives xG (Opta; a penalty is exactly 0.79) and penalties missed per
-- player-gameweek, but not penalties scored. The penalty-events Edge
-- Function reads each Premier League date from ESPN and stores every goal
-- with ESPN's penalty and own-goal flags here; teams and players are matched
-- to ours. public.fpl_player_penalties then gives penalties taken (scored +
-- missed), non-penalty goals and non-penalty xG (xG - 0.79 per penalty).
-- Safe to re-run.

create table if not exists public.penalty_import_runs (
  run_id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode text, triggered_by text,
  from_date date, to_date date,
  api_requests int not null default 0,
  matches int not null default 0, goals int not null default 0, penalty_goals int not null default 0,
  unmatched_players int not null default 0,
  detail_types jsonb, warnings text, error_message text,
  status text not null check (status in ('success', 'warning', 'failed'))
);

create table if not exists public.espn_pl_matches (
  espn_event_id text primary key,
  match_date date, kickoff timestamptz, completed boolean not null default false,
  home_name text, away_name text, home_score int, away_score int,
  home_team_id bigint references public.teams (team_id), away_team_id bigint references public.teams (team_id),
  fixture_id bigint references public.fixtures (fixture_id),
  run_id bigint references public.penalty_import_runs (run_id),
  updated_at timestamptz not null default now()
);

create table if not exists public.espn_pl_goals (
  goal_key text primary key,              -- md5(event, minute, player, type)
  espn_event_id text not null references public.espn_pl_matches (espn_event_id) on delete cascade,
  team_name text, player_name text, espn_player_id text,
  minute text, clock_seconds numeric,
  scoring boolean not null default true, penalty boolean not null default false, own_goal boolean not null default false,
  type_text text,
  team_id bigint references public.teams (team_id),
  fpl_player_id int,
  run_id bigint references public.penalty_import_runs (run_id)
);
create index if not exists espn_pl_goals_player_idx on public.espn_pl_goals (fpl_player_id) where penalty;

alter table public.penalty_import_runs enable row level security;
alter table public.espn_pl_matches enable row level security;
alter table public.espn_pl_goals enable row level security;
revoke all on public.penalty_import_runs, public.espn_pl_matches, public.espn_pl_goals from anon, authenticated;
grant select on public.penalty_import_runs, public.espn_pl_matches, public.espn_pl_goals to service_role;

-- Our team for an ESPN name: any alias we already hold, else display/canonical name.
create or replace function public.penalty_match_team(p_name text)
returns bigint language sql stable security definer set search_path = '' as $function$
  select t.team_id from public.teams t
   where lower(t.display_name) = lower(p_name) or lower(t.canonical_name) = lower(p_name)
      or exists (select 1 from public.team_aliases a where a.team_id = t.team_id and lower(a.raw_name) = lower(p_name))
   order by (exists (select 1 from public.fixtures f where f.league_id = 1 and f.season_id = 13 and t.team_id in (f.home_team_id, f.away_team_id))) desc,
            t.team_id
   limit 1
$function$;

-- Our FPL player for an ESPN name at a club: full name, then FPL's known
-- name, then surname, then web name (without its initial).
create or replace function public.penalty_match_player(p_team bigint, p_name text, p_season bigint default 13)
returns int language sql stable security definer set search_path = '' as $function$
  with n as (select lower(public.unaccent(coalesce(p_name, ''))) nm),
  c as (
    select p.fpl_player_id,
           lower(public.unaccent(coalesce(p.source_payload->>'first_name', '') || ' ' || coalesce(p.source_payload->>'second_name', ''))) full_name,
           lower(public.unaccent(coalesce(nullif(p.source_payload->>'known_name', ''), '~'))) known,
           lower(public.unaccent(coalesce(p.source_payload->>'second_name', '~'))) sn,
           lower(public.unaccent(regexp_replace(coalesce(p.web_name, '~'), '^.*\.', ''))) wn,
           coalesce((p.source_payload->>'minutes')::int, 0) mins
      from public.fpl_players p where p.season_id = p_season and p.canonical_team_id = p_team)
  select c.fpl_player_id from c, n
   where n.nm <> '' and (n.nm = c.full_name or n.nm = c.known or n.nm = c.sn or n.nm like '% ' || c.sn
          or n.nm = c.wn or n.nm like '% ' || c.wn or c.full_name like '% ' || split_part(n.nm, ' ', array_length(string_to_array(n.nm, ' '), 1)))
   order by case when n.nm = c.full_name then 0 when n.nm = c.known then 1 when n.nm = c.sn or n.nm like '% ' || c.sn then 2
                 when n.nm = c.wn or n.nm like '% ' || c.wn then 3 else 4 end, c.mins desc
   limit 1
$function$;

create or replace function public.penalty_import_rows()
returns bigint language sql stable security definer set search_path = '' as $function$
  select count(*) from public.espn_pl_matches where match_date >= date '2026-08-01'
$function$;

create or replace function public.penalty_import_store(p_run jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_id bigint;
  v_err text := nullif(p_run->>'error', '');
  v_warn text := nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(p_run->'warnings', '[]'::jsonb))), ' | '), '');
  v_status text;
  v_matches int := jsonb_array_length(coalesce(p_run->'matches', '[]'::jsonb));
  v_goals int; v_pens int; v_unmatched int;
begin
  v_status := case when v_err is not null then 'failed' when v_warn is not null then 'warning' else 'success' end;
  insert into public.penalty_import_runs (started_at, finished_at, mode, triggered_by, from_date, to_date, api_requests, matches, detail_types, warnings, error_message, status)
  values (coalesce((p_run->>'started_at')::timestamptz, now()), now(), p_run->>'mode', p_run->>'triggered_by',
          (p_run->>'from_date')::date, (p_run->>'to_date')::date, coalesce((p_run->>'api_requests')::int, 0), v_matches,
          p_run->'detail_types', left(v_warn, 4000), left(v_err, 2000), v_status)
  returning run_id into v_id;

  if v_status <> 'failed' then
    insert into public.espn_pl_matches (espn_event_id, match_date, kickoff, completed, home_name, away_name, home_score, away_score,
                                        home_team_id, away_team_id, run_id, updated_at)
    select x->>'espn_event_id', (x->>'date')::date, (x->>'kickoff')::timestamptz, coalesce((x->>'completed')::boolean, false),
           x->>'home', x->>'away', (x->>'home_score')::int, (x->>'away_score')::int,
           public.penalty_match_team(x->>'home'), public.penalty_match_team(x->>'away'), v_id, now()
      from jsonb_array_elements(coalesce(p_run->'matches', '[]'::jsonb)) x
    on conflict (espn_event_id) do update set match_date = excluded.match_date, kickoff = excluded.kickoff, completed = excluded.completed,
      home_name = excluded.home_name, away_name = excluded.away_name, home_score = excluded.home_score, away_score = excluded.away_score,
      home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id, run_id = excluded.run_id, updated_at = now();

    -- Our fixture: same teams, kickoff within a day (UK dates v UTC).
    update public.espn_pl_matches m set fixture_id = f.fixture_id
      from public.fixtures f
     where m.run_id = v_id and f.league_id = 1 and f.home_team_id = m.home_team_id and f.away_team_id = m.away_team_id
       and f.kickoff_date between m.match_date - 1 and m.match_date + 1;

    -- A re-read replaces that match's goals (ESPN corrections heal).
    delete from public.espn_pl_goals g
     where g.espn_event_id in (select x->>'espn_event_id' from jsonb_array_elements(coalesce(p_run->'matches', '[]'::jsonb)) x);
    insert into public.espn_pl_goals (goal_key, espn_event_id, team_name, player_name, espn_player_id, minute, clock_seconds,
                                      scoring, penalty, own_goal, type_text, team_id, run_id)
    select md5(concat_ws('|', x->>'espn_event_id', x->>'minute', x->>'player', x->>'type_text', x->>'clock_seconds')),
           x->>'espn_event_id', x->>'team', x->>'player', x->>'espn_player_id', x->>'minute', (x->>'clock_seconds')::numeric,
           coalesce((x->>'scoring')::boolean, true), coalesce((x->>'penalty')::boolean, false), coalesce((x->>'own_goal')::boolean, false),
           x->>'type_text', public.penalty_match_team(x->>'team'), v_id
      from jsonb_array_elements(coalesce(p_run->'goals', '[]'::jsonb)) x
     where exists (select 1 from public.espn_pl_matches m where m.espn_event_id = x->>'espn_event_id')
    on conflict (goal_key) do nothing;
    -- Own goals are credited to the other side by ESPN's team field; no player match for them.
    update public.espn_pl_goals g set fpl_player_id = public.penalty_match_player(g.team_id, g.player_name)
     where g.run_id = v_id and not g.own_goal and g.team_id is not null;
  end if;

  select count(*), count(*) filter (where penalty and scoring), count(*) filter (where fpl_player_id is null and not own_goal)
    into v_goals, v_pens, v_unmatched from public.espn_pl_goals where run_id = v_id;
  if v_status = 'success' and v_unmatched > 0 then v_status := 'warning'; end if;
  update public.penalty_import_runs set goals = v_goals, penalty_goals = v_pens, unmatched_players = v_unmatched, status = v_status where run_id = v_id;

  insert into public.pipeline_runs (job_name, started_at, finished_at, status, summary, error_message, rows_inserted)
  values ('penalty_import', coalesce((p_run->>'started_at')::timestamptz, now()), now(), v_status,
          format('%s: %s to %s, %s matches, %s goals (%s penalties), %s unmatched scorers, %s requests',
                 coalesce(p_run->>'mode', '?'), coalesce(p_run->>'from_date', '?'), coalesce(p_run->>'to_date', '?'),
                 v_matches, v_goals, v_pens, v_unmatched, coalesce(p_run->>'api_requests', '0')),
          case when v_status = 'failed' then left(v_err, 500) when v_warn is not null then left(v_warn, 500) end,
          v_goals);
  return jsonb_build_object('run_id', v_id, 'status', v_status, 'matches', v_matches, 'goals', v_goals, 'penalty_goals', v_pens, 'unmatched', v_unmatched);
end;
$function$;
revoke all on function public.penalty_import_store(jsonb), public.penalty_import_rows(), public.penalty_match_team(text),
  public.penalty_match_player(bigint, text, bigint) from public, anon, authenticated;
grant execute on function public.penalty_import_store(jsonb), public.penalty_import_rows(), public.penalty_match_team(text),
  public.penalty_match_player(bigint, text, bigint) to service_role;

-- Per player, this season: penalties scored (ESPN), missed (FPL), and the
-- non-penalty split. Opta values every penalty at 0.79 xG.
create or replace view public.fpl_player_penalties with (security_invoker = true) as
with fpl as (
  select g.fpl_player_id, sum(g.goals_scored) goals, sum(g.penalties_missed) pen_missed,
         sum(g.expected_goals) xg, sum(g.minutes) minutes
    from public.fpl_player_gameweeks g where g.season_id = 13 group by 1),
esp as (
  select g.fpl_player_id, count(*) filter (where g.penalty and g.scoring and not g.own_goal) pen_goals
    from public.espn_pl_goals g join public.espn_pl_matches m on m.espn_event_id = g.espn_event_id
   where m.match_date >= date '2026-08-01' and g.fpl_player_id is not null group by 1)
select p.fpl_player_id, p.web_name, p.canonical_team_id team_id, fpl.minutes,
       fpl.goals, coalesce(esp.pen_goals, 0) pen_goals, coalesce(fpl.pen_missed, 0) pen_missed,
       coalesce(esp.pen_goals, 0) + coalesce(fpl.pen_missed, 0) pens_taken,
       fpl.goals - coalesce(esp.pen_goals, 0) np_goals,
       round(fpl.xg::numeric, 2) xg,
       round(greatest(fpl.xg::numeric - 0.79 * (coalesce(esp.pen_goals, 0) + coalesce(fpl.pen_missed, 0)), 0), 2) npxg,
       nullif(p.source_payload->>'penalties_order', '')::int fpl_penalty_order
  from public.fpl_players p join fpl on fpl.fpl_player_id = p.fpl_player_id
  left join esp on esp.fpl_player_id = p.fpl_player_id
 where p.season_id = 13;
grant select on public.fpl_player_penalties to service_role;

-- pg_cron -> penalty-events with the worker token.
create or replace function private.penalty_import_call(p_mode text default 'auto')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform net.http_post(
    url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/penalty-events',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
    body := jsonb_build_object('mode', p_mode, 'triggered_by', 'schedule'), timeout_milliseconds := 150000);
end;
$$;
revoke all on function private.penalty_import_call(text) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'penalty-import') then
    -- After the evening games, and again early morning for late corrections.
    perform cron.schedule('penalty-import', '35 6,23 * * *', 'select private.penalty_import_call(''auto'')');
  end if;
end $$;

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, notes)
values
  ('penalty-import', 'fpl', 'supabase_cron', '35 6,23 * * *', interval '13 hours', interval '00:05:00', 'pg_cron', '^penalty-import$', null,
   'Twice a day: private.penalty_import_call(''auto'') calls the penalty-events Edge Function (ESPN scoreboard, free)'),
  ('penalty-events', 'fpl', 'edge_function', '35 6,23 * * * (via penalty-import)', interval '13 hours', interval '00:05:00', 'pipeline_runs', '^penalty_import$', 'site.api.espn.com',
   'Premier League goals with penalty flags into public.espn_pl_goals; feeds public.fpl_player_penalties (npxG, penalty goals)')
on conflict (job_key) do nothing;

-- First run now: backfills the season (the function is deployed before this applies).
select private.penalty_import_call('backfill');
