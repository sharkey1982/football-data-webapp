-- Live definition exported from the database (function intlw_refresh()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intlw_refresh()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  delete from intlw.team_competition_totals where true;
  insert into intlw.team_competition_totals
  select team, competition, count(*), count(*) filter (where gf > ga), count(*) filter (where gf = ga),
         count(*) filter (where gf < ga), sum(gf), sum(ga), min(match_date), max(match_date)
  from (select home_team team, competition, home_score gf, away_score ga, match_date from intlw.matches
        union all
        select away_team, competition, away_score, home_score, match_date from intlw.matches) s
  group by team, competition;

  delete from intlw.pair_records where true;
  insert into intlw.pair_records
  select a, b, count(*), count(*) filter (where ag > bg), count(*) filter (where ag = bg),
         count(*) filter (where ag < bg), sum(ag), sum(bg), min(match_date), max(match_date)
  from (select least(home_team, away_team) a, greatest(home_team, away_team) b,
               case when home_team < away_team then home_score else away_score end ag,
               case when home_team < away_team then away_score else home_score end bg, match_date
        from intlw.matches) s
  group by a, b;

  -- Editions: winner and runner-up.
  delete from intlw.edition_summary where true;
  insert into intlw.edition_summary (edition_key, competition, label, season_start, teams, matches, goals, hosts,
                                    winner, runner_up, final_key, first_match, last_match)
  with fin as (
    select distinct on (m.edition_key) m.edition_key, m.match_key,
      case when m.home_score > m.away_score then m.home_team when m.away_score > m.home_score then m.away_team
           else m.shootout_winner end as winner,
      case when m.home_score > m.away_score then m.away_team when m.away_score > m.home_score then m.home_team
           when m.shootout_winner = m.home_team then m.away_team when m.shootout_winner = m.away_team then m.home_team end as runner_up
    from intlw.matches m where m.stage_code = 'F'
    order by m.edition_key, m.match_date desc, m.match_key desc
  ),
  fr as (  -- final group (World Cup 1950): 2 points a win, then goal difference
    select edition_key, team, row_number() over (partition by edition_key order by sum(pts) desc, sum(gf - ga) desc) as pos
    from (select edition_key, home_team team, home_score gf, away_score ga,
                 case when home_score > away_score then 2 when home_score = away_score then 1 else 0 end pts
          from intlw.matches where stage_code = 'FR'
          union all
          select edition_key, away_team, away_score, home_score,
                 case when away_score > home_score then 2 when home_score = away_score then 1 else 0 end
          from intlw.matches where stage_code = 'FR') s
    group by edition_key, team
  ),
  totals as (
    select edition_key, count(*) n, sum(home_score + away_score) g from intlw.matches where edition_key is not null group by 1
  )
  select e.edition_key, e.competition, e.label, e.season_start, e.teams, coalesce(t.n, 0), coalesce(t.g, 0), e.hosts,
         coalesce(e.winner, fin.winner, (select team from fr where fr.edition_key = e.edition_key and pos = 1)),
         coalesce(e.runner_up, fin.runner_up, (select team from fr where fr.edition_key = e.edition_key and pos = 2)),
         fin.match_key, e.first_match, e.last_match
  from intlw.editions e
  left join fin on fin.edition_key = e.edition_key
  left join totals t on t.edition_key = e.edition_key;

  -- Teams: record, Elo now and at its peak, titles.
  delete from intlw.team_summary where true;
  insert into intlw.team_summary
  with sides as (
    select home_team team, match_date d, match_key k, elo_home_pre + elo_change after from intlw.matches
    union all
    select away_team, match_date, match_key, elo_away_pre - elo_change from intlw.matches
  ),
  latest as (select distinct on (team) team, after from sides order by team, d desc, k desc),
  peak as (select distinct on (team) team, after, d from sides order by team, after desc, d asc),
  rec as (
    select team, sum(played) p, sum(won) w, sum(drawn) dr, sum(lost) l, sum(goals_for) gf, sum(goals_against) ga
    from intlw.team_competition_totals group by team
  ),
  titles as (  -- one row per edition won
    select winner team,
           coalesce(sum(n) filter (where competition = 'FIFA World Cup'), 0) wc,
           coalesce(sum(n) filter (where competition = 'UEFA Euro'), 0) eu,
           coalesce(sum(n) filter (where competition = 'UEFA Nations League'), 0) nl,
           jsonb_object_agg(slug, n) titles
    from (select s.winner, s.competition, c.slug, count(*) n
          from intlw.edition_summary s join intlw.competitions c on c.name = s.competition
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
  from intlw.teams t
  join rec on rec.team = t.team
  join latest on latest.team = t.team
  join peak on peak.team = t.team
  left join titles on titles.team = t.team;
end $function$
;
