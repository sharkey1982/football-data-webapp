-- ============================================================================
-- Line-ups v our model: record privately, post only once the model earns it
-- (Chris, 25 Oct 2026: "The model needs to show it is half decent first", and
-- "you sound like a bot if you act totally surprised ... there needs to be a
-- round of analysis when expected starters are missing").
--
-- First real slot (25 Oct, 14:00, 8 teams): model 71 of 88 starters, "same XI
-- as their last league game" 70 of 88. Barely better than the naive guess.
--
--   * social_lineup_checks: per team per game, starters the model expected
--     and starters a "same as last league game" guess got, with the players
--     left out and each one's reason as far as our data shows: flagged at the
--     deadline, flagged since, played a cup/European game in the 5 days
--     before, played no minutes in the last league game, or none in our data.
--   * The line-ups detector records every slot; it makes a post only when
--     social_settings.lineup_posts_enabled (off). Chris switches it on once
--     the model clearly beats the naive guess over several gameweeks.
-- ============================================================================

alter table public.social_settings add column if not exists lineup_posts_enabled boolean not null default false;

create table if not exists public.social_lineup_checks (
  check_id bigint generated always as identity primary key,
  season_id bigint not null,
  fpl_event_id integer not null,
  fpl_fixture_id integer not null,
  kickoff_time timestamptz not null,
  fpl_team_id integer not null,
  team text,
  starters integer not null,
  model_matched integer not null,
  last_xi_matched integer,
  left_out jsonb not null default '[]',       -- model XI players not starting, with reason
  surprise_starters jsonb not null default '[]',
  recorded_at timestamptz not null default now(),
  unique (season_id, fpl_fixture_id, fpl_team_id)
);
alter table public.social_lineup_checks enable row level security;
grant select, insert, update on public.social_lineup_checks to service_role;
grant usage, select on sequence public.social_lineup_checks_check_id_seq to service_role;
drop policy if exists social_lineup_checks_admin_read on public.social_lineup_checks;
create policy social_lineup_checks_admin_read on public.social_lineup_checks for select to authenticated using (public.is_admin());
grant select on public.social_lineup_checks to authenticated;

-- The 11 with most minutes for one FPL fixture (FPL live data; per fixture, so double gameweeks are right).
create or replace function private.social_lineup_starters(p_season bigint, p_fpl_fixture_id integer)
returns table (fpl_team_id integer, fpl_player_id integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select z.fpl_team_id, z.fpl_player_id from (
    select p.fpl_team_id, e.fpl_player_id,
           row_number() over (partition by p.fpl_team_id order by (s->>'value')::int desc, e.fpl_player_id) rn
      from public.fpl_fixtures ff
      join public.fpl_live_elements e on e.season_id = p_season and e.fpl_event_id = ff.fpl_event_id
      cross join lateral jsonb_array_elements(coalesce(e.explain, '[]')) x
      cross join lateral jsonb_array_elements(coalesce(x->'stats', '[]')) s
      join public.fpl_players p on p.season_id = p_season and p.fpl_player_id = e.fpl_player_id
     where ff.season_id = p_season and ff.fpl_fixture_id = p_fpl_fixture_id
       and (x->>'fixture')::int = ff.fpl_fixture_id and s->>'identifier' = 'minutes' and (s->>'value')::int > 0
       and p.fpl_team_id in (ff.fpl_home_team_id, ff.fpl_away_team_id)) z
  where z.rn <= 11
$$;

-- Record one slot's games (idempotent: the first complete reading stands).
create or replace function private.social_record_lineup_checks(p_season bigint, p_fixtures jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare f jsonb; t jsonb; ff record; v_tid integer; v_prev integer; v_last integer; n integer := 0;
begin
  for f in select x from jsonb_array_elements(p_fixtures) x loop
    select * into ff from public.fpl_fixtures where season_id = p_season and fpl_fixture_id = (f->>'fpl_fixture_id')::int;
    for t in select x from jsonb_array_elements(f->'teams') x loop
      v_tid := case t->>'side' when 'home' then ff.fpl_home_team_id else ff.fpl_away_team_id end;
      -- The team's previous league game.
      select p.fpl_fixture_id into v_prev from public.fpl_fixtures p
       where p.season_id = p_season and v_tid in (p.fpl_home_team_id, p.fpl_away_team_id) and p.kickoff_time < ff.kickoff_time
       order by p.kickoff_time desc limit 1;
      select count(*) into v_last
        from private.social_lineup_starters(p_season, ff.fpl_fixture_id) s
        join private.social_lineup_starters(p_season, v_prev) l using (fpl_team_id, fpl_player_id)
       where s.fpl_team_id = v_tid;
      insert into public.social_lineup_checks (season_id, fpl_event_id, fpl_fixture_id, kickoff_time, fpl_team_id, team,
                                               starters, model_matched, last_xi_matched, left_out, surprise_starters)
      values (p_season, ff.fpl_event_id, ff.fpl_fixture_id, ff.kickoff_time, v_tid, t->>'team',
              (t->>'started')::int, (t->>'matched')::int, case when v_prev is null then null else v_last end,
              (select coalesce(jsonb_agg(o || jsonb_build_object('reason',
                 case
                   when ds.status is not null and ds.status <> 'a' then 'flagged at deadline: ' || coalesce(nullif(ds.news, ''), ds.status)
                   when pl.status <> 'a' then 'flagged since the deadline: ' || coalesce(nullif(pl.news, ''), pl.status)
                   when exists (select 1 from public.cup_lineup_players c join public.fixtures cf on cf.fixture_id = c.fixture_id
                                 where c.fpl_player_id = (o->>'id')::int and coalesce(c.started, false)
                                   and cf.kickoff_date between (ff.kickoff_time at time zone 'Europe/London')::date - 5
                                                           and (ff.kickoff_time at time zone 'Europe/London')::date - 1)
                     then 'started a cup or European game in the previous 5 days'
                   when v_prev is not null and not exists (select 1 from private.social_lineup_starters(p_season, v_prev) l where l.fpl_player_id = (o->>'id')::int)
                     then 'did not start the last league game'
                   else 'no reason in our data' end)), '[]')
                 from jsonb_array_elements(t->'outs') o
                 left join public.fpl_deadline_player_state ds on ds.season_id = p_season and ds.fpl_event_id = ff.fpl_event_id
                                                              and ds.snapshot_kind = 'pre_deadline' and ds.fpl_player_id = (o->>'id')::int
                 left join public.fpl_players pl on pl.season_id = p_season and pl.fpl_player_id = (o->>'id')::int),
              t->'ins')
      on conflict (season_id, fpl_fixture_id, fpl_team_id) do nothing;
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

create or replace function pg_temp.social_patch(p_sig text, p_old text, p_new text) returns void language plpgsql as $f$
declare d text; n integer;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_new in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, p_old, ''))) / length(p_old);
  if n <> 1 then raise exception 'social_patch: % anchor found % times: %', p_sig, n, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end;
