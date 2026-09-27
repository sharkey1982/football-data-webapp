-- ============================================================================
-- Teams and name aliases for the 1992/93-2013/14 English history load
--
-- Mapping method (docs/history-backfill.md): every football-data.co.uk
-- fixture 1993/94-2013/14 was aligned with engsoccerdata's same fixture
-- (same division and season, date within 3 days, same score). For each
-- football-data.co.uk name the engsoccerdata name it lines up with most
-- often won by at least 3 to 1 over any other, and no engsoccerdata name
-- was claimed by two football-data.co.uk names: 110 names each side, one to
-- one. engsoccerdata has no 1992/93 club that is missing from 1993-2013.
--
-- New teams (7). Judgement calls:
--   * Wimbledon       -- Wimbledon FC to 2003/04. Kept separate from Milton
--                        Keynes Dons (renamed and relocated 2004) and AFC
--                        Wimbledon (founded 2002), as both sources do.
--   * Halifax Town    -- the club wound up in 2008; FC Halifax Town (team
--                        'halifax', founded 2008) is a different club.
--   * Chester City    -- expelled 2010; Chester FC (team 'chester', founded
--                        2010) is a different club.
--   * Hereford United -- wound up 2014; Hereford FC is a different club, so
--                        slug 'hereford-united' leaves 'hereford' free.
--   * Darlington, Scarborough, Rushden & Diamonds -- no later club in the data.
--   football-data.co.uk spells Halifax Town/FC Halifax Town both "Halifax"
--   and Chester City/Chester FC both "Chester"; the existing aliases stay on
--   the current clubs and scripts/history_backfill.py (ERA_OVERRIDES) sends
--   the old seasons to the old clubs. engsoccerdata's "Halifax Town" and
--   "Chester" are only the old clubs in 1992-2013, so they alias directly.
-- Existing teams reused: "Boston" (Boston United 2002-2007) is the same club
-- as team 'boston-united'; "Aldershot" in 2008-2013 is Aldershot Town (team
-- 'aldershot'; the old Aldershot FC folded in March 1992, before this data);
-- "Macclesfield" is Macclesfield Town (team 'macclesfield').
--
-- Idempotent: inserts skip existing slugs / (source_name, raw_name).
-- ============================================================================

insert into public.teams (country_id, canonical_name, slug, display_name)
select c.country_id, v.canonical_name, v.slug, v.display_name
from (values
  ('Wimbledon', 'wimbledon', 'Wimbledon'),
  ('Halifax Town', 'halifax-town', 'Halifax Town'),
  ('Chester City', 'chester-city', 'Chester City'),
  ('Hereford', 'hereford-united', 'Hereford United'),
  ('Darlington', 'darlington', 'Darlington'),
  ('Scarborough', 'scarborough', 'Scarborough'),
  ('Rushden & D', 'rushden-diamonds', 'Rushden & Diamonds')
) v(canonical_name, slug, display_name)
cross join (select country_id from public.teams where slug = 'arsenal') c
where not exists (select 1 from public.teams t where t.slug = v.slug);

-- football-data.co.uk spellings not yet aliased ("Halifax"/"Chester" keep
-- their current-club aliases; see ERA_OVERRIDES).
insert into public.team_aliases (team_id, source_name, raw_name)
select t.team_id, 'football-data.co.uk', v.raw_name
from (values
  ('Boston', 'boston-united'),
  ('Darlington', 'darlington'),
  ('Hereford', 'hereford-united'),
  ('Rushden & D', 'rushden-diamonds'),
  ('Scarborough', 'scarborough'),
  ('Wimbledon', 'wimbledon')
) v(raw_name, slug)
join public.teams t on t.slug = v.slug
on conflict (source_name, raw_name) do nothing;

