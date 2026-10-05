-- ============================================================================
-- Tennis phase 3, data (design: claude/tennis-phase3-design-2026-10-05.md, A).
--
-- 1. Merge 48 players who are one person under two spellings (see the DO
--    block); the importer's ALIASES map the same names from now on.
-- 2. tennis.player_people: country (ISO alpha-2), date of birth, playing hand
--    from Wikidata (CC0), written by scripts/tennis_people.py (GitHub Actions)
--    through public.tennis_set_people.
-- 3. tennis.venues: tournament location -> display city and country.
-- 4. Events and editions: an edition is one tournament-name in one year; an
--    event groups editions across sponsor renames (Grand Slams by name, Tour
--    Finals per tour, others by city and calendar week, one per year).
-- 5. Summary tables (player totals, per-year, per-surface/level splits,
--    per-edition results), rebuilt by public.tennis_refresh() after every
--    import, so pages read rows instead of aggregating every match: the
--    database is small (the 4 Oct outage).
-- 6. tennis.broadcasters (UK TV) and public.tennis_calendar (this week and
--    next, from last season's dates).
-- ============================================================================

-- Players who are one person under two spellings in the source (5 Oct 2026):
-- fuller/shorter initials and married names, each confirmed by Wikidata
-- (scripts/tennis_people.py) and never appearing in the same draw; plus three
-- spacing variants the original exact-text ALIASES lookup missed. The importer's
-- ALIASES now map the same names, so future imports agree. Matches move to the
-- kept player and their source_key is rebuilt from the display names; the
-- merged player's aliases move too, then the player is deleted.
do $$
declare r record; n int := 0; bad text;
begin
  -- Guard: matches and games per tour-year must not move.
  create temp table before_merge on commit drop as
    select tour, year, count(*) matches, sum((select coalesce(sum(g), 0) from unnest(w_games || l_games) g)) games
    from tennis.matches group by tour, year;
  for r in
    select p.tour, pf.player_id fid, pt.player_id tid
    from (values
  ('ATP', 'Lisnard J.', 'Lisnard J.R.'),
  ('ATP', 'Ferrero J.', 'Ferrero J.C.'),
  ('ATP', 'Chela J.', 'Chela J.I.'),
  ('ATP', 'Mathieu P.', 'Mathieu P.H.'),
  ('ATP', 'Guzman J.', 'Guzman J.P.'),
  ('ATP', 'Scherrer J.', 'Scherrer J.C.'),
  ('ATP', 'Qureshi A.', 'Qureshi A.U.H.'),
  ('ATP', 'Sanchez De Luna J.', 'Sanchez de Luna J.A.'),
  ('ATP', 'Del Potro J.', 'Del Potro J.M.'),
  ('ATP', 'Jun W.', 'Jun W.S.'),
  ('ATP', 'Viola Mat.', 'Viola M.'),
  ('ATP', 'Zayid M.', 'Zayid M.S.'),
  ('ATP', 'Herbert P.', 'Herbert P.H.'),
  ('ATP', 'Galan D.', 'Galan D.E.'),
  ('ATP', 'Silva F.F.', 'Ferreira Silva F.'),
  ('ATP', 'Aragone J.', 'Aragone J.C.'),
  ('ATP', 'Kwon S.', 'Kwon S.W.'),
  ('ATP', 'Moroni G.', 'Moroni G.M.'),
  ('ATP', 'Barrios Vera M.T.', 'Barrios M.'),
  ('ATP', 'Etcheverry T.M.', 'Etcheverry T.'),
  ('ATP', 'Bailly G.', 'Bailly G.A.'),
  ('ATP', 'Bogomolov Jr.A.', 'Bogomolov A.'),
  ('ATP', 'Granollers Pujol G.', 'Granollers G.'),
  ('WTA', 'Sun T.', 'Sun T.T.'),
  ('WTA', 'Camerin M.', 'Camerin M.E.'),
  ('WTA', 'Volodko K.', 'Bondarenko K.'),
  ('WTA', 'Hsieh S.', 'Hsieh S.W.'),
  ('WTA', 'Sun S.', 'Sun S.N.'),
  ('WTA', 'Candela E.C.', 'Cabeza-Candela E.'),
  ('WTA', 'Olaru I.', 'Olaru R.'),
  ('WTA', 'Olaru I.R.', 'Olaru R.'),
  ('WTA', 'Munoz D.', 'Munoz Gallegos D.'),
  ('WTA', 'Pliskova Kar.', 'Pliskova Ka.'),
  ('WTA', 'Pliskova Kri.', 'Pliskova Kr.'),
  ('WTA', 'Salerni M.', 'Salerni M.E.'),
  ('WTA', 'Joao Koehler M.', 'Koehler M.J.'),
  ('WTA', 'Gavrilova D.', 'Saville D.'),
  ('WTA', 'Beck An.', 'Beck A.'),
  ('WTA', 'Schmiedlova A.K.', 'Schmiedlova A.'),
  ('WTA', 'Kerkhove L.', 'Pattinama Kerkhove L.'),
  ('WTA', 'Jang S.', 'Jang S.J.'),
  ('WTA', 'Sanders S.', 'Hunter S.'),
  ('WTA', 'Collins D.R.', 'Collins D.'),
  ('WTA', 'Alves C.M.', 'Alves C.'),
  ('WTA', 'Teichmann J.B.', 'Teichmann J.'),
  ('WTA', 'Jimenez V.', 'Jimenez Kasintseva V.'),
  ('WTA', 'Nugroho P.M.', 'Nugroho P.'),
  ('WTA', 'Arruabarrena Vecino L.', 'Arruabarrena L.')
    ) p(tour, f, t)
    join tennis.players pf on pf.tour = p.tour and pf.name = p.f
    join tennis.players pt on pt.tour = p.tour and pt.name = p.t
  loop
    update tennis.matches set winner_id = r.tid where winner_id = r.fid;
    update tennis.matches set loser_id = r.tid where loser_id = r.fid;
    update tennis.player_aliases set player_id = r.tid where player_id = r.fid;
    delete from tennis.players where player_id = r.fid;
    n := n + 1;
  end loop;
  update tennis.matches m
  set source_key = concat_ws('|', m.tour, m.year, t.name, m.round, w.name, l.name)
  from tennis.tournaments t, tennis.players w, tennis.players l
  where t.tournament_id = m.tournament_id and w.player_id = m.winner_id and l.player_id = m.loser_id
    and m.source_key <> concat_ws('|', m.tour, m.year, t.name, m.round, w.name, l.name);
  raise notice 'merged % players', n;

  -- Guard, rolls the whole migration back on failure: totals unchanged, and
  -- the rebuilt keys of every complete season equal the importer's (file) hash.
  select string_agg(b.tour || b.year, ', ') into bad
  from before_merge b
  left join (select tour, year, count(*) matches, sum((select coalesce(sum(g), 0) from unnest(w_games || l_games) g)) games
             from tennis.matches group by tour, year) a using (tour, year)
  where (a.matches, a.games) is distinct from (b.matches, b.games);
  if bad is not null then raise exception 'merge changed totals: %', bad; end if;
  select string_agg(e.tour || e.year, ', ') into bad
  from (values ('ATP',2000,2963,73589,'655dddd4f81197a0bb74a5a4d4d4aa85'),('ATP',2001,2963,73949,'b33454a5220a77bcbde25edc5d2ac5e0'),('ATP',2002,2854,71475,'adf377e8ffdafb28e5382bb1ece71bd6'),('ATP',2003,2861,70459,'4cf179ded6f5c4f06f03587866cad09e'),('ATP',2004,2877,71478,'81794debea14622d107fabc98581efe6'),('ATP',2005,2909,71544,'8cce48c926a4471ace798350fa47c994'),('ATP',2006,2909,72222,'ee0f117367700a1eb33f10567cb3c51c'),('ATP',2007,2806,68986,'118b6b770f760fcbbca3db54226942ae'),('ATP',2008,2707,67078,'cff59eb60ae7dfe8e9c5eb844173e4b0'),('ATP',2009,2731,67926,'934799857d8081a2d169821407f651af'),('ATP',2010,2679,66559,'3a6ca2ab08452dcd47daf30787ec23d7'),('ATP',2011,2675,65708,'129620bb4927ee91c53a6a11c0321d57'),('ATP',2012,2607,64964,'939d50954b6f2ecc9fbe9388c77d9fd9'),('ATP',2013,2631,65790,'eaab591d7cfa8af5d1109d59d84d3310'),('ATP',2014,2600,65222,'951746701f4281344fea355966010aeb'),('ATP',2015,2630,67022,'bb9d210101d5b3a8ae708379048cac0c'),('ATP',2016,2626,66663,'aa622ad867c9022d285a2881d0e4ef00'),('ATP',2017,2633,66842,'8b7bb82a8999c224e7a4616dee69183b'),('ATP',2018,2637,68149,'1a455002d64747cbd50543967f9cc2f2'),('ATP',2019,2610,67190,'e3fa9ae828ee50cacaff78bcacc01229'),('ATP',2020,1267,34093,'f0e4cc19f23f0bf42f262815d2f4c42c'),('ATP',2021,2489,63609,'9be15ae50aebbe032636ce7863d66e09'),('ATP',2022,2632,67413,'fa10aecdcc212801c54f73b5e50db6e8'),('ATP',2023,2703,69085,'fb0a6d6b1f733d4330a2bc146f4e9ae7'),('ATP',2024,2703,69446,'0d40377ab24cf75bde3bf57843c3b68c'),('ATP',2025,2644,67683,'ec43dc6800974afb71f516523ec96559'),('ATP',2026,2204,58072,'9be4ddd9b106165c7a4ae039453b2dea'),('WTA',2007,2491,51407,'00d3a8fb72659751c334288adf50850b'),('WTA',2008,2404,50517,'c7143b843fa6febd3b4f46ad1800f5cf'),('WTA',2009,2433,51363,'ee49c75b524670579e87fc2d3309ff5c'),('WTA',2010,2448,51234,'0ac36d0fbd668431bb25040957ac983c'),('WTA',2011,2468,51748,'ae4bc4a1be71834433cdca4b56eafb97'),('WTA',2012,2407,50071,'23d08172913faa18b57b21c038ab9917'),('WTA',2013,2442,51787,'2d7f5024b12703d88c7a79b8a70049e7'),('WTA',2014,2476,52756,'1985c5257ea5e53f0177e15655c209b1'),('WTA',2015,2521,54000,'ecb769beb2a2bf25e93ee21e98900974'),('WTA',2016,2522,53750,'a37ee294452b46b29be55c2b10dbf2e7'),('WTA',2017,2500,53928,'e396942cd815ec7a47b4923e24438170'),('WTA',2018,2469,52752,'88ec231340b736fce870979d40cec82f'),('WTA',2019,2472,53617,'a08b1524138976fb133a22ffc232f271'),('WTA',2020,1055,22903,'d61423071c6dd6430762d895c538e0f1'),('WTA',2021,2447,52326,'d3b7d214e5f0283b2db57ab32ec42b53'),('WTA',2022,2369,50753,'12010dada99f3393550a1f6e9090b3e7'),('WTA',2023,2491,53369,'f1042ac8f84ff53648f7f6e996f20b36'),('WTA',2024,2490,53486,'c752ea3c78d0614a364f8918ff277216'),('WTA',2025,2505,53998,'e37fa8aa21546e9a945ae7554ff80e0f'),('WTA',2026,2191,47433,'56cff71ba0dc5745ec8b000525162216')) e(tour, year, matches, games, key_hash)
  cross join lateral public.tennis_year_totals(e.tour, e.year) g
  where e.year < 2026 and (g.matches, g.games, g.key_hash) is distinct from (e.matches, e.games, e.key_hash);
  if bad is not null then raise exception 'merged keys differ from the source files: %', bad; end if;
end $$;


-- 2. Player details from Wikidata ---------------------------------------------
create table if not exists tennis.player_people (
  player_id bigint primary key references tennis.players(player_id) on delete cascade,
  wikidata_qid text not null,
  full_name text,
  country text,                 -- ISO 3166-1 alpha-2 of the nation played for
  all_countries text[],
  birth_date date,
  hand text check (hand in ('Right', 'Left')),
  match_method text not null,
  checked_at timestamptz not null default now()
);
alter table tennis.player_people enable row level security;
create policy "public read" on tennis.player_people for select to anon, authenticated using (true);
grant select on tennis.player_people to anon, authenticated;

create or replace function public.tennis_set_people(rows jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from tennis.player_people where true;
  insert into tennis.player_people (player_id, wikidata_qid, full_name, country, all_countries, birth_date, hand, match_method)
  select r.player_id, r.wikidata_qid, r.full_name, r.country, r.all_countries, r.birth_date, r.hand, r.match_method
  from jsonb_to_recordset(rows) r(player_id bigint, wikidata_qid text, full_name text, country text, all_countries text[],
                                  birth_date date, hand text, match_method text)
  where exists (select 1 from tennis.players p where p.player_id = r.player_id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.tennis_set_people(jsonb) from public, anon, authenticated;
grant execute on function public.tennis_set_people(jsonb) to service_role;

-- 3. Venues ---------------------------------------------------------------------
create table if not exists tennis.venues (
  location text primary key,    -- as in the source ("Queens Club", "Monreal")
  city text not null,           -- display ("London (Queen's Club)", "Montreal")
  country text not null         -- ISO 3166-1 alpha-2
);
alter table tennis.venues enable row level security;
create policy "public read" on tennis.venues for select to anon, authenticated using (true);
grant select on tennis.venues to anon, authenticated;
insert into tennis.venues (location, city, country) values
  ('''s-Hertogenbosch', '''s-Hertogenbosch', 'NL'),
  ('Abu Dhabi', 'Abu Dhabi', 'AE'),
  ('Acapulco', 'Acapulco', 'MX'),
  ('Adelaide', 'Adelaide', 'AU'),
  ('Almaty', 'Almaty', 'KZ'),
  ('Amelia Island', 'Amelia Island', 'US'),
  ('Amersfoort', 'Amersfoort', 'NL'),
  ('Amsterdam', 'Amsterdam', 'NL'),
  ('Antalya', 'Antalya', 'TR'),
  ('Antwerp', 'Antwerp', 'BE'),
  ('Athens', 'Athens', 'GR'),
  ('Atlanta', 'Atlanta', 'US'),
  ('Auckland', 'Auckland', 'NZ'),
  ('Austin', 'Austin', 'US'),
  ('Bad Gastein', 'Bad Gastein', 'AT'),
  ('Bad Homburg', 'Bad Homburg', 'DE'),
  ('Baku', 'Baku', 'AZ'),
  ('Bali', 'Bali', 'ID'),
  ('Bangalore', 'Bangalore', 'IN'),
  ('Bangkok', 'Bangkok', 'TH'),
  ('Banja Luka', 'Banja Luka', 'BA'),
  ('Barcelona', 'Barcelona', 'ES'),
  ('Basel', 'Basel', 'CH'),
  ('Bastad', 'Bastad', 'SE'),
  ('Beijing', 'Beijing', 'CN'),
  ('Belgrade', 'Belgrade', 'RS'),
  ('Berlin', 'Berlin', 'DE'),
  ('Biel', 'Biel', 'CH'),
  ('Birmingham', 'Birmingham', 'GB'),
  ('Bogota', 'Bogota', 'CO'),
  ('Brighton', 'Brighton', 'GB'),
  ('Brisbane', 'Brisbane', 'AU'),
  ('Brussels', 'Brussels', 'BE'),
  ('Bucharest', 'Bucharest', 'RO'),
  ('Budapest', 'Budapest', 'HU'),
  ('Buenos Aires', 'Buenos Aires', 'AR'),
  ('Cagliari', 'Cagliari', 'IT'),
  ('Cancun', 'Cancun', 'MX'),
  ('Carlsbad', 'Carlsbad', 'US'),
  ('Casablanca', 'Casablanca', 'MA'),
  ('Charleston', 'Charleston', 'US'),
  ('Chengdu', 'Chengdu', 'CN'),
  ('Chennai', 'Chennai', 'IN'),
  ('Chicago', 'Chicago', 'US'),
  ('Cincinnati', 'Cincinnati', 'US'),
  ('Cleveland', 'Cleveland', 'US'),
  ('Cluj-Napoca', 'Cluj-Napoca', 'RO'),
  ('College Park', 'College Park', 'US'),
  ('Cologne', 'Cologne', 'DE'),
  ('Copenhagen', 'Copenhagen', 'DK'),
  ('Cordoba', 'Cordoba', 'AR'),
  ('Costa Do Sauipe', 'Costa do Sauipe', 'BR'),
  ('Courmayeur', 'Courmayeur', 'IT'),
  ('Dallas', 'Dallas', 'US'),
  ('Delray Beach', 'Delray Beach', 'US'),
  ('Doha', 'Doha', 'QA'),
  ('Dubai', 'Dubai', 'AE'),
  ('Dusseldorf', 'Dusseldorf', 'DE'),
  ('Eastbourne', 'Eastbourne', 'GB'),
  ('Estoril', 'Estoril', 'PT'),
  ('Fes', 'Fes', 'MA'),
  ('Florence', 'Florence', 'IT'),
  ('Florianopolis', 'Florianopolis', 'BR'),
  ('Forest Hills', 'Forest Hills', 'US'),
  ('Fort Worth', 'Fort Worth', 'US'),
  ('Gdynia', 'Gdynia', 'PL'),
  ('Geneva', 'Geneva', 'CH'),
  ('Gijon', 'Gijon', 'ES'),
  ('Gold Coast', 'Gold Coast', 'AU'),
  ('Granby', 'Granby', 'CA'),
  ('Gstaad', 'Gstaad', 'CH'),
  ('Guadalajara', 'Guadalajara', 'MX'),
  ('Guangzhou', 'Guangzhou', 'CN'),
  ('Halle', 'Halle', 'DE'),
  ('Hamburg', 'Hamburg', 'DE'),
  ('Hangzhou', 'Hangzhou', 'CN'),
  ('Hiroshima', 'Hiroshima', 'JP'),
  ('Ho Chi Min City', 'Ho Chi Minh City', 'VN'),
  ('Hobart', 'Hobart', 'AU'),
  ('Hong Kong', 'Hong Kong', 'HK'),
  ('Houston', 'Houston', 'US'),
  ('Hua Hin', 'Hua Hin', 'TH'),
  ('Iasi', 'Iasi', 'RO'),
  ('Indian Wells', 'Indian Wells', 'US'),
  ('Indianapolis', 'Indianapolis', 'US'),
  ('Istanbul', 'Istanbul', 'TR'),
  ('Jiujiang', 'Jiujiang', 'CN'),
  ('Johannesburg', 'Johannesburg', 'ZA'),
  ('Jurmala', 'Jurmala', 'LV'),
  ('Kaohsiung', 'Kaohsiung', 'TW'),
  ('Katowice', 'Katowice', 'PL'),
  ('Kitzbuhel', 'Kitzbuhel', 'AT'),
  ('Kolkata', 'Kolkata', 'IN'),
  ('Kuala Lumpur', 'Kuala Lumpur', 'MY'),
  ('Las Vegas', 'Las Vegas', 'US'),
  ('Lausanne', 'Lausanne', 'CH'),
  ('Lexington', 'Lexington', 'US'),
  ('Linz', 'Linz', 'AT'),
  ('Lisbon', 'Lisbon', 'PT'),
  ('London', 'London', 'GB'),
  ('Long Island', 'Long Island', 'US'),
  ('Los Angeles', 'Los Angeles', 'US'),
  ('Los Cabos', 'Los Cabos', 'MX'),
  ('Lugano', 'Lugano', 'CH'),
  ('Luxembourg', 'Luxembourg', 'LU'),
  ('Lyon', 'Lyon', 'FR'),
  ('Madrid', 'Madrid', 'ES'),
  ('Mallorca', 'Mallorca', 'ES'),
  ('Marbella', 'Marbella', 'ES'),
  ('Marrakech', 'Marrakech', 'MA'),
  ('Marrakesh', 'Marrakech', 'MA'),
  ('Marseille', 'Marseille', 'FR'),
  ('Melbourne', 'Melbourne', 'AU'),
  ('Memphis', 'Memphis', 'US'),
  ('Merida', 'Merida', 'MX'),
  ('Metz', 'Metz', 'FR'),
  ('Mexico City', 'Mexico City', 'MX'),
  ('Miami', 'Miami', 'US'),
  ('Milan', 'Milan', 'IT'),
  ('Monastir', 'Monastir', 'TN'),
  ('Monreal', 'Montreal', 'CA'),
  ('Monte Carlo', 'Monte Carlo', 'MC'),
  ('Monterrey', 'Monterrey', 'MX'),
  ('Montpellier', 'Montpellier', 'FR'),
  ('Montreal', 'Montreal', 'CA'),
  ('Moscow', 'Moscow', 'RU'),
  ('Mumbai', 'Mumbai', 'IN'),
  ('Munich', 'Munich', 'DE'),
  ('Nanchang', 'Nanchang', 'CN'),
  ('Napoli', 'Naples', 'IT'),
  ('New Haven', 'New Haven', 'US'),
  ('New York', 'New York', 'US'),
  ('Newport', 'Newport', 'US'),
  ('Nice', 'Nice', 'FR'),
  ('Ningbo', 'Ningbo', 'CN'),
  ('Nottingham', 'Nottingham', 'GB'),
  ('Nur-Sultan', 'Astana', 'KZ'),
  ('Nürnberg', 'Nuremberg', 'DE'),
  ('Oeiras', 'Oeiras', 'PT'),
  ('Orlando', 'Orlando', 'US'),
  ('Osaka', 'Osaka', 'JP'),
  ('Ostrava', 'Ostrava', 'CZ'),
  ('Palermo', 'Palermo', 'IT'),
  ('Paris', 'Paris', 'FR'),
  ('Parma', 'Parma', 'IT'),
  ('Pattaya', 'Pattaya', 'TH'),
  ('Ponte Vedra Beach', 'Ponte Vedra Beach', 'US'),
  ('Portoroz', 'Portoroz', 'SI'),
  ('Portschach', 'Portschach', 'AT'),
  ('Prague', 'Prague', 'CZ'),
  ('Pune', 'Pune', 'IN'),
  ('Quebec', 'Quebec City', 'CA'),
  ('Queens Club', 'London (Queen''s Club)', 'GB'),
  ('Quito', 'Quito', 'EC'),
  ('Rabat', 'Rabat', 'MA'),
  ('Rio de Janeiro', 'Rio de Janeiro', 'BR'),
  ('Riyadh', 'Riyadh', 'SA'),
  ('Rogers Cup', 'Montreal/Toronto', 'CA'),
  ('Rome', 'Rome', 'IT'),
  ('Rotterdam', 'Rotterdam', 'NL'),
  ('Rouen', 'Rouen', 'FR'),
  ('Salvador', 'Salvador', 'BR'),
  ('San Diego', 'San Diego', 'US'),
  ('San Jose', 'San Jose', 'US'),
  ('San Marino', 'San Marino', 'SM'),
  ('Santiago', 'Santiago', 'CL'),
  ('Sao Paulo', 'Sao Paulo', 'BR'),
  ('Sardinia', 'Sardinia', 'IT'),
  ('Scottsdale', 'Scottsdale', 'US'),
  ('Seoul', 'Seoul', 'KR'),
  ('Shanghai', 'Shanghai', 'CN'),
  ('Shenzhen', 'Shenzhen', 'CN'),
  ('Singapore', 'Singapore', 'SG'),
  ('Sofia', 'Sofia', 'BG'),
  ('Sopot', 'Sopot', 'PL'),
  ('St. Petersburg', 'St Petersburg', 'RU'),
  ('St. Polten', 'St Polten', 'AT'),
  ('Stanford', 'Stanford', 'US'),
  ('Stockholm', 'Stockholm', 'SE'),
  ('Strasbourg', 'Strasbourg', 'FR'),
  ('Stuttgart', 'Stuttgart', 'DE'),
  ('Sydney', 'Sydney', 'AU'),
  ('Taipei', 'Taipei', 'TW'),
  ('Tallinn', 'Tallinn', 'EE'),
  ('Tashkent', 'Tashkent', 'UZ'),
  ('Tel Aviv', 'Tel Aviv', 'IL'),
  ('Tenerife', 'Tenerife', 'ES'),
  ('Tianjin', 'Tianjin', 'CN'),
  ('Tokyo', 'Tokyo', 'JP'),
  ('Toronto', 'Toronto', 'CA'),
  ('Toulouse', 'Toulouse', 'FR'),
  ('Turin', 'Turin', 'IT'),
  ('Umag', 'Umag', 'HR'),
  ('Valencia', 'Valencia', 'ES'),
  ('Vienna', 'Vienna', 'AT'),
  ('Vina del Mar', 'Vina del Mar', 'CL'),
  ('Warsaw', 'Warsaw', 'PL'),
  ('Washington', 'Washington', 'US'),
  ('Winston-Salem', 'Winston-Salem', 'US'),
  ('Wuhan', 'Wuhan', 'CN'),
  ('Zagreb', 'Zagreb', 'HR'),
  ('Zhengzhou', 'Zhengzhou', 'CN'),
  ('Zhuhai', 'Zhuhai', 'CN'),
  ('Zurich', 'Zurich', 'CH')
on conflict (location) do update set city = excluded.city, country = excluded.country;
-- The Canadian Open alternates between Montreal and Toronto: one event.
update tennis.venues set city = 'Montreal/Toronto' where location in ('Montreal', 'Monreal', 'Toronto', 'Rogers Cup');

-- 4/5. Events, editions and summaries -----------------------------------------
create table if not exists tennis.events (
  event_id bigint generated always as identity primary key,
  tour text not null,
  grp text not null,            -- grouping key: 'slam:Wimbledon', 'finals', 'city:Miami'
  slug text,
  name text, city text, country text, level text, level_rank int, surface text,
  first_year int, last_year int, editions int
);
create table if not exists tennis.editions (
  tournament_id bigint not null references tennis.tournaments(tournament_id),
  year int not null,
  event_id bigint not null references tennis.events(event_id) on delete cascade,
  tour text not null, name text not null, location text,
  start_date date, end_date date, level text, level_rank int, surface text, matches int,
  winner_id bigint, runner_up_id bigint, final_key text,
  primary key (tournament_id, year)
);
create index if not exists editions_event_idx on tennis.editions (event_id, year);
create table if not exists tennis.player_totals (
  player_id bigint primary key references tennis.players(player_id) on delete cascade,
  tour text not null,
  matches bigint, wins bigint, first_match date, last_match date,
  won bigint, lost bigint, titles bigint, finals bigint, first_year int, last_year int, recent_matches bigint,
  best_rank int, best_rank_date date
);
create table if not exists tennis.player_splits (
  player_id bigint not null references tennis.players(player_id) on delete cascade,
  year int not null, surface text not null, level text not null,
  won int not null, lost int not null, titles int not null, finals int not null,
  primary key (player_id, year, surface, level)
);
create table if not exists tennis.player_years (
  player_id bigint not null references tennis.players(player_id) on delete cascade,
  year int not null,
  won int, lost int, titles int, finals int,
  end_rank int, end_points int, best_rank int,
  primary key (player_id, year)
);
create table if not exists tennis.player_editions (
  player_id bigint not null references tennis.players(player_id) on delete cascade,
  tournament_id bigint not null, year int not null, event_id bigint not null,
  won int not null, lost int not null,
  last_round text, last_round_order numeric, champion boolean not null,
  primary key (player_id, tournament_id, year)
);
create index if not exists player_editions_event_idx on tennis.player_editions (event_id, year);
do $$ declare t text; begin
  foreach t in array array['events','editions','player_totals','player_splits','player_years','player_editions'] loop
    execute format('alter table tennis.%I enable row level security', t);
    execute format('drop policy if exists "public read" on tennis.%I', t);
    execute format('create policy "public read" on tennis.%I for select to anon, authenticated using (true)', t);
    execute format('grant select on tennis.%I to anon, authenticated', t);
  end loop;
end $$;

create or replace function tennis.slugify_city(t text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(t, 'àáâäãåçèééêëìíîïñòóôöõøùúûüýÿ', 'aaaaaaceeeeeiiiinoooooouuuuyy')), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function tennis.rebuild_events() returns void language plpgsql as $$
declare e record; ev bigint; g text; doy int;
begin
  delete from tennis.editions where true;
  delete from tennis.events where true;
  for e in
    select m.tour, m.year, m.tournament_id, t.name,
      mode() within group (order by m.location) location,
      min(m.match_date) start_date, max(m.match_date) end_date,
      min(tennis.level_rank(tennis.level_of(m.tour, m.series, t.name))) level_rank,
      mode() within group (order by case when m.surface = 'Greenset' then 'Hard' else m.surface end) surface,
      count(*) matches
    from tennis.matches m join tennis.tournaments t using (tournament_id)
    group by m.tour, m.year, m.tournament_id, t.name
    order by min(m.match_date), t.name
  loop
    g := case
      when e.level_rank = 2 then 'finals'
      when e.level_rank = 1 then 'slam:' || e.name
      else 'city:' || coalesce((select v.city from tennis.venues v where v.location = e.location), e.location) end;
    doy := extract(doy from e.start_date)::int;
    select ev2.event_id into ev from tennis.events ev2
    where ev2.tour = e.tour and ev2.grp = g
      and not exists (select 1 from tennis.editions x where x.event_id = ev2.event_id and x.year = e.year)
      and (g not like 'city:%' or exists (
        select 1 from tennis.editions x where x.event_id = ev2.event_id
          and least(abs(extract(doy from x.start_date)::int - doy), 365 - abs(extract(doy from x.start_date)::int - doy)) <= 35))
    order by ev2.last_year desc nulls last, ev2.event_id
    limit 1;
    if ev is null then
      insert into tennis.events (tour, grp) values (e.tour, g) returning event_id into ev;
    end if;
    insert into tennis.editions (tournament_id, year, event_id, tour, name, location, start_date, end_date, level_rank, surface, matches)
    values (e.tournament_id, e.year, ev, e.tour, e.name, e.location, e.start_date, e.end_date, e.level_rank, e.surface, e.matches);
    update tennis.events set last_year = e.year where event_id = ev;
    ev := null;
  end loop;

  update tennis.editions d set
    level = (select l from (values (1,'Grand Slam'),(2,'Finals'),(3,'1000'),(4,'Premier'),(5,'500'),(6,'250')) v(r,l) where v.r = d.level_rank),
    winner_id = f.winner_id, runner_up_id = f.loser_id, final_key = f.source_key
  from (select distinct on (tournament_id, year) tournament_id, year, winner_id, loser_id, source_key
        from tennis.matches where round = 'The Final' and tennis.result_of(status, w_games) <> 'Not played'
        order by tournament_id, year, match_date desc) f
  where f.tournament_id = d.tournament_id and f.year = d.year;
  update tennis.editions d set level = (select l from (values (1,'Grand Slam'),(2,'Finals'),(3,'1000'),(4,'Premier'),(5,'500'),(6,'250')) v(r,l) where v.r = d.level_rank)
  where level is null;

  update tennis.events ev set
    name = case when ev.grp = 'finals' then ev.tour || ' Finals' else l.name end, city = coalesce(v.city, l.location), country = v.country, level = l.level, level_rank = l.level_rank,
    surface = l.surface, first_year = s.y0, last_year = s.y1, editions = s.n
  from (select distinct on (event_id) * from tennis.editions order by event_id, year desc, start_date desc) l
  join (select event_id, min(year) y0, max(year) y1, count(*) n from tennis.editions group by event_id) s using (event_id)
  left join tennis.venues v on v.location = l.location
  where l.event_id = ev.event_id;

  -- Slugs: fixed for the Slams and Tour Finals (they move city), else the city; -2, -3 by first year on clashes.
  update tennis.events ev set slug = x.slug from (
    select event_id, case when n = 1 then base else base || '-' || n end slug from (
      select event_id, base, row_number() over (partition by tour, base order by first_year, event_id) n from (
        select event_id, tour, first_year,
          case when grp = 'finals' then lower(tour) || '-finals'
               when grp like 'slam:%' then tennis.slugify_city(substr(grp, 6))
               else tennis.slugify_city(city) end base
        from tennis.events) b) c) x
  where x.event_id = ev.event_id;
end $$;

create or replace function tennis.rebuild_summaries() returns void language plpgsql as $$
begin
  delete from tennis.player_totals where true;
  delete from tennis.player_splits where true;
  delete from tennis.player_years where true;
  delete from tennis.player_editions where true;

  drop table if exists s;
  create temp table s on commit drop as
  select m.winner_id pid, m.tour, m.year, m.match_date, m.tournament_id, m.round, tennis.round_order(m.round) ro,
    true won, tennis.result_of(m.status, m.w_games) in ('Completed','Retired','Awarded','Disqualified') played,
    m.round = 'The Final' and tennis.result_of(m.status, m.w_games) <> 'Not played' final,
    case when m.surface = 'Greenset' then 'Hard' else coalesce(m.surface, '?') end surface,
    coalesce(tennis.level_of(m.tour, m.series, t.name), '?') level, m.w_rank rnk, m.w_pts pts
  from tennis.matches m join tennis.tournaments t using (tournament_id)
  union all
  select m.loser_id, m.tour, m.year, m.match_date, m.tournament_id, m.round, tennis.round_order(m.round),
    false, tennis.result_of(m.status, m.w_games) in ('Completed','Retired','Awarded','Disqualified'),
    m.round = 'The Final' and tennis.result_of(m.status, m.w_games) <> 'Not played',
    case when m.surface = 'Greenset' then 'Hard' else coalesce(m.surface, '?') end,
    coalesce(tennis.level_of(m.tour, m.series, t.name), '?'), m.l_rank, m.l_pts
  from tennis.matches m join tennis.tournaments t using (tournament_id);

  insert into tennis.player_totals
  select s.pid, s.tour, count(*), count(*) filter (where won), min(match_date), max(match_date),
    count(*) filter (where won and played), count(*) filter (where not won and played),
    count(*) filter (where final and won), count(*) filter (where final), min(year), max(year),
    count(*) filter (where played and year > lt.y - 3),
    min(rnk) filter (where rnk > 0),
    (array_agg(match_date order by rnk, match_date) filter (where rnk > 0))[1]
  from s join (select tour, max(year) y from tennis.matches group by tour) lt using (tour)
  group by s.pid, s.tour, lt.y;

  insert into tennis.player_splits
  select pid, year, surface, level, count(*) filter (where won and played), count(*) filter (where not won and played),
    count(*) filter (where final and won), count(*) filter (where final)
  from s group by 1, 2, 3, 4;

  insert into tennis.player_years
  select pid, year, count(*) filter (where won and played), count(*) filter (where not won and played),
    count(*) filter (where final and won), count(*) filter (where final),
    (array_agg(rnk order by match_date desc, ro desc) filter (where rnk > 0))[1],
    (array_agg(pts order by match_date desc, ro desc) filter (where pts > 0))[1],
    min(rnk) filter (where rnk > 0)
  from s group by 1, 2;

  insert into tennis.player_editions
  select s.pid, s.tournament_id, s.year, d.event_id,
    count(*) filter (where won and played), count(*) filter (where not won and played),
    (array_agg(round order by ro desc, match_date desc))[1], max(ro),
    bool_or(final and won)
  from s join tennis.editions d on d.tournament_id = s.tournament_id and d.year = s.year
  group by 1, 2, 3, 4;
end $$;

create or replace function public.tennis_refresh() returns text language plpgsql security definer set search_path = '' as $$
begin
  perform tennis.rebuild_events();
  perform tennis.rebuild_summaries();
  return format('%s events, %s editions, %s player totals',
    (select count(*) from tennis.events), (select count(*) from tennis.editions), (select count(*) from tennis.player_totals));
end $$;
revoke all on function public.tennis_refresh() from public, anon, authenticated;
grant execute on function public.tennis_refresh() to service_role;

-- 6. UK TV and the calendar -----------------------------------------------------
create table if not exists tennis.broadcasters (
  id bigint generated always as identity primary key,
  tour text,                    -- null: both tours
  event_slug text,              -- a named event (Slams); null: by level
  levels text[],                -- null: any level
  channel text not null,
  free_to_air text,             -- e.g. 'BBC One/Two and iPlayer', 'Quest (highlights)'
  from_year int not null, to_year int,
  source_url text, checked_on date not null
);
alter table tennis.broadcasters enable row level security;
create policy "public read" on tennis.broadcasters for select to anon, authenticated using (true);
grant select on tennis.broadcasters to anon, authenticated;
insert into tennis.broadcasters (tour, event_slug, levels, channel, free_to_air, from_year, to_year, source_url, checked_on) values
  ('ATP', null, array['Finals','1000','500','250'], 'Sky Sports', null, 2024, 2028, 'https://www.tvbeurope.com/media-consumption/sky-sports-serves-up-atp-and-wta-tennis-for-next-five-years', '2026-10-05'),
  ('WTA', null, array['Finals','1000','500','250','Premier'], 'Sky Sports', null, 2024, 2028, 'https://www.tvbeurope.com/media-consumption/sky-sports-serves-up-atp-and-wta-tennis-for-next-five-years', '2026-10-05'),
  (null, 'australian-open', null, 'TNT Sports', 'Quest (nightly highlights)', 2026, null, 'https://rxtvinfo.com/2026/wbd-confirms-australian-open-coverage-with-more-freeview-highlights', '2026-10-05'),
  (null, 'french-open', null, 'TNT Sports', null, 2026, null, 'https://helpforum.sky.com/t5/Sky-Stream/No-Roland-Garros-2026-why/m-p/5281993', '2026-10-05'),
  (null, 'wimbledon', null, 'BBC', 'BBC One, BBC Two and iPlayer', 2026, 2033, 'https://www.sportcal.com/news/bbc-retains-wimbledon-rights-through-2033-players-protest-prize-pot/', '2026-10-05'),
  (null, 'us-open', null, 'Sky Sports', null, 2026, null, 'https://helpforum.sky.com/t5/Sky-Stream/No-Roland-Garros-2026-why/m-p/5281993', '2026-10-05');

-- 7. Site views ------------------------------------------------------------------
-- tennis_players now reads the summary table (was an aggregate over every
-- match) and gains the Wikidata columns; leading columns are unchanged.
create or replace view public.tennis_players with (security_invoker = true) as
select p.player_id, p.tour, p.name, p.slug,
  t.matches, t.wins, t.first_match, t.last_match, t.won, t.lost, t.titles, t.finals,
  t.first_year, t.last_year, t.recent_matches,
  pp.country, pp.full_name, pp.birth_date, pp.hand, pp.wikidata_qid, t.best_rank, t.best_rank_date
from tennis.players p
join tennis.player_totals t using (player_id)
left join tennis.player_people pp using (player_id);

create or replace view public.tennis_player_splits with (security_invoker = true) as
select s.player_id, p.tour, p.slug, s.year, s.surface, s.level, s.won, s.lost, s.titles, s.finals
from tennis.player_splits s join tennis.players p using (player_id);

create or replace view public.tennis_player_years with (security_invoker = true) as
select y.player_id, p.tour, p.slug, p.name, y.year, y.won, y.lost, y.titles, y.finals, y.end_rank, y.end_points, y.best_rank
from tennis.player_years y join tennis.players p using (player_id);

create or replace view public.tennis_events with (security_invoker = true) as
select e.event_id, e.tour, e.slug, e.name, e.city, e.country, e.level, e.level_rank, e.surface,
  e.first_year, e.last_year, e.editions
from tennis.events e;

create or replace view public.tennis_editions with (security_invoker = true) as
select d.tournament_id, d.year, d.event_id, ev.slug event_slug, d.tour, d.name, d.location, ev.city, ev.country,
  d.start_date, d.end_date, d.level, d.level_rank, d.surface, d.matches,
  w.name winner, w.slug winner_slug, r.name runner_up, r.slug runner_up_slug, d.final_key
from tennis.editions d
join tennis.events ev using (event_id)
left join tennis.players w on w.player_id = d.winner_id
left join tennis.players r on r.player_id = d.runner_up_id;

create or replace view public.tennis_player_editions with (security_invoker = true) as
select pe.player_id, p.tour, p.slug, pe.tournament_id, pe.year, pe.event_id, ev.slug event_slug, d.name, d.level, d.level_rank,
  d.surface, d.start_date, pe.won, pe.lost, pe.last_round, pe.last_round_order, pe.champion
from tennis.player_editions pe
join tennis.players p using (player_id)
join tennis.editions d on d.tournament_id = pe.tournament_id and d.year = pe.year
join tennis.events ev on ev.event_id = pe.event_id;

-- The calendar: each active event (played in its tour's latest or previous
-- season) with the date it usually starts next, 52 weeks on from its last
-- edition (so the same weekday), and its UK broadcaster.
create or replace view public.tennis_calendar with (security_invoker = true) as
with latest as (select tour, max(year) y from tennis.editions group by tour),
last_ed as (
  select distinct on (d.event_id) d.event_id, d.start_date, d.end_date, d.year,
    w.name last_winner, w.slug last_winner_slug
  from tennis.editions d left join tennis.players w on w.player_id = d.winner_id
  order by d.event_id, d.year desc, d.start_date desc
), nxt as (
  select l.*, (l.start_date + 364 * greatest(1, ceil((current_date - l.start_date)::numeric / 364))::int) next_start
  from last_ed l
)
select ev.event_id, ev.tour, ev.slug, ev.name, ev.city, ev.country, ev.level, ev.level_rank, ev.surface,
  n.next_start usual_start, n.next_start + (n.end_date - n.start_date) usual_end,
  n.year last_year, n.last_winner, n.last_winner_slug,
  b.channel, b.free_to_air
from tennis.events ev
join nxt n using (event_id)
join latest lt on lt.tour = ev.tour
left join lateral (
  select b.channel, b.free_to_air from tennis.broadcasters b
  where (b.tour is null or b.tour = ev.tour)
    and (b.event_slug = ev.slug or (b.event_slug is null and (b.levels is null or ev.level = any(b.levels))))
    and extract(year from n.next_start) between b.from_year and coalesce(b.to_year, 9999)
  order by (b.event_slug is not null) desc, b.from_year desc
  limit 1
) b on true
where ev.last_year >= lt.y - 1;

grant select on public.tennis_players, public.tennis_player_splits, public.tennis_player_years, public.tennis_events,
  public.tennis_editions, public.tennis_player_editions, public.tennis_calendar to anon, authenticated;
grant all on all tables in schema tennis to service_role;

select public.tennis_refresh();
