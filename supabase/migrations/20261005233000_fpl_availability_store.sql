-- FPL availability: store it per pipeline run instead of a view (5 Oct 2026).
--
-- The availability view (20261005230000) was joined inside three views that
-- the per-fixture projection refresh expands many times over; the refresh
-- query (already ~1.4s to plan) then ran past the API's 8-second statement
-- limit when the database was busy, and the 10-gameweek pipeline run failed.
-- fpl_fixture_availability_store holds the view's rows, refreshed by
-- refresh_fpl_fixture_availability() at the start of each projection run
-- (scripts/refresh_fpl_projections.py), so the projection views join a
-- small indexed table. The view stays as the definition and for checks.

create table public.fpl_fixture_availability_store as
  select v.*, now() as refreshed_at from public.fpl_player_fixture_availability v with no data;
alter table public.fpl_fixture_availability_store add primary key (fixture_id, fpl_player_id);
alter table public.fpl_fixture_availability_store enable row level security;
create policy fpl_fixture_availability_store_read on public.fpl_fixture_availability_store for select to anon, authenticated using (true);
grant select on public.fpl_fixture_availability_store to anon, authenticated;
comment on table public.fpl_fixture_availability_store is 'Rows of fpl_player_fixture_availability, refreshed by refresh_fpl_fixture_availability() at the start of each FPL projection run; the projection views read this table.';

create or replace function public.refresh_fpl_fixture_availability()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_rows integer;
begin
  delete from public.fpl_fixture_availability_store;
  insert into public.fpl_fixture_availability_store
    select v.*, now() from public.fpl_player_fixture_availability v;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function public.refresh_fpl_fixture_availability() from public, anon, authenticated;
grant execute on function public.refresh_fpl_fixture_availability() to service_role;

select public.refresh_fpl_fixture_availability();

create or replace view public.fixture_player_lineup_consensus with (security_invoker=true) as
 WITH source_totals AS (
         SELECT lp.fixture_id,
            lp.team_id,
            sum(s.source_weight) AS available_weight,
            count(*) AS source_count
           FROM (fixture_lineup_predictions lp
             JOIN lineup_prediction_sources s ON ((s.lineup_source_id = lp.lineup_source_id)))
          WHERE s.active
          GROUP BY lp.fixture_id, lp.team_id
        ), votes AS (
         SELECT lp.fixture_id,
            lp.team_id,
            lpp.fpl_player_id,
            sum(
                CASE
                    WHEN lpp.predicted_start THEN s.source_weight
                    ELSE (0)::numeric
                END) AS positive_weight,
            count(*) FILTER (WHERE lpp.predicted_start) AS positive_sources,
            max(lpp.tactical_role) AS tactical_role
           FROM ((fixture_lineup_predictions lp
             JOIN fixture_lineup_prediction_players lpp ON ((lpp.lineup_prediction_id = lp.lineup_prediction_id)))
             JOIN lineup_prediction_sources s ON ((s.lineup_source_id = lp.lineup_source_id)))
          WHERE s.active
          GROUP BY lp.fixture_id, lp.team_id, lpp.fpl_player_id
        )
 SELECT st.fixture_id,
    st.team_id,
    p.fpl_player_id,
    p.web_name,
    COALESCE(v.positive_weight, (0)::numeric) AS positive_weight,
    st.available_weight,
    COALESCE(v.positive_sources, (0)::bigint) AS positive_sources,
    st.source_count,
        CASE
            WHEN (st.available_weight > (0)::numeric) THEN (COALESCE(v.positive_weight, (0)::numeric) / st.available_weight)
            ELSE (0)::numeric
        END AS source_consensus_probability,
    COALESCE(av.availability,
        CASE
            WHEN (p.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text])) THEN (0)::numeric
            WHEN (p.chance_of_playing_next_round IS NOT NULL) THEN ((p.chance_of_playing_next_round)::numeric / (100)::numeric)
            ELSE (1)::numeric
        END) AS availability_probability,
    v.tactical_role
   FROM ((source_totals st
     JOIN fpl_players p ON (((p.canonical_team_id = st.team_id) AND (p.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)))))
     LEFT JOIN votes v ON (((v.fixture_id = st.fixture_id) AND (v.team_id = st.team_id) AND (v.fpl_player_id = p.fpl_player_id))))
     LEFT JOIN fpl_fixture_availability_store av ON ((av.fixture_id = st.fixture_id) AND (av.fpl_player_id = p.fpl_player_id));

