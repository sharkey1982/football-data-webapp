-- ============================================================================
-- X opening lines ("hooks") and a two-week A/B test of two styles
-- (Chris, approved 5 Nov 2026).
--
-- The automatic X posts opened with labels ("FPL GW9 captaincy: FixtureShark
-- projected points", "FPL GW10 is different: ..."). Their first line now
-- leads with the single most surprising or useful fact in that post's own
-- data, in one of two styles:
--   A  data-first      a statement of the fact
--                      "Ødegaard, a £6.7m midfielder, is 0.1 points behind
--                       Haaland in our GW10 captaincy projections."
--   B  question-first  a short honest question the same data answers
--                      "Can a £6.7m midfielder match Haaland as GW10
--                       captain? On our projections, Ødegaard is 0.1 points
--                       behind."
-- The rest of each post is unchanged. When the data has no strong fact, or
-- the post would go over 280, the label line stays (hook_style null).
--
-- How (no detector body is edited):
--   BEFORE INSERT trigger social_hook_before_insert on social_post_candidates
--   for the five automatic types -> private.social_hook_apply(): builds both
--   variants (private.social_hook_build, one function per type below), picks
--   the style, swaps the first line of the first post, and sets text,
--   generated_text (so the revalidation's "no new numbers" check holds),
--   thread and source_data (hook_style, hook_text, hook_alt, hook_fact,
--   hook_label, hook_slot, hook_test).
--   Gameweek threads: scripts/fpl_gameweek_report.py writes both variants for
--   the preview and reflection into the report payload (x_hooks); the
--   trigger picks one. The team-news update and the reflection correction
--   keep their openers.
--
-- Assignment (private.social_hook_style): alternating per new candidate
-- within each post type, by "slot" (one gameweek of captaincy posts, one
-- thread kind for one gameweek, otherwise one candidate), so a re-made
-- captaincy ranking keeps its gameweek's style and the posts that go out
-- alternate. Starting styles are staggered by type so both styles appear
-- across types. Deterministic: the n-th slot of a type with a hook gets
-- A when (n + offset) is even.
--
-- Test window: private.social_hook_test (one row): started now, ends at
-- midnight UK 14 days after the merge date. After it the first new
-- candidate decides the winner (private.social_hook_decide: higher average
-- impressions, first post of each thread, latest read), stores it as
-- default_style and every post uses it. Too few posts on either side: no
-- winner, default A, and the digest says so. Chris can change default_style
-- (or extend ends_at) by migration.
--
-- Digest: both admin emails' X section gets
--   "Hook test (day N of 14): data-first X posts, avg Y impressions;
--    question-first X posts, avg Z."
-- while the test runs, then the result for 7 days after the decision
-- (private.social_hook_test_line, patched into admin_daily_digest and
-- admin_overnight_digest by anchored string replacement).
--
-- House rules enforced on every hook: within 280 with the rest of the post,
-- no betting words or hype words (private.social_hook_ok), numbers only
-- from the post's own data.
-- ============================================================================

-- ---------------------------------------------------------------- settings
create table if not exists private.social_hook_test (
  id boolean primary key default true check (id),
  started_at timestamptz not null,
  ends_at timestamptz not null,
  default_style text check (default_style in ('A', 'B')),
  decided_at timestamptz,
  result jsonb
);
revoke all on private.social_hook_test from public, anon, authenticated;

insert into private.social_hook_test (started_at, ends_at)
values (now(), (((now() at time zone 'Europe/London')::date + 14)::timestamp) at time zone 'Europe/London')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- helpers
create or replace function private.social_hook_ok(p_hook text)
returns boolean language sql immutable set search_path = pg_temp as $$
  -- No betting language, no hype words, no emoji other than the thread marker.
  select coalesce(btrim(p_hook), '') <> ''
     and p_hook !~* '\m(bet|bets|betting|wager|odds-on|tips?|banker|lock|guaranteed|must-have|insane|huge|massive|shock|shocking|crazy|unmissable|incredible)\M'
     and replace(p_hook, chr(129525), '') !~ '[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F]'
     and p_hook !~ '!';
$$;

create or replace function private.social_hook_pos(p_season bigint, p_player int)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case element_type when 1 then 'goalkeeper' when 2 then 'defender' when 3 then 'midfielder' when 4 then 'forward' end
    from public.fpl_players where season_id = p_season and fpl_player_id = p_player;
$$;

create or replace function private.social_hook_pack(p_fact text, p_a text, p_pa text, p_b text, p_pb text)
returns jsonb language sql immutable set search_path = pg_temp as $$
  select case when p_a is null or p_b is null or p_pa is null or p_pb is null then null
              else jsonb_build_object('fact', p_fact, 'A', jsonb_build_object('hook', p_a, 'post', p_pa),
                                      'B', jsonb_build_object('hook', p_b, 'post', p_pb)) end;
$$;

-- ---------------------------------------------------------------- captaincy
-- p_post: "FPL GW10 captaincy: FixtureShark projected points\n1. Haaland ..."
create or replace function private.social_hook_captaincy(p_post text, s jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_gw int := (s->>'gw')::int; v_season bigint := (s->>'season_id')::bigint;
  p1 jsonb; p2 jsonb; p3 jsonb; c jsonb; x1 numeric; x2 numeric; g numeric; v_rest text;
  v_pos text; v_cost text; v_ord text; a text; b text; f text;
begin
  if p_post !~ '^FPL GW\d+ captaincy: ' then return null; end if;
  v_rest := substr(p_post, strpos(p_post, E'\n'));
  select t into p1 from jsonb_array_elements(s->'players') t where (t->>'rank')::int = 1;
  select t into p2 from jsonb_array_elements(s->'players') t where (t->>'rank')::int = 2;
  select t into p3 from jsonb_array_elements(s->'players') t where (t->>'rank')::int = 3;
  if p1 is null or p2 is null or strpos(p_post, E'\n') = 0 then return null; end if;
  -- The post shows one decimal place; the hook uses the same rounded values.
  x1 := round((p1->>'xpts')::numeric, 1); x2 := round((p2->>'xpts')::numeric, 1); g := x1 - x2;

  if g <= 0.2 and (p2->>'now_cost')::int <= 70 and (p1->>'now_cost')::int >= 100 then
    v_pos := private.social_hook_pos(v_season, (p2->>'fpl_player_id')::int);
    v_cost := private.social_fmt((p2->>'now_cost')::numeric / 10, 1);
    if v_pos is null then return null; end if;
    f := 'cheap_second_close';
    a := case when g = 0 then format('%s, a £%sm %s, is level with %s in our GW%s captaincy projections.', p2->>'web_name', v_cost, v_pos, p1->>'web_name', v_gw)
              else format('%s, a £%sm %s, is %s points behind %s in our GW%s captaincy projections.', p2->>'web_name', v_cost, v_pos,
                          private.social_fmt(g, 1), p1->>'web_name', v_gw) end;
    b := case when g = 0 then format('Can a £%sm %s match %s as GW%s captain? On our projections, %s is level with him.', v_cost, v_pos, p1->>'web_name', v_gw, p2->>'web_name')
              else format('Can a £%sm %s match %s as GW%s captain? On our projections, %s is %s points behind.', v_cost, v_pos, p1->>'web_name', v_gw,
                          p2->>'web_name', private.social_fmt(g, 1)) end;
  elsif g <= 0.2 then
    f := 'top_two_close';
    a := case when g = 0 then format('%s and %s are level on %s projected points for GW%s captain.', p1->>'web_name', p2->>'web_name', private.social_fmt(x1, 1), v_gw)
              else format('Only %s projected points separate %s and %s for GW%s captain.', private.social_fmt(g, 1), p1->>'web_name', p2->>'web_name', v_gw) end;
    b := case when g = 0 then format('%s or %s for GW%s captain? Level on %s projected points, on our numbers.', p1->>'web_name', p2->>'web_name', v_gw, private.social_fmt(x1, 1))
              else format('%s or %s for GW%s captain? Only %s projected points separate them on our numbers.', p1->>'web_name', p2->>'web_name', v_gw, private.social_fmt(g, 1)) end;
  elsif (p1->>'now_cost')::int >= 100 and ((p2->>'now_cost')::int <= 65 or (p3->>'now_cost')::int <= 65) then
    c := case when (p2->>'now_cost')::int <= 65 then p2 else p3 end;
    v_ord := case when c = p2 then 'second' else 'third' end;
    v_pos := private.social_hook_pos(v_season, (c->>'fpl_player_id')::int);
    v_cost := private.social_fmt((c->>'now_cost')::numeric / 10, 1);
    if v_pos is null then return null; end if;
    f := 'cheap_pick';
    a := format('%s tops our GW%s captaincy projections. Our %s pick is a £%sm %s: %s.', p1->>'web_name', v_gw, v_ord, v_cost, v_pos, c->>'web_name');
    b := case when v_ord = 'second' then format('Who''s the best GW%s captain after %s? On our projections, a £%sm %s: %s.', v_gw, p1->>'web_name', v_cost, v_pos, c->>'web_name')
              else format('Who''s third in our GW%s captaincy projections, behind %s and %s? A £%sm %s: %s.', v_gw, p1->>'web_name', p2->>'web_name', v_cost, v_pos, c->>'web_name') end;
  elsif g >= 1.0 then
    f := 'clear_leader';
    a := format('%s is %s projected points clear of anyone else for GW%s captain.', p1->>'web_name', private.social_fmt(g, 1), v_gw);
    b := format('Is anyone close to %s for GW%s captain? Not on our projections: he''s %s points clear.', p1->>'web_name', v_gw, private.social_fmt(g, 1));
  else
    return null;
  end if;
  -- The hook is longer than the label: to fit 280 the fifth-ranked line goes
  -- first, then the blank-chance line (the same for both styles).
  if greatest(public.social_weighted_length(a || v_rest), public.social_weighted_length(b || v_rest)) > 280 then
    v_rest := regexp_replace(v_rest, '\n5\. [^\n]*', '');
  end if;
  if greatest(public.social_weighted_length(a || v_rest), public.social_weighted_length(b || v_rest)) > 280 then
    v_rest := regexp_replace(v_rest, '\nBlank chance [^\n]*', '');
  end if;
  return private.social_hook_pack(f, a, a || v_rest, b, b || v_rest);
end;
$$;

-- ---------------------------------------------------------------- week changes
-- p_post: "FPL GW9: what changed since the last deadline\nPrices: ...\nMost bought: N.Jackson +1971k (now 23.7%)\n..."
create or replace function private.social_hook_week_changes(p_post text, s jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_gw int := (s->>'gw')::int; v_lines text[]; l text; m text[];
  v_rec text[]; v_sold text[]; v_sold_line text; v_bought text[]; v_bought_line text; v_ruled text[] := '{}';
  a text; b text; f text; v_drop text; v_rest text;
  k_sold numeric; k_bought numeric;
begin
  if p_post !~ '^FPL GW\d+: what changed since the last deadline' then return null; end if;
  v_lines := (string_to_array(p_post, E'\n'))[2:];
  foreach l in array coalesce(v_lines, '{}') loop
    m := regexp_match(l, '^(.+): (\S+) in(?: by \d\d:\d\d)?, the most in a gameweek in our records');
    if m is not null and l !~ '^(Prices|Most bought|Most sold|Ownership up most|Ruled out)' then v_rec := m; end if;
    m := regexp_match(l, '^Most sold(?: by \d\d:\d\d)?: (.+) −(\d+(?:\.\d+)?)(k?) \(now ([0-9.]+)%\)$');
    if m is not null then v_sold := m; v_sold_line := l; end if;
    m := regexp_match(l, '^Most bought(?: by \d\d:\d\d)?: (.+) \+(\d+(?:\.\d+)?)(k?) \(now ([0-9.]+)%\)$');
    if m is not null then v_bought := m; v_bought_line := l; end if;
    if l like 'Ruled out: %' then v_ruled := string_to_array(substr(l, 12), ', '); end if;
  end loop;
  k_sold := case when v_sold is null then null else v_sold[2]::numeric * case when v_sold[3] = 'k' then 1000 else 1 end end;
  k_bought := case when v_bought is null then null else v_bought[2]::numeric * case when v_bought[3] = 'k' then 1000 else 1 end end;

  if v_rec is not null then
    f := 'transfer_record';
    a := format('%s had %s transfers in before the FPL GW%s deadline, the most in a gameweek in our records.', v_rec[1], v_rec[2], v_gw);
    b := format('Has any FPL player been bought more in one gameweek? Not in our records: %s, %s in before GW%s.', v_rec[1], v_rec[2], v_gw);
  elsif v_sold is not null and v_sold[1] = any(v_ruled) then
    f := 'most_sold_ruled_out'; v_drop := v_sold_line;
    a := format('%s was the most sold FPL player before the GW%s deadline (−%s%s), and is ruled out.', v_sold[1], v_gw, v_sold[2], v_sold[3]);
    b := format('Who did FPL managers sell most before the GW%s deadline? %s (−%s%s), who is ruled out.', v_gw, v_sold[1], v_sold[2], v_sold[3]);
  elsif v_sold is not null and (k_bought is null or k_sold >= k_bought) then
    f := 'most_sold'; v_drop := v_sold_line;
    a := format('%s was the most sold FPL player before the GW%s deadline: −%s%s, now %s%% owned.', v_sold[1], v_gw, v_sold[2], v_sold[3], v_sold[4]);
    b := format('Who did FPL managers sell most before the GW%s deadline? %s: −%s%s, now %s%% owned.', v_gw, v_sold[1], v_sold[2], v_sold[3], v_sold[4]);
  elsif v_bought is not null then
    f := 'most_bought'; v_drop := v_bought_line;
    a := format('%s was the most bought FPL player before the GW%s deadline: +%s%s, now %s%% owned.', v_bought[1], v_gw, v_bought[2], v_bought[3], v_bought[4]);
    b := format('Who did FPL managers buy most before the GW%s deadline? %s: +%s%s, now %s%% owned.', v_gw, v_bought[1], v_bought[2], v_bought[3], v_bought[4]);
  else
    return null;
  end if;
  -- The line the hook now states goes, so the post doesn't say it twice.
  v_rest := coalesce(E'\n' || nullif(array_to_string(array_remove(v_lines, v_drop), E'\n'), ''), '');
  return private.social_hook_pack(f, a, a || v_rest, b, b || v_rest);
end;
$$;

-- ---------------------------------------------------------------- week ahead
-- p_post: "FPL GW10 is different: ...; ... Deadline Fri 18:30.\nMidweek before it: Champions League (Tue–Wed): ARS, ..."
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
  v_dlt := to_char(v_dl, 'Dy HH24:MI');
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
    a := format('FPL GW%s starts %s days after GW%s ended. Deadline %s, games %s.', v_gw, v_gap, v_gw - 1, v_dlt, v_span);
    b := format('How long since the last FPL gameweek? %s days: GW%s''s deadline is %s, games %s.', v_gap, v_gw, v_dlt, v_span);
  else
    return null;
  end if;
  return private.social_hook_pack(f, a, a || v_rest, b, b || v_rest);
end;
$$;

-- ---------------------------------------------------------------- fixture moved
-- One move: "Fixture moved: <line>". Several: "FPL fixtures moved (3). 🧵" then a post per line.
create or replace function private.social_hook_fixture_moved(p_post text, p_thread jsonb, s jsonb)
returns jsonb language plpgsql immutable set search_path = pg_temp as $$
declare
  v_line text; l text; m text[]; x text[]; v_n int; v_extra text; a text; b text; pa text; pb text; f text;
begin
  if p_post like 'Fixture moved: %' then
    v_line := substr(p_post, 16);
    x := regexp_match(v_line, ' ((?:[A-Z]{3})(?: and [A-Z]{3})?) now (plays?) twice in GW(\d+)\.');
    if x is not null then
      f := 'now_double';
      a := format('%s now %s twice in FPL GW%s.', x[1], x[2], x[3]);
      b := format('Who now plays twice in FPL GW%s? %s.', x[3], x[1]);
      return private.social_hook_pack(f, a, a || E'\n' || v_line, b, b || E'\n' || v_line);
    end if;
    x := regexp_match(v_line, ' ((?:[A-Z]{3})(?: and [A-Z]{3})?) now (blanks?) in GW(\d+)\.');
    if x is not null then
      f := 'now_blank';
      a := format('%s now %s in FPL GW%s.', x[1], x[2], x[3]);
      b := format('Who now blanks in FPL GW%s? %s.', x[3], x[1]);
      return private.social_hook_pack(f, a, a || E'\n' || v_line, b, b || E'\n' || v_line);
    end if;
    v_extra := coalesce(substring(v_line from ' FPL owners: .*$'), '');
    m := regexp_match(v_line, '^(.+?) v (.+) is now (\w{3} \d{1,2} \w{3} \d\d:\d\d) \(was (\w{3} \d{1,2} \w{3})\)\. Still GW(\d+)\.');
    if m is not null then
      f := 'new_time';
      a := format('%s v %s has moved: now %s. It was %s; still FPL GW%s.', m[1], m[2], m[3], m[4], m[5]);
      b := format('When is %s v %s now? %s, moved from %s. Still FPL GW%s.', m[1], m[2], m[3], m[4], m[5]);
      return private.social_hook_pack(f, a, a || v_extra, b, b || v_extra);
    end if;
    m := regexp_match(v_line, '^Postponed: (.+?) v (.+) \(was GW(\d+)\)\.');
    if m is not null then
      f := 'postponed';
      a := format('%s v %s is postponed: no longer in FPL GW%s, and a new date is to be confirmed.', m[1], m[2], m[3]);
      b := format('Is %s v %s still in FPL GW%s? No: it''s postponed, and a new date is to be confirmed.', m[1], m[2], m[3]);
      return private.social_hook_pack(f, a, a || v_extra, b, b || v_extra);
    end if;
    m := regexp_match(v_line, '^(.+?) v (.+) now has a date: (\w{3} \d{1,2} \w{3}), in GW(\d+)\.');
    if m is not null then
      f := 'new_date';
      a := format('%s v %s has a date: %s, in FPL GW%s.', m[1], m[2], m[3], m[4]);
      b := format('When will %s v %s be played? %s, in FPL GW%s.', m[1], m[2], m[3], m[4]);
      return private.social_hook_pack(f, a, a || v_extra, b, b || v_extra);
    end if;
    m := regexp_match(v_line, '^(.+?) v (.+) moves from GW(\d+) to GW(\d+) \((\w{3} \d{1,2} \w{3})\)\.');
    if m is not null then
      f := 'new_gameweek';
      a := format('%s v %s has moved from FPL GW%s to GW%s: now %s.', m[1], m[2], m[3], m[4], m[5]);
      b := format('Which FPL gameweek is %s v %s in now? GW%s (%s), moved from GW%s.', m[1], m[2], m[4], m[5], m[3]);
      return private.social_hook_pack(f, a, a || v_extra, b, b || v_extra);
    end if;
    return null;
  end if;

  m := regexp_match(p_post, '^FPL fixtures moved \((\d+)\)\. 🧵$');
  if m is null or jsonb_typeof(p_thread) <> 'array' then return null; end if;
  v_n := m[1]::int;
  for l in select e from jsonb_array_elements_text(p_thread) with ordinality t(e, i) where i > 1 order by i loop
    x := regexp_match(l, ' ((?:[A-Z]{3})(?: and [A-Z]{3})?) now (plays?) twice in GW(\d+)\.');
    if x is not null then
      a := format('%s now %s twice in FPL GW%s, one of %s fixture moves. 🧵', x[1], x[2], x[3], v_n);
      b := format('Who now plays twice in FPL GW%s? %s: %s fixtures have moved. 🧵', x[3], x[1], v_n);
      return private.social_hook_pack('now_double', a, a, b, b);
    end if;
  end loop;
  for l in select e from jsonb_array_elements_text(p_thread) with ordinality t(e, i) where i > 1 order by i loop
    x := regexp_match(l, ' ((?:[A-Z]{3})(?: and [A-Z]{3})?) now (blanks?) in GW(\d+)\.');
    if x is not null then
      a := format('%s now %s in FPL GW%s, one of %s fixture moves. 🧵', x[1], x[2], x[3], v_n);
      b := format('Who now blanks in FPL GW%s? %s: %s fixtures have moved. 🧵', x[3], x[1], v_n);
      return private.social_hook_pack('now_blank', a, a, b, b);
    end if;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------- gameweek threads
-- Variants come from the report (scripts/fpl_gameweek_report.py, payload x_hooks);
-- the first post keeps everything from its thread marker on (the preview's link).
create or replace function private.social_hook_thread(p_post text, s jsonb)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare h jsonb; v_tail text; a text; b text;
begin
  if coalesce(s->>'kind', '') not in ('preview', 'reflection') then return null; end if;
  select r.payload->'x_hooks' into h from public.fpl_gameweek_reports r where r.report_id = (s->>'report_id')::bigint;
  if jsonb_typeof(h) <> 'object' then return null; end if;
  v_tail := substring(p_post from '🧵.*$');
  if v_tail is null then return null; end if;
  a := btrim(h->>'A'); b := btrim(h->>'B');
  if a is null or b is null or a ~ 'https?://' or b ~ 'https?://' then return null; end if;
  return private.social_hook_pack(coalesce(h->>'fact', 'report'), a, a || ' ' || v_tail, b, b || ' ' || v_tail);
end;
$$;

create or replace function private.social_hook_build(p_type text, p_post text, p_thread jsonb, s jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case p_type
    when 'fpl_captaincy' then private.social_hook_captaincy(p_post, s)
    when 'fpl_week_changes' then private.social_hook_week_changes(p_post, s)
    when 'gameweek_outlook' then private.social_hook_outlook(p_post, s)
    when 'fixture_moved' then private.social_hook_fixture_moved(p_post, p_thread, s)
    when 'gameweek_thread' then private.social_hook_thread(p_post, s)
  end;
$$;

-- ---------------------------------------------------------------- the test
create or replace function private.social_hook_slot(p_type text, s jsonb, p_dedupe text)
returns text language sql immutable set search_path = pg_temp as $$
  select case p_type
    when 'fpl_captaincy' then format('fpl_captaincy:%s:%s', s->>'season_id', s->>'gw')
    when 'gameweek_thread' then format('gameweek_thread:%s:%s:%s', s->>'season_id', s->>'gw', s->>'kind')
    else coalesce(p_dedupe, p_type || ':' || md5(coalesce(s::text, ''))) end;
$$;

-- Per style: posts published in the test window with a hook, how many have
-- an X read, and their average impressions (latest read of the first post).
create or replace function private.social_hook_test_stats(p_at timestamptz)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with t as (select * from private.social_hook_test limit 1),
  posts as (
    select c.candidate_id, c.source_data->>'hook_style' style
      from public.social_post_candidates c, t
     where c.publication_status = 'published' and (c.source_data->>'hook_test')::boolean
       and c.source_data->>'hook_style' in ('A', 'B')
       and c.published_at >= t.started_at and c.published_at < least(t.ends_at, p_at)),
  m as (
    select distinct on (m.candidate_id) m.candidate_id, coalesce(m.impressions, 0) imp
      from public.social_post_metrics m join posts using (candidate_id)
     where m.position = 1 and m.captured_at <= p_at
     order by m.candidate_id, m.captured_at desc)
  select jsonb_object_agg(s.style, jsonb_build_object(
           'posts', (select count(*) from posts where posts.style = s.style),
           'read', (select count(*) from posts join m using (candidate_id) where posts.style = s.style),
           'avg', (select round(avg(m.imp), 1) from posts join m using (candidate_id) where posts.style = s.style)))
    from (values ('A'), ('B')) s(style);
$$;

-- After the window: higher average impressions wins; a side with no read post: no winner (A).
create or replace function private.social_hook_decide()
returns text language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare t private.social_hook_test; st jsonb; v_win text; v_avg_a numeric; v_avg_b numeric;
begin
  select * into t from private.social_hook_test for update;
  if t.id is null or now() < t.ends_at then return null; end if;
  if t.default_style is not null then return t.default_style; end if;
  st := private.social_hook_test_stats(now());
  v_avg_a := (st->'A'->>'avg')::numeric; v_avg_b := (st->'B'->>'avg')::numeric;
  v_win := case when v_avg_a is null or v_avg_b is null or v_avg_a = v_avg_b then null
                when v_avg_b > v_avg_a then 'B' else 'A' end;
  update private.social_hook_test set default_style = coalesce(v_win, 'A'), decided_at = now(),
         result = st || jsonb_build_object('winner', v_win)
   where id;
  return coalesce(v_win, 'A');
end;
$$;

create or replace function private.social_hook_style(p_type text, p_slot text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare t private.social_hook_test; v text; n int; v_off int;
begin
  select * into t from private.social_hook_test;
  if t.id is null then return jsonb_build_object('style', 'A', 'test', false); end if;
  if now() >= t.ends_at then
    return jsonb_build_object('style', coalesce(t.default_style, private.social_hook_decide(), 'A'), 'test', false);
  end if;
  -- A re-made candidate for the same slot keeps that slot's style.
  select c.source_data->>'hook_style' into v from public.social_post_candidates c
   where c.post_type = p_type and c.source_data->>'hook_slot' = p_slot and (c.source_data->>'hook_test')::boolean
     and c.source_data->>'hook_style' in ('A', 'B')
   order by c.candidate_id desc limit 1;
  if v is null then
    select count(distinct c.source_data->>'hook_slot') into n from public.social_post_candidates c
     where c.post_type = p_type and (c.source_data->>'hook_test')::boolean and c.source_data->>'hook_style' in ('A', 'B')
       and c.created_at >= t.started_at;
    -- Staggered starts, so both styles appear across types in the first days.
    v_off := case p_type when 'fpl_week_changes' then 1 when 'gameweek_outlook' then 1 else 0 end;
    v := case when (n + v_off) % 2 = 0 then 'A' else 'B' end;
  end if;
  return jsonb_build_object('style', v, 'test', true);
end;
$$;

-- The candidate with its hook: {text, thread, source_data}.
create or replace function private.social_hook_apply(p_type text, p_text text, p_thread jsonb, s jsonb, p_dedupe text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_is_thread boolean := jsonb_typeof(p_thread) = 'array' and jsonb_array_length(p_thread) > 0;
  v_first text; h jsonb; v_slot text; st jsonb; v_style text; v_post text; v_thread jsonb; v_text text; v_alt text;
  v_base jsonb;
begin
  s := coalesce(s, '{}');
  v_first := case when v_is_thread then p_thread->>0 else p_text end;
  v_slot := private.social_hook_slot(p_type, s, p_dedupe);
  v_base := jsonb_build_object('hook_slot', v_slot, 'hook_label', split_part(v_first, E'\n', 1));
  h := private.social_hook_build(p_type, v_first, p_thread, s);
  if h is null then
    return jsonb_build_object('text', p_text, 'thread', p_thread, 'source_data', s || v_base || jsonb_build_object('hook_style', null, 'hook_skip', 'no strong fact'));
  end if;
  if not private.social_hook_ok(h->'A'->>'hook') or not private.social_hook_ok(h->'B'->>'hook') then
    return jsonb_build_object('text', p_text, 'thread', p_thread, 'source_data', s || v_base || jsonb_build_object('hook_style', null, 'hook_skip', 'banned word'));
  end if;
  if public.social_weighted_length(h->'A'->>'post') > 280 or public.social_weighted_length(h->'B'->>'post') > 280 then
    -- Both must fit, so a type's posts don't drop out of one style only.
    return jsonb_build_object('text', p_text, 'thread', p_thread, 'source_data', s || v_base || jsonb_build_object('hook_style', null, 'hook_skip', 'too long'));
  end if;
  st := private.social_hook_style(p_type, v_slot);
  v_style := st->>'style';
  v_post := h->v_style->>'post';
  v_alt := h->(case when v_style = 'A' then 'B' else 'A' end)->>'hook';
  if v_is_thread then
    v_thread := jsonb_set(p_thread, '{0}', to_jsonb(v_post));
    select string_agg(e, E'\n\n' order by i) into v_text from jsonb_array_elements_text(v_thread) with ordinality t(e, i);
  else
    v_thread := p_thread; v_text := v_post;
  end if;
  return jsonb_build_object('text', v_text, 'thread', v_thread,
    'source_data', s || v_base || jsonb_build_object('hook_style', v_style, 'hook_text', h->v_style->>'hook', 'hook_alt', v_alt,
                                                      'hook_fact', h->>'fact', 'hook_test', (st->>'test')::boolean));
end;
$$;

create or replace function private.social_hook_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  begin
    r := private.social_hook_apply(new.post_type, new.text, new.thread, new.source_data, new.dedupe_key);
  exception when others then
    -- A hook never blocks a post: keep the label and say why.
    new.source_data := coalesce(new.source_data, '{}') || jsonb_build_object('hook_style', null, 'hook_skip', 'error: ' || left(sqlerrm, 200));
    return new;
  end;
  if new.generated_text is null or new.generated_text = new.text then new.generated_text := r->>'text'; end if;
  new.text := r->>'text';
  new.thread := case when jsonb_typeof(r->'thread') = 'array' then r->'thread' end;
  new.source_data := r->'source_data';
  return new;
end;
$$;

drop trigger if exists social_hook_before_insert on public.social_post_candidates;
create trigger social_hook_before_insert
  before insert on public.social_post_candidates
  for each row
  when (new.post_type in ('fixture_moved', 'fpl_captaincy', 'fpl_week_changes', 'gameweek_outlook', 'gameweek_thread')
        and new.validation_status = 'passed')
  execute function private.social_hook_trigger();

-- ---------------------------------------------------------------- digest line
create or replace function private.social_hook_avg(p jsonb)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when coalesce((p->>'read')::int, 0) = 0 then 'no figures yet'
              else format('avg %s impressions', to_char((p->>'avg')::numeric, 'FM999990.0'))
                   || case when (p->>'posts')::int > (p->>'read')::int then format(' (%s not read yet)', (p->>'posts')::int - (p->>'read')::int) else '' end
         end;
$$;

create or replace function private.social_hook_test_line(p_at timestamptz)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t private.social_hook_test; st jsonb; v_day int; v_len int; v_win text;
begin
  select * into t from private.social_hook_test;
  if t.id is null or p_at < t.started_at then return null; end if;
  v_len := ((t.ends_at at time zone 'Europe/London')::date - (t.started_at at time zone 'Europe/London')::date);
  if p_at < t.ends_at then
    st := private.social_hook_test_stats(p_at);
    v_day := least(v_len, greatest(1, ((p_at at time zone 'Europe/London')::date - (t.started_at at time zone 'Europe/London')::date) + 1));
    return format('Hook test (day %s of %s): data-first %s, %s; question-first %s, %s.', v_day, v_len,
                  private.digest_n((st->'A'->>'posts')::int, 'post'), private.social_hook_avg(st->'A'),
                  private.digest_n((st->'B'->>'posts')::int, 'post'), private.social_hook_avg(st->'B'));
  end if;
  -- Finished: the result, for a week after it was decided (or, before the
  -- first post after the end decides it, what it would be).
  if t.decided_at is not null and p_at > t.decided_at + interval '7 days' then return null; end if;
  st := coalesce(t.result, private.social_hook_test_stats(p_at));
  v_win := case when t.decided_at is not null then st->>'winner'
                when (st->'A'->>'avg') is null or (st->'B'->>'avg') is null or (st->'A'->>'avg')::numeric = (st->'B'->>'avg')::numeric then null
                when (st->'B'->>'avg')::numeric > (st->'A'->>'avg')::numeric then 'B' else 'A' end;
  return format('Hook test finished %s: data-first %s, %s; question-first %s, %s. %s', to_char(t.ends_at at time zone 'Europe/London' - interval '1 day', 'FMDD Mon'),
                private.digest_n((st->'A'->>'posts')::int, 'post'), private.social_hook_avg(st->'A'),
                private.digest_n((st->'B'->>'posts')::int, 'post'), private.social_hook_avg(st->'B'),
                case when v_win is null then 'Too few posts with figures to pick a winner; automatic posts use data-first openings. Your call: extend the test or keep a style.'
                     else format('Winner: %s. Automatic posts %s %s openings; tell Claude to change it.',
                                 case v_win when 'A' then 'data-first' else 'question-first' end,
                                 case when t.decided_at is not null then 'now use' else 'will use' end,
                                 case v_win when 'A' then 'data-first' else 'question-first' end) end);
end;
$$;

-- ---------------------------------------------------------------- digests
-- Both admin emails' X section: the hook-test line before "Queued ...".
-- Anchored string replacement on the live bodies (each anchor must occur
-- exactly once); skipped if already patched, so the file is safe to re-run.
do $do$
declare d text; n int; a text; f regprocedure;
begin
  foreach f in array array['private.admin_daily_digest(date)'::regprocedure,
                           'private.admin_overnight_digest(timestamptz, timestamptz)'::regprocedure] loop
    a := case when f = 'private.admin_daily_digest(date)'::regprocedure
              then $a$  v_lines := v_lines || coalesce('Queued next:'$a$
              else $a$  v_lines := v_lines || coalesce('Queued for today:'$a$ end;
    d := pg_get_functiondef(f);
    if strpos(d, 'social_hook_test_line') > 0 then continue; end if;
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    if n <> 1 then raise exception '%: anchor found % times', f, n; end if;
    d := replace(d, a, $r$  -- Hook A/B test (20261105120000_social_hook_ab_test.sql).
  v_lines := v_lines || array_remove(array[private.social_hook_test_line(v_to)], null);
$r$ || a);
    execute d;
  end loop;
end
$do$;

-- ---------------------------------------------------------------- drafts waiting
-- Candidates of these types still pending (not yet approved or queued, not
-- posted) get their hook now. Queued (approved) ones keep the text that was
-- queued: their hold is the window for Chris to stop them.
do $do$
declare c record; r jsonb;
begin
  for c in select * from public.social_post_candidates
            where post_type in ('fixture_moved', 'fpl_captaincy', 'fpl_week_changes', 'gameweek_outlook', 'gameweek_thread')
              and approval_status = 'pending' and publication_status = 'unpublished' and validation_status = 'passed'
              and expires_at > now() and not (coalesce(source_data, '{}') ? 'hook_slot')
            order by candidate_id loop
    r := private.social_hook_apply(c.post_type, c.text, c.thread, c.source_data, c.dedupe_key);
    update public.social_post_candidates
       set text = r->>'text',
           generated_text = case when generated_text is null or generated_text = text then r->>'text' else generated_text end,
           thread = case when jsonb_typeof(r->'thread') = 'array' then r->'thread' end,
           source_data = r->'source_data', updated_at = now()
     where candidate_id = c.candidate_id and publication_status = 'unpublished';
  end loop;
end
$do$;
