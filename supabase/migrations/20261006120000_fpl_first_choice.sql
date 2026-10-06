-- FPL: "first choice when fit", set by an admin (6 Oct 2026).
--
-- Chris: Saliba plays 90 every game when fit, but the model rates his start
-- chance when fit at ~0.79 (30 of 38 starts last season, and returning
-- regulars often don't start their first game back). This lets an admin
-- say so. Unlike fpl_player_squad_state's start_probability_override (which
-- replaces the start chance outright, injured or not), this sets his start
-- chance WHEN AVAILABLE: per-fixture availability still multiplies it, so
-- he stays out until his return and then ramps 75% -> 90% -> fit.
--
-- 1. fpl_player_first_choice: one row per setting (player, start chance if
--    fit, from/to dates by kick-off, note, who/when). Removing keeps the row
--    (removed_at) for the record. Public read (the page marks these players);
--    written only through the admin functions below.
-- 2. fpl_fallback_start_probability_v6 uses it ahead of the start record.
--    (Fixtures with predicted line-ups from sources, and squad-state
--    overrides, still come first in the resolved view, as before.)
-- 3. get_fpl_minutes_outlook returns first_choice per player-gameweek.
-- 4. get_fpl_first_choices(team) for the admin panel.

create table public.fpl_player_first_choice (
  first_choice_id bigserial primary key,
  fpl_player_id bigint not null,
  season_id bigint not null default public.fpl_current_season_id(),
  start_if_fit numeric not null check (start_if_fit > 0 and start_if_fit <= 0.98),
  effective_from date not null default current_date,
  effective_to date,
  note text,
  set_by uuid default auth.uid(),
  set_at timestamptz not null default now(),
  removed_at timestamptz,
  check (effective_to is null or effective_to >= effective_from)
);
create index fpl_player_first_choice_player on public.fpl_player_first_choice (fpl_player_id) where removed_at is null;
alter table public.fpl_player_first_choice enable row level security;
create policy fpl_player_first_choice_read on public.fpl_player_first_choice for select to anon, authenticated using (true);
grant select on public.fpl_player_first_choice to anon, authenticated;
comment on table public.fpl_player_first_choice is 'Admin judgement: a player''s start chance when fit (e.g. 0.95 for a returning first-choice player), for fixtures between effective_from and effective_to. Used by fpl_fallback_start_probability_v6 ahead of the start record; fixture availability still applies. removed_at set = no longer in force.';

