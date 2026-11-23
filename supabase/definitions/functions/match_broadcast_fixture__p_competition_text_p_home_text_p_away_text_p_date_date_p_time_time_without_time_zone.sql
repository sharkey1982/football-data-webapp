-- Live definition exported from the database (function match_broadcast_fixture(p_competition text, p_home text, p_away text, p_date date, p_time time without time zone)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.match_broadcast_fixture(p_competition text, p_home text, p_away text, p_date date, p_time time without time zone DEFAULT NULL::time without time zone)
 RETURNS TABLE(fixture_id bigint, league_code text, reason text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
declare
  v_comp text := nullif(trim(p_competition), '');
  v_home_raw text := nullif(trim(p_home), '');
  v_away_raw text := nullif(trim(p_away), '');
  v_code text; v_league bigint; v_home bigint; v_away bigint;
  v_fixture bigint; v_n int; v_reason text;
begin
  if p_date is null or v_home_raw is null or v_away_raw is null then
    return query select null::bigint, null::text, 'missing kickoff date or team'::text;
    return;
  end if;

  -- Competition: league code, league name, or a broadcast_competition_map label.
  if v_comp is not null then
    select l.code, l.league_id into v_code, v_league from public.leagues l
     where upper(l.code) = upper(v_comp) or lower(l.name) = lower(v_comp)
     order by (upper(l.code) = upper(v_comp)) desc limit 1;
    if v_code is null then
      v_code := (select m.league_code from public.broadcast_competition_map m where lower(m.label) = lower(v_comp) order by m.label limit 1);
      v_league := (select l.league_id from public.leagues l where l.code = v_code);
    end if;
  end if;

  v_home := public.resolve_broadcast_team(v_home_raw);
  v_away := public.resolve_broadcast_team(v_away_raw);
  if v_home is null then v_reason := 'unknown team: ' || v_home_raw; end if;
  if v_away is null then v_reason := coalesce(v_reason || '; ', '') || 'unknown team: ' || v_away_raw; end if;
  if v_comp is not null and v_code is null then
    v_reason := coalesce(v_reason || '; ', '') ||
      case when exists (select 1 from public.broadcast_competition_coverage c where lower(c.label) = lower(v_comp))
           then 'competition not covered by site fixtures: ' else 'competition not mapped: ' end || v_comp;
  elsif v_code is not null and v_league is null then
    v_reason := coalesce(v_reason || '; ', '') || 'competition not in database: ' || v_comp;
  end if;
  if v_reason is not null then
    return query select null::bigint, v_code, v_reason;
    return;
  end if;

  -- Nearest fixture of these two teams within 3 days in the competition; a
  -- matching kick-off time breaks a tie in distance.
  with cand as (
    select fx.fixture_id fid, abs(fx.kickoff_date - p_date) dist,
           (p_time is not null and fx.kickoff_time = p_time) tmatch
    from public.fixtures fx
    where fx.home_team_id = v_home and fx.away_team_id = v_away
      and fx.kickoff_date between p_date - 3 and p_date + 3
      and (v_league is null or fx.league_id = v_league)
  ), best as (select * from cand order by dist, tmatch desc, fid limit 1)
  select b.fid, (select count(*) from cand c where c.dist = b.dist and c.tmatch = b.tmatch)
    into v_fixture, v_n from best b;

  -- Nothing in the named competition: both teams on the EXACT date, unique
  -- across competitions (a mislabelled row). No tolerance, no partial match.
  if v_fixture is null and v_league is not null then
    select min(fx.fixture_id), count(*) into v_fixture, v_n from public.fixtures fx
     where fx.home_team_id = v_home and fx.away_team_id = v_away and fx.kickoff_date = p_date;
  end if;

  if v_fixture is null then v_reason := 'no fixture within 3 days';
  elsif v_n > 1 then v_reason := 'ambiguous fixture'; v_fixture := null; end if;

  return query select v_fixture, v_code, v_reason;
end;
$function$
;
