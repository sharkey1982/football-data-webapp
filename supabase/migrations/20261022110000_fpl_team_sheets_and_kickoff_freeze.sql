-- FPL v6: team sheets that add up, FPL news before every run, projections
-- frozen at kick-off (22 Oct 2026; audit DQ-08, S-13, DQ-07).
--
-- 1. Team sheets (DQ-08). fixture_player_expected_minutes_resolved_v3 only
--    ever scaled a team-fixture DOWN to 10 outfield starters and 1
--    goalkeeper. A team whose regulars are out was left short: Chelsea's only
--    fit keeper for GW8-12 (Penders: Martinez injured, Jorgensen and Sanchez
--    on loan) had start 0.25 from one substitute appearance, so Chelsea had
--    0.25 expected keepers and their clean-sheet and save points vanished.
--    Spurs GW8 had 9.63 expected starters, Coventry 10.28-10.50 every week;
--    18 of 200 team-fixtures in GW8-17 were more than 0.5 from 11.
--    Fix: after the existing scale-down, a team-fixture below 10 outfield / 1
--    goalkeeper is scaled UP. The gap goes first in proportion to
--    start chance x headroom, then any remainder in proportion to headroom,
--    where headroom = min(availability, 0.98) - start chance, so nobody goes
--    above his FPL availability. A player who gains start chance gains
--    minutes (80 a start, 90 for a keeper) and his sub chance is capped at
--    1 - start. Dry run on 22 Oct, GW8-17: every team-fixture 10.98-11.00
--    starters and 0.98-1.00 keepers; Penders 0.25 -> 0.98. Teams already at
--    11 are unchanged.
--
-- 2. FPL news before every run (S-13): see scripts/refresh_fpl_projections.py.
--    Saka (50%, news 21 Oct 20:30) was projected at start 0.94 on 21 Oct
--    22:06 because fpl_players had last been refreshed at 18:17 (pg_cron,
--    6-hourly); availability is applied correctly when the data is current
--    (all 20,708 stored rows have start <= availability). The script now
--    calls public.refresh_fpl() first.
--
-- 3. Frozen at kick-off (DQ-07): refresh_fpl_projection_fixture_v6 skipped
--    only fixtures with status 'played', which is set hours after the match,
--    so 4,591 of 4,662 v6 rows on played fixtures were rewritten after
--    kick-off. It now also skips a fixture whose kick-off has passed
--    (fpl_fixtures.kickoff_time, else the UK-local fixture date and time).
--    p_allow_played => true (scripts/backfill-projections.ts) still forces it.
--
-- Bug fixes within leaguewide_v6 (model_change_log), no new version: no fit
-- or setting changes, and the same rule was always intended (the view
-- already capped teams at 11; docs/methodology/expected-minutes.md listed
-- "limits only reduce" as a known limitation).

