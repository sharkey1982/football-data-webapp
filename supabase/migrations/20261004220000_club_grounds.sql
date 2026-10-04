-- ============================================================================
-- Club grounds: where each club plays (Chris, 4 Oct 2026), for Your Local
-- Clubs (postcode -> nearest clubs) and away-travel maps.
--
-- Seeded with the 116 clubs in the top five English divisions in 2026/27
-- (incl. the four Welsh clubs), gathered via ChatGPT from the Football Club
-- History Database ground gazetteer (fchd.info). Not trusted as given:
-- scripts/verify_club_grounds.py looks every ground_postcode up on
-- postcodes.io and stores that point and the distance to our coordinates;
-- check_club_grounds() fails any ground more than 1.5 km from its postcode,
-- any unverified row, and any current top-five-division club with no ground.
-- ============================================================================

create table public.club_grounds (
  team_id integer primary key references public.teams(team_id),
  ground_name text not null,
  latitude numeric(8,5) not null check (latitude between 49 and 61),
  longitude numeric(8,5) not null check (longitude between -9 and 2),
  ground_postcode text not null,
  arrangement text check (arrangement in ('temporary', 'shared')),
  source_url text,
  notes text,
  postcode_latitude numeric(8,5),
  postcode_longitude numeric(8,5),
  postcode_distance_m integer,
  postcode_checked_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.club_grounds is 'Home ground and pitch-centre coordinates per club; postcode_* is the independent postcodes.io check (scripts/verify_club_grounds.py).';

alter table public.club_grounds enable row level security;
create policy club_grounds_public_read on public.club_grounds for select using (true);
grant select on public.club_grounds to anon, authenticated;
grant select, insert, update on public.club_grounds to service_role;

insert into public.club_grounds (team_id, ground_name, latitude, longitude, ground_postcode, arrangement, source_url, notes) values
  (1, 'Emirates Stadium', 51.55515, -0.10842, 'N7 7AJ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (10, 'Villa Park', 52.50907, -1.88503, 'B6 6HE', null, 'https://fchd.info/maps/GAZ.htm', null),
  (30, 'Vitality Stadium', 50.73522, -1.83834, 'BH7 7AF', null, 'https://fchd.info/maps/GAZ.htm', null),
  (23, 'Gtech Community Stadium', 51.49076, -0.28868, 'TW8 0RU', null, 'https://fchd.info/maps/GAZ.htm', null),
  (25, 'Amex Stadium', 50.86158, -0.08367, 'BN1 9BL', null, 'https://fchd.info/maps/GAZ.htm', null),
  (20, 'Stamford Bridge', 51.48174, -0.19093, 'SW6 1HS', null, 'https://fchd.info/maps/GAZ.htm', null),
  (48, 'Coventry Building Society Arena', 52.44814, -1.49561, 'CV6 6GE', null, 'https://fchd.info/maps/GAZ.htm', null),
  (2, 'Selhurst Park', 51.39829, -0.08544, 'SE25 6PU', null, 'https://fchd.info/maps/GAZ.htm', null),
  (4, 'Hill Dickinson Stadium', 53.42502, -3.00272, 'L3 0BW', null, 'https://fchd.info/maps/GAZ.htm', null),
  (32, 'Craven Cottage', 51.47494, -0.22159, 'SW6 6HH', null, 'https://fchd.info/maps/GAZ.htm', null),
  (8, 'MKM Stadium', 53.74626, -0.36764, 'HU3 6HU', 'shared', 'https://fchd.info/maps/GAZ.htm', 'Shared with Hull FC rugby league.'),
  (31, 'Portman Road', 52.05496, 1.14532, 'IP1 2DA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (36, 'Elland Road', 53.77781, -1.57217, 'LS11 0ES', null, 'https://fchd.info/maps/GAZ.htm', null),
  (15, 'Anfield', 53.43089, -2.96081, 'L4 0TH', null, 'https://fchd.info/maps/GAZ.htm', null),
  (18, 'Etihad Stadium', 53.48313, -2.20035, 'M11 3FF', null, 'https://fchd.info/maps/GAZ.htm', null),
  (5, 'Old Trafford', 53.46305, -2.29131, 'M16 0RA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (17, 'St James'' Park', 54.97558, -1.62159, 'NE1 4ST', null, 'https://fchd.info/maps/GAZ.htm', null),
  (37, 'City Ground', 52.93994, -1.13287, 'NG2 5FJ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (12, 'Stadium of Light', 54.91443, -1.38818, 'SR5 1SU', null, 'https://fchd.info/maps/GAZ.htm', null),
  (14, 'Tottenham Hotspur Stadium', 51.60419, -0.06611, 'N17 0BX', null, 'https://fchd.info/maps/GAZ.htm', null),
  (34, 'St Andrew''s', 52.47576, -1.86820, 'B9 4RL', null, 'https://fchd.info/maps/GAZ.htm', null),
  (21, 'Ewood Park', 53.72858, -2.48917, 'BB2 4JF', null, 'https://fchd.info/maps/GAZ.htm', null),
  (40, 'Toughsheet Community Stadium', 53.58059, -2.53566, 'BL6 6JW', null, 'https://fchd.info/maps/GAZ.htm', null),
  (64, 'Ashton Gate', 51.44013, -2.62022, 'BS3 2EJ', 'shared', 'https://fchd.info/maps/GAZ.htm', 'Shared with Bristol Bears rugby union.'),
  (19, 'Turf Moor', 53.78899, -2.23025, 'BB10 4BX', null, 'https://fchd.info/maps/GAZ.htm', null),
  (22, 'Cardiff City Stadium', 51.47282, -3.20302, 'CF11 8AZ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (24, 'The Valley', 51.48646, 0.03653, 'SE7 8BL', null, 'https://fchd.info/maps/GAZ.htm', null),
  (27, 'Pride Park Stadium', 52.91495, -1.44728, 'DE24 8XL', null, 'https://fchd.info/maps/GAZ.htm', null),
  (107, 'Sincil Bank', 53.21834, -0.54076, 'LN5 8LD', null, 'https://fchd.info/maps/GAZ.htm', null),
  (33, 'Riverside Stadium', 54.57826, -1.21689, 'TS3 6RS', null, 'https://fchd.info/maps/GAZ.htm', null),
  (35, 'The Den', 51.48595, -0.05091, 'SE16 3LN', null, 'https://fchd.info/maps/GAZ.htm', null),
  (44, 'Carrow Road', 52.62215, 1.30922, 'NR1 1JE', null, 'https://fchd.info/maps/GAZ.htm', null),
  (82, 'Fratton Park', 50.79633, -1.06381, 'PO4 8RA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (59, 'Deepdale', 53.77218, -2.68840, 'PR1 6RU', null, 'https://fchd.info/maps/GAZ.htm', null),
  (7, 'Loftus Road', 51.50927, -0.23211, 'W12 7PJ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (63, 'Bramall Lane', 53.37036, -1.47084, 'S2 4SU', null, 'https://fchd.info/maps/GAZ.htm', null),
  (16, 'St Mary''s Stadium', 50.90583, -1.39099, 'SO14 5FP', null, 'https://fchd.info/maps/GAZ.htm', null),
  (9, 'bet365 Stadium', 52.98841, -2.17541, 'ST4 4EG', null, 'https://fchd.info/maps/GAZ.htm', null),
  (6, 'Swansea.com Stadium', 51.64274, -3.93458, 'SA1 2FA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (39, 'Vicarage Road', 51.64989, -0.40154, 'WD18 0ER', null, 'https://fchd.info/maps/GAZ.htm', null),
  (11, 'The Hawthorns', 52.50909, -1.96393, 'B71 4LF', null, 'https://fchd.info/maps/GAZ.htm', null),
  (13, 'London Stadium', 51.53869, -0.01644, 'E20 2ST', null, 'https://fchd.info/maps/GAZ.htm', null),
  (43, 'Molineux', 52.59022, -2.13041, 'WV1 4QR', null, 'https://fchd.info/maps/GAZ.htm', null),
  (102, 'Racecourse Ground', 53.05197, -3.00380, 'LL11 2AH', null, 'https://fchd.info/maps/GAZ.htm', null),
  (71, 'Plough Lane', 51.43153, -0.18661, 'SW17 0NR', null, 'https://fchd.info/maps/GAZ.htm', null),
  (45, 'Oakwell', 53.55233, -1.46765, 'S71 1ET', null, 'https://fchd.info/maps/GAZ.htm', null),
  (38, 'Bloomfield Road', 53.80486, -3.04814, 'FY1 6JJ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (47, 'Valley Parade', 53.80424, -1.75903, 'BD8 7DY', null, 'https://fchd.info/maps/GAZ.htm', null),
  (119, 'Hayes Lane', 51.39009, 0.02109, 'BR2 9EF', null, 'https://fchd.info/maps/GAZ.htm', null),
  (88, 'Pirelli Stadium', 52.82199, -1.62693, 'DE13 0AR', null, 'https://fchd.info/maps/GAZ.htm', null),
  (75, 'Abbey Stadium', 52.21211, 0.15415, 'CB5 8LN', null, 'https://fchd.info/maps/GAZ.htm', null),
  (68, 'Eco-Power Stadium', 53.50982, -1.11387, 'DN4 5JW', null, 'https://fchd.info/maps/GAZ.htm', null),
  (29, 'Accu Stadium', 53.65429, -1.76837, 'HD1 6PG', 'shared', 'https://fchd.info/maps/GAZ.htm', 'Shared with Huddersfield Giants rugby league.'),
  (3, 'King Power Stadium', 52.62038, -1.14225, 'LE2 7FL', null, 'https://fchd.info/maps/GAZ.htm', null),
  (53, 'Brisbane Road', 51.56016, -0.01263, 'E10 5NF', null, 'https://fchd.info/maps/GAZ.htm', null),
  (78, 'Kenilworth Road', 51.88422, -0.43163, 'LU4 8AW', null, 'https://fchd.info/maps/GAZ.htm', null),
  (86, 'Field Mill', 53.13806, -1.20073, 'NG18 5DA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (55, 'Stadium MK', 52.00966, -0.73355, 'MK1 1ST', null, 'https://fchd.info/maps/GAZ.htm', null),
  (60, 'Meadow Lane', 52.94263, -1.13719, 'NG2 3HJ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (87, 'Kassam Stadium', 51.71654, -1.20792, 'OX4 4XP', null, 'https://fchd.info/maps/GAZ.htm', null),
  (62, 'London Road', 52.56471, -0.24039, 'PE2 8AL', null, 'https://fchd.info/maps/GAZ.htm', null),
  (76, 'Home Park', 50.38808, -4.15093, 'PL2 3DQ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (42, 'Select Car Leasing Stadium', 51.42236, -0.98262, 'RG2 0FL', null, 'https://fchd.info/maps/GAZ.htm', null),
  (26, 'Hillsborough', 53.41143, -1.50066, 'S6 1SW', null, 'https://fchd.info/maps/GAZ.htm', null),
  (89, 'Broadhall Way', 51.88984, -0.19363, 'SG2 8RH', null, 'https://fchd.info/maps/GAZ.htm', null),
  (131, 'Edgeley Park', 53.39964, -2.16630, 'SK3 9DD', null, 'https://fchd.info/maps/GAZ.htm', null),
  (41, 'Brick Community Stadium', 53.54766, -2.65401, 'WN5 0UH', 'shared', 'https://fchd.info/maps/GAZ.htm', 'Shared with Wigan Warriors rugby league.'),
  (84, 'Adams Park', 51.63054, -0.80023, 'HP12 4HJ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (69, 'Crown Ground', 53.76541, -2.37103, 'BB5 5BX', null, 'https://fchd.info/maps/GAZ.htm', null),
  (100, 'The Hive Stadium', 51.60263, -0.29178, 'HA8 6AG', null, 'https://fchd.info/maps/GAZ.htm', null),
  (97, 'Memorial Stadium', 51.48622, -2.58310, 'BS7 0BF', null, 'https://fchd.info/maps/GAZ.htm', null),
  (74, 'Whaddon Road', 51.90614, -2.06026, 'GL52 5NA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (54, 'SMH Group Stadium', 53.25355, -1.42577, 'S41 8NZ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (49, 'JobServe Community Stadium', 51.92329, 0.89784, 'CO4 5UP', null, 'https://fchd.info/maps/GAZ.htm', null),
  (46, 'Broadfield Stadium', 51.09971, -0.19476, 'RH11 9RX', null, 'https://fchd.info/maps/GAZ.htm', null),
  (52, 'Mornflake Stadium', 53.08743, -2.43571, 'CW2 6EB', null, 'https://fchd.info/maps/GAZ.htm', null),
  (81, 'St James Park', 50.73074, -3.52106, 'EX4 6PX', null, 'https://fchd.info/maps/GAZ.htm', null),
  (51, 'Highbury Stadium', 53.91651, -3.02473, 'FY7 6TX', null, 'https://fchd.info/maps/GAZ.htm', null),
  (56, 'Priestfield Stadium', 51.38425, 0.56075, 'ME7 4DD', null, 'https://fchd.info/maps/GAZ.htm', null),
  (98, 'Blundell Park', 53.57024, -0.04652, 'DN35 7PY', null, 'https://fchd.info/maps/GAZ.htm', null),
  (83, 'Rodney Parade', 51.58826, -2.98799, 'NP19 0UU', 'shared', 'https://fchd.info/maps/GAZ.htm', 'Shared with Dragons RFC and Newport RFC.'),
  (85, 'Sixfields Stadium', 52.23518, -0.93349, 'NN5 5QA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (50, 'Boundary Park', 53.55516, -2.12846, 'OL1 2PA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (57, 'Vale Park', 53.05011, -2.19266, 'ST6 1AW', null, 'https://fchd.info/maps/GAZ.htm', null),
  (61, 'Spotland', 53.62079, -2.17997, 'OL11 5DR', null, 'https://fchd.info/maps/GAZ.htm', null),
  (28, 'New York Stadium', 53.42689, -1.36244, 'S60 1DF', null, 'https://fchd.info/maps/GAZ.htm', null),
  (130, 'Moor Lane', 53.51362, -2.27676, 'M7 3PZ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (72, 'The Croud Meadow', 52.68872, -2.74936, 'SY2 6ST', null, 'https://fchd.info/maps/GAZ.htm', null),
  (65, 'County Ground', 51.56450, -1.77109, 'SN1 2ED', null, 'https://fchd.info/maps/GAZ.htm', null),
  (91, 'Prenton Park', 53.37377, -3.03249, 'CH42 9PY', null, 'https://fchd.info/maps/GAZ.htm', null),
  (58, 'Bescot Stadium', 52.56540, -1.99042, 'WS1 4SA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (92, 'York Community Stadium', 53.98439, -1.05286, 'YO32 9AF', null, 'https://fchd.info/maps/GAZ.htm', null),
  (93, 'Recreation Ground', 51.24839, -0.75474, 'GU11 1TW', null, 'https://fchd.info/maps/GAZ.htm', null),
  (94, 'Moss Lane', 53.38343, -2.33517, 'WA15 8AP', null, 'https://fchd.info/maps/GAZ.htm', null),
  (117, 'Holker Street', 54.12328, -3.23496, 'LA14 5UW', null, 'https://fchd.info/maps/GAZ.htm', null),
  (118, 'Meadow Park', 51.66193, -0.27238, 'WD6 5AL', null, 'https://fchd.info/maps/GAZ.htm', null),
  (138, 'Boston Community Stadium', 52.95631, -0.02856, 'PE21 7NE', null, 'https://fchd.info/maps/GAZ.htm', null),
  (77, 'Brunton Park', 54.89551, -2.91362, 'CA1 1LL', null, 'https://fchd.info/maps/GAZ.htm', null),
  (112, 'Silverlake Stadium', 50.95236, -1.37202, 'SO50 9HT', null, 'https://fchd.info/maps/GAZ.htm', null),
  (114, 'The New Lawn', 51.69900, -2.23792, 'GL6 0ET', null, 'https://fchd.info/maps/GAZ.htm', null),
  (125, 'Mill Farm', 53.79737, -2.88951, 'PR4 3JZ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (105, 'Gateshead International Stadium', 54.96102, -1.57967, 'NE10 0EF', null, 'https://fchd.info/maps/GAZ.htm', null),
  (104, 'The Shay', 53.71614, -1.85914, 'HX1 2YT', null, 'https://fchd.info/maps/GAZ.htm', null),
  (129, 'Marcy Fitness Stadium', 53.99171, -1.51450, 'HG2 7RY', null, 'https://fchd.info/maps/GAZ.htm', null),
  (90, 'Victoria Park', 54.68908, -1.21269, 'TS24 8BZ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (309, 'Hornchurch Stadium', 51.55656, 0.23836, 'RM14 2LX', null, 'https://fchd.info/maps/GAZ.htm', null),
  (108, 'Aggborough Stadium', 52.38049, -2.24268, 'DY10 1NB', null, 'https://fchd.info/maps/GAZ.htm', null),
  (66, 'Glanford Park', 53.58669, -0.69525, 'DN15 8TD', null, 'https://fchd.info/maps/GAZ.htm', null),
  (124, 'Damson Park', 52.43890, -1.75724, 'B91 2PP', null, 'https://fchd.info/maps/GAZ.htm', null),
  (70, 'Roots Hall', 51.54901, 0.70157, 'SS2 6NQ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (123, 'Gander Green Lane', 51.36760, -0.20433, 'SM1 2EY', null, 'https://fchd.info/maps/GAZ.htm', null),
  (139, 'The Lamb Ground', 52.62843, -1.68892, 'B77 1AA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (135, 'Grosvenor Vale', 51.56940, -0.41660, 'HA4 6JQ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (96, 'Kingfield Stadium', 51.30633, -0.55888, 'GU22 9AA', null, 'https://fchd.info/maps/GAZ.htm', null),
  (310, 'Sussex Transport Community Stadium', 50.82035, -0.38482, 'BN14 7HQ', null, 'https://fchd.info/maps/GAZ.htm', null),
  (67, 'Huish Park', 50.95023, -2.67398, 'BA22 8YF', null, 'https://fchd.info/maps/GAZ.htm', null);

create or replace function public.check_club_grounds()
returns table(check_name text, status text, found bigint, detail text)
language sql stable security definer set search_path = '' as $$
  select 'club_grounds_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Clubs playing in the top five English divisions since 1 July with no row in club_grounds'
  from (select count(distinct t.team_id) n
        from public.matches m
        join public.leagues l on l.league_id = m.league_id and l.code in ('E0', 'E1', 'E2', 'E3', 'EC')
        join public.teams t on t.team_id in (m.home_team_id, m.away_team_id)
        where m.match_date >= make_date(extract(year from now() - interval '6 months')::int, 7, 1)
          and not exists (select 1 from public.club_grounds g where g.team_id = t.team_id)) x
  union all
  select 'club_grounds_postcode_checked', case when n = 0 then 'ok' else 'warning' end, n,
    'Club grounds whose postcode has not been looked up (run the club-grounds-verify workflow)'
  from (select count(*) n from public.club_grounds where postcode_checked_at is null) x
  union all
  select 'club_grounds_near_postcode', case when n = 0 then 'ok' else 'failed' end, n,
    'Club grounds more than 1.5 km from their own postcode, or whose postcode does not exist'
  from (select count(*) n from public.club_grounds
        where postcode_checked_at is not null and (postcode_distance_m is null or postcode_distance_m > 1500)) x
$$;

revoke all on function public.check_club_grounds() from public, anon, authenticated;
grant execute on function public.check_club_grounds() to service_role;
