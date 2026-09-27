-- ============================================================================
-- Teams and name aliases for the Conference (tier 5, league EC) history
-- load, 2004/05-2013/14.
--
-- Mapping method (docs/history-backfill.md): every football-data.co.uk EC
-- fixture 2005/06-2013/14 was aligned with engsoccerdata's
-- england_nonleague.csv (division 'conference') fixture: same season, date
-- within 3 days, same score. Every football-data.co.uk name lines up with
-- one engsoccerdata name by at least 5 to 1 over any other (Halifax excepted:
-- two clubs, split by ERA_OVERRIDES). football-data.co.uk has no 2004/05
-- Conference file, so that season comes from engsoccerdata alone.
--
-- New teams (17). All are the club as it was then; judgement calls:
--   * Salisbury City  -- wound up 2014; Salisbury FC (2015) is a different
--                        club, so canonical/slug 'Salisbury City' /
--                        'salisbury-city' leave 'Salisbury' free for it.
--   * Farsley Celtic  -- wound up 2010; the later Farsley Celtic (founded
--                        2010 as Farsley AFC) is a different club, hence the
--                        full name as canonical.
--   * Farnborough Town -- wound up 2007; Farnborough FC is a different club.
--   * Leigh RMI       -- as named in 2004/05 (renamed Leigh Genesis 2008,
--                        folded 2011); engsoccerdata calls it Leigh Genesis.
--   * Hyde United     -- the same club was called Hyde FC in 2010-2015.
--   * Grays Athletic, Northwich Victoria, St Albans City, Hayes & Yeading
--     United, Kettering Town, Histon, Stafford Rangers, Droylsden, Eastbourne
--     Borough, Lewes, Bath City, Canvey Island -- same club throughout.
-- Existing teams reused:
--   * "Gravesend" (Gravesend & Northfleet, renamed Ebbsfleet United in 2007)
--     is team 'ebbsfleet'.
--   * "AFC Telford United" (2011/12) and "Telford United" (2012/13) are both
--     AFC Telford United (founded 2004), team 'telford-united'. The old
--     Telford United folded in 2004 and never played in these seasons.
--   * "Stevenage" (Stevenage Borough to 2010), "Oxford" (Oxford United),
--     "Aldershot" (Aldershot Town), "Dag and Red", "Hereford" (Hereford
--     United), "Rushden & D", "Darlington", "Chester" 2013/14 (Chester FC) --
--     already aliased.
--   * "Halifax" 2005/06-2007/08 is Halifax Town (ERA_OVERRIDES, as for E3);
--     2013/14 is FC Halifax Town (team 'halifax').
--   * Chester City's 2009/10 record was expunged; neither source has those
--     matches (football-data.co.uk 2009/10 has 23 clubs, 506 rows).
--
-- engsoccerdata's "Chester" alias stays on Chester City (england.csv, tiers
-- 1-4, 1992-2000); in england_nonleague.csv 2013/14 the same spelling is
-- Chester FC. Nothing imports engsoccerdata tier-5 rows after 2004/05, so it
-- only matters for cross-checks, which handle it explicitly.
--
-- Idempotent: inserts skip existing slugs / (source_name, raw_name).
-- ============================================================================

insert into public.teams (country_id, canonical_name, slug, display_name)
select c.country_id, v.canonical_name, v.slug, v.display_name
from (values
  ('Bath City', 'bath-city', 'Bath City'),
  ('Canvey Island', 'canvey-island', 'Canvey Island'),
  ('Droylsden', 'droylsden', 'Droylsden'),
  ('Eastbourne Borough', 'eastbourne-borough', 'Eastbourne Borough'),
  ('Farnborough Town', 'farnborough-town', 'Farnborough Town'),
  ('Farsley Celtic', 'farsley-celtic', 'Farsley Celtic'),
  ('Grays', 'grays-athletic', 'Grays Athletic'),
  ('Hayes & Yeading', 'hayes-yeading', 'Hayes & Yeading United'),
  ('Histon', 'histon', 'Histon'),
  ('Hyde United', 'hyde-united', 'Hyde United'),
  ('Kettering Town', 'kettering-town', 'Kettering Town'),
  ('Leigh RMI', 'leigh-rmi', 'Leigh RMI'),
  ('Lewes', 'lewes', 'Lewes'),
  ('Northwich', 'northwich-victoria', 'Northwich Victoria'),
  ('Salisbury City', 'salisbury-city', 'Salisbury City'),
  ('St. Albans', 'st-albans-city', 'St Albans City'),
  ('Stafford Rangers', 'stafford-rangers', 'Stafford Rangers')
) v(canonical_name, slug, display_name)
cross join (select country_id from public.teams where slug = 'arsenal') c
where not exists (select 1 from public.teams t where t.slug = v.slug);