create or replace function public.fpl_set_first_choice(p_fpl_player_id bigint, p_start_if_fit numeric, p_from date default current_date, p_to date default null, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_id bigint;
begin
  perform public._require_admin();
  if p_start_if_fit is null or p_start_if_fit <= 0 or p_start_if_fit > 0.98 then
    raise exception 'start chance if fit must be above 0 and at most 0.98';
  end if;
  -- One setting in force per player: a new one replaces the old.
  update public.fpl_player_first_choice set removed_at = now()
   where fpl_player_id = p_fpl_player_id and removed_at is null;
  insert into public.fpl_player_first_choice (fpl_player_id, start_if_fit, effective_from, effective_to, note)
  values (p_fpl_player_id, p_start_if_fit, coalesce(p_from, current_date), p_to, nullif(trim(p_note), ''))
  returning first_choice_id into v_id;
  return v_id;
end $$;
revoke all on function public.fpl_set_first_choice(bigint, numeric, date, date, text) from public, anon;
grant execute on function public.fpl_set_first_choice(bigint, numeric, date, date, text) to authenticated;

create or replace function public.fpl_remove_first_choice(p_first_choice_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public._require_admin();
  update public.fpl_player_first_choice set removed_at = now()
   where first_choice_id = p_first_choice_id and removed_at is null;
end $$;
revoke all on function public.fpl_remove_first_choice(bigint) from public, anon;
grant execute on function public.fpl_remove_first_choice(bigint) to authenticated;

create or replace function public.get_fpl_first_choices(p_team_id bigint)
returns table(first_choice_id bigint, fpl_player_id bigint, web_name text, start_if_fit numeric, effective_from date, effective_to date, note text, set_at timestamptz)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select c.first_choice_id, c.fpl_player_id, p.web_name, c.start_if_fit, c.effective_from, c.effective_to, c.note, c.set_at
    from public.fpl_player_first_choice c
    join public.fpl_players p on p.fpl_player_id = c.fpl_player_id and p.season_id = public.fpl_current_season_id()
   where c.removed_at is null and p.canonical_team_id = p_team_id
     and (c.effective_to is null or c.effective_to >= current_date)
   order by p.web_name;
$$;
grant execute on function public.get_fpl_first_choices(bigint) to anon, authenticated;

create or replace view public.fpl_fallback_start_probability_v6 with (security_invoker=true) as
 WITH base AS (
         SELECT f.fixture_id,
            fp.canonical_team_id AS team_id,
            fp.fpl_player_id,
            fp.element_type,
            COALESCE(u.appearances, (0)::bigint) AS apps,
            COALESCE(u.likely_starts, (0)::bigint) AS starts,
            COALESCE(u.sub_appearances, (0)::bigint) AS subs,
            COALESCE(av.availability, ((COALESCE(fp.chance_of_playing_next_round, fp.chance_of_playing_this_round,
                CASE
                    WHEN (fp.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text])) THEN 0
                    ELSE 100
                END))::numeric / (100)::numeric)) AS availability,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status,
            COALESCE(sr.starts, 0) AS sr_starts,
            COALESCE(sr.available_matches, 0) AS sr_available,
            sr.prior_rate,
            fc.start_if_fit
           FROM (((((fixtures f
             JOIN leagues l ON ((l.league_id = f.league_id)))
             JOIN fpl_players fp ON (((fp.season_id = f.season_id) AND ((fp.canonical_team_id = f.home_team_id) OR (fp.canonical_team_id = f.away_team_id)))))
             LEFT JOIN fpl_player_substitution_usage u ON (((u.season_id = fp.season_id) AND (u.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN player_squad_hierarchy h ON (((h.season_id = fp.season_id) AND (h.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN fpl_fixture_availability_store av ON (((av.fixture_id = f.fixture_id) AND (av.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN fpl_player_start_record sr ON ((sr.fpl_player_id = fp.fpl_player_id))
             LEFT JOIN LATERAL ( SELECT c.start_if_fit
                   FROM fpl_player_first_choice c
                  WHERE ((c.fpl_player_id = fp.fpl_player_id) AND (c.removed_at IS NULL) AND (f.kickoff_date >= c.effective_from) AND (f.kickoff_date <= COALESCE(c.effective_to, '9999-12-31'::date)))
                  ORDER BY c.set_at DESC
                 LIMIT 1) fc ON (true)
          WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (l.code = 'E0'::text))
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    LEAST(0.98, (availability *
        CASE
            -- Set by an admin as first choice when fit (6 Oct 2026): his start
            -- chance WHEN AVAILABLE; fixture availability still applies.
            WHEN (start_if_fit IS NOT NULL) THEN start_if_fit
            -- Outfield (2026-10-05, backtested on GW3-5 starts: Brier 0.0992 ->
            -- 0.0944, log-loss 0.333 -> 0.313): starts over the matches he was
            -- AVAILABLE for, plus last season's start rate counted as one more
            -- match (0.20 with no Premier League record). Injured weeks no
            -- longer count against him; fit weeks on the bench do.
            WHEN (element_type <> 1) THEN LEAST(0.97, (((sr_starts)::numeric + COALESCE(prior_rate, 0.20)) / ((sr_available)::numeric + 1.0)))
            -- Goalkeepers: unchanged (not covered by the backtest).
            WHEN ((apps >= 4) AND (starts = apps)) THEN 0.96
            WHEN ((apps = 3) AND (starts = 3)) THEN 0.94
            WHEN ((apps >= 3) AND (starts >= (apps - 1))) THEN 0.84
            WHEN (apps > 0) THEN GREATEST(0.05, LEAST(0.90, (((starts)::numeric + 0.5) / ((apps)::numeric + 1.0))))
            ELSE
            CASE squad_status
                WHEN 'first_choice'::text THEN 0.72
                WHEN 'rotation'::text THEN 0.38
                WHEN 'backup'::text THEN 0.12
                ELSE 0.18
            END
        END)) AS start_probability,
    availability,
    apps,
    starts,
    subs,
        CASE
            WHEN (start_if_fit IS NOT NULL) THEN 'nailed_history'::text
            WHEN ((element_type <> 1) AND (sr_available >= 3) AND (sr_starts >= sr_available)) THEN 'nailed_history'::text
            WHEN ((element_type <> 1) AND (sr_available >= 3) AND (sr_starts >= (sr_available - 1))) THEN 'strong_history'::text
            WHEN (element_type <> 1) THEN 'history_hierarchy'::text
            WHEN ((apps >= 3) AND (starts = apps)) THEN 'nailed_history'::text
            WHEN ((apps >= 3) AND (starts >= (apps - 1))) THEN 'strong_history'::text
            ELSE 'history_hierarchy'::text
        END AS probability_source
   FROM base;

drop function if exists public.get_fpl_minutes_outlook(bigint);

create or replace function public.get_fpl_minutes_outlook(p_team_id bigint)
returns table(
  fpl_player_id bigint, web_name text, slug text, position_label text, status text, news text,
  fpl_event_id integer, fixtures integer, opponents text,
  start_probability numeric, expected_minutes numeric, availability numeric, availability_rule text,
  generated_at timestamptz, tactical_role text, first_choice boolean)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  with nxt as (
    select min(g.fpl_event_id) as ev
      from public.fpl_gameweeks g
     where g.season_id = public.fpl_current_season_id() and g.deadline_time > now()
  )
  select v.fpl_player_id::bigint, p.web_name, p.slug,
         case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
         p.status, nullif(p.news, ''),
         ff.fpl_event_id, count(*)::integer,
         string_agg(case when f.home_team_id = p_team_id then ot.display_name || ' (H)' else ot.display_name || ' (A)' end, ', ' order by f.kickoff_date),
         round(sum(v.start_probability), 3), round(sum(v.expected_minutes), 1),
         round(min(a.availability), 3), min(a.rule), max(v.generated_at),
         mode() within group (order by v.tactical_role),
         bool_or(exists (select 1 from public.fpl_player_first_choice c
                          where c.fpl_player_id = v.fpl_player_id and c.removed_at is null
                            and f.kickoff_date between c.effective_from and coalesce(c.effective_to, '9999-12-31'::date)))
    from public.fpl_projection_frontend_feed_v6 v
    join public.fpl_players p on p.fpl_player_id = v.fpl_player_id and p.season_id = public.fpl_current_season_id()
    join public.fixtures f on f.fixture_id = v.fixture_id
    join public.fpl_fixtures ff on ff.canonical_fixture_id = v.fixture_id and ff.season_id = f.season_id
    join public.teams ot on ot.team_id = case when f.home_team_id = p_team_id then f.away_team_id else f.home_team_id end
    left join public.fpl_fixture_availability_store a on a.fixture_id = v.fixture_id and a.fpl_player_id = v.fpl_player_id
    cross join nxt
   where v.team_id = p_team_id
     and f.status <> 'played'
     and ff.fpl_event_id between nxt.ev and nxt.ev + 9
   group by v.fpl_player_id, p.web_name, p.slug, p.element_type, p.status, p.news, ff.fpl_event_id;
$$;

grant execute on function public.get_fpl_minutes_outlook(bigint) to anon, authenticated;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
values ('2026-10-06', 'prediction',
  'FPL: admin "first choice when fit" setting',
  'The model rates a returning first-choice player''s start chance when fit from last season''s starts (Saliba 0.79); an admin who knows he plays when fit had no way to say so that kept his injury in view.',
  'fpl_player_first_choice: start chance if fit, by date range; used by fpl_fallback_start_probability_v6 ahead of the start record, with fixture availability still applied. Set and removed on /fpl/minutes (admins).',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261006120000');

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Admin-set start chance when fit for players (e.g. a returning first-choice centre-back), by date range; read by the FPL start probability.',
  refresh_note = 'Written from /fpl/minutes by admins.', purpose_reviewed_at = now()
where node_key = 'object:fpl_player_first_choice';