-- engsoccerdata names, each paired with the football-data.co.uk name its
-- fixtures align with; resolved through that name's alias, except the two
-- old clubs football-data.co.uk shares a spelling with.
insert into public.team_aliases (team_id, source_name, raw_name)
select coalesce(o.team_id, a.team_id), 'engsoccerdata', v.esd_name
from (values
('Accrington', 'Accrington'),
('AFC Bournemouth', 'Bournemouth'),
('AFC Wimbledon', 'AFC Wimbledon'),
('Aldershot', 'Aldershot'),
('Arsenal', 'Arsenal'),
('Aston Villa', 'Aston Villa'),
('Barnet', 'Barnet'),
('Barnsley', 'Barnsley'),
('Birmingham City', 'Birmingham'),
('Blackburn Rovers', 'Blackburn'),
('Blackpool', 'Blackpool'),
('Bolton Wanderers', 'Bolton'),
('Boston United', 'Boston'),
('Bradford City', 'Bradford'),
('Brentford', 'Brentford'),
('Brighton & Hove Albion', 'Brighton'),
('Bristol City', 'Bristol City'),
('Bristol Rovers', 'Bristol Rvs'),
('Burnley', 'Burnley'),
('Burton Albion', 'Burton'),
('Bury', 'Bury'),
('Cambridge United', 'Cambridge'),
('Cardiff City', 'Cardiff'),
('Carlisle United', 'Carlisle'),
('Charlton Athletic', 'Charlton'),
('Chelsea', 'Chelsea'),
('Cheltenham', 'Cheltenham'),
('Chester', 'Chester'),
('Chesterfield', 'Chesterfield'),
('Colchester United', 'Colchester'),
('Coventry City', 'Coventry'),
('Crawley Town', 'Crawley Town'),
('Crewe Alexandra', 'Crewe'),
('Crystal Palace', 'Crystal Palace'),
('Dagenham and Redbridge', 'Dag and Red'),
('Darlington', 'Darlington'),
('Derby County', 'Derby'),
('Doncaster Rovers', 'Doncaster'),
('Everton', 'Everton'),
('Exeter City', 'Exeter'),
('Fleetwood Town', 'Fleetwood Town'),
('Fulham', 'Fulham'),
('Gillingham', 'Gillingham'),
('Grimsby Town', 'Grimsby'),
('Halifax Town', 'Halifax'),
('Hartlepool United', 'Hartlepool'),
('Hereford United', 'Hereford'),
('Huddersfield Town', 'Huddersfield'),
('Hull City', 'Hull'),
('Ipswich Town', 'Ipswich'),
('Kidderminster Harriers', 'Kidderminster'),
('Leeds United', 'Leeds'),
('Leicester City', 'Leicester'),
('Leyton Orient', 'Leyton Orient'),
('Lincoln City', 'Lincoln'),
('Liverpool', 'Liverpool'),
('Luton Town', 'Luton'),
('Macclesfield', 'Macclesfield'),
('Manchester City', 'Man City'),
('Manchester United', 'Man United'),
('Mansfield Town', 'Mansfield'),
('Middlesbrough', 'Middlesbrough'),
('Millwall', 'Millwall'),
('Milton Keynes Dons', 'Milton Keynes Dons'),
('Morecambe', 'Morecambe'),
('Newcastle United', 'Newcastle'),
('Newport County', 'Newport County'),
('Northampton Town', 'Northampton'),
('Norwich City', 'Norwich'),
('Nottingham Forest', 'Nott''m Forest'),
('Notts County', 'Notts County'),
('Oldham Athletic', 'Oldham'),
('Oxford United', 'Oxford'),
('Peterborough United', 'Peterboro'),
('Plymouth Argyle', 'Plymouth'),
('Port Vale', 'Port Vale'),
('Portsmouth', 'Portsmouth'),
('Preston North End', 'Preston'),
('Queens Park Rangers', 'QPR'),
('Reading', 'Reading'),
('Rochdale', 'Rochdale'),
('Rotherham United', 'Rotherham'),
('Rushden & Diamonds', 'Rushden & D'),
('Scarborough', 'Scarborough'),
('Scunthorpe United', 'Scunthorpe'),
('Sheffield United', 'Sheffield United'),
('Sheffield Wednesday', 'Sheffield Weds'),
('Shrewsbury Town', 'Shrewsbury'),
('Southampton', 'Southampton'),
('Southend United', 'Southend'),
('Stevenage Borough', 'Stevenage'),
('Stockport County', 'Stockport'),
('Stoke City', 'Stoke'),
('Sunderland', 'Sunderland'),
('Swansea City', 'Swansea'),
('Swindon Town', 'Swindon'),
('Torquay United', 'Torquay'),
('Tottenham Hotspur', 'Tottenham'),
('Tranmere Rovers', 'Tranmere'),
('Walsall', 'Walsall'),
('Watford', 'Watford'),
('West Bromwich Albion', 'West Brom'),
('West Ham United', 'West Ham'),
('Wigan Athletic', 'Wigan'),
('Wimbledon', 'Wimbledon'),
('Wolverhampton Wanderers', 'Wolves'),
('Wrexham', 'Wrexham'),
('Wycombe Wanderers', 'Wycombe'),
('Yeovil', 'Yeovil'),
('York City', 'York')
) v(esd_name, fd_name)
left join public.team_aliases a on a.source_name = 'football-data.co.uk' and a.raw_name = v.fd_name
left join public.teams o on o.slug = case v.esd_name when 'Halifax Town' then 'halifax-town' when 'Chester' then 'chester-city' end
on conflict (source_name, raw_name) do nothing;

do $$
begin
  if (select count(*) from public.team_aliases where source_name = 'engsoccerdata') <> 110 then
    raise exception 'Expected 110 engsoccerdata aliases';
  end if;
  if exists (select 1 from public.team_aliases where source_name = 'engsoccerdata' and team_id is null) then
    raise exception 'Unresolved engsoccerdata alias';
  end if;
end $$;
