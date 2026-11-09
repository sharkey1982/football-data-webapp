-- "The week ahead" long-break openings, second go (Chris, 9 Nov 2026 06:12:
-- "Gw finished last night. Are you trying to say there is an international
-- break this week?"). Say it plainly: no FPL this weekend, and when it's back.
-- The template doesn't know why there's a gap (international break or a cup
-- weekend), so it says "no FPL this weekend"; post #86 names the
-- international break. Safe to re-run.

create or replace function private.social_hook_outlook(p_post text, s jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := (s->>'season_id')::bigint; v_gw int := (s->>'gw')::int;
  v_dl timestamp := ((s->>'deadline')::timestamptz) at time zone 'Europe/London';
  v_first timestamptz; v_last timestamptz; v_prev_last timestamptz; v_days int[];
  v_blank text; v_nblank int; v_double text; v_ndouble int; v_fri text; v_nfri int; v_mid int; v_gap int;
  v_line1 text; v_rest text; v_dlt text; v_span text; v_tail text; a text; b text; f text;
begin
  if p_post !~ '^FPL GW\d+ is (different|a normal week)' then return null; end if;
  v_line1 := split_part(p_post, E'\n', 1);
  v_rest := case when strpos(p_post, E'\n') > 0 then substr(p_post, strpos(p_post, E'\n')) else '' end;
  -- A deadline more than six days away gets its date: "Sat 11:00" read as this Saturday.
  v_dlt := to_char(v_dl, case when v_dl - (now() at time zone 'Europe/London') > interval '6 days'
                              then 'Dy FMDD Mon HH24:MI' else 'Dy HH24:MI' end);
  select min(kickoff_time), max(kickoff_time), array_agg(distinct extract(isodow from kickoff_time at time zone 'Europe/London')::int)
    into v_first, v_last, v_days from public.fpl_fixtures where season_id = v_season and fpl_event_id = v_gw;
  if v_first is null then return null; end if;
  select max(kickoff_time) into v_prev_last from public.fpl_fixtures where season_id = v_season and fpl_event_id = v_gw - 1;
  v_span := to_char(v_first at time zone 'Europe/London', 'FMDay') || ' to ' || to_char(v_last at time zone 'Europe/London', 'FMDay');
  with n as (select t.short_name, (select count(*) from public.fpl_fixtures f where f.season_id = v_season and f.fpl_event_id = v_gw
                                      and t.fpl_team_id in (f.fpl_home_team_id, f.fpl_away_team_id)) games
               from public.fpl_teams t where t.season_id = v_season)
  select string_agg(short_name, ', ' order by short_name) filter (where games = 0), count(*) filter (where games = 0),
         string_agg(short_name, ', ' order by short_name) filter (where games >= 2), count(*) filter (where games >= 2)
    into v_blank, v_nblank, v_double, v_ndouble from n;
  select count(*), min(th.name || ' v ' || ta.name) into v_nfri, v_fri
    from public.fpl_fixtures f join public.fpl_teams th on th.season_id = f.season_id and th.fpl_team_id = f.fpl_home_team_id
    join public.fpl_teams ta on ta.season_id = f.season_id and ta.fpl_team_id = f.fpl_away_team_id
   where f.season_id = v_season and f.fpl_event_id = v_gw and extract(isodow from f.kickoff_time at time zone 'Europe/London') = 5;
  -- PL teams in the "Midweek before it" line of this post.
  select count(distinct x[1]) into v_mid from regexp_matches(coalesce(substring(v_rest from 'Midweek before it: [^\n]*'), ''), '\m([A-Z]{3})\M', 'g') x;
  v_gap := (v_first at time zone 'Europe/London')::date - (v_prev_last at time zone 'Europe/London')::date;

  if v_ndouble > 0 then
    f := 'doubles';
    v_tail := case when v_nblank > 0 then format('; %s %s.', v_blank, case when v_nblank = 1 then 'doesn''t play' else 'don''t play' end) else '.' end;
    a := format('%s %s twice in FPL GW%s%s Deadline %s.', v_double, case when v_ndouble = 1 then 'plays' else 'play' end, v_gw, v_tail, v_dlt);
    b := format('Who plays twice in FPL GW%s? %s%s Deadline %s.', v_gw, v_double, v_tail, v_dlt);
  elsif v_nblank > 0 then
    f := 'blanks';
    a := format('%s %s in FPL GW%s. Deadline %s.', v_blank, case when v_nblank = 1 then 'doesn''t play' else 'don''t play' end, v_gw, v_dlt);
    b := format('Who doesn''t play in FPL GW%s? %s. Deadline %s.', v_gw, v_blank, v_dlt);
  elsif extract(isodow from v_dl) = 5 and v_nfri > 0 then
    f := 'friday_deadline';
    v_tail := case when v_nfri = 1 then format('%s is on Friday night', v_fri) else format('%s games are on Friday', v_nfri) end
           || case when not (1 = any(v_days)) then ', and there''s no Monday game' else '' end;
    a := format('The FPL GW%s deadline is Friday at %s: %s.', v_gw, to_char(v_dl, 'HH24:MI'), v_tail);
    b := format('When is the FPL GW%s deadline? Friday at %s: %s.', v_gw, to_char(v_dl, 'HH24:MI'), v_tail);
  elsif extract(isodow from v_dl) between 1 and 4 then
    f := 'midweek_gameweek';
    a := format('FPL GW%s is a midweek gameweek, %s. Deadline %s.', v_gw, v_span, v_dlt);
    b := format('When is the next FPL deadline? %s: GW%s is a midweek gameweek, %s.', v_dlt, v_gw, v_span);
  elsif v_mid >= 6 then
    f := 'midweek_teams';
    a := format('%s Premier League teams played cup or European games before FPL GW%s. Deadline %s, games %s.', v_mid, v_gw, v_dlt, v_span);
    b := format('How many Premier League teams played midweek before FPL GW%s? %s. Deadline %s, games %s.', v_gw, v_mid, v_dlt, v_span);
  elsif v_gap >= 10 then
    f := 'long_break';
    a := format('No FPL this weekend. GW%s is back with a deadline of %s, games %s.', v_gw, v_dlt, v_span);
    b := format('When is FPL back? Not this weekend: the GW%s deadline is %s, games %s.', v_gw, v_dlt, v_span);
  else
    return null;
  end if;
  return private.social_hook_pack(f, a, a || v_rest, b, b || v_rest);
end;
$$;

update public.social_post_candidates
   set text = E'It''s the international break, so no FPL this weekend. GW11''s deadline is Sat 21 Nov 11:00, with games Saturday to Monday.\nNo cup or European games before it.',
       generated_text = E'It''s the international break, so no FPL this weekend. GW11''s deadline is Sat 21 Nov 11:00, with games Saturday to Monday.\nNo cup or European games before it.',
       source_data = source_data || jsonb_build_object('hook_text', 'It''s the international break, so no FPL this weekend. GW11''s deadline is Sat 21 Nov 11:00, with games Saturday to Monday.')
 where candidate_id = 86 and publication_status = 'unpublished' and text like 'When is FPL back?%';
