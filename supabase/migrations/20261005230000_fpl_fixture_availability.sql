-- FPL availability by fixture, from return dates and doubts (5 Oct 2026).
--
-- Before: every view that turned FPL status into availability applied this
-- week's status to EVERY future fixture. A player "Expected back 10 Oct" was
-- 0 for the rest of the season; a 75% doubt was 75% in every gameweek; an
-- injury with no return date was 0 forever.
--
-- 1. fpl_player_fixture_availability: one row per upcoming PL fixture and
--    player of that club, with availability and the rule that set it:
--      available            1
--      unavailable (u/n)    0
--      suspended_until D    0 before D, 1 from D
--      before_return_date   0 before the "Expected back" date (a doubt keeps
--                           FPL's chance for the next gameweek)
--      returning            first match on/after the date 75%, second 90%, then 1
--      return_date_passed   still injured after the date: FPL's chance for the
--                           next gameweek, then 50%, 75%, 90%, 1
--      doubt                FPL's chance for the NEXT gameweek only; the
--                           remaining doubt halves each gameweek after
--                           (75% -> 88% -> 94%; 50% -> 75% -> 88%)
--      injured_no_date      0 for the next two gameweeks, then +15% a
--                           gameweek to at most 60%
--    "Next gameweek" is the first FPL event whose deadline is ahead, by the
--    fixture's FPL event (so double gameweeks count once).
--    Evidence (snapshots 13 Sep - 5 Oct): of 25 "Expected back" players on
--    18 Sep, the dates held for all but one (most were set to the first
--    match after the break); none of 47 "Unknown return date" players was
--    back within 17 days; half of the doubts were still doubts 17 days on.
--    The 60% cap and the ramps are assumptions until more weeks are logged.
-- 2. fixture_player_lineup_consensus, fixture_player_expected_minutes_fallback
--    and fpl_fallback_start_probability_v6 take availability from it (old
--    status rule kept as the fallback for anything it doesn't cover). Manual
--    squad-state overrides still win, as before.
-- 3. A player with no appearances this season because he has been injured
--    (injured since August) was rated as an unknown squad player (start 18%)
--    even once fit. If he is currently flagged (injured, doubtful or
--    suspended), is not a goalkeeper, and started 20+ league games last
--    season, he now counts as first choice; 10-19 starts, rotation. Only
--    where the squad ranking has nothing better. A FIT player with no
--    appearances keeps the old rating: five gameweeks unused is evidence.

create or replace view public.fpl_player_fixture_availability with (security_invoker=true) as
 WITH season AS (
         SELECT fpl_current_season_id() AS season_id
        ), nxt AS (
         SELECT min(g.fpl_event_id) AS next_event,
            min(g.deadline_time) AS next_deadline
           FROM fpl_gameweeks g
          WHERE g.season_id = (SELECT season_id FROM season) AND g.deadline_time > now()
        ), fx AS (
         SELECT f.fixture_id,
            f.kickoff_date,
            f.home_team_id,
            f.away_team_id,
            ff.fpl_event_id
           FROM fixtures f
             JOIN leagues l ON l.league_id = f.league_id AND l.code = 'E0'::text
             LEFT JOIN fpl_fixtures ff ON ff.canonical_fixture_id = f.fixture_id AND ff.season_id = f.season_id
          WHERE f.season_id = (SELECT season_id FROM season) AND f.status <> 'played'::text
        ), pl AS (
         SELECT p.fpl_player_id,
            p.canonical_team_id AS team_id,
            COALESCE(p.status, 'a'::text) AS status,
            p.chance_of_playing_next_round,
            p.news,
            m.m AS date_parts,
            COALESCE(p.news_added::date, CURRENT_DATE) AS news_date
           FROM fpl_players p
             LEFT JOIN LATERAL regexp_match(p.news, '(?:back|until)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'::text, 'i'::text) m(m) ON true
          WHERE p.season_id = (SELECT season_id FROM season)
        ), pl2 AS (
         SELECT pl.fpl_player_id, pl.team_id, pl.status, pl.chance_of_playing_next_round, pl.news,
            CASE
                WHEN pl.date_parts IS NULL THEN NULL::date
                -- The news carries no year: take the year the news was posted, and the next
                -- one if that would put the date more than two weeks before the news itself.
                WHEN to_date(pl.date_parts[1] || ' ' || pl.date_parts[2] || ' ' || extract(year FROM pl.news_date)::text, 'DD Mon YYYY') < (pl.news_date - 14)
                  THEN (to_date(pl.date_parts[1] || ' ' || pl.date_parts[2] || ' ' || extract(year FROM pl.news_date)::text, 'DD Mon YYYY') + '1 year'::interval)::date
                ELSE to_date(pl.date_parts[1] || ' ' || pl.date_parts[2] || ' ' || extract(year FROM pl.news_date)::text, 'DD Mon YYYY')
            END AS return_date
           FROM pl
        ), pf AS (
         SELECT fx.fixture_id,
            pl2.fpl_player_id,
            pl2.team_id,
            fx.kickoff_date,
            fx.fpl_event_id,
            -- 0 = the next gameweek (the one FPL's "chance of playing next round" is about).
            GREATEST(0, COALESCE(fx.fpl_event_id - nxt.next_event, floor((fx.kickoff_date - nxt.next_deadline::date)::numeric / 7.0)::integer, 0)) AS gameweeks_ahead,
            pl2.status,
            pl2.chance_of_playing_next_round,
            pl2.return_date,
            -- Which match back this is: 1 = the first on or after the return date.
            CASE WHEN pl2.return_date IS NOT NULL AND fx.kickoff_date >= pl2.return_date
              THEN row_number() OVER (PARTITION BY pl2.fpl_player_id, (fx.kickoff_date >= pl2.return_date) ORDER BY fx.kickoff_date, fx.fixture_id)
            END AS match_back
           FROM pl2
             JOIN fx ON pl2.team_id = fx.home_team_id OR pl2.team_id = fx.away_team_id
             CROSS JOIN nxt
        )
 SELECT fixture_id,
    fpl_player_id,
    team_id,
    kickoff_date,
    fpl_event_id,
    gameweeks_ahead,
    status,
    chance_of_playing_next_round,
    return_date,
    r.availability,
    r.rule
   FROM pf
     CROSS JOIN LATERAL (
       SELECT CASE
            WHEN pf.status = 'a'::text THEN 1::numeric
            WHEN pf.status = ANY (ARRAY['u'::text, 'n'::text]) THEN 0::numeric
            WHEN pf.status = 's'::text AND pf.return_date IS NOT NULL THEN CASE WHEN pf.kickoff_date < pf.return_date THEN 0::numeric ELSE 1::numeric END
            WHEN pf.status = 's'::text THEN CASE WHEN pf.gameweeks_ahead = 0 THEN 0::numeric ELSE 1::numeric END
            -- Return date still ahead: out before it, then 75%, 90%, fit.
            WHEN pf.return_date > CURRENT_DATE AND pf.kickoff_date < pf.return_date THEN
              CASE WHEN pf.status = 'd'::text AND pf.gameweeks_ahead = 0 THEN COALESCE(pf.chance_of_playing_next_round, 75)::numeric / 100.0 ELSE 0::numeric END
            WHEN pf.return_date > CURRENT_DATE THEN
              CASE pf.match_back WHEN 1 THEN 0.75 WHEN 2 THEN 0.90 ELSE 1::numeric END
            -- Return date passed but still injured: the date slipped. Trust FPL for the
            -- next gameweek, then 50%, 75%, 90%, fit.
            WHEN pf.status = 'i'::text AND pf.return_date IS NOT NULL THEN
              CASE pf.gameweeks_ahead WHEN 0 THEN COALESCE(pf.chance_of_playing_next_round, 0)::numeric / 100.0 WHEN 1 THEN 0.50 WHEN 2 THEN 0.75 WHEN 3 THEN 0.90 ELSE 1::numeric END
            -- A doubt is about the next gameweek: FPL's chance then, and the remaining
            -- doubt halves each gameweek after (75% -> 88%, 94%; 50% -> 75%, 88%).
            WHEN pf.status = 'd'::text THEN
              1::numeric - (1::numeric - COALESCE(pf.chance_of_playing_next_round, 75)::numeric / 100.0) * power(0.5::numeric, pf.gameweeks_ahead::numeric)
            -- Injured, no return date: out for the next two gameweeks, then a slow
            -- rise to at most 60% (no data yet on how long these last).
            WHEN pf.status = 'i'::text THEN
              CASE WHEN pf.gameweeks_ahead <= 1 THEN 0::numeric ELSE LEAST(0.60, 0.15 * (pf.gameweeks_ahead - 1)::numeric) END
            ELSE 1::numeric
          END AS availability,
          CASE
            WHEN pf.status = 'a'::text THEN 'available'
            WHEN pf.status = ANY (ARRAY['u'::text, 'n'::text]) THEN 'unavailable'
            WHEN pf.status = 's'::text AND pf.return_date IS NOT NULL THEN 'suspended_until'
            WHEN pf.status = 's'::text THEN 'suspended_next'
            WHEN pf.return_date > CURRENT_DATE AND pf.kickoff_date < pf.return_date THEN 'before_return_date'
            WHEN pf.return_date > CURRENT_DATE THEN 'returning'
            WHEN pf.status = 'i'::text AND pf.return_date IS NOT NULL THEN 'return_date_passed'
            WHEN pf.status = 'd'::text THEN 'doubt'
            WHEN pf.status = 'i'::text THEN 'injured_no_date'
            ELSE 'other'
          END AS rule
     ) r;

grant select on public.fpl_player_fixture_availability to anon, authenticated;
comment on view public.fpl_player_fixture_availability is 'Availability (0-1) per upcoming PL fixture and player from FPL status, chance of playing and the return/suspension date in the news text: a doubt applies to the next gameweek only, a return date ramps 75%/90%/fit, unknown-return injuries rise slowly to at most 60%. Column rule names the rule applied. Read by the projection views.';

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
     LEFT JOIN fpl_player_fixture_availability av ON ((av.fixture_id = st.fixture_id) AND (av.fpl_player_id = p.fpl_player_id));

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
             LEFT JOIN fpl_player_fixture_availability av ON ((av.fixture_id = f.fixture_id) AND (av.fpl_player_id = fp.fpl_player_id))
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
             LEFT JOIN fpl_player_fixture_availability av ON ((av.fixture_id = f.fixture_id) AND (av.fpl_player_id = fp.fpl_player_id))
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

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
values ('2026-10-05', 'prediction',
  'FPL: availability by fixture from return dates; doubts apply to the next gameweek only',
  'Every future fixture used this week''s FPL status: "Expected back 10 Oct" players were 0 for the rest of the season (Pau, Bizot, Mateta ...), 75% doubts were 75% in every gameweek and unknown-return injuries were 0 forever. Players injured since August were rated as unknown squad players (18% start) even once fit.',
  'New view fpl_player_fixture_availability (per fixture: suspension end, return-date ramp 75/90/100, doubt for next gameweek then halving, unknown return 0 for two gameweeks then +15%/gameweek to 60%). Lineup consensus and both history fallbacks read it. No appearances this season while flagged (not goalkeepers): last season''s starts (20+ first choice, 10-19 rotation) when the squad ranking has nothing better.',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261005230000; docs/incidents.md 2026-10-05');

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Availability per upcoming PL fixture and player: FPL status and chance of playing for the next gameweek, return and suspension dates from the news text for later ones.',
  refresh_note = 'View over fpl_players, fpl_gameweeks and fpl_fixtures; live.', purpose_reviewed_at = now()
where node_key = 'object:fpl_player_fixture_availability';
