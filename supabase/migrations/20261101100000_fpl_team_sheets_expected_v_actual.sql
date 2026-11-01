-- Team sheets: expected v actual (Chris, 1 Nov 2026). Admin page
-- /admin/team-sheets: for every Premier League team-game this season, the
-- model's predicted XI against the real XI, and a naive baseline ("same XI as
-- the team's previous league game"), with the season trend. Admin only for
-- now; meant to open up once the model beats the baseline (drop the
-- _require_admin() calls in the two read functions and grant anon).
--
-- Actual XI: FPL live data (fpl_live_elements). A player started if FPL's
-- `starts` stat says so (the team's only fixture that gameweek); otherwise,
-- in a double gameweek, the 11 with most minutes in that fixture. `starts`
-- rather than minutes alone because "11 most minutes" counts a sub who came
-- on at half-time instead of the man he replaced (22 such cases in GW1-9).
-- A player's side comes from the fixture's own BPS list (h/a), so a player
-- who has since changed club still counts for the club he played for.
--
-- Predicted XI: the 11 highest start_probability per team, point in time:
--   * GW7+: fpl_deadline_player_horizon, snapshot_kind 'pre_deadline';
--   * GW6: fpl_projection_snapshots, snapshot_kind 'pre_deadline';
--   * otherwise only a model run stored in fpl_player_projections in the week
--     before the deadline (generated_at < deadline): GW5's 17 Sep run, a day
--     and a half before the deadline. Labelled 'model_run' on the page.
--   * GW1-4: no stored prediction. Never back-filled with hindsight.
-- Baseline: the team's starters in its previous league fixture.
--
-- private.refresh_fpl_team_sheets() fills public.fpl_team_sheet_results; a
-- row is final once FPL marks the fixture finished, and is not recomputed
-- after that (p_all => true recomputes everything). pg_cron, hourly; it does
-- nothing when every played fixture already has final rows. Safe to re-run.

create table if not exists public.fpl_team_sheet_results (
  season_id bigint not null,
  fpl_event_id integer not null,
  fpl_fixture_id integer not null,
  fpl_team_id integer not null,
  canonical_fixture_id bigint,
  canonical_team_id bigint,
  opponent_fpl_team_id integer not null,
  is_home boolean not null,
  kickoff_time timestamptz not null,
  starters integer not null,                 -- 11 unless FPL's data is short
  model_source text check (model_source in ('pre_deadline_snapshot', 'model_run')),
  model_version text,
  model_at timestamptz,                      -- when the prediction was taken
  model_matched integer,                     -- of the 11 predicted, how many started; null = no prediction
  baseline_fpl_fixture_id integer,           -- the team's previous league fixture; null in its first
  baseline_matched integer,
  -- [{id, name, pos, sp, own, started, mins}] in order of start chance
  predicted jsonb not null default '[]'::jsonb,
  -- [{id, name, pos, mins, sp, own, predicted, in_baseline}]
  actual jsonb not null default '[]'::jsonb,
  -- [{id, name, pos, own, started}]
  baseline jsonb not null default '[]'::jsonb,
  final boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (season_id, fpl_fixture_id, fpl_team_id)
);
create index if not exists fpl_team_sheet_results_event_idx on public.fpl_team_sheet_results (season_id, fpl_event_id);
alter table public.fpl_team_sheet_results enable row level security;
revoke all on public.fpl_team_sheet_results from anon, authenticated;
comment on table public.fpl_team_sheet_results is
  'One row per Premier League team-game: the model''s pre-deadline predicted XI v the actual XI (FPL live data) v the previous game''s XI. Filled by private.refresh_fpl_team_sheets (pg_cron fpl-team-sheets, hourly). Read through public.get_team_sheet_accuracy / get_team_sheet_detail (admin only).';

create or replace function private.refresh_fpl_team_sheets(p_season bigint default null, p_all boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_season bigint := coalesce(p_season, public.fpl_current_season_id());
  v_due integer;
  v_rows integer;
begin
  -- Anything to do? A played fixture with a team still lacking a final row.
  select count(*) into v_due
    from public.fpl_fixtures f
   where f.season_id = v_season and f.fpl_event_id is not null
     and f.kickoff_time < now() - interval '2 hours'
     and (coalesce(f.started, false) or coalesce(f.finished, false))
     and (p_all or exists (
           select 1 from (values (f.fpl_home_team_id), (f.fpl_away_team_id)) t(tid)
            where not exists (select 1 from public.fpl_team_sheet_results r
                               where r.season_id = v_season and r.fpl_fixture_id = f.fpl_fixture_id
                                 and r.fpl_team_id = t.tid and r.final)));
  if v_due = 0 then
    return jsonb_build_object('season_id', v_season, 'due', 0, 'written', 0);
  end if;

  with
  fx as (
    select f.fpl_fixture_id, f.fpl_event_id ev, f.canonical_fixture_id cf, f.fpl_home_team_id th, f.fpl_away_team_id ta,
           f.kickoff_time ko, coalesce(f.finished, false) finished, g.deadline_time dl, f.source_payload pl
      from public.fpl_fixtures f
      join public.fpl_gameweeks g on g.season_id = f.season_id and g.fpl_event_id = f.fpl_event_id
     where f.season_id = v_season and f.kickoff_time < now() - interval '2 hours'
       and (coalesce(f.started, false) or coalesce(f.finished, false))),
  -- team-games per gameweek: 2 in a double gameweek
  tg as (select ev, tid, count(*) n from (select ev, th tid from fx union all select ev, ta from fx) z group by 1, 2),
  -- the fixture's own record of who played for which side
  side as (
    select fx.fpl_fixture_id, (el->>'element')::int pid, case kk.k when 'h' then fx.th else fx.ta end tid
      from fx
      cross join lateral jsonb_array_elements(coalesce(fx.pl->'stats', '[]'::jsonb)) s
      cross join lateral (values ('h'), ('a')) kk(k)
      cross join lateral jsonb_array_elements(coalesce(s->kk.k, '[]'::jsonb)) el
     where s->>'identifier' = 'bps'),
  mins as (
    select fx.fpl_fixture_id, fx.ev, fx.th, fx.ta, fx.ko, e.fpl_player_id pid, (s->>'value')::int m,
           coalesce((e.stats->>'starts')::int, 0) st
      from fx
      join public.fpl_live_elements e on e.season_id = v_season and e.fpl_event_id = fx.ev
      cross join lateral jsonb_array_elements(coalesce(e.explain, '[]'::jsonb)) x
      cross join lateral jsonb_array_elements(coalesce(x->'stats', '[]'::jsonb)) s
     where (x->>'fixture')::int = fx.fpl_fixture_id and s->>'identifier' = 'minutes' and (s->>'value')::int > 0),
  played as (
    select m.*, coalesce(sd.tid,
             (select ps.fpl_team_id from public.fpl_player_snapshots ps
               where ps.season_id = v_season and ps.fpl_player_id = m.pid and ps.snapshot_date <= m.ko::date
                 and ps.fpl_team_id in (m.th, m.ta)
               order by ps.snapshot_date desc limit 1),
             (select p.fpl_team_id from public.fpl_players p
               where p.season_id = v_season and p.fpl_player_id = m.pid and p.fpl_team_id in (m.th, m.ta))) tid
      from mins m
      left join side sd on sd.fpl_fixture_id = m.fpl_fixture_id and sd.pid = m.pid),
  starters as (
    select * from (
      select a.*, row_number() over (partition by a.fpl_fixture_id, a.tid
                                     order by case when t.n = 1 then a.st else 0 end desc, a.m desc, a.pid) rn
        from played a join tg t on t.ev = a.ev and t.tid = a.tid
       where a.tid is not null) z
     where rn <= 11),
  -- the prediction, point in time (see header). One model version per
  -- fixture: the one most recently run before the snapshot. The projection
  -- snapshots also carry rows of the retired leaguewide_v4, left over from
  -- 17 Sep, beside the live leaguewide_v6.
  dph_ver as (
    select distinct on (fx.fpl_fixture_id) fx.fpl_fixture_id, h.model_version mv, h.snapshot_at at
      from fx
      join public.fpl_deadline_player_horizon h
        on h.season_id = v_season and h.fpl_event_id = fx.ev and h.snapshot_kind = 'pre_deadline'
       and h.fixture_id = fx.cf and h.snapshot_at < fx.dl and h.start_probability is not null
     order by fx.fpl_fixture_id, h.snapshot_at desc, h.model_version desc),
  src_dph as (
    select distinct on (fx.fpl_fixture_id, h.fpl_player_id)
           fx.fpl_fixture_id, fx.th, fx.ta, fx.dl, h.fpl_player_id::int pid, h.start_probability sp, h.model_version mv, h.snapshot_at at
      from fx
      join dph_ver v on v.fpl_fixture_id = fx.fpl_fixture_id
      join public.fpl_deadline_player_horizon h
        on h.season_id = v_season and h.fpl_event_id = fx.ev and h.snapshot_kind = 'pre_deadline'
       and h.fixture_id = fx.cf and h.snapshot_at = v.at and h.model_version = v.mv and h.start_probability is not null
     order by fx.fpl_fixture_id, h.fpl_player_id, h.start_probability desc),
  ps_ver as (
    select distinct on (fx.fpl_fixture_id) fx.fpl_fixture_id, h.model_version mv, h.snapshot_at at
      from fx
      join public.fpl_projection_snapshots h
        on h.season_id = v_season and h.fpl_event_id = fx.ev and h.snapshot_kind = 'pre_deadline'
       and h.fixture_id = fx.cf and h.snapshot_at < fx.dl and h.start_probability is not null
     where not exists (select 1 from dph_ver d where d.fpl_fixture_id = fx.fpl_fixture_id)
     order by fx.fpl_fixture_id, h.snapshot_at desc, h.projection_generated_at desc nulls last, h.model_version desc),
  src_ps as (
    select distinct on (fx.fpl_fixture_id, h.fpl_player_id)
           fx.fpl_fixture_id, fx.th, fx.ta, fx.dl, h.fpl_player_id::int pid, h.start_probability sp, h.model_version mv, h.snapshot_at at
      from fx
      join ps_ver v on v.fpl_fixture_id = fx.fpl_fixture_id
      join public.fpl_projection_snapshots h
        on h.season_id = v_season and h.fpl_event_id = fx.ev and h.snapshot_kind = 'pre_deadline'
       and h.fixture_id = fx.cf and h.snapshot_at = v.at and h.model_version = v.mv and h.start_probability is not null
     order by fx.fpl_fixture_id, h.fpl_player_id, h.projection_generated_at desc nulls last),
  run_ver as (
    select distinct on (fx.fpl_fixture_id) fx.fpl_fixture_id, p.model_version mv
      from fx
      join public.fpl_player_projections p
        on p.season_id = v_season and p.fixture_id = fx.cf and p.start_probability is not null
       and p.generated_at < fx.dl and p.generated_at >= fx.dl - interval '7 days'
     where not exists (select 1 from dph_ver d where d.fpl_fixture_id = fx.fpl_fixture_id)
       and not exists (select 1 from ps_ver d where d.fpl_fixture_id = fx.fpl_fixture_id)
     order by fx.fpl_fixture_id, p.generated_at desc),
  src_run as (
    select distinct on (fx.fpl_fixture_id, p.fpl_player_id)
           fx.fpl_fixture_id, fx.th, fx.ta, fx.dl, p.fpl_player_id pid, p.start_probability sp, p.model_version mv, p.generated_at at
      from fx
      join run_ver v on v.fpl_fixture_id = fx.fpl_fixture_id
      join public.fpl_player_projections p
        on p.season_id = v_season and p.fixture_id = fx.cf and p.start_probability is not null and p.model_version = v.mv
       and p.generated_at < fx.dl and p.generated_at >= fx.dl - interval '7 days'
     order by fx.fpl_fixture_id, p.fpl_player_id, p.generated_at desc),
  src as (
    select 'pre_deadline_snapshot' kind, * from src_dph
    union all select 'pre_deadline_snapshot', * from src_ps
    union all select 'model_run', * from src_run),
  -- club at the time of the prediction
  snap as (
    select s.*, coalesce(
             (select ps.fpl_team_id from public.fpl_player_snapshots ps
               where ps.season_id = v_season and ps.fpl_player_id = s.pid and ps.snapshot_date <= s.at::date
               order by ps.snapshot_date desc limit 1),
             (select p.fpl_team_id from public.fpl_players p where p.season_id = v_season and p.fpl_player_id = s.pid)) tid
      from src s),
  model as (
    select * from (
      select snap.*, row_number() over (partition by fpl_fixture_id, tid order by sp desc, pid) rn,
             count(*) over (partition by fpl_fixture_id, tid) n
        from snap where tid in (th, ta)) z
     where rn <= 11 and n >= 11),
  games as (
    select s.fpl_fixture_id, s.tid, count(*) starters
      from starters s group by 1, 2),
  g2 as (
    select g.*, fx.ev, fx.cf, fx.ko, fx.dl, fx.finished, fx.th, fx.ta,
           (select p.fpl_fixture_id from games p join fx f2 on f2.fpl_fixture_id = p.fpl_fixture_id
             where p.tid = g.tid and f2.ko < fx.ko order by f2.ko desc limit 1) prev
      from games g join fx on fx.fpl_fixture_id = g.fpl_fixture_id),
  -- ownership as it stood before the deadline
  own as (
    select pl.fpl_player_id pid, pl.web_name nm, pl.element_type et, pl.selected_by_percent own_now
      from public.fpl_players pl where pl.season_id = v_season),
  rows_out as (
    select g.*,
           (select max(m.kind) from model m where m.fpl_fixture_id = g.fpl_fixture_id and m.tid = g.tid) kind,
           (select max(m.mv) from model m where m.fpl_fixture_id = g.fpl_fixture_id and m.tid = g.tid) mv,
           (select max(m.at) from model m where m.fpl_fixture_id = g.fpl_fixture_id and m.tid = g.tid) mat
      from g2 g)
  insert into public.fpl_team_sheet_results as r (
    season_id, fpl_event_id, fpl_fixture_id, fpl_team_id, canonical_fixture_id, canonical_team_id,
    opponent_fpl_team_id, is_home, kickoff_time, starters, model_source, model_version, model_at,
    model_matched, baseline_fpl_fixture_id, baseline_matched, predicted, actual, baseline, final, computed_at)
  select v_season, o.ev, o.fpl_fixture_id, o.tid, o.cf,
         (select t.canonical_team_id from public.fpl_teams t where t.season_id = v_season and t.fpl_team_id = o.tid),
         case when o.tid = o.th then o.ta else o.th end, o.tid = o.th, o.ko, o.starters,
         o.kind, o.mv, o.mat,
         case when o.kind is not null then
           (select count(*) from model m join starters s on s.fpl_fixture_id = m.fpl_fixture_id and s.pid = m.pid and s.tid = m.tid
             where m.fpl_fixture_id = o.fpl_fixture_id and m.tid = o.tid)::int end,
         o.prev,
         case when o.prev is not null then
           (select count(*) from starters s join starters b on b.fpl_fixture_id = o.prev and b.tid = o.tid and b.pid = s.pid
             where s.fpl_fixture_id = o.fpl_fixture_id and s.tid = o.tid)::int end,
         -- predicted XI
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', m.pid, 'name', w.nm, 'pos', w.et, 'sp', round(m.sp, 3), 'own', coalesce(ow.own, w.own_now),
                     'started', s.pid is not null, 'mins', coalesce(pm.m, 0)) order by m.sp desc, m.pid)
                     from model m
                     join own w on w.pid = m.pid
                     left join starters s on s.fpl_fixture_id = m.fpl_fixture_id and s.tid = m.tid and s.pid = m.pid
                     left join played pm on pm.fpl_fixture_id = m.fpl_fixture_id and pm.pid = m.pid
                     left join lateral (select ps.selected_by_percent own from public.fpl_player_snapshots ps
                                         where ps.season_id = v_season and ps.fpl_player_id = m.pid and ps.snapshot_date <= o.dl::date
                                         order by ps.snapshot_date desc limit 1) ow on true
                    where m.fpl_fixture_id = o.fpl_fixture_id and m.tid = o.tid), '[]'::jsonb),
         -- actual XI
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', s.pid, 'name', w.nm, 'pos', w.et, 'mins', s.m,
                     'sp', case when o.kind is not null then round(coalesce(sn.sp, 0), 3) end,
                     'own', coalesce(ow.own, w.own_now),
                     'predicted', case when o.kind is not null then mm.pid is not null end,
                     'in_baseline', case when o.prev is not null then b.pid is not null end)
                     order by w.et, s.m desc, s.pid)
                     from starters s
                     join own w on w.pid = s.pid
                     left join snap sn on sn.fpl_fixture_id = s.fpl_fixture_id and sn.pid = s.pid and sn.tid = s.tid
                     left join model mm on mm.fpl_fixture_id = s.fpl_fixture_id and mm.tid = s.tid and mm.pid = s.pid
                     left join starters b on b.fpl_fixture_id = o.prev and b.tid = s.tid and b.pid = s.pid
                     left join lateral (select ps.selected_by_percent own from public.fpl_player_snapshots ps
                                         where ps.season_id = v_season and ps.fpl_player_id = s.pid and ps.snapshot_date <= o.dl::date
                                         order by ps.snapshot_date desc limit 1) ow on true
                    where s.fpl_fixture_id = o.fpl_fixture_id and s.tid = o.tid), '[]'::jsonb),
         -- baseline: last game's XI
         coalesce((select jsonb_agg(jsonb_build_object(
                     'id', b.pid, 'name', w.nm, 'pos', w.et, 'own', coalesce(ow.own, w.own_now),
                     'started', s.pid is not null) order by w.et, b.m desc, b.pid)
                     from starters b
                     join own w on w.pid = b.pid
                     left join starters s on s.fpl_fixture_id = o.fpl_fixture_id and s.tid = o.tid and s.pid = b.pid
                     left join lateral (select ps.selected_by_percent own from public.fpl_player_snapshots ps
                                         where ps.season_id = v_season and ps.fpl_player_id = b.pid and ps.snapshot_date <= o.dl::date
                                         order by ps.snapshot_date desc limit 1) ow on true
                    where b.fpl_fixture_id = o.prev and b.tid = o.tid), '[]'::jsonb),
         o.finished and o.starters = 11,
         now()
    from rows_out o
  on conflict (season_id, fpl_fixture_id, fpl_team_id) do update set
    fpl_event_id = excluded.fpl_event_id, canonical_fixture_id = excluded.canonical_fixture_id,
    canonical_team_id = excluded.canonical_team_id, opponent_fpl_team_id = excluded.opponent_fpl_team_id,
    is_home = excluded.is_home, kickoff_time = excluded.kickoff_time, starters = excluded.starters,
    model_source = excluded.model_source, model_version = excluded.model_version, model_at = excluded.model_at,
    model_matched = excluded.model_matched, baseline_fpl_fixture_id = excluded.baseline_fpl_fixture_id,
    baseline_matched = excluded.baseline_matched, predicted = excluded.predicted, actual = excluded.actual,
    baseline = excluded.baseline, final = excluded.final, computed_at = excluded.computed_at
  where p_all or not r.final;
  get diagnostics v_rows = row_count;

  return jsonb_build_object('season_id', v_season, 'due', v_due, 'written', v_rows);
