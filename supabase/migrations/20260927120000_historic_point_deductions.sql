-- ============================================================================
-- HISTORY BACKFILL: points deductions for the English Football League and
-- Premier League, 1992/93-2013/14 (34 deductions).
--
-- Researched from the season articles for each division (sources listed in
-- docs/history-backfill.md). Deliberately NOT applied:
--   * Tottenham 1994/95: -12, cut to -6, then quashed by arbitration (Dec 1994).
--   * Anything in the Conference / National League: loaded with Phase 3.
-- Notes on timing:
--   * Leeds 2006/07 -10 was imposed after they were already relegated and is
--     recorded against 2006/07 (as the Football League did).
--   * Southampton -10 relates to 2008/09 insolvency but was applied at the
--     start of 2009/10 (League One) -- recorded there.
--   * Hartlepool 2009/10 -3 was applied after the season (5 Jun 2010).
--
-- Clubs and seasons are resolved by name and start year, not by generated id.
-- Idempotent: skips any (league, season, team, points, reason) already present.
-- ============================================================================

with d(start_year, league_code, club, points, reason) as (values
  (1996, 'E0', 'Middlesbrough', -3, 'Failed to fulfil fixture at Blackburn Rovers (21 Dec 1996); appeal rejected'),
  (2009, 'E0', 'Portsmouth', -9, 'Administration'),
  (2006, 'E1', 'Leeds', -10, 'Administration (imposed after relegation; applied to 2006/07)'),
  (2008, 'E1', 'Crystal Palace', -1, 'Fielding an ineligible player'),
  (2009, 'E1', 'Crystal Palace', -10, 'Administration (Jan 2010)'),
  (2011, 'E1', 'Portsmouth', -10, 'Administration (Feb 2012)'),
  (2004, 'E2', 'Wrexham', -10, 'Administration (Dec 2004)'),
  (2006, 'E2', 'Rotherham', -10, 'Administration / CVA'),
  (2007, 'E2', 'Leeds', -15, 'Exited administration without a CVA; applied at season start'),
  (2007, 'E2', 'Luton', -10, 'Administration (Nov 2007)'),
  (2007, 'E2', 'Bournemouth', -10, 'Administration (Feb 2008)'),
  (2008, 'E2', 'Stockport', -10, 'Administration (Apr 2009)'),
  (2009, 'E2', 'Southampton', -10, 'Insolvency event in 2008/09; applied at start of 2009/10'),
  (2009, 'E2', 'Hartlepool', -3, 'Fielding an ineligible player; applied after the season (5 Jun 2010)'),
  (2010, 'E2', 'Plymouth', -10, 'Administration (Feb 2011)'),
  (2012, 'E2', 'Coventry', -10, 'Administration (Mar 2013)'),
  (2012, 'E2', 'Portsmouth', -10, 'Administration (Apr 2013)'),
  (2013, 'E2', 'Coventry', -10, 'Exited administration without a CVA; applied at season start'),
  (1996, 'E3', 'Brighton', -2, 'Failure to control spectators'),
  (1997, 'E3', 'Leyton Orient', -3, 'Fielding ineligible players'),
  (2000, 'E3', 'Chesterfield', -9, 'Financial irregularities'),
  (2002, 'E3', 'Boston Utd', -4, 'Financial irregularities'),
  (2004, 'E3', 'Cambridge', -10, 'Administration (Apr 2005)'),
  (2005, 'E3', 'Bury', -1, 'Fielding an ineligible player'),
  (2006, 'E3', 'Boston Utd', -10, 'Administration / CVA at end of season'),
  (2007, 'E3', 'Rotherham', -10, 'Administration (Mar 2008)'),
  (2008, 'E3', 'Luton', -30, 'Exited administration without a CVA (-20) and illegal agent payments (-10); applied at season start'),
  (2008, 'E3', 'Bournemouth', -17, 'Exited administration without a CVA; applied at season start'),
  (2008, 'E3', 'Rotherham', -17, 'Exited administration without a CVA; applied at season start'),
  (2008, 'E3', 'Darlington', -10, 'Administration (Feb 2009)'),
  (2010, 'E3', 'Hereford', -3, 'Fielding an ineligible player'),
  (2010, 'E3', 'Torquay', -1, 'Fielding an ineligible player'),
  (2011, 'E3', 'Port Vale', -10, 'Administration (Mar 2012)'),
  (2013, 'E3', 'AFC Wimbledon', -3, 'Fielding an ineligible player')
), r as (
  select l.league_id, s.season_id, t.team_id, d.points, d.reason, d.club, d.start_year
    from d
    join public.leagues l on l.code = d.league_code
    join public.seasons s on s.start_year = d.start_year
    left join public.teams t on t.canonical_name = d.club
)
insert into public.point_deductions (league_id, season_id, team_id, points, reason)
select r.league_id, r.season_id, r.team_id, r.points, r.reason
  from r
 where not exists (select 1 from public.point_deductions p
                    where p.league_id = r.league_id and p.season_id = r.season_id and p.team_id = r.team_id
                      and p.points = r.points and p.reason = r.reason);

-- Fail loudly if any club did not resolve or never played in that division-season.
do $$
declare n int;
begin
  select count(*) into n
    from public.point_deductions p
    join public.seasons s using (season_id)
   where s.start_year between 1992 and 2013
     and not exists (select 1 from public.matches m
                      where m.league_id = p.league_id and m.season_id = p.season_id
                        and p.team_id in (m.home_team_id, m.away_team_id));
  if n > 0 then raise exception '% historic deductions point at a club that did not play that division-season', n; end if;
  select count(*) into n from public.point_deductions p join public.seasons s using (season_id) where s.start_year between 1992 and 2013;
  if n <> 34 then raise exception 'expected 34 historic deductions, found %', n; end if;
end $$;
