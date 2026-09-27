-- ============================================================================
-- HISTORY BACKFILL (National League): points deductions in the Conference
-- (tier 5, league EC), 2004/05-2013/14 (20 deductions).
--
-- Researched from each season's Football Conference article (points in the
-- final table checked against 3W+D) and cross-checked with
-- thecityground.com's points-deducted list and fchd.info; see
-- docs/history-backfill.md. Deliberately NOT applied:
--   * Chester City 2009/10 (-25 administration, -3): record expunged, so no
--     matches and no deduction.
--   * Crawley Town 2008/09: the reported -4 was cut to -1 on appeal
--     (Feb 2009); -1 is applied.
--
-- Clubs are resolved by slug and seasons by start year, not by generated id.
-- Idempotent: skips any (league, season, team, points, reason) already present.
-- ============================================================================

with d(start_year, slug, points, reason) as (values
  (2004, 'tamworth', -3, 'Breach of league rules'),
  (2004, 'northwich-victoria', -10, 'Administration'),
  (2005, 'altrincham', -18, 'Fielding an ineligible player'),
  (2006, 'crawley-town', -10, 'Administration'),
  (2007, 'crawley-town', -6, 'Breach of financial regulations'),
  (2007, 'halifax-town', -10, 'Administration'),
  (2008, 'oxford', -5, 'Fielding an ineligible player'),
  (2008, 'mansfield', -4, 'Breach of league rules (Oct 2008)'),
  (2008, 'crawley-town', -1, 'Fielding an ineligible player (reduced from -4 on appeal, Feb 2009)'),
  (2009, 'salisbury-city', -10, 'Administration'),
  (2009, 'gateshead', -1, 'Failing to fulfil a fixture'),
  (2009, 'grays-athletic', -2, 'Fielding ineligible players'),
  (2010, 'kidderminster', -5, 'Submitting misleading financial information'),
  (2010, 'histon', -5, 'Submitting misleading financial information'),
  (2010, 'rushden-diamonds', -5, 'Submitting misleading financial information'),
  (2010, 'kettering-town', -2, 'Fielding an ineligible player'),
  (2011, 'darlington', -10, 'Administration'),
  (2011, 'kettering-town', -3, 'Failing to pay football creditors'),
  (2013, 'alfreton-town', -3, 'Fielding an ineligible player'),
  (2013, 'aldershot', -10, 'Administration')
), r as (
  select l.league_id, s.season_id, t.team_id, d.points, d.reason
    from d
    join public.leagues l on l.code = 'EC'
    join public.seasons s on s.start_year = d.start_year
    left join public.teams t on t.slug = d.slug
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
    join public.leagues l using (league_id)
   where l.code = 'EC' and s.start_year between 2004 and 2013;
  if n <> 20 then raise exception 'expected 20 Conference deductions 2004/05-2013/14, found %', n; end if;
  select count(*) into n
    from public.point_deductions p
    join public.seasons s using (season_id)
    join public.leagues l using (league_id)
   where l.code = 'EC' and s.start_year between 2004 and 2013
     and (p.team_id is null
          or not exists (select 1 from public.matches m
                          where m.league_id = p.league_id and m.season_id = p.season_id
                            and p.team_id in (m.home_team_id, m.away_team_id)));
  if n > 0 then raise exception '% Conference deductions point at a club that did not play that season', n; end if;
end $$;