end;
$function$;

comment on function private.refresh_fpl_team_sheets(bigint, boolean) is
  'Fills public.fpl_team_sheet_results for played fixtures (predicted v actual v previous-game XI). Skips final rows unless p_all. pg_cron fpl-team-sheets, hourly.';
revoke all on function private.refresh_fpl_team_sheets(bigint, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- /admin/team-sheets list: one entry per team-game, without the XIs.
-- ---------------------------------------------------------------------------
create or replace function public.get_team_sheet_accuracy(p_season_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_season bigint := coalesce(p_season_id, public.fpl_current_season_id());
  v_out jsonb;
begin
  perform public._require_admin();

  select jsonb_build_object(
    'season_id', v_season,
    'computed_at', (select max(r.computed_at) from public.fpl_team_sheet_results r where r.season_id = v_season),
    'games', coalesce(jsonb_agg(jsonb_build_object(
        'gw', r.fpl_event_id, 'fixture_id', r.fpl_fixture_id, 'team_id', r.fpl_team_id,
        'team', t.name, 'team_short', t.short_name, 'opponent', o.name, 'opponent_short', o.short_name,
        'home', r.is_home, 'kickoff', r.kickoff_time, 'starters', r.starters, 'final', r.final,
        'model_source', r.model_source, 'model_version', r.model_version, 'model_at', r.model_at,
        'model_matched', r.model_matched, 'baseline_matched', r.baseline_matched,
        -- the starter we gave the lowest chance
        'surprise', (select jsonb_build_object('name', a->>'name', 'sp', (a->>'sp')::numeric)
                       from jsonb_array_elements(r.actual) a
                      where (a->>'predicted')::boolean is false
                      order by (a->>'sp')::numeric, a->>'name' limit 1),
        -- the predicted starter who didn't start, most owned first
        'left_out', (select jsonb_build_object('name', p->>'name', 'sp', (p->>'sp')::numeric, 'own', (p->>'own')::numeric)
                       from jsonb_array_elements(r.predicted) p
                      where (p->>'started')::boolean is false
                      order by (p->>'own')::numeric desc nulls last, (p->>'sp')::numeric desc limit 1),
        'new_in', (select coalesce(jsonb_agg(a->>'name' order by a->>'name'), '[]'::jsonb)
                     from jsonb_array_elements(r.actual) a where (a->>'in_baseline')::boolean is false)
      ) order by r.fpl_event_id, r.kickoff_time, r.fpl_fixture_id, r.is_home desc), '[]'::jsonb)
  ) into v_out
  from public.fpl_team_sheet_results r
  left join public.fpl_teams t on t.season_id = r.season_id and t.fpl_team_id = r.fpl_team_id
  left join public.fpl_teams o on o.season_id = r.season_id and o.fpl_team_id = r.opponent_fpl_team_id
  where r.season_id = v_season;

  return v_out;
end;
$function$;

revoke all on function public.get_team_sheet_accuracy(bigint) from public, anon;
grant execute on function public.get_team_sheet_accuracy(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- /admin/team-sheets detail for one team-game: the XIs, plus formation,
-- positions and substitutions from the BBC screenshots where we have them.
-- ---------------------------------------------------------------------------
create or replace function public.get_team_sheet_detail(p_season_id bigint, p_fpl_fixture_id integer, p_fpl_team_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_out jsonb;
begin
  perform public._require_admin();

  select jsonb_build_object(
    'fixture_id', r.fpl_fixture_id, 'team_id', r.fpl_team_id, 'gw', r.fpl_event_id,
    'model_source', r.model_source, 'model_version', r.model_version, 'model_at', r.model_at,
    'baseline_fixture_id', r.baseline_fpl_fixture_id,
    'baseline_opponent', (select o.short_name from public.fpl_fixtures bf
                            join public.fpl_teams o on o.season_id = bf.season_id
                             and o.fpl_team_id = case when bf.fpl_home_team_id = r.fpl_team_id then bf.fpl_away_team_id else bf.fpl_home_team_id end
                           where bf.season_id = r.season_id and bf.fpl_fixture_id = r.baseline_fpl_fixture_id),
    'predicted', r.predicted, 'actual', r.actual, 'baseline', r.baseline,
    'formation', (select tm.formation from public.team_match_tactics tm
                   where tm.fixture_id = r.canonical_fixture_id and tm.team_id = r.canonical_team_id
                     and tm.source_name = 'bbc_screenshot'
                   order by tm.observed_at desc nulls last limit 1),
    'roles', (select coalesce(jsonb_object_agg(lp.fpl_player_id::text, lp.tactical_role), '{}'::jsonb)
                from public.fixture_lineup_positions lp
               where lp.fixture_id = r.canonical_fixture_id and lp.team_id = r.canonical_team_id
                 and lp.source_name = 'bbc_screenshot' and lp.fpl_player_id is not null),
    'subs', (select coalesce(jsonb_agg(jsonb_build_object(
                'minute', s.minute, 'off_id', s.player_off_fpl_id, 'on_id', s.player_on_fpl_id,
                'off', coalesce(poff.web_name, s.name_off), 'on', coalesce(pon.web_name, s.name_on))
               order by s.minute nulls last, s.name_on), '[]'::jsonb)
               from public.fixture_lineup_substitutions s
               left join public.fpl_players poff on poff.season_id = r.season_id and poff.fpl_player_id = s.player_off_fpl_id
               left join public.fpl_players pon on pon.season_id = r.season_id and pon.fpl_player_id = s.player_on_fpl_id
              where s.fixture_id = r.canonical_fixture_id and s.team_id = r.canonical_team_id
                and s.source_name = 'bbc_screenshot'),
    'subs_complete', (select bool_or(c.complete) from public.fixture_lineup_sub_coverage c
                       where c.fixture_id = r.canonical_fixture_id and c.team_id = r.canonical_team_id
                         and c.source_name = 'bbc_screenshot')
  ) into v_out
  from public.fpl_team_sheet_results r
  where r.season_id = p_season_id and r.fpl_fixture_id = p_fpl_fixture_id and r.fpl_team_id = p_fpl_team_id;

  return v_out;
end;
$function$;

revoke all on function public.get_team_sheet_detail(bigint, integer, integer) from public, anon;
grant execute on function public.get_team_sheet_detail(bigint, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Hourly; registered so job_health notices if it stops. Backfill the season.
-- ---------------------------------------------------------------------------
select cron.unschedule('fpl-team-sheets') where exists (select 1 from cron.job where jobname = 'fpl-team-sheets');
select cron.schedule('fpl-team-sheets', '41 * * * *', $$select private.refresh_fpl_team_sheets()$$);

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, notes)
values ('fpl-team-sheets', 'fpl', 'supabase_cron', '41 * * * *', interval '3 hours', interval '00:05:00',
        'pg_cron', '^fpl-team-sheets$', null,
        'Predicted v actual v previous-game XIs per team-game for /admin/team-sheets; no-op when every played fixture is final')
on conflict (job_key) do update
  set schedule = excluded.schedule, expected_interval = excluded.expected_interval,
      max_duration = excluded.max_duration, run_key = excluded.run_key, notes = excluded.notes;

select private.refresh_fpl_team_sheets(public.fpl_current_season_id(), true);

do $$
begin
  if to_regprocedure('public.meta_refresh_flow()') is not null then
    perform public.meta_refresh_flow();
    update public.meta_flow_nodes set layer = 'admin', status = 'current', is_public = false, ai_relevant = false,
      purpose = 'Admin Team sheets page (/admin/team-sheets): every team-game this season, the model''s pre-deadline predicted XI v the actual XI and the previous game''s XI. Admin only.',
      refresh_note = 'Reads fpl_team_sheet_results (private.refresh_fpl_team_sheets, pg_cron fpl-team-sheets hourly).',
      purpose_reviewed_at = now()
    where node_key in ('function:get_team_sheet_accuracy(p_season_id bigint)',
                       'function:get_team_sheet_detail(p_season_id bigint, p_fpl_fixture_id integer, p_fpl_team_id integer)');
  end if;
end $$;