create or replace view public.fixture_player_expected_minutes_resolved_v3 with (security_invoker=true) as
 WITH r AS (
         SELECT raw.fixture_id,
            raw.team_id,
            raw.fpl_player_id,
            raw.web_name,
            raw.element_type,
            raw.expected_minutes,
            raw.prob_starting_xi,
            raw.prob_sub_appearance,
            raw.availability_probability,
            raw.tactical_role,
            raw.minutes_source,
            (raw.element_type = 1) AS is_gk,
            row_number() OVER (PARTITION BY raw.fixture_id, raw.team_id, (raw.element_type = 1) ORDER BY raw.expected_minutes DESC, raw.prob_starting_xi DESC, raw.fpl_player_id) AS gk_rank
           FROM public.fixture_player_expected_minutes_resolved_v3_raw raw
        ), t AS (
         SELECT r.*,
            sum(r.expected_minutes) OVER w AS team_min,
            sum(r.prob_starting_xi) OVER w AS team_start,
            sum((r.expected_minutes * ((1)::numeric - LEAST(r.prob_starting_xi, (1)::numeric)))) OVER w AS w_min_sum,
            sum((r.prob_starting_xi * ((1)::numeric - LEAST(r.prob_starting_xi, (1)::numeric)))) OVER w AS w_start_sum,
            max(CASE WHEN (r.gk_rank = 1) THEN LEAST(r.expected_minutes, (90)::numeric) ELSE NULL::numeric END) OVER w AS lead_gk_min,
            max(CASE WHEN (r.gk_rank = 1) THEN LEAST(r.prob_starting_xi, (1)::numeric) ELSE NULL::numeric END) OVER w AS lead_gk_start,
            sum(CASE WHEN (r.gk_rank > 1) THEN r.expected_minutes ELSE (0)::numeric END) OVER w AS other_gk_min,
            sum(CASE WHEN (r.gk_rank > 1) THEN r.prob_starting_xi ELSE (0)::numeric END) OVER w AS other_gk_start
           FROM r
          WINDOW w AS (PARTITION BY r.fixture_id, r.team_id, r.is_gk)
        ), n AS (
         -- Step 1 (unchanged): scale DOWN a team-fixture that has more than
         -- 10 outfield starters / 1 goalkeeper.
         SELECT t.*,
                CASE
                    WHEN (t.is_gk AND (t.gk_rank = 1)) THEN LEAST(t.expected_minutes, (90)::numeric)
                    WHEN t.is_gk THEN (t.expected_minutes * LEAST((1)::numeric, (GREATEST(((90)::numeric - t.lead_gk_min), (0)::numeric) / NULLIF(t.other_gk_min, (0)::numeric))))
                    WHEN ((t.team_min <= (900)::numeric) OR (t.w_min_sum = (0)::numeric)) THEN t.expected_minutes
                    ELSE GREATEST((0)::numeric, (t.expected_minutes - ((((t.team_min - (900)::numeric) * t.expected_minutes) * ((1)::numeric - LEAST(t.prob_starting_xi, (1)::numeric))) / t.w_min_sum)))
                END AS new_min,
                CASE
                    WHEN (t.is_gk AND (t.gk_rank = 1)) THEN LEAST(t.prob_starting_xi, (1)::numeric)
                    WHEN t.is_gk THEN (t.prob_starting_xi * LEAST((1)::numeric, (GREATEST(((1)::numeric - t.lead_gk_start), (0)::numeric) / NULLIF(t.other_gk_start, (0)::numeric))))
                    WHEN ((t.team_start <= (10)::numeric) OR (t.w_start_sum = (0)::numeric)) THEN t.prob_starting_xi
                    ELSE GREATEST((0)::numeric, (t.prob_starting_xi - ((((t.team_start - (10)::numeric) * t.prob_starting_xi) * ((1)::numeric - LEAST(t.prob_starting_xi, (1)::numeric))) / t.w_start_sum)))
                END AS new_start
           FROM t
        ), h AS (
         -- Step 2 (22 Oct 2026): scale UP a team-fixture that has fewer than
         -- 10 outfield starters / 1 goalkeeper, e.g. when regulars are
         -- injured (Chelsea GW8: the only fit keeper, Penders, was left at
         -- 0.25). Nobody goes above his availability (or 0.98).
         SELECT n.*,
            COALESCE(n.new_start, n.prob_starting_xi) AS s1,
            COALESCE(n.new_min, n.expected_minutes) AS m1,
            GREATEST((0)::numeric, LEAST(0.98, COALESCE(n.availability_probability, (1)::numeric)) - COALESCE(n.new_start, n.prob_starting_xi)) AS cap
           FROM n
        ), h2 AS (
         SELECT h.*,
            GREATEST((0)::numeric, (CASE WHEN h.is_gk THEN (1)::numeric ELSE (10)::numeric END) - sum(h.s1) OVER w2) AS deficit,
            sum(h.s1 * h.cap) OVER w2 AS w_sum,
            sum(h.cap) OVER w2 AS cap_sum
           FROM h
          WINDOW w2 AS (PARTITION BY h.fixture_id, h.team_id, h.is_gk)
        ), h3 AS (
         -- First pass: in proportion to start chance x headroom, so the
         -- squad players already in contention take most of the gap.
         SELECT h2.*,
            CASE WHEN h2.deficit > 0 AND h2.w_sum > 0 THEN LEAST(h2.cap, h2.deficit * h2.s1 * h2.cap / h2.w_sum) ELSE (0)::numeric END AS add1
           FROM h2
        ), h4 AS (
         SELECT h3.*,
            GREATEST((0)::numeric, h3.deficit - sum(h3.add1) OVER w3) AS residual,
            sum(h3.cap - h3.add1) OVER w3 AS cap2_sum
           FROM h3
          WINDOW w3 AS (PARTITION BY h3.fixture_id, h3.team_id, h3.is_gk)
        ), u AS (
         -- Second pass: whatever is left, in proportion to the remaining
         -- headroom (never more than it).
         SELECT h4.*,
            h4.add1 + CASE WHEN h4.residual > 0 AND h4.cap2_sum > 0 THEN LEAST(h4.cap - h4.add1, h4.residual * (h4.cap - h4.add1) / h4.cap2_sum) ELSE (0)::numeric END AS add_start
           FROM h4
        ), v AS (
         SELECT u.*,
            u.s1 + u.add_start AS s2,
            CASE
                WHEN (u.is_gk AND (u.gk_rank > 1) AND (u.expected_minutes > (0)::numeric)) THEN ((u.prob_sub_appearance * u.m1) / u.expected_minutes)
                ELSE u.prob_sub_appearance
            END AS sub1
           FROM u
        ), x AS (
         SELECT v.*,
            CASE WHEN v.add_start > 0 THEN LEAST(v.sub1, GREATEST((0)::numeric, (1)::numeric - v.s2)) ELSE v.sub1 END AS sub2
           FROM v
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    web_name,
    element_type,
    CASE WHEN add_start > 0
         THEN LEAST((90)::numeric, GREATEST((0)::numeric, m1 + add_start * (CASE WHEN is_gk THEN 90 ELSE 80 END)::numeric + (sub2 - sub1) * (20)::numeric))
         ELSE m1 END AS expected_minutes,
    s2 AS prob_starting_xi,
    sub2 AS prob_sub_appearance,
    availability_probability,
    tactical_role,
    minutes_source
   FROM x;

create or replace function public.refresh_fpl_projection_fixture_v6(p_fixture_id bigint, p_allow_played boolean default false)
 returns integer
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text;
  v_kickoff timestamptz;
  v_rows integer;
begin
  if not p_allow_played then
    select f.status,
           coalesce(ff.kickoff_time,
                    ((f.kickoff_date + coalesce(f.kickoff_time, '00:00'::time)) at time zone 'Europe/London'))
      into v_status, v_kickoff
      from public.fixtures f
      left join public.fpl_fixtures ff on ff.canonical_fixture_id = f.fixture_id and ff.season_id = f.season_id
     where f.fixture_id = p_fixture_id
     limit 1;
    if v_status = 'played' or v_kickoff <= now() then
      -- Nothing written, and deliberately not an error: the routine
      -- pipeline sweeps a matchweek range that may include fixtures under
      -- way or just played. Frozen at kick-off (22 Oct 2026): what is
      -- stored is what was shown before the match.
      return 0;
    end if;
  end if;

  select public.refresh_fpl_projection_fixture_v6_impl(p_fixture_id) into v_rows;
  return v_rows;
end;
$function$;

-- Regression tests (rolled back by the exception at the end of the block).
do $$
declare
  v_bad int;
  v_gk numeric;
  v_fx bigint;
begin
  -- Every upcoming team-fixture now sums to ~11 and ~1 keeper.
  select count(*) into v_bad from (
    select r.fixture_id, r.team_id, sum(r.prob_starting_xi) sp,
           coalesce(sum(r.prob_starting_xi) filter (where r.element_type = 1), 0) gk
      from public.fixture_player_expected_minutes_resolved_v3 r
      join public.fixtures f on f.fixture_id = r.fixture_id
     where f.season_id = public.fpl_current_season_id() and f.status <> 'played'
       and f.kickoff_date >= current_date and f.kickoff_date < current_date + 21
     group by 1, 2) t
   where abs(t.sp - 11) > 0.5 or abs(t.gk - 1) > 0.2;
  if v_bad > 0 then
    raise exception 'resolved_v3: % upcoming team-fixtures outside 11 +/- 0.5 starters / 1 +/- 0.2 keepers', v_bad;
  end if;

  -- Nobody above his availability.
  select count(*) into v_bad
    from public.fixture_player_expected_minutes_resolved_v3 r
    join public.fixtures f on f.fixture_id = r.fixture_id
   where f.season_id = public.fpl_current_season_id() and f.status <> 'played'
     and f.kickoff_date >= current_date and f.kickoff_date < current_date + 21
     and r.prob_starting_xi > coalesce(r.availability_probability, 1) + 0.005;
  if v_bad > 0 then
    raise exception 'resolved_v3: % rows with start probability above availability', v_bad;
  end if;

  -- A fixture that has kicked off is not rewritten.
  select f.fixture_id into v_fx
    from public.fixtures f join public.fpl_fixtures ff on ff.canonical_fixture_id = f.fixture_id and ff.season_id = f.season_id
   where f.season_id = public.fpl_current_season_id() and ff.kickoff_time < now() - interval '1 day'
   order by ff.kickoff_time desc limit 1;
  if v_fx is not null then
    update public.fixtures set status = 'scheduled' where fixture_id = v_fx;
    if public.refresh_fpl_projection_fixture_v6(v_fx) <> 0 then
      raise exception 'refresh_fpl_projection_fixture_v6 rewrote fixture % after kick-off', v_fx;
    end if;
  end if;

  raise exception 'regression_ok';
exception when others then
  if sqlerrm <> 'regression_ok' then raise; end if;
end $$;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select '2026-10-22', 'prediction',
  'FPL: team sheets scaled up to 11 starters and 1 keeper',
  'Teams with regulars out were left short of 11 expected starters: Chelsea''s only fit keeper (Penders) had start 0.25 for GW8-12, Spurs GW8 9.63 starters, Coventry ~10.3 every week (audit DQ-08).',
  'fixture_player_expected_minutes_resolved_v3 now also scales a team-fixture up to 10 outfield starters and 1 keeper: the gap is shared by start chance x headroom, then headroom, never above a player''s availability (or 0.98); minutes follow the added start chance. Teams already at 11 are unchanged.',
  'leaguewide_v6', 'leaguewide_v6', 'migration 20261022110000'
where not exists (select 1 from public.model_change_log where reference = 'migration 20261022110000');

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select '2026-10-22', 'data',
  'FPL: projections frozen at kick-off, FPL news refreshed before each run',
  'Projections were rewritten for hours after kick-off (4,591 of 4,662 v6 rows on played fixtures), and a run could use FPL news up to 6 hours old (Saka 50% doubtful projected at start 0.94 on 21 Oct) (audit DQ-07, S-13).',
  'refresh_fpl_projection_fixture_v6 skips fixtures whose kick-off has passed; scripts/refresh_fpl_projections.py calls refresh_fpl() before refreshing availability.',
  'leaguewide_v6', 'leaguewide_v6', 'migration 20261022110000 (2)'
where not exists (select 1 from public.model_change_log where reference = 'migration 20261022110000 (2)');

-- Integrity checks (see incidents 2026-10-22). Skipped if already added.
do $$
declare
  def text := pg_get_functiondef('public.check_model_integrity'::regproc);
  anchor text := '  -- Catalogue (2026-09-26)';
  addition text := $add$  -- Team sheets (2026-10-22): every upcoming team-fixture in the 10
  -- gameweeks from the next deadline has 11 +/- 0.5 expected starters and
  -- 1 +/- 0.2 expected goalkeepers (Chelsea GW8 had 0.25 keepers).
  select 'fpl_projection_team_starters',
    case when n = 0 then 'ok' else 'failed' end, n,
    'Upcoming team-fixtures (next 10 gameweeks) whose leaguewide_v6 start probabilities sum outside 11 +/- 0.5, or whose goalkeepers sum outside 1 +/- 0.2 (fixture_player_expected_minutes_resolved_v3)'
  from (select count(*) n from (
          select p.fixture_id, fp.canonical_team_id,
                 sum(p.start_probability) sp,
                 coalesce(sum(p.start_probability) filter (where fp.element_type = 1), 0) gk
            from public.fpl_player_projections p
            join public.fpl_fixtures ff on ff.canonical_fixture_id = p.fixture_id and ff.season_id = p.season_id
            join public.fixtures f on f.fixture_id = p.fixture_id
            join public.fpl_players fp on fp.fpl_player_id = p.fpl_player_id and fp.season_id = p.season_id
                                      and fp.canonical_team_id in (f.home_team_id, f.away_team_id)
           where p.season_id = public.fpl_current_season_id() and p.model_version = 'leaguewide_v6'
             and coalesce(p.scenario_key, 'baseline') = 'baseline'
             and f.status <> 'played' and ff.kickoff_time > now()
             and ff.fpl_event_id between public.ai_next_fpl_gameweek(public.fpl_current_season_id())
                                     and public.ai_next_fpl_gameweek(public.fpl_current_season_id()) + 9
           group by 1, 2) t
         where abs(t.sp - 11) > 0.5 or abs(t.gk - 1) > 0.2) x
  union all
  -- FPL flags (2026-10-22): a player FPL gives a c% chance for the next
  -- round has a start probability of at most c% (+0.02) in that gameweek.
  -- Warning: it also fires between an FPL news update and the next
  -- projection run (Saka 50% at 0.94 on 21 Oct).
  select 'fpl_projection_respects_chance_of_playing',
    case when n = 0 then 'ok' else 'warning' end, n,
    'Players with an FPL chance_of_playing_next_round whose next-gameweek leaguewide_v6 start probability exceeds it (stale availability, or availability not applied)'
  from (select count(*) n
          from public.fpl_player_projections p
          join public.fpl_fixtures ff on ff.canonical_fixture_id = p.fixture_id and ff.season_id = p.season_id
          join public.fpl_players fp on fp.fpl_player_id = p.fpl_player_id and fp.season_id = p.season_id
         where p.season_id = public.fpl_current_season_id() and p.model_version = 'leaguewide_v6'
           and coalesce(p.scenario_key, 'baseline') = 'baseline'
           and ff.fpl_event_id = public.ai_next_fpl_gameweek(public.fpl_current_season_id())
           and ff.kickoff_time > now()
           and fp.chance_of_playing_next_round is not null
           and p.start_probability > fp.chance_of_playing_next_round / 100.0 + 0.02) x
  union all
$add$;
begin
  if position('fpl_projection_team_starters' in def) > 0 then return; end if;
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(def, anchor, addition || anchor);
end $$;