create or replace view public.fixture_player_expected_minutes_fallback with (security_invoker=true) as
 WITH prev AS (
         -- Last season's league starts, as the prior for a player with no
         -- appearances yet this season (e.g. injured since August).
         SELECT gh.fpl_code,
            count(*) FILTER (WHERE (gh.starts > 0)) AS starts_last
           FROM fpl_player_gameweek_history gh
          WHERE (gh.season_id = ( SELECT max(h2.season_id) AS max
                   FROM fpl_player_gameweek_history h2
                  WHERE (h2.season_id < ( SELECT fpl_current_season_id() AS fpl_current_season_id))))
          GROUP BY gh.fpl_code
        ), base AS (
         SELECT f.fixture_id,
            fp.canonical_team_id AS team_id,
            fp.fpl_player_id,
            fp.web_name,
            fp.element_type,
            fp.status,
            COALESCE(av.availability, ((COALESCE(fp.chance_of_playing_next_round, fp.chance_of_playing_this_round,
                CASE
                    WHEN (fp.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text])) THEN 0
                    ELSE 100
                END))::numeric / (100)::numeric)) AS availability,
            COALESCE(u.appearances, (0)::bigint) AS apps,
            COALESCE(u.likely_starts, (0)::bigint) AS starts,
            COALESCE(u.sub_appearances, (0)::bigint) AS subs,
            COALESCE(u.avg_sub_minutes, (20)::numeric) AS avg_sub_minutes,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status,
            CASE
                WHEN ((fp.status = ANY (ARRAY['i'::text, 'd'::text, 's'::text])) AND (fp.element_type <> 1)) THEN prev.starts_last
                ELSE NULL::bigint
            END AS base_prev_starts,
            pt.tactical_role
           FROM (((((fixtures f
             JOIN leagues l ON ((l.league_id = f.league_id)))
             JOIN fpl_players fp ON (((fp.season_id = f.season_id) AND ((fp.canonical_team_id = f.home_team_id) OR (fp.canonical_team_id = f.away_team_id)))))
             LEFT JOIN fpl_player_substitution_usage u ON (((u.season_id = fp.season_id) AND (u.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN player_squad_hierarchy h ON (((h.season_id = fp.season_id) AND (h.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN player_tactical_profiles pt ON (((pt.season_id = fp.season_id) AND (pt.source_player_id = (fp.fpl_player_id)::text))))
             LEFT JOIN fpl_fixture_availability_store av ON ((av.fixture_id = f.fixture_id) AND (av.fpl_player_id = fp.fpl_player_id))
             LEFT JOIN prev ON (prev.fpl_code = fp.fpl_code)
          WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (l.code = 'E0'::text))
        ), p AS (
         SELECT base.fixture_id,
            base.team_id,
            base.fpl_player_id,
            base.web_name,
            base.element_type,
            base.status,
            base.availability,
            base.apps,
            base.starts,
            base.subs,
            base.avg_sub_minutes,
            base.squad_status,
            base.tactical_role,
            LEAST(0.97, GREATEST((0)::numeric, (base.availability *
                CASE
                    WHEN (base.apps > 0) THEN (((base.starts)::numeric + 1.5) / ((base.apps)::numeric + 3.0))
                    ELSE
                    CASE COALESCE(NULLIF(base.squad_status, 'unknown'::text), CASE WHEN (base.base_prev_starts >= 20) THEN 'first_choice'::text WHEN (base.base_prev_starts >= 10) THEN 'rotation'::text ELSE NULL::text END, 'unknown'::text)
                        WHEN 'first_choice'::text THEN 0.72
                        WHEN 'rotation'::text THEN 0.38
                        WHEN 'backup'::text THEN 0.12
                        ELSE 0.18
                    END
                END))) AS start_prob
           FROM base
        ), r AS (
         SELECT p.fixture_id,
            p.team_id,
            p.fpl_player_id,
            p.web_name,
            p.element_type,
            p.status,
            p.availability,
            p.apps,
            p.starts,
            p.subs,
            p.avg_sub_minutes,
            p.squad_status,
            p.tactical_role,
            p.start_prob,
                CASE
                    WHEN (p.element_type = 1) THEN 90
                    WHEN (p.start_prob >= 0.7) THEN 78
                    WHEN (p.start_prob >= 0.4) THEN 72
                    ELSE 68
                END AS mins_start,
            LEAST(0.75, GREATEST((0)::numeric, ((p.availability * ((1)::numeric - p.start_prob)) *
                CASE p.squad_status
                    WHEN 'rotation'::text THEN 0.7
                    WHEN 'backup'::text THEN 0.5
                    WHEN 'first_choice'::text THEN 0.35
                    ELSE 0.3
                END))) AS sub_prob
           FROM p
        ), raw AS (
         SELECT r.fixture_id,
            r.team_id,
            r.fpl_player_id,
            r.web_name,
            r.element_type,
            r.status,
            r.availability,
            r.apps,
            r.starts,
            r.subs,
            r.avg_sub_minutes,
            r.squad_status,
            r.tactical_role,
            r.start_prob,
            r.mins_start,
            r.sub_prob,
            ((r.start_prob * (r.mins_start)::numeric) + (r.sub_prob * LEAST((40)::numeric, GREATEST((5)::numeric, r.avg_sub_minutes)))) AS raw_minutes
           FROM r
        ), sc AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.web_name,
            raw.element_type,
            raw.status,
            raw.availability,
            raw.apps,
            raw.starts,
            raw.subs,
            raw.avg_sub_minutes,
            raw.squad_status,
            raw.tactical_role,
            raw.start_prob,
            raw.mins_start,
            raw.sub_prob,
            raw.raw_minutes,
            ((990)::numeric / NULLIF(sum(raw.raw_minutes) OVER (PARTITION BY raw.fixture_id, raw.team_id), (0)::numeric)) AS scale
           FROM raw
        ), cap AS (
         SELECT sc.fixture_id,
            sc.team_id,
            sc.fpl_player_id,
            sc.web_name,
            sc.element_type,
            sc.status,
            sc.availability,
            sc.apps,
            sc.starts,
            sc.subs,
            sc.avg_sub_minutes,
            sc.squad_status,
            sc.tactical_role,
            sc.start_prob,
            sc.mins_start,
            sc.sub_prob,
            sc.raw_minutes,
            sc.scale,
            LEAST((90)::numeric, (sc.raw_minutes * sc.scale)) AS capped
           FROM sc
        ), fin AS (
         SELECT cap.fixture_id,
            cap.team_id,
            cap.fpl_player_id,
            cap.web_name,
            cap.element_type,
            cap.status,
            cap.availability,
            cap.apps,
            cap.starts,
            cap.subs,
            cap.avg_sub_minutes,
            cap.squad_status,
            cap.tactical_role,
            cap.start_prob,
            cap.mins_start,
            cap.sub_prob,
            cap.raw_minutes,
            cap.scale,
            cap.capped,
            LEAST((90)::numeric, (cap.capped + ((((990)::numeric - sum(cap.capped) OVER (PARTITION BY cap.fixture_id, cap.team_id)) * cap.capped) / NULLIF(sum(cap.capped) OVER (PARTITION BY cap.fixture_id, cap.team_id), (0)::numeric)))) AS expected_minutes
           FROM cap
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
    tactical_role,
    start_prob AS prob_starting_xi,
    sub_prob AS prob_sub_appearance,
    availability,
    expected_minutes,
    'fallback_history_hierarchy'::text AS minutes_source
   FROM fin;

create or replace view public.fpl_fallback_start_probability_v6 with (security_invoker=true) as
 WITH prev AS (
         -- Last season's league starts, as the prior for a player with no
         -- appearances yet this season (e.g. injured since August).
         SELECT gh.fpl_code,
            count(*) FILTER (WHERE (gh.starts > 0)) AS starts_last
           FROM fpl_player_gameweek_history gh
          WHERE (gh.season_id = ( SELECT max(h2.season_id) AS max
                   FROM fpl_player_gameweek_history h2
                  WHERE (h2.season_id < ( SELECT fpl_current_season_id() AS fpl_current_season_id))))
          GROUP BY gh.fpl_code
        ), base AS (
         SELECT f.fixture_id,
            fp.canonical_team_id AS team_id,
            fp.fpl_player_id,
            COALESCE(u.appearances, (0)::bigint) AS apps,
            COALESCE(u.likely_starts, (0)::bigint) AS starts,
            COALESCE(u.sub_appearances, (0)::bigint) AS subs,
            COALESCE(av.availability, ((COALESCE(fp.chance_of_playing_next_round, fp.chance_of_playing_this_round,
                CASE
                    WHEN (fp.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text])) THEN 0
                    ELSE 100
                END))::numeric / (100)::numeric)) AS availability,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status,
            CASE
                WHEN ((fp.status = ANY (ARRAY['i'::text, 'd'::text, 's'::text])) AND (fp.element_type <> 1)) THEN prev.starts_last
                ELSE NULL::bigint
            END AS base_prev_starts
           FROM ((((fixtures f
             JOIN leagues l ON ((l.league_id = f.league_id)))
             JOIN fpl_players fp ON (((fp.season_id = f.season_id) AND ((fp.canonical_team_id = f.home_team_id) OR (fp.canonical_team_id = f.away_team_id)))))
             LEFT JOIN fpl_player_substitution_usage u ON (((u.season_id = fp.season_id) AND (u.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN player_squad_hierarchy h ON (((h.season_id = fp.season_id) AND (h.fpl_player_id = fp.fpl_player_id))))
             LEFT JOIN fpl_fixture_availability_store av ON ((av.fixture_id = f.fixture_id) AND (av.fpl_player_id = fp.fpl_player_id))
             LEFT JOIN prev ON (prev.fpl_code = fp.fpl_code)
          WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (l.code = 'E0'::text))
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    LEAST(0.98, (availability *
        CASE
            WHEN ((apps >= 4) AND (starts = apps)) THEN 0.96
            WHEN ((apps = 3) AND (starts = 3)) THEN 0.94
            WHEN ((apps >= 3) AND (starts >= (apps - 1))) THEN 0.84
            WHEN (apps > 0) THEN GREATEST(0.05, LEAST(0.90, (((starts)::numeric + 0.5) / ((apps)::numeric + 1.0))))
            ELSE
            CASE COALESCE(NULLIF(squad_status, 'unknown'::text), CASE WHEN (base_prev_starts >= 20) THEN 'first_choice'::text WHEN (base_prev_starts >= 10) THEN 'rotation'::text ELSE NULL::text END, 'unknown'::text)
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
            WHEN ((apps >= 3) AND (starts = apps)) THEN 'nailed_history'::text
            WHEN ((apps >= 3) AND (starts >= (apps - 1))) THEN 'strong_history'::text
            ELSE 'history_hierarchy'::text
        END AS probability_source
   FROM base;

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Per-fixture FPL availability (stored copy of fpl_player_fixture_availability) read by the projection views.',
  refresh_note = 'refresh_fpl_fixture_availability(), called at the start of each projection refresh run.', purpose_reviewed_at = now()
where node_key = 'object:fpl_fixture_availability_store';
