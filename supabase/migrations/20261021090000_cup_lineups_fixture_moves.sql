-- ============================================================================
-- Midweek lineups and fixture moves (Chris, 21 Oct 2026)
--   * cup_lineup_players: who played in cup and European games, for the site's
--     and articles' narrative ("City rested Haaland"). Chris: "don't change
--     formation and availability assumptions because of this". Nothing in the
--     projections reads it. First rows: Chris's BBC screenshots of
--     Villarreal v Liverpool and AEK Athens v Manchester City (20 Oct).
--   * fpl_fixture_changes: every change FPL makes to a fixture's gameweek or
--     kick-off (fpl_fixtures is updated in place, so nothing recorded the old
--     date). Feeds the automatic "Fixture moved" post (blank and double
--     gameweeks included).
-- ============================================================================

create table if not exists public.cup_lineup_players (
  row_id bigint generated always as identity primary key,
  fixture_id bigint not null references public.fixtures (fixture_id),
  team_id bigint not null references public.teams (team_id),
  player_name text not null,
  fpl_player_id integer,                 -- this season's FPL id where he has one
  shirt integer,
  started boolean not null,
  on_minute integer,                     -- substitutes who came on
  off_minute integer,                    -- starters taken off
  replaced text,                         -- the player he replaced, or who replaced him
  yellow_minute integer,
  red_minute integer,
  captain boolean not null default false,
  source text not null,
  entered_at timestamptz not null default now(),
  unique (fixture_id, team_id, player_name)
);
comment on table public.cup_lineup_players is
  'Cup and European lineups for PL teams: narrative only (site, articles, reflection). Not used by projections, start chances or formations (Chris, 21 Oct 2026).';
alter table public.cup_lineup_players enable row level security;
drop policy if exists cup_lineup_players_read on public.cup_lineup_players;
create policy cup_lineup_players_read on public.cup_lineup_players for select using (true);