-- football-data.co.uk spellings not yet aliased.
insert into public.team_aliases (team_id, source_name, raw_name)
select t.team_id, 'football-data.co.uk', v.raw_name
from (values
  ('AFC Telford United', 'telford-united'),
  ('Bath City', 'bath-city'),
  ('Canvey Island', 'canvey-island'),
  ('Droylsden', 'droylsden'),
  ('Eastbourne Borough', 'eastbourne-borough'),
  ('Farsley', 'farsley-celtic'),
  ('Gravesend', 'ebbsfleet'),
  ('Grays', 'grays-athletic'),
  ('Hayes & Yeading', 'hayes-yeading'),
  ('Histon', 'histon'),
  ('Hyde United', 'hyde-united'),
  ('Kettering Town', 'kettering-town'),
  ('Lewes', 'lewes'),
  ('Northwich', 'northwich-victoria'),
  ('Salisbury', 'salisbury-city'),
  ('St. Albans', 'st-albans-city'),
  ('Stafford Rangers', 'stafford-rangers')
) v(raw_name, slug)
join public.teams t on t.slug = v.slug
on conflict (source_name, raw_name) do nothing;

-- engsoccerdata (england_nonleague.csv) spellings not yet aliased.
insert into public.team_aliases (team_id, source_name, raw_name)
select t.team_id, 'engsoccerdata', v.raw_name
from (values
  ('AFC Telford United', 'telford-united'),
  ('Alfreton Town', 'alfreton-town'),
  ('Altrincham', 'altrincham'),
  ('Barrow', 'barrow'),
  ('Bath City', 'bath-city'),
  ('Braintree Town', 'braintree-town'),
  ('Canvey Island', 'canvey-island'),
  ('Dartford', 'dartford'),
  ('Droylsden', 'droylsden'),
  ('Eastbourne Borough', 'eastbourne-borough'),
  ('Ebbsfleet United', 'ebbsfleet'),
  ('Farnborough Town', 'farnborough-town'),
  ('Farsley', 'farsley-celtic'),
  ('FC Halifax Town', 'halifax'),
  ('Forest Green Rovers', 'forest-green'),
  ('Gateshead', 'gateshead'),
  ('Grays Athletic', 'grays-athletic'),
  ('Hayes & Yeading', 'hayes-yeading'),
  ('Histon', 'histon'),
  ('Hyde United', 'hyde-united'),
  ('Kettering Town', 'kettering-town'),
  ('Leigh Genesis', 'leigh-rmi'),
  ('Lewes', 'lewes'),
  ('Northwich Victoria', 'northwich-victoria'),
  ('Nuneaton Town', 'nuneaton-town'),
  ('Salisbury', 'salisbury-city'),
  ('Southport', 'southport'),
  ('St Albans', 'st-albans-city'),
  ('Stafford Rangers', 'stafford-rangers'),
  ('Tamworth', 'tamworth'),
  ('Welling United', 'welling-united'),
  ('Weymouth', 'weymouth'),
  ('Woking', 'woking')
) v(raw_name, slug)
join public.teams t on t.slug = v.slug
on conflict (source_name, raw_name) do nothing;

do $$
declare n int;
begin
  select count(*) into n from public.teams where slug in ('bath-city','canvey-island','droylsden','eastbourne-borough',
    'farnborough-town','farsley-celtic','grays-athletic','hayes-yeading','histon','hyde-united','kettering-town','leigh-rmi',
    'lewes','northwich-victoria','salisbury-city','st-albans-city','stafford-rangers');
  if n <> 17 then raise exception 'expected 17 Conference teams, found %', n; end if;
  -- every staged EC name resolves (engsoccerdata "Chester" = Chester FC only in 2013/14)
  select count(*) into n from (
    select source_name, home_name nm from public.historic_source_rows where league_code = 'EC'
    union select source_name, away_name from public.historic_source_rows where league_code = 'EC') x
   where not exists (select 1 from public.team_aliases a where a.source_name = x.source_name and a.raw_name = x.nm);
  if n > 0 then raise exception '% staged EC names have no alias', n; end if;
end $$;
