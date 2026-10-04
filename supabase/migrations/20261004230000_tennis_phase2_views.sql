-- ============================================================================
-- Tennis phase 2: what the pages read (design: claude/tennis-design-2026-10-04.md)
--
-- 1. tennis.level_of(tour, series): one tournament level across the renamed
--    tiers (ATP 2009 and WTA 2009/2021 renames). WTA "Premier" (2009-2023)
--    stays its own level: the source does not separate Premier Mandatory/5
--    from Premier 700. "WTA251".."WTA276" (26 one-off labels in the 2021
--    file, a spreadsheet fill-down) are WTA250.
-- 2. tennis.result_of(status): the source's status with its typos fixed
--    ("Walkoer", "Rrtired"); "Cancelled" and "Sched" are "Not played".
--    A match counts in a win-loss record when it was played: Completed,
--    Retired, Awarded or Disqualified (walkovers don't count, as on the
--    ATP/WTA sites). A final won by walkover is still a title.
-- 3. public.tennis_matches gains level, level_rank, round_order, result,
--    played and surface_group (Greenset -> Hard) -- appended, so existing
--    columns keep their positions.
-- 4. public.tennis_players gains won/lost (played matches), titles, finals,
--    first/last year and recent_matches (played in the tour's last three
--    seasons; 50+ gets a static page).
-- ============================================================================

create or replace function tennis.level_of(p_tour text, p_series text)
returns text language sql immutable as $$
  select case
    when p_series = 'Grand Slam' then 'Grand Slam'
    when p_series in ('Masters Cup', 'Tour Championships') then 'Finals'
    when p_series in ('Masters', 'Masters 1000', 'Tier 1', 'WTA1000') then '1000'
    when p_series in ('International Gold', 'ATP500', 'Tier 2', 'WTA500') then '500'
    when p_series = 'Premier' then 'Premier'
    when p_series in ('International', 'ATP250', 'Tier 3', 'Tier 4', 'WTA250') then '250'
    when p_series ~ '^WTA2[5-7][0-9]$' then '250'
  end
$$;

-- The WTA Elite Trophy is labelled "Tour Championships" in the source but was a
-- secondary end-of-season event (2015-2019, 2023): level 500, not Tour Finals.
create or replace function tennis.level_of(p_tour text, p_series text, p_tournament text)
returns text language sql immutable as $$
  select case when p_tournament = 'WTA Elite Trophy' then '500' else tennis.level_of(p_tour, p_series) end
$$;

create or replace function tennis.level_rank(p_level text)
returns int language sql immutable as $$
  select case p_level when 'Grand Slam' then 1 when 'Finals' then 2 when '1000' then 3
    when 'Premier' then 4 when '500' then 5 when '250' then 6 else 9 end
$$;

create or replace function tennis.round_order(p_round text)
returns numeric language sql immutable as $$
  select case p_round when '1st Round' then 1 when '2nd Round' then 2 when '3rd Round' then 3
    when '4th Round' then 4 when 'Round Robin' then 4.5 when 'Quarterfinals' then 5
    when 'Semifinals' then 6 when 'Third Place' then 6.5 when 'The Final' then 7 else 0 end
$$;

create or replace function tennis.result_of(p_status text)
returns text language sql immutable as $$
  select case
    when p_status in ('Walkover', 'Walkoer') then 'Walkover'
    when p_status in ('Retired', 'Rrtired') then 'Retired'
    when p_status in ('Cancelled', 'Sched') then 'Not played'
    else coalesce(p_status, 'Completed') end
$$;

create or replace view public.tennis_matches with (security_invoker = true) as
select m.source_key, m.tour, m.year, m.match_date, t.tournament_id, t.name tournament, t.slug tournament_slug,
  m.location, m.series, m.court, m.surface, m.round, m.best_of,
  m.winner_id, w.name winner, w.slug winner_slug, m.loser_id, l.name loser, l.slug loser_slug,
  m.w_rank, m.l_rank, m.w_pts, m.l_pts, m.w_games, m.l_games, m.w_sets, m.l_sets, m.status,
  m.ps_w, m.ps_l, m.avg_w, m.avg_l, m.max_w, m.max_l, m.b365_w, m.b365_l, m.bfe_w, m.bfe_l,
  tennis.level_of(m.tour, m.series, t.name) level,
  tennis.level_rank(tennis.level_of(m.tour, m.series, t.name)) level_rank,
  tennis.round_order(m.round) round_order,
  tennis.result_of(m.status) result,
  tennis.result_of(m.status) in ('Completed', 'Retired', 'Awarded', 'Disqualified') played,
  case when m.surface = 'Greenset' then 'Hard' else m.surface end surface_group
from tennis.matches m
join tennis.tournaments t on t.tournament_id = m.tournament_id
join tennis.players w on w.player_id = m.winner_id
join tennis.players l on l.player_id = m.loser_id;

create or replace view public.tennis_players with (security_invoker = true) as
with s as (
  select winner_id pid, tour, year, match_date, true won,
    tennis.result_of(status) in ('Completed', 'Retired', 'Awarded', 'Disqualified') played,
    round = 'The Final' and tennis.result_of(status) <> 'Not played' final
  from tennis.matches
  union all
  select loser_id, tour, year, match_date, false,
    tennis.result_of(status) in ('Completed', 'Retired', 'Awarded', 'Disqualified'),
    round = 'The Final' and tennis.result_of(status) <> 'Not played'
  from tennis.matches
), latest as (select tour, max(year) y from tennis.matches group by tour)
select p.player_id, p.tour, p.name, p.slug,
  count(*) matches, count(*) filter (where s.won) wins,
  min(s.match_date) first_match, max(s.match_date) last_match,
  count(*) filter (where s.won and s.played) won,
  count(*) filter (where not s.won and s.played) lost,
  count(*) filter (where s.final and s.won) titles,
  count(*) filter (where s.final) finals,
  min(s.year) first_year, max(s.year) last_year,
  count(*) filter (where s.played and s.year > lt.y - 3) recent_matches
from tennis.players p
join s on s.pid = p.player_id
join latest lt on lt.tour = p.tour
group by p.player_id, lt.y;

grant select on public.tennis_matches, public.tennis_players to anon, authenticated;
grant execute on function tennis.level_of(text, text), tennis.level_of(text, text, text), tennis.level_rank(text), tennis.round_order(text), tennis.result_of(text)
  to anon, authenticated;