-- Villarreal v Liverpool, AEK Athens v Manchester City, Champions League, 20 Oct 2026.
-- From BBC Sport line-ups (Chris's screenshots); the substitutes lists were cut
-- off at the bottom, so unused substitutes may be missing. Shirt numbers of
-- Wirtz and Vitor Reis were not visible.
insert into public.cup_lineup_players (fixture_id, team_id, player_name, fpl_player_id, shirt, started, on_minute, off_minute, replaced, yellow_minute, captain, source)
values
 (2105, 147, 'Alisson Becker', 350, 1, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'K. Tsimikas', 364, 21, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'V. van Dijk', 356, 4, true, null, null, null, null, true, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'J. Jacquet', 362, 5, true, null, 74, 'J. Gomez', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'R. Araujo', 579, 33, true, null, 46, 'F. Wirtz', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'T. Nyoni', 375, 42, true, null, 81, 'J. McConnell', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'A. Mac Allister', 372, 10, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'C. Gakpo', 367, 18, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'R. Gravenberch', 371, 38, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'R. Ngumoha', 369, 73, true, null, 74, 'B. Barcola', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'L. Koumas', 381, 67, true, null, 66, 'A. Isak', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'F. Wirtz', 366, null, false, 46, null, 'R. Araujo', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'A. Isak', 379, 9, false, 66, null, 'L. Koumas', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'B. Barcola', 627, 29, false, 74, null, 'R. Ngumoha', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'J. Gomez', 359, 2, false, 74, null, 'J. Jacquet', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'J. McConnell', 378, 53, false, 81, null, 'T. Nyoni', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'L. Chambers', null, 44, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'J. Danns', 382, 76, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'M. Kerkez', 358, 6, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'M. Laffey', null, 94, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2105, 147, 'G. Mamardashvili', 351, 25, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'G. Donnarumma', 384, 1, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'J. Gvardiol', 391, 24, true, null, 72, 'Vitor Reis', 59, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'Rúben Dias', 390, 3, true, null, 83, 'K. Braithwaite', null, true, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'A. Khusanov', 393, 45, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'R. Lewis', 395, 82, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'E. Fernández', 155, 17, true, null, 72, 'R. Aït-Nouri', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'E. Anderson', 481, 5, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'Allan', 628, 37, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'R. Cherki', 399, 10, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'P. Foden', 398, 47, true, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'F. Samba', 653, 75, true, null, 62, 'R. McAidoo', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'R. Aït-Nouri', 392, 21, false, 72, null, 'E. Fernández', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'Vitor Reis', 396, null, false, 72, null, 'J. Gvardiol', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'K. Braithwaite', 622, 61, false, 83, null, 'Rúben Dias', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'R. McAidoo', 621, 56, false, 62, null, 'F. Samba', null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'M. Bettinelli', 386, 13, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'A. Bouaddi', 616, 32, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'E. Haaland', 411, 9, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'J. Doku', 400, 11, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'M. Guéhi', 388, 6, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'I. Ndiaye', 237, 7, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)'),
 (2085, 142, 'G. Rulli', 587, 28, false, null, null, null, null, false, 'BBC Sport line-ups (Chris, screenshot)')
on conflict (fixture_id, team_id, player_name) do nothing;

-- ---------------------------------------------------------------- fixture changes
create table if not exists public.fpl_fixture_changes (
  change_id bigint generated always as identity primary key,
  season_id bigint not null,
  fpl_fixture_id integer not null,
  old_event integer,
  new_event integer,
  old_kickoff timestamptz,
  new_kickoff timestamptz,
  detected_at timestamptz not null default now(),
  candidate_id bigint                    -- the "Fixture moved" post that reported it
);
comment on table public.fpl_fixture_changes is 'Every change FPL makes to a fixture''s gameweek or kick-off time (trigger on fpl_fixtures).';
create index if not exists fpl_fixture_changes_unposted on public.fpl_fixture_changes (season_id, detected_at) where candidate_id is null;
alter table public.fpl_fixture_changes enable row level security;
drop policy if exists fpl_fixture_changes_read on public.fpl_fixture_changes;
create policy fpl_fixture_changes_read on public.fpl_fixture_changes for select using (true);

create or replace function private.fpl_fixture_log_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.fpl_event_id is distinct from old.fpl_event_id or new.kickoff_time is distinct from old.kickoff_time then
    insert into public.fpl_fixture_changes (season_id, fpl_fixture_id, old_event, new_event, old_kickoff, new_kickoff)
    values (new.season_id, new.fpl_fixture_id, old.fpl_event_id, new.fpl_event_id, old.kickoff_time, new.kickoff_time);
  end if;
  return new;
end;
$$;
drop trigger if exists fpl_fixtures_log_change on public.fpl_fixtures;
create trigger fpl_fixtures_log_change after update of fpl_event_id, kickoff_time on public.fpl_fixtures
  for each row execute function private.fpl_fixture_log_change();

-- ---------------------------------------------------------------- the "Fixture moved" post
-- Changes at least 30 minutes old (TV moves arrive in batches), grouped into
-- one post or thread. A move to another gameweek says who now blanks or plays
-- twice and names the most-owned players; a new date in the same gameweek is
-- posted only within the next three weeks. Time-only changes are logged, not
-- posted.
create or replace function private.social_detect_fixture_moves(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  m record; v_lines text[] := '{}'; v_moves jsonb := '[]'; v_ids bigint[]; v_used bigint[] := '{}'; v_line text; v_blank text; v_double text;
  v_owners text; v_text text; v_posts text[]; v_key text; v_id bigint; v_old_date date; v_new_date date;
begin
  select array_agg(change_id order by change_id) into v_ids from public.fpl_fixture_changes
   where season_id = v_season and candidate_id is null and detected_at < now() - interval '30 minutes';
  if v_ids is null then return jsonb_build_object('status', 'none', 'reason', 'no fixture changes'); end if;

  for m in
    select c.fpl_fixture_id, array_agg(c.change_id) ids,
           (array_agg(c.old_event order by c.change_id))[1] old_event, (array_agg(c.old_kickoff order by c.change_id))[1] old_kickoff,
           f.fpl_event_id new_event, f.kickoff_time new_kickoff, f.fpl_home_team_id h, f.fpl_away_team_id a,
           th.name hn, ta.name an, th.short_name hs, ta.short_name aws,
           (select deadline_time from public.fpl_gameweeks g where g.season_id = v_season
               and g.fpl_event_id = coalesce(f.fpl_event_id, (array_agg(c.old_event order by c.change_id))[1])) deadline
      from public.fpl_fixture_changes c
      join public.fpl_fixtures f on f.season_id = c.season_id and f.fpl_fixture_id = c.fpl_fixture_id
      join public.fpl_teams th on th.season_id = f.season_id and th.fpl_team_id = f.fpl_home_team_id
      join public.fpl_teams ta on ta.season_id = f.season_id and ta.fpl_team_id = f.fpl_away_team_id
     where c.change_id = any(v_ids)
     group by c.fpl_fixture_id, f.fpl_event_id, f.kickoff_time, f.fpl_home_team_id, f.fpl_away_team_id, th.name, ta.name, th.short_name, ta.short_name
     order by min(c.change_id)
  loop
    v_used := v_used || m.ids;
    v_line := null;
    if m.old_event is distinct from m.new_event then
      -- Teams with no game left in the old gameweek, and with two or more in the new one.
      select string_agg(short_name, ' and ' order by short_name) into v_blank from public.fpl_teams t
       where t.season_id = v_season and t.fpl_team_id in (m.h, m.a) and m.old_event is not null
         and not exists (select 1 from public.fpl_fixtures f where f.season_id = v_season and f.fpl_event_id = m.old_event
                           and t.fpl_team_id in (f.fpl_home_team_id, f.fpl_away_team_id));
      select string_agg(short_name, ' and ' order by short_name) into v_double from public.fpl_teams t
       where t.season_id = v_season and t.fpl_team_id in (m.h, m.a) and m.new_event is not null
         and (select count(*) from public.fpl_fixtures f where f.season_id = v_season and f.fpl_event_id = m.new_event
                and t.fpl_team_id in (f.fpl_home_team_id, f.fpl_away_team_id)) >= 2;
      select 'FPL owners: ' || string_agg(format('%s %s%%', web_name, private.social_fmt(own, 1)), ', ' order by own desc) into v_owners
        from (select pl.web_name, coalesce(pl.selected_by_percent, 0)::numeric own from public.fpl_players pl
               where pl.season_id = v_season and pl.fpl_team_id in (m.h, m.a) and coalesce(pl.selected_by_percent, 0) >= 5
               order by pl.selected_by_percent desc limit 2) o;
      if m.new_event is null then
        v_line := format('Postponed: %s v %s (was GW%s). A new date is to be confirmed.', m.hn, m.an, m.old_event);
      elsif m.old_event is null then
        v_line := format('%s v %s now has a date: %s, in GW%s.', m.hn, m.an, to_char(m.new_kickoff at time zone 'Europe/London', 'Dy FMDD Mon'), m.new_event);
      else
        v_line := format('%s v %s moves from GW%s to GW%s (%s).', m.hn, m.an, m.old_event, m.new_event,
                         to_char(m.new_kickoff at time zone 'Europe/London', 'Dy FMDD Mon'));
      end if;
      v_line := v_line
        || coalesce(' ' || v_blank || ' now ' || case when v_blank like '% and %' then 'blank' else 'blanks' end || ' in GW' || m.old_event || '.', '')
        || coalesce(' ' || v_double || ' now ' || case when v_double like '% and %' then 'play' else 'plays' end || ' twice in GW' || m.new_event || '.', '')
        || coalesce(' ' || v_owners || '.', '');
    else
      v_old_date := (m.old_kickoff at time zone 'Europe/London')::date;
      v_new_date := (m.new_kickoff at time zone 'Europe/London')::date;
      if v_old_date is distinct from v_new_date and m.deadline > now() and m.deadline < now() + interval '21 days' then
        v_line := format('%s v %s is now %s (was %s). Still GW%s.', m.hn, m.an,
                         to_char(m.new_kickoff at time zone 'Europe/London', 'Dy FMDD Mon HH24:MI'),
                         to_char(m.old_kickoff at time zone 'Europe/London', 'Dy FMDD Mon'), m.new_event);
      end if;
    end if;
    if v_line is not null then
      v_lines := v_lines || v_line;
      v_moves := v_moves || jsonb_build_object('fpl_fixture_id', m.fpl_fixture_id, 'old_event', m.old_event, 'new_event', m.new_event,
                                               'old_kickoff', m.old_kickoff, 'new_kickoff', m.new_kickoff);
    end if;
  end loop;

  if coalesce(array_length(v_lines, 1), 0) = 0 then
    update public.fpl_fixture_changes set candidate_id = 0 where change_id = any(v_used);
    return jsonb_build_object('status', 'none', 'reason', 'only time changes or past gameweeks', 'changes', array_length(v_used, 1));
  end if;
  v_text := case when array_length(v_lines, 1) = 1 then 'Fixture moved: ' || v_lines[1] else 'FPL fixtures moved' end;
  if array_length(v_lines, 1) = 1 then
    v_posts := array[v_text];
  else
    v_posts := array[v_text || format(' (%s). 🧵', array_length(v_lines, 1))] || v_lines;
  end if;
  if exists (select 1 from unnest(v_posts) p where public.social_weighted_length(p) > 280) then
    return jsonb_build_object('status', 'rejected', 'reason', 'a post is over 280 characters', 'posts', to_jsonb(v_posts));
  end if;
  v_key := format('fixture_moved:%s:%s-%s', v_season, (select min(x) from unnest(v_used) x), (select max(x) from unnest(v_used) x));
  insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fixture_moved', array_to_string(v_posts, E'\n\n'), array_to_string(v_posts, E'\n\n'),
          case when array_length(v_posts, 1) > 1 then to_jsonb(v_posts) end,
          jsonb_build_object('season_id', v_season, 'moves', v_moves, 'change_ids', to_jsonb(v_used)),
          now(), v_key, now() + interval '2 days', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  update public.fpl_fixture_changes set candidate_id = v_id where change_id = any(v_used);
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fixture_moved', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'moves', jsonb_array_length(v_moves));
end;
$$;

-- ---------------------------------------------------------------- wiring
alter table public.social_post_candidates drop constraint if exists social_post_candidates_post_type_check;
alter table public.social_post_candidates add constraint social_post_candidates_post_type_check
  check (post_type in ('fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight', 'announcement',
                       'fpl_price_changes', 'gameweek_thread', 'fpl_availability', 'fpl_market', 'fpl_week_changes', 'gameweek_outlook',
                       'fixture_moved'));
update public.social_settings
   set auto_post_types = (select array_agg(distinct t order by t) from unnest(auto_post_types || array['fixture_moved']) t), updated_at = now()
 where id;

CREATE OR REPLACE FUNCTION private.social_revalidate(p_candidate_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c public.social_post_candidates; e jsonb := '[]'; s jsonb; v_mv text; v_top jsonb; v_n integer; v_val numeric; p text;
begin
  select * into c from public.social_post_candidates where candidate_id = p_candidate_id;
  if c.candidate_id is null then return jsonb_build_array('candidate not found'); end if;
  s := c.source_data;
  if c.expires_at <= now() then e := e || to_jsonb(format('expired at %s', c.expires_at)); end if;
  if c.validation_status <> 'passed' then e := e || to_jsonb('did not pass validation'::text); end if;
  foreach p in array private.social_posts(c) loop
    if public.social_weighted_length(p) > 280 then e := e || to_jsonb(format('too long: %s of 280', public.social_weighted_length(p))); end if;
  end loop;
  if not (public.social_numbers(c.text) <@ public.social_numbers(c.generated_text)) then
    e := e || to_jsonb('text contains a number that is not in the generated data'::text);
  end if;

  if c.post_type = 'fpl_captaincy' then
    select model_version into v_mv from public.fpl_player_projections where season_id = (s->>'season_id')::bigint order by generated_at desc limit 1;
    if v_mv is distinct from s->>'model_version' then e := e || to_jsonb(format('model version is now %s', v_mv)); end if;
    if (select deadline_time from public.fpl_gameweeks where season_id = (s->>'season_id')::bigint and fpl_event_id = (s->>'gw')::int)
       is distinct from (s->>'deadline')::timestamptz then e := e || to_jsonb('deadline changed'::text); end if;
    v_top := private.social_captaincy_top((s->>'season_id')::bigint, (s->>'gw')::int, s->>'model_version', 5);
    if (select array_agg(t->>'fpl_player_id' order by (t->>'rank')::int) from jsonb_array_elements(v_top) t where (t->>'rank')::int <= 3)
       is distinct from (select array_agg(t->>'fpl_player_id' order by (t->>'rank')::int) from jsonb_array_elements(s->'players') t where (t->>'rank')::int <= 3)
    then e := e || to_jsonb('top three has changed'::text); end if;
    select count(*) into v_n from jsonb_array_elements(s->'players') t
      join public.fpl_players pl on pl.season_id = (s->>'season_id')::bigint and pl.fpl_player_id = (t->>'fpl_player_id')::int
     where pl.now_cost <> (t->>'now_cost')::int or pl.status <> 'a';
    if v_n > 0 then e := e || to_jsonb(format('%s listed player(s) changed price or status', v_n)); end if;
    select count(*) into v_n from jsonb_array_elements(v_top) t join jsonb_array_elements(s->'players') o on o->>'fpl_player_id' = t->>'fpl_player_id'
     where round((t->>'xpts')::numeric, 1) <> round((o->>'xpts')::numeric, 1);
    if v_n > 0 then e := e || to_jsonb(format('%s projected points value(s) changed', v_n)); end if;

  elsif c.post_type = 'team_xg_change' then
    select abs(f.market_home_goals - (s->'after'->>'home')::numeric) + abs(f.market_away_goals - (s->'after'->>'away')::numeric) into v_val
      from public.fixtures f where f.fixture_id = (s->>'fixture_id')::bigint and f.kickoff_date is not distinct from (s->>'kickoff_date')::date;
    if v_val is null then e := e || to_jsonb('fixture moved or forecast missing'::text);
    elsif v_val > 0.05 then e := e || to_jsonb('forecast has changed again'::text); end if;

  elsif c.post_type = 'prediction_accuracy' then
    select count(*) into v_n from public.model_scorecard_matches
     where match_id in (select jsonb_array_elements_text(s->'match_ids')::bigint) and model_version = s->>'model_version';
    if v_n <> (s->>'n')::int then e := e || to_jsonb('scorecard rows changed'::text); end if;

  elsif c.post_type = 'historical_insight' then
    if not exists (select 1 from public.history_streaks h where h.league_id = 1 and h.team_id = (s->>'team_id')::bigint
                     and h.streak_type = s->>'streak_type' and h.start_date = (s->>'start_date')::date
                     and h.length = (s->>'length')::int and h.ongoing) then
      e := e || to_jsonb('streak has changed'::text);
    end if;

  elsif c.post_type = 'fpl_price_changes' then
    -- Every listed player still has the price the post gives.
    select count(*) into v_n from jsonb_array_elements(s->'changes') t
      join public.fpl_players pl on pl.season_id = (s->>'season_id')::bigint and pl.fpl_player_id = (t->>'fpl_player_id')::int
     where pl.now_cost <> (t->>'now')::int;
    if v_n > 0 then e := e || to_jsonb(format('%s player(s) changed price again', v_n)); end if;

  elsif c.post_type = 'gameweek_thread' then
    if exists (select 1 from public.fpl_gameweek_reports r where r.season_id = (s->>'season_id')::bigint and r.fpl_event_id = (s->>'gw')::int
                 and r.kind = case s->>'kind' when 'preview_update' then 'preview' when 'reflection_correction' then 'reflection' else s->>'kind' end
                 and r.status = 'published' and not r.frozen and r.version > (s->>'version')::int
                 and (s->>'kind' <> 'preview_update' or jsonb_array_length(coalesce(r.payload->'x_update', '[]')) >= 2)) then
      e := e || to_jsonb('a newer version of the report was published'::text);
    end if;

  elsif c.post_type = 'fpl_availability' then
    -- Every listed player still has the status the post gives.
    select count(*) into v_n from jsonb_array_elements(s->'players') t
      join public.fpl_players pl on pl.season_id = (s->>'season_id')::bigint and pl.fpl_player_id = (t->>'fpl_player_id')::int
     where pl.status is distinct from t->>'status' or pl.chance_of_playing_next_round is distinct from (t->>'chance')::int;
    if v_n > 0 then e := e || to_jsonb(format('%s player(s) changed status again', v_n)); end if;

  elsif c.post_type = 'gameweek_outlook' then
    if (select deadline_time from public.fpl_gameweeks where season_id = (s->>'season_id')::bigint and fpl_event_id = (s->>'gw')::int)
       is distinct from (s->>'deadline')::timestamptz then e := e || to_jsonb('deadline changed'::text); end if;
    if (select md5(string_agg(fpl_fixture_id || '@' || coalesce(kickoff_time::text, ''), ',' order by fpl_fixture_id))
          from public.fpl_fixtures where season_id = (s->>'season_id')::bigint and fpl_event_id = (s->>'gw')::int)
       is distinct from s->>'fixtures_sig' then e := e || to_jsonb('fixtures changed'::text); end if;

  elsif c.post_type = 'fixture_moved' then
    -- Every move still stands.
    select count(*) into v_n from jsonb_array_elements(s->'moves') t
      join public.fpl_fixtures f on f.season_id = (s->>'season_id')::bigint and f.fpl_fixture_id = (t->>'fpl_fixture_id')::int
     where f.fpl_event_id is distinct from (t->>'new_event')::int or f.kickoff_time is distinct from (t->>'new_kickoff')::timestamptz;
    if v_n > 0 then e := e || to_jsonb(format('%s fixture(s) changed again', v_n)); end if;
  end if;
  return e;
end;
$function$;

CREATE OR REPLACE FUNCTION public.social_run_detectors(p_triggered_by text DEFAULT 'schedule'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run bigint; v_res jsonb := '{}'; v_one jsonb; v_created integer := 0; d text; v_pr bigint; v_queued integer;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'admin only'; end if;
  if not (select detector_enabled from public.social_settings) then
    return jsonb_build_object('status', 'disabled');
  end if;
  insert into public.social_detector_runs (triggered_by) values (coalesce(p_triggered_by, 'schedule')) returning run_id into v_run;
  insert into public.pipeline_runs (job_name, started_at, status) values ('social_detect', now(), 'running') returning run_id into v_pr;

  foreach d in array array['captaincy', 'xg_change', 'accuracy', 'streaks', 'price_changes', 'gameweek_threads',
                            'availability', 'market', 'week_changes', 'outlook', 'fixture_moves'] loop
    begin
      execute format('select private.social_detect_%s($1)', d) into v_one using v_run;
    exception when others then
      v_one := jsonb_build_object('status', 'error', 'error', sqlerrm);
    end;
    v_res := v_res || jsonb_build_object(d, v_one);
    if v_one->>'status' = 'created' then
      v_created := v_created + greatest(1, (select count(*) from jsonb_array_elements(coalesce(v_one->'fixtures', '[]')) f where f->>'status' = 'created'));
    end if;
  end loop;
  v_queued := private.social_auto_queue();

  update public.social_detector_runs set finished_at = now(), results = v_res || jsonb_build_object('auto_queued', v_queued),
         candidates_created = v_created where run_id = v_run;
  update public.pipeline_runs set finished_at = now(),
         status = case when exists (select 1 from jsonb_each(v_res) e where e.value->>'status' = 'error') then 'failed' else 'success' end,
         summary = format('%s candidate(s), %s queued automatically; %s', v_created, v_queued,
                          (select string_agg(e.key || ' ' || (e.value->>'status'), ', ') from jsonb_each(v_res) e))
   where run_id = v_pr;
  return jsonb_build_object('run_id', v_run, 'candidates_created', v_created, 'auto_queued', v_queued, 'results', v_res);
end;
$function$;
