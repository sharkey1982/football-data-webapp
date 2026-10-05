-- ============================================================================
-- International: continental tournaments (5 Oct 2026).
--
-- The importer now builds editions for the Copa América, Africa Cup of
-- Nations, AFC Asian Cup, Gold Cup and Confederations Cup as well as the World
-- Cup, Euro and Nations League. Their rounds are derived from the results, and
-- a few early editions (decided by play-offs or final groups the results file
-- does not mark) carry a winner the importer states. So:
--
--   intl.editions.winner / runner_up   set by the importer when it knows them
--   intl.edition_summary               uses them first, then the final, then
--                                      a final group
--   intl.team_summary.titles           {competition slug: titles} for every
--                                      tournament and the Nations League
-- ============================================================================

alter table intl.editions add column if not exists winner text references intl.teams(team);
alter table intl.editions add column if not exists runner_up text references intl.teams(team);
alter table intl.team_summary add column if not exists titles jsonb not null default '{}';

create or replace function public.intl_load_reference(payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into intl.teams (team, slug, confederation, first_match, last_match, matches)
  select r->>'team', r->>'slug', r->>'confederation', (r->>'first_match')::date, (r->>'last_match')::date,
         (r->>'matches')::int
  from jsonb_array_elements(payload->'teams') r
  on conflict (team) do update set slug = excluded.slug, confederation = excluded.confederation,
    first_match = excluded.first_match, last_match = excluded.last_match, matches = excluded.matches;

  delete from intl.team_names where true;
  insert into intl.team_names (team, name, valid_from, valid_to)
  select r->>'team', r->>'name', (r->>'valid_from')::date, (r->>'valid_to')::date
  from jsonb_array_elements(payload->'team_names') r;

  insert into intl.competitions (name, slug, kind, confederation, matches)
  select r->>'name', r->>'slug', r->>'kind', r->>'confederation', (r->>'matches')::int
  from jsonb_array_elements(payload->'competitions') r
  on conflict (name) do update set slug = excluded.slug, kind = excluded.kind,
    confederation = excluded.confederation, matches = excluded.matches;

  insert into intl.editions (edition_key, competition, label, season_start, teams, matches, hosts,
                             first_match, last_match, stage_source, winner, runner_up)
  select r->>'edition_key', r->>'competition', r->>'label', (r->>'season_start')::int, (r->>'teams')::int,
         (r->>'matches')::int, array(select jsonb_array_elements_text(r->'hosts')),
         (r->>'first_match')::date, (r->>'last_match')::date, r->>'stage_source',
         r->>'winner', r->>'runner_up'
  from jsonb_array_elements(payload->'editions') r
  on conflict (edition_key) do update set competition = excluded.competition, label = excluded.label,
    season_start = excluded.season_start, teams = excluded.teams, matches = excluded.matches,
    hosts = excluded.hosts, first_match = excluded.first_match, last_match = excluded.last_match,
    stage_source = excluded.stage_source, winner = excluded.winner, runner_up = excluded.runner_up;

  insert into intl.stages (stage_key, edition_key, code, name, type, stage_order)
  select r->>'stage_key', r->>'edition_key', r->>'code', r->>'name', r->>'type', (r->>'stage_order')::int
  from jsonb_array_elements(payload->'stages') r
  on conflict (stage_key) do update set name = excluded.name, type = excluded.type,
    stage_order = excluded.stage_order;
  delete from intl.stages s
  where not exists (select 1 from jsonb_array_elements(payload->'stages') r where r->>'stage_key' = s.stage_key);

  insert into intl.groups (group_key, stage_key, label, league, size)
  select r->>'group_key', r->>'stage_key', r->>'label', r->>'league', (r->>'size')::int
  from jsonb_array_elements(payload->'groups') r
  on conflict (group_key) do update set label = excluded.label, league = excluded.league, size = excluded.size;
  delete from intl.groups g
  where not exists (select 1 from jsonb_array_elements(payload->'groups') r where r->>'group_key' = g.group_key);

  delete from intl.group_members where true;
  insert into intl.group_members (group_key, team)
  select r->>'group_key', r->>'team' from jsonb_array_elements(payload->'group_members') r;
end $$;

create or replace function public.intl_refresh()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intl.team_competition_totals where true;
  insert into intl.team_competition_totals
  select team, competition, count(*), count(*) filter (where gf > ga), count(*) filter (where gf = ga),
         count(*) filter (where gf < ga), sum(gf), sum(ga), min(match_date), max(match_date)
  from (select home_team team, competition, home_score gf, away_score ga, match_date from intl.matches
        union all
        select away_team, competition, away_score, home_score, match_date from intl.matches) s
  group by team, competition;

  delete from intl.pair_records where true;
  insert into intl.pair_records
  select a, b, count(*), count(*) filter (where ag > bg), count(*) filter (where ag = bg),
         count(*) filter (where ag < bg), sum(ag), sum(bg), min(match_date), max(match_date)
  from (select least(home_team, away_team) a, greatest(home_team, away_team) b,
               case when home_team < away_team then home_score else away_score end ag,
               case when home_team < away_team then away_score else home_score end bg, match_date
        from intl.matches) s
  group by a, b;

  -- Editions: winner and runner-up.
  delete from intl.edition_summary where true;
  insert into intl.edition_summary (edition_key, competition, label, season_start, teams, matches, goals, hosts,
                                    winner, runner_up, final_key, first_match, last_match)
  with fin as (
    select distinct on (m.edition_key) m.edition_key, m.match_key,
      case when m.home_score > m.away_score then m.home_team when m.away_score > m.home_score then m.away_team
           else m.shootout_winner end as winner,
      case when m.home_score > m.away_score then m.away_team when m.away_score > m.home_score then m.home_team
           when m.shootout_winner = m.home_team then m.away_team when m.shootout_winner = m.away_team then m.home_team end as runner_up
    from intl.matches m where m.stage_code = 'F'
    order by m.edition_key, m.match_date desc, m.match_key desc
  ),
  fr as (  -- final group (World Cup 1950): 2 points a win, then goal difference
    select edition_key, team, row_number() over (partition by edition_key order by sum(pts) desc, sum(gf - ga) desc) as pos
    from (select edition_key, home_team team, home_score gf, away_score ga,
                 case when home_score > away_score then 2 when home_score = away_score then 1 else 0 end pts
          from intl.matches where stage_code = 'FR'
          union all
          select edition_key, away_team, away_score, home_score,
                 case when away_score > home_score then 2 when home_score = away_score then 1 else 0 end
          from intl.matches where stage_code = 'FR') s
    group by edition_key, team
  ),
  totals as (
    select edition_key, count(*) n, sum(home_score + away_score) g from intl.matches where edition_key is not null group by 1
  )
  select e.edition_key, e.competition, e.label, e.season_start, e.teams, coalesce(t.n, 0), coalesce(t.g, 0), e.hosts,
         coalesce(e.winner, fin.winner, (select team from fr where fr.edition_key = e.edition_key and pos = 1)),
         coalesce(e.runner_up, fin.runner_up, (select team from fr where fr.edition_key = e.edition_key and pos = 2)),
         fin.match_key, e.first_match, e.last_match
  from intl.editions e
  left join fin on fin.edition_key = e.edition_key
  left join totals t on t.edition_key = e.edition_key;

  -- Teams: record, Elo now and at its peak, titles.
  delete from intl.team_summary where true;
  insert into intl.team_summary
  with sides as (
    select home_team team, match_date d, match_key k, elo_home_pre + elo_change after from intl.matches
    union all
    select away_team, match_date, match_key, elo_away_pre - elo_change from intl.matches
  ),
  latest as (select distinct on (team) team, after from sides order by team, d desc, k desc),
  peak as (select distinct on (team) team, after, d from sides order by team, after desc, d asc),
  rec as (
    select team, sum(played) p, sum(won) w, sum(drawn) dr, sum(lost) l, sum(goals_for) gf, sum(goals_against) ga
    from intl.team_competition_totals group by team
  ),
  titles as (  -- one row per edition won
    select winner team,
           coalesce(sum(n) filter (where competition = 'FIFA World Cup'), 0) wc,
           coalesce(sum(n) filter (where competition = 'UEFA Euro'), 0) eu,
           coalesce(sum(n) filter (where competition = 'UEFA Nations League'), 0) nl,
           jsonb_object_agg(slug, n) titles
    from (select s.winner, s.competition, c.slug, count(*) n
          from intl.edition_summary s join intl.competitions c on c.name = s.competition
          where s.winner is not null group by 1, 2, 3) x
    group by winner
  )
  select t.team, t.slug, t.confederation, rec.p, rec.w, rec.dr, rec.l, rec.gf, rec.ga, t.first_match, t.last_match,
         round(latest.after, 1),
         case when t.confederation is not null and t.last_match >= current_date - interval '4 years'
              then rank() over (partition by (t.confederation is not null and t.last_match >= current_date - interval '4 years')
                                order by latest.after desc) end,
         round(peak.after, 1), peak.d,
         coalesce(titles.wc, 0), coalesce(titles.eu, 0), coalesce(titles.nl, 0), coalesce(titles.titles, '{}')
  from intl.teams t
  join rec on rec.team = t.team
  join latest on latest.team = t.team
  join peak on peak.team = t.team
  left join titles on titles.team = t.team;
end $$;

revoke all on function public.intl_load_reference(jsonb) from public, anon, authenticated;
grant execute on function public.intl_load_reference(jsonb) to service_role;
revoke all on function public.intl_refresh() from public, anon, authenticated;
grant execute on function public.intl_refresh() to service_role;

create or replace view public.intl_team_summary with (security_invoker = true) as
select team, slug, confederation, played, won, drawn, lost, goals_for, goals_against, first_match, last_match,
       elo, elo_rank, elo_peak, elo_peak_date, wc_titles, euro_titles, unl_titles, titles
from intl.team_summary;

grant select on public.intl_team_summary to anon, authenticated;
