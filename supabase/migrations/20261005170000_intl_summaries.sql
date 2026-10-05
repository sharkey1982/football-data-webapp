-- ============================================================================
-- International pages (phase 2): summary tables the pages read, rebuilt by
-- intl_refresh() after every import.
--
-- intl.team_summary     one row per team: record, current and peak World
--                       Football Elo, Elo rank among current FIFA sides,
--                       World Cup / Euro / Nations League titles.
-- intl.edition_summary  one row per edition: winner, runner-up, the final,
--                       games and goals.
--
-- Winners: the last game of the Final stage (so a replayed final counts the
-- replay), by score, then shoot-out. The 1950 World Cup had a final group
-- instead of a final: its winner tops that group (2 points a win, then goal
-- difference).
-- ============================================================================

create table intl.team_summary (
  team text primary key,
  slug text not null,
  confederation text,
  played int not null, won int not null, drawn int not null, lost int not null,
  goals_for int not null, goals_against int not null,
  first_match date not null, last_match date not null,
  elo numeric not null,                     -- after the team's latest game
  elo_rank int,                             -- among confederation members who played in the last 4 years
  elo_peak numeric not null,
  elo_peak_date date not null,
  wc_titles int not null default 0,
  euro_titles int not null default 0,
  unl_titles int not null default 0
);

create table intl.edition_summary (
  edition_key text primary key,
  competition text not null,
  label text not null,
  season_start int not null,
  teams int not null,
  matches int not null,
  goals int not null,
  hosts text[] not null default '{}',
  winner text,
  runner_up text,
  final_key text,                           -- the deciding game (null for a final group)
  first_match date,
  last_match date
);

alter table intl.team_summary enable row level security;
alter table intl.edition_summary enable row level security;
create policy "public read" on intl.team_summary for select to anon, authenticated using (true);
create policy "public read" on intl.edition_summary for select to anon, authenticated using (true);
grant select on intl.team_summary, intl.edition_summary to anon, authenticated;
grant all on intl.team_summary, intl.edition_summary to service_role;

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
         coalesce(fin.winner, (select team from fr where fr.edition_key = e.edition_key and pos = 1)),
         coalesce(fin.runner_up, (select team from fr where fr.edition_key = e.edition_key and pos = 2)),
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
  titles as (
    select winner team,
           count(*) filter (where competition = 'FIFA World Cup') wc,
           count(*) filter (where competition = 'UEFA Euro') eu,
           count(*) filter (where competition = 'UEFA Nations League') nl
    from intl.edition_summary where winner is not null group by winner
  )
  select t.team, t.slug, t.confederation, rec.p, rec.w, rec.dr, rec.l, rec.gf, rec.ga, t.first_match, t.last_match,
         round(latest.after, 1),
         case when t.confederation is not null and t.last_match >= current_date - interval '4 years'
              then rank() over (partition by (t.confederation is not null and t.last_match >= current_date - interval '4 years')
                                order by latest.after desc) end,
         round(peak.after, 1), peak.d,
         coalesce(titles.wc, 0), coalesce(titles.eu, 0), coalesce(titles.nl, 0)
  from intl.teams t
  join rec on rec.team = t.team
  join latest on latest.team = t.team
  join peak on peak.team = t.team
  left join titles on titles.team = t.team;
end $$;

revoke all on function public.intl_refresh() from public, anon, authenticated;
grant execute on function public.intl_refresh() to service_role;

create view public.intl_team_summary with (security_invoker = true) as
select team, slug, confederation, played, won, drawn, lost, goals_for, goals_against, first_match, last_match,
       elo, elo_rank, elo_peak, elo_peak_date, wc_titles, euro_titles, unl_titles
from intl.team_summary;

create view public.intl_edition_summary with (security_invoker = true) as
select s.edition_key, s.competition, c.slug as competition_slug, s.label, s.season_start, s.teams, s.matches, s.goals,
       s.hosts, s.winner, w.slug as winner_slug, s.runner_up, r.slug as runner_up_slug, s.final_key, s.first_match, s.last_match
from intl.edition_summary s
join intl.competitions c on c.name = s.competition
left join intl.teams w on w.team = s.winner
left join intl.teams r on r.team = s.runner_up;

grant select on public.intl_team_summary, public.intl_edition_summary to anon, authenticated;

-- Fill the new tables now; the import that follows this migration refreshes them again.
select public.intl_refresh();
