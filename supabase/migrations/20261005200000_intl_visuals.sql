-- ============================================================================
-- International: data for the history visuals (5 Oct 2026).
--
-- intl.team_year_elo  each nation's World Football Elo at the end of every
--                     year it was active (a game in that year or the three
--                     before), with its rank that year among confederation
--                     members. Feeds the "Elo race since 1872".
-- intl.upsets         every competitive game (not a friendly) won by the side
--                     the Elo ratings gave less than a 25% expectation, with
--                     that expectation. Feeds the biggest-upsets lists.
--
-- Both are rebuilt by public.intl_refresh_visuals(), which the importer calls
-- straight after intl_refresh().
-- ============================================================================

create table intl.team_year_elo (
  team text not null references intl.teams(team) on delete cascade,
  year int not null,
  elo numeric not null,                     -- after the team's last game up to the end of the year
  rank int not null,                        -- among active confederation members that year
  played int not null,                      -- games in the year
  primary key (team, year)
);
create index intl_team_year_elo_rank_idx on intl.team_year_elo (rank, year);

create table intl.upsets (
  match_key text primary key references intl.matches(match_key) on delete cascade,
  winner text not null,
  loser text not null,
  expectation numeric not null,             -- the winner's Elo expectation before the game (0-1)
  kind text not null                        -- competition kind: tournament / qualifying / nations_league
);
create index intl_upsets_expectation_idx on intl.upsets (expectation);

alter table intl.team_year_elo enable row level security;
alter table intl.upsets enable row level security;
create policy "public read" on intl.team_year_elo for select to anon, authenticated using (true);
create policy "public read" on intl.upsets for select to anon, authenticated using (true);
grant select on intl.team_year_elo, intl.upsets to anon, authenticated;
grant all on intl.team_year_elo, intl.upsets to service_role;

create or replace function public.intl_refresh_visuals()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from intl.team_year_elo where true;
  insert into intl.team_year_elo (team, year, elo, rank, played)
  with sides as (
    select home_team team, match_date d, match_key k, elo_home_pre + elo_change after from intl.matches
    union all
    select away_team, match_date, match_key, elo_away_pre - elo_change from intl.matches
  ),
  year_end as (   -- last rating in each year a team played
    select distinct on (team, y) team, extract(year from d)::int y, after,
           count(*) over (partition by team, extract(year from d)::int) n
    from sides order by team, y, d desc, k desc
  ),
  span as (       -- every year from a team's first game to its last
    select t.team, y
    from intl.teams t
    cross join lateral generate_series(extract(year from t.first_match)::int, extract(year from t.last_match)::int) y
    where t.confederation is not null
  ),
  filled as (
    select s.team, s.y, ye.after, coalesce(ye.n, 0) n,
           count(ye.after) over (partition by s.team order by s.y) grp,
           max(case when ye.after is not null then s.y end) over (partition by s.team order by s.y) last_played
    from span s left join year_end ye on ye.team = s.team and ye.y = s.y
  ),
  carried as (
    select team, y, n, last_played,
           first_value(after) over (partition by team, grp order by y) elo
    from filled
  )
  select team, y, round(elo, 1), rank() over (partition by y order by elo desc), n
  from carried
  where elo is not null and last_played >= y - 3;

  delete from intl.upsets where true;
  insert into intl.upsets (match_key, winner, loser, expectation, kind)
  select match_key,
         case when home_score > away_score then home_team else away_team end,
         case when home_score > away_score then away_team else home_team end,
         round(case when home_score > away_score then e else 1 - e end, 4),
         kind
  from (
    select m.*, c.kind,
           1 / (power(10, -(m.elo_home_pre - m.elo_away_pre + case when m.neutral then 0 else 100 end) / 400) + 1) e
    from intl.matches m join intl.competitions c on c.name = m.competition
    where c.kind <> 'friendly' and m.home_score <> m.away_score
      and m.elo_home_pre is not null and m.elo_away_pre is not null
  ) s
  where case when home_score > away_score then e else 1 - e end < 0.25;
end $$;

revoke all on function public.intl_refresh_visuals() from public, anon, authenticated;
grant execute on function public.intl_refresh_visuals() to service_role;

create view public.intl_team_year_elo with (security_invoker = true) as
select y.team, t.slug, intl.name_at(y.team, make_date(y.year, 12, 31)) as name, t.confederation,
       y.year, y.elo, y.rank, y.played
from intl.team_year_elo y join intl.teams t on t.team = y.team;

create view public.intl_upsets with (security_invoker = true) as
select u.expectation, u.kind, m.*
from intl.upsets u join public.intl_matches m on m.match_key = u.match_key;

grant select on public.intl_team_year_elo, public.intl_upsets to anon, authenticated;

select public.intl_refresh_visuals();