$f$;

-- Record every slot; build a post only when line-up posts are switched on.
select pg_temp.social_patch('private.social_detect_lineups(bigint)',
  $o$    select sum((e->>'matched')::int), sum((e->>'started')::int)$o$,
  $n$    perform private.social_record_lineup_checks(v_season, v_all);
    if not coalesce((select lineup_posts_enabled from public.social_settings), false) then
      v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'recorded', 'reason', 'line-up posts are off: recorded only');
      continue;
    end if;
    select sum((e->>'matched')::int), sum((e->>'started')::int)$n$);

-- No "biggest surprise" framing: a plain statement of who we expected.
select pg_temp.social_patch('private.social_detect_lineups(bigint)',
  $o$format(E'\n\nBiggest surprise: %s (%s) not starting. We gave him %s to start, and %s of FPL managers own him.',$o$,
  $n$format(E'\n\nNot starting: %s (%s). We had him at %s to start; %s of FPL managers own him.',$n$);
select pg_temp.social_patch('private.social_detect_lineups(bigint)',
  $o$format(E'\n\nBiggest surprise: %s (%s) starts. We gave him %s.',$o$,
  $n$format(E'\n\nStarting: %s (%s). We had him at %s.',$n$);

-- The 14:00 slot today (already a draft, not posted): record it too.
do $$
declare v jsonb;
begin
  select source_data->'fixtures' into v from public.social_post_candidates where dedupe_key = 'lineups:2026-10-25 14:00';
  if v is not null then perform private.social_record_lineup_checks(13, v); end if;
end $$;
update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
 where dedupe_key = 'lineups:2026-10-25 14:00' and publication_status = 'unpublished' and approval_status = 'pending';
