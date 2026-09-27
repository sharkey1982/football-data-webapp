-- ============================================================================
-- Teams and football-data.co.uk aliases for the European league history load
-- (docs/history-backfill.md, "European leagues")
--
-- Every club name in the staged files (historic_source_rows_europe: big five
-- 2011/12-2020/21, P1/B1/T1/G1/N1/SC0 and the eight all-seasons leagues
-- 2016(/17)-2024(/25)) without a football-data.co.uk alias was checked against
-- every existing team (all countries, all sources): each is either a new team
-- or a new spelling of an existing one (listed below).
-- For the ten main-file leagues the names were also aligned with
-- engsoccerdata's fixtures (same league and season, date within 3 days, same
-- score): one to one, except that engsoccerdata files Gazelec Ajaccio's
-- 2015/16 Ligue 1 season under "AC Ajaccio" (football-data.co.uk is right:
-- AC Ajaccio were in Ligue 2 that season).
--
-- New spellings of existing teams:
--   * "U Craiova" (Romania to Feb 2021, then "Univ. Craiova")  -> CS Universitatea Craiova
--   * "Ham-Kam" (Norway 2022-Sep 2023, then "HamKam")          -> HamKam
--   * "Gornik Z." (Poland to Mar 2023, then "Gornik Zabrze")    -> Gornik Zabrze
--   * "Erzurum BB" (Turkey 2018/19, 2020/21)                    -> Erzurumspor FK
--     (BB Erzurumspor, renamed Erzurumspor FK in 2022; existing alias "Erzurumspor")
--   * "Waasland-Beveren" (Belgium 2016/17-2020/21)              -> SK Beveren
--     (renamed SK Beveren in 2022; existing alias "Beveren")
--   * "Viitorul Constanta" (Romania 2016/17-2020/21)            -> Farul Constanta: in
--     the 2021 merger Viitorul's club took the Farul name and kept its
--     Liga I place, so the league entity is continuous (judgement call).
-- Same name, different clubs (kept apart):
--   * "Ajaccio GFCO" = Gazelec Ajaccio, not AC Ajaccio ("Ajaccio").
--   * "U Craiova 1948" = FC U Craiova 1948 (Liga I 2021-2024), not CS
--     Universitatea Craiova.
--   * "Gaziantepspor" (dissolved 2020) is not Gaziantep FK ("Gaziantep").
--   * "Lausanne Ouchy" = Stade Lausanne-Ouchy, not Lausanne-Sport ("Lausanne").
--   * "Zaglebie Sosnowiec" is not Zaglebie Lubin ("Zaglebie").
--   * "Poli Timisoara" = ACS Poli Timisoara (2012-2021), slug
--     'acs-poli-timisoara' leaves 'politehnica-timisoara' free.
--   * "Aves" = CD Aves (dissolved 2020), not AVS Futebol SAD ("AVS").
--   * "Belenenses" (Primeira Liga 2016/17-2020/21) = the SAD that kept the
--     league place after the 2018 split from CF Os Belenenses (later B-SAD).
-- "Ruch" (2016/17) and "Ruch Chorzow" (2023/24) are the same club.
-- Clubs that appear only in promotion/relegation play-offs (excluded on
-- import) get no team: Neustadt, Kongsvinger, Moss, Brage, Landskrona,
-- Aarau, Schaffhausen.
--
-- canonical_name follows the existing teams (plain short name), display_name
-- the full name. Idempotent: inserts skip existing slugs / aliases.
-- ============================================================================

insert into public.teams (country_id, canonical_name, slug, display_name)
select c.country_id, v.canonical_name, v.slug, v.display_name
from (values
  -- Austria
  ('Austria', 'Austria Klagenfurt', 'austria-klagenfurt', 'SK Austria Klagenfurt'),
  ('Austria', 'Admira', 'admira', 'FC Admira Wacker'),
  ('Austria', 'Mattersburg', 'mattersburg', 'SV Mattersburg'),
  ('Austria', 'St. Polten', 'st-polten', 'SKN St. Pölten'),
  ('Austria', 'Wacker Innsbruck', 'wacker-innsbruck', 'FC Wacker Innsbruck'),
  -- Belgium
  ('Belgium', 'Beerschot', 'beerschot', 'K Beerschot VA'),
  ('Belgium', 'Eupen', 'eupen', 'KAS Eupen'),
  ('Belgium', 'Lokeren', 'lokeren', 'KSC Lokeren'),
  ('Belgium', 'Mouscron', 'mouscron', 'Royal Excel Mouscron'),
  ('Belgium', 'Oostende', 'oostende', 'KV Oostende'),
  ('Belgium', 'RWDM', 'rwdm', 'RWD Molenbeek'),
  ('Belgium', 'Seraing', 'seraing', 'RFC Seraing'),
  -- Germany
  ('Germany', 'Eintracht Braunschweig', 'eintracht-braunschweig', 'Eintracht Braunschweig'),
  ('Germany', 'Fortuna Dusseldorf', 'fortuna-dusseldorf', 'Fortuna Düsseldorf'),
  ('Germany', 'Hannover', 'hannover-96', 'Hannover 96'),
  ('Germany', 'Ingolstadt', 'ingolstadt', 'FC Ingolstadt 04'),
  ('Germany', 'Kaiserslautern', 'kaiserslautern', '1. FC Kaiserslautern'),
  ('Germany', 'Nurnberg', 'nurnberg', '1. FC Nürnberg'),
  -- Denmark
  ('Denmark', 'AaB', 'aalborg', 'AaB'),
  ('Denmark', 'Esbjerg', 'esbjerg', 'Esbjerg fB'),
  ('Denmark', 'Helsingor', 'helsingor', 'FC Helsingør'),
  ('Denmark', 'Hobro', 'hobro', 'Hobro IK'),
  ('Denmark', 'Hvidovre', 'hvidovre', 'Hvidovre IF'),
  ('Denmark', 'Vendsyssel', 'vendsyssel', 'Vendsyssel FF'),
  -- France
  ('France', 'Gazelec Ajaccio', 'gazelec-ajaccio', 'Gazélec Ajaccio'),
  ('France', 'Amiens', 'amiens', 'Amiens SC'),
  ('France', 'Bastia', 'bastia', 'SC Bastia'),
  ('France', 'Caen', 'caen', 'Stade Malherbe Caen'),
  ('France', 'Dijon', 'dijon', 'Dijon FCO'),
  ('France', 'Evian Thonon Gaillard', 'evian-thonon-gaillard', 'Évian Thonon Gaillard'),
  ('France', 'Guingamp', 'guingamp', 'En Avant Guingamp'),
  ('France', 'Nancy', 'nancy', 'AS Nancy-Lorraine'),
  ('France', 'Nimes', 'nimes', 'Nîmes Olympique'),
  ('France', 'Sochaux', 'sochaux', 'FC Sochaux-Montbéliard'),
  ('France', 'Valenciennes', 'valenciennes', 'Valenciennes FC'),
  -- Finland
  ('Finland', 'Ekenas', 'ekenas', 'Ekenäs IF'),
  ('Finland', 'HIFK', 'hifk', 'HIFK Helsinki'),
  ('Finland', 'Honka', 'honka', 'FC Honka'),
  ('Finland', 'JJK', 'jjk', 'JJK Jyväskylä'),
  ('Finland', 'KPV', 'kpv', 'KPV Kokkola'),
  ('Finland', 'PK-35 Vantaa', 'pk-35-vantaa', 'PK-35 Vantaa'),
  ('Finland', 'PS Kemi', 'ps-kemi', 'PS Kemi'),
  ('Finland', 'RoPS', 'rops', 'RoPS Rovaniemi'),
  -- Greece
  ('Greece', 'Apollon Smyrnis', 'apollon-smyrnis', 'Apollon Smyrnis'),
  ('Greece', 'Athens Kallithea', 'athens-kallithea', 'Athens Kallithea'),
  ('Greece', 'PAS Giannina', 'pas-giannina', 'PAS Giannina'),
  ('Greece', 'Ionikos', 'ionikos', 'Ionikos'),
  ('Greece', 'Kerkyra', 'kerkyra', 'PAE Kerkyra'),
  ('Greece', 'Lamia', 'lamia', 'PAS Lamia 1964'),
  ('Greece', 'Panionios', 'panionios', 'Panionios'),
  ('Greece', 'Platanias', 'platanias', 'Platanias'),
  ('Greece', 'Veria', 'veria', 'Veria'),
  ('Greece', 'Xanthi', 'xanthi', 'Xanthi FC'),
  -- Italy
  ('Italy', 'Benevento', 'benevento', 'Benevento'),
  ('Italy', 'Brescia', 'brescia', 'Brescia'),
  ('Italy', 'Carpi', 'carpi', 'Carpi'),
  ('Italy', 'Catania', 'catania', 'Catania'),
  ('Italy', 'Cesena', 'cesena', 'Cesena'),
  ('Italy', 'Chievo', 'chievo', 'Chievo Verona'),
  ('Italy', 'Crotone', 'crotone', 'Crotone'),
  ('Italy', 'Livorno', 'livorno', 'Livorno'),
  ('Italy', 'Novara', 'novara', 'Novara'),
  ('Italy', 'Palermo', 'palermo', 'Palermo'),
  ('Italy', 'Pescara', 'pescara', 'Pescara'),
  ('Italy', 'Siena', 'siena', 'AC Siena'),
  ('Italy', 'SPAL', 'spal', 'SPAL'),
  -- Netherlands
  ('Netherlands', 'Almere City', 'almere-city', 'Almere City'),
  ('Netherlands', 'Emmen', 'emmen', 'FC Emmen'),
  ('Netherlands', 'De Graafschap', 'de-graafschap', 'De Graafschap'),
  ('Netherlands', 'Roda JC', 'roda-jc', 'Roda JC Kerkrade'),
  ('Netherlands', 'Vitesse', 'vitesse', 'Vitesse'),
  ('Netherlands', 'VVV-Venlo', 'vvv-venlo', 'VVV-Venlo'),
  ('Netherlands', 'RKC Waalwijk', 'rkc-waalwijk', 'RKC Waalwijk'),
  -- Norway
  ('Norway', 'Jerv', 'jerv', 'FK Jerv'),
  ('Norway', 'Mjondalen', 'mjondalen', 'Mjøndalen IF'),
  ('Norway', 'Odd', 'odd', 'Odds BK'),
  ('Norway', 'Ranheim', 'ranheim', 'Ranheim Fotball'),
  ('Norway', 'Sogndal', 'sogndal', 'Sogndal Fotball'),
  ('Norway', 'Stabaek', 'stabaek', 'Stabæk Fotball'),
  -- Portugal
  ('Portugal', 'Aves', 'desportivo-aves', 'CD Aves'),
  ('Portugal', 'Belenenses SAD', 'belenenses-sad', 'Belenenses SAD'),
  ('Portugal', 'Boavista', 'boavista', 'Boavista'),
  ('Portugal', 'Chaves', 'chaves', 'GD Chaves'),
  ('Portugal', 'Farense', 'farense', 'SC Farense'),
  ('Portugal', 'Feirense', 'feirense', 'CD Feirense'),
  ('Portugal', 'Pacos Ferreira', 'pacos-ferreira', 'Paços de Ferreira'),
  ('Portugal', 'Portimonense', 'portimonense', 'Portimonense'),
  ('Portugal', 'Vitoria Setubal', 'vitoria-setubal', 'Vitória de Setúbal'),
  ('Portugal', 'Vizela', 'vizela', 'FC Vizela'),
  -- Poland
  ('Poland', 'Gornik Leczna', 'gornik-leczna', 'Górnik Łęczna'),
  ('Poland', 'Miedz Legnica', 'miedz-legnica', 'Miedź Legnica'),
  ('Poland', 'LKS Lodz', 'lks-lodz', 'ŁKS Łódź'),
  ('Poland', 'Podbeskidzie', 'podbeskidzie', 'Podbeskidzie Bielsko-Biała'),
  ('Poland', 'Puszcza Niepolomice', 'puszcza-niepolomice', 'Puszcza Niepołomice'),
  ('Poland', 'Ruch Chorzow', 'ruch-chorzow', 'Ruch Chorzów'),
  ('Poland', 'Sandecja', 'sandecja', 'Sandecja Nowy Sącz'),
  ('Poland', 'Stal Mielec', 'stal-mielec', 'Stal Mielec'),
  ('Poland', 'Warta Poznan', 'warta-poznan', 'Warta Poznań'),
  ('Poland', 'Zaglebie Sosnowiec', 'zaglebie-sosnowiec', 'Zagłębie Sosnowiec'),
  -- Romania
  ('Romania', 'Academica Clinceni', 'academica-clinceni', 'Academica Clinceni'),
  ('Romania', 'Astra Giurgiu', 'astra-giurgiu', 'Astra Giurgiu'),
  ('Romania', 'Dunarea Calarasi', 'dunarea-calarasi', 'Dunărea Călărași'),
  ('Romania', 'Chindia Targoviste', 'chindia-targoviste', 'Chindia Târgoviște'),
  ('Romania', 'Concordia Chiajna', 'concordia-chiajna', 'Concordia Chiajna'),
  ('Romania', 'Daco-Getica Bucuresti', 'daco-getica', 'Daco-Getica București'),
  ('Romania', 'Gaz Metan Medias', 'gaz-metan-medias', 'Gaz Metan Mediaș'),
  ('Romania', 'Gloria Buzau', 'gloria-buzau', 'Gloria Buzău'),
  ('Romania', 'Mioveni', 'mioveni', 'CS Mioveni'),
  ('Romania', 'Pandurii', 'pandurii', 'Pandurii Târgu Jiu'),
  ('Romania', 'Poli Iasi', 'poli-iasi', 'Politehnica Iași'),
  ('Romania', 'ACS Poli Timisoara', 'acs-poli-timisoara', 'ACS Poli Timișoara'),
  ('Romania', 'ASA Targu Mures', 'asa-targu-mures', 'ASA Târgu Mureș'),
  ('Romania', 'FC U Craiova 1948', 'fc-u-craiova-1948', 'FC U Craiova 1948'),
  -- Scotland
  ('Scotland', 'Hamilton', 'hamilton-academical', 'Hamilton Academical'),
  ('Scotland', 'Inverness CT', 'inverness-ct', 'Inverness Caledonian Thistle'),
  ('Scotland', 'Partick Thistle', 'partick-thistle', 'Partick Thistle'),
  ('Scotland', 'Ross County', 'ross-county', 'Ross County'),
  -- Spain
  ('Spain', 'Cordoba', 'cordoba', 'Córdoba CF'),
  ('Spain', 'Eibar', 'eibar', 'SD Eibar'),
  ('Spain', 'Huesca', 'huesca', 'SD Huesca'),
  ('Spain', 'Sporting Gijon', 'sporting-gijon', 'Sporting Gijón'),
  ('Spain', 'Zaragoza', 'real-zaragoza', 'Real Zaragoza'),
  -- Sweden
  ('Sweden', 'AFC Eskilstuna', 'afc-eskilstuna', 'AFC Eskilstuna'),
  ('Sweden', 'Dalkurd', 'dalkurd', 'Dalkurd FF'),
  ('Sweden', 'Falkenberg', 'falkenberg', 'Falkenbergs FF'),
  ('Sweden', 'Gefle', 'gefle', 'Gefle IF'),
  ('Sweden', 'Helsingborg', 'helsingborg', 'Helsingborgs IF'),
  ('Sweden', 'Jonkopings Sodra', 'jonkopings-sodra', 'Jönköpings Södra'),
  ('Sweden', 'Orebro', 'orebro', 'Örebro SK'),
  ('Sweden', 'Ostersund', 'ostersund', 'Östersunds FK'),
  ('Sweden', 'GIF Sundsvall', 'gif-sundsvall', 'GIF Sundsvall'),
  ('Sweden', 'Trelleborg', 'trelleborg', 'Trelleborgs FF'),
  ('Sweden', 'Varberg', 'varberg', 'Varbergs BoIS'),
  -- Switzerland
  ('Switzerland', 'Stade Lausanne-Ouchy', 'stade-lausanne-ouchy', 'Stade Lausanne-Ouchy'),
  ('Switzerland', 'Neuchatel Xamax', 'neuchatel-xamax', 'Neuchâtel Xamax'),
  ('Switzerland', 'Yverdon', 'yverdon', 'Yverdon-Sport'),
  -- Turkey
  ('Turkey', 'Adana Demirspor', 'adana-demirspor', 'Adana Demirspor'),
  ('Turkey', 'Adanaspor', 'adanaspor', 'Adanaspor'),
  ('Turkey', 'Akhisarspor', 'akhisarspor', 'Akhisar Belediyespor'),
  ('Turkey', 'Altay', 'altay', 'Altay'),
  ('Turkey', 'Ankaragucu', 'ankaragucu', 'MKE Ankaragücü'),
  ('Turkey', 'Bodrumspor', 'bodrumspor', 'Bodrum FK'),
  ('Turkey', 'Bursaspor', 'bursaspor', 'Bursaspor'),
  ('Turkey', 'Denizlispor', 'denizlispor', 'Denizlispor'),
  ('Turkey', 'Gaziantepspor', 'gaziantepspor', 'Gaziantepspor'),
  ('Turkey', 'Giresunspor', 'giresunspor', 'Giresunspor'),
  ('Turkey', 'Hatayspor', 'hatayspor', 'Hatayspor'),
  ('Turkey', 'Istanbulspor', 'istanbulspor', 'İstanbulspor'),
  ('Turkey', 'Karabukspor', 'karabukspor', 'Kardemir Karabükspor'),
  ('Turkey', 'Osmanlispor', 'osmanlispor', 'Osmanlıspor'),
  ('Turkey', 'Pendikspor', 'pendikspor', 'Pendikspor'),
  ('Turkey', 'Sivasspor', 'sivasspor', 'Sivasspor'),
  ('Turkey', 'Umraniyespor', 'umraniyespor', 'Ümraniyespor'),
  ('Turkey', 'Yeni Malatyaspor', 'yeni-malatyaspor', 'Yeni Malatyaspor')
) v(country, canonical_name, slug, display_name)
join public.countries c on c.name = v.country
where not exists (select 1 from public.teams t where t.slug = v.slug);

insert into public.team_aliases (team_id, source_name, raw_name)
select t.team_id, 'football-data.co.uk', v.raw_name
from (values
  ('A. Klagenfurt', 'austria-klagenfurt'), ('Admira', 'admira'), ('Mattersburg', 'mattersburg'),
  ('St. Polten', 'st-polten'), ('Wacker Innsbruck', 'wacker-innsbruck'),
  ('Beerschot VA', 'beerschot'), ('Eupen', 'eupen'), ('Lokeren', 'lokeren'), ('Mouscron', 'mouscron'),
  ('Oostende', 'oostende'), ('RWD Molenbeek', 'rwdm'), ('Seraing', 'seraing'), ('Waasland-Beveren', 'beveren'),
  ('Braunschweig', 'eintracht-braunschweig'), ('Fortuna Dusseldorf', 'fortuna-dusseldorf'), ('Hannover', 'hannover-96'),
  ('Ingolstadt', 'ingolstadt'), ('Kaiserslautern', 'kaiserslautern'), ('Nurnberg', 'nurnberg'),
  ('Aalborg', 'aalborg'), ('Esbjerg', 'esbjerg'), ('Helsingor', 'helsingor'), ('Hobro', 'hobro'),
  ('Hvidovre IF', 'hvidovre'), ('Vendsyssel', 'vendsyssel'),
  ('Ajaccio GFCO', 'gazelec-ajaccio'), ('Amiens', 'amiens'), ('Bastia', 'bastia'), ('Caen', 'caen'), ('Dijon', 'dijon'),
  ('Evian Thonon Gaillard', 'evian-thonon-gaillard'), ('Guingamp', 'guingamp'), ('Nancy', 'nancy'), ('Nimes', 'nimes'),
  ('Sochaux', 'sochaux'), ('Valenciennes', 'valenciennes'),
  ('Ekenas', 'ekenas'), ('HIFK', 'hifk'), ('Honka', 'honka'), ('JJK Jyvaskyla', 'jjk'), ('KPV Kokkola', 'kpv'),
  ('PK-35 Vantaa', 'pk-35-vantaa'), ('PS Kemi', 'ps-kemi'), ('Rovaniemi', 'rops'),
  ('Apollon', 'apollon-smyrnis'), ('Athens Kallithea', 'athens-kallithea'), ('Giannina', 'pas-giannina'),
  ('Ionikos', 'ionikos'), ('Kerkyra', 'kerkyra'), ('Lamia', 'lamia'), ('Panionios', 'panionios'),
  ('Platanias', 'platanias'), ('Veria', 'veria'), ('Xanthi', 'xanthi'),
  ('Benevento', 'benevento'), ('Brescia', 'brescia'), ('Carpi', 'carpi'), ('Catania', 'catania'), ('Cesena', 'cesena'),
  ('Chievo', 'chievo'), ('Crotone', 'crotone'), ('Livorno', 'livorno'), ('Novara', 'novara'), ('Palermo', 'palermo'),
  ('Pescara', 'pescara'), ('Siena', 'siena'), ('Spal', 'spal'),
  ('Almere City', 'almere-city'), ('FC Emmen', 'emmen'), ('Graafschap', 'de-graafschap'), ('Roda', 'roda-jc'),
  ('Vitesse', 'vitesse'), ('VVV Venlo', 'vvv-venlo'), ('Waalwijk', 'rkc-waalwijk'),
  ('Ham-Kam', 'hamkam'), ('Jerv', 'jerv'), ('Mjondalen', 'mjondalen'), ('Odd', 'odd'), ('Ranheim', 'ranheim'),
  ('Sogndal', 'sogndal'), ('Stabaek', 'stabaek'),
  ('Aves', 'desportivo-aves'), ('Belenenses', 'belenenses-sad'), ('Boavista', 'boavista'), ('Chaves', 'chaves'),
  ('Farense', 'farense'), ('Feirense', 'feirense'), ('Pacos Ferreira', 'pacos-ferreira'),
  ('Portimonense', 'portimonense'), ('Setubal', 'vitoria-setubal'), ('Vizela', 'vizela'),
  ('Gornik Z.', 'gornik-zabrze'), ('Leczna', 'gornik-leczna'), ('Legnica', 'miedz-legnica'), ('LKS Lodz', 'lks-lodz'),
  ('Podbeskidzie', 'podbeskidzie'), ('Puszcza', 'puszcza-niepolomice'), ('Ruch', 'ruch-chorzow'),
  ('Ruch Chorzow', 'ruch-chorzow'), ('Sandecja Nowy S.', 'sandecja'), ('Stal Mielec', 'stal-mielec'),
  ('Warta Poznan', 'warta-poznan'), ('Zaglebie Sosnowiec', 'zaglebie-sosnowiec'),
  ('Academica Clinceni', 'academica-clinceni'), ('Astra', 'astra-giurgiu'), ('Calarasi', 'dunarea-calarasi'),
  ('Chindia Targoviste', 'chindia-targoviste'), ('Concordia', 'concordia-chiajna'),
  ('Daco-Getica Bucuresti', 'daco-getica'), ('Gaz Metan Medias', 'gaz-metan-medias'), ('Gloria Buzau', 'gloria-buzau'),
  ('Mioveni', 'mioveni'), ('Pandurii', 'pandurii'), ('Poli Iasi', 'poli-iasi'), ('Poli Timisoara', 'acs-poli-timisoara'),
  ('Targu Mures', 'asa-targu-mures'), ('U Craiova', 'universitatea-craiova'), ('U Craiova 1948', 'fc-u-craiova-1948'),
  ('Viitorul Constanta', 'farul-constanta'),
  ('Hamilton', 'hamilton-academical'), ('Inverness C', 'inverness-ct'), ('Partick', 'partick-thistle'),
  ('Ross County', 'ross-county'),
  ('Cordoba', 'cordoba'), ('Eibar', 'eibar'), ('Huesca', 'huesca'), ('Sp Gijon', 'sporting-gijon'),
  ('Zaragoza', 'real-zaragoza'),
  ('AFC Eskilstuna', 'afc-eskilstuna'), ('Dalkurd', 'dalkurd'), ('Falkenbergs', 'falkenberg'), ('Gefle', 'gefle'),
  ('Helsingborg', 'helsingborg'), ('Jonkopings', 'jonkopings-sodra'), ('Orebro', 'orebro'),
  ('Ostersunds', 'ostersund'), ('Sundsvall', 'gif-sundsvall'), ('Trelleborgs', 'trelleborg'), ('Varberg', 'varberg'),
  ('Lausanne Ouchy', 'stade-lausanne-ouchy'), ('Xamax', 'neuchatel-xamax'), ('Yverdon', 'yverdon'),
  ('Ad. Demirspor', 'adana-demirspor'), ('Adanaspor', 'adanaspor'), ('Akhisar Belediyespor', 'akhisarspor'),
  ('Altay', 'altay'), ('Ankaragucu', 'ankaragucu'), ('Bodrumspor', 'bodrumspor'), ('Bursaspor', 'bursaspor'),
  ('Denizlispor', 'denizlispor'), ('Erzurum BB', 'erzurumspor'), ('Gaziantepspor', 'gaziantepspor'),
  ('Giresunspor', 'giresunspor'), ('Hatayspor', 'hatayspor'), ('Istanbulspor', 'istanbulspor'),
  ('Karabukspor', 'karabukspor'), ('Osmanlispor', 'osmanlispor'), ('Pendikspor', 'pendikspor'),
  ('Sivasspor', 'sivasspor'), ('Umraniyespor', 'umraniyespor'), ('Yeni Malatyaspor', 'yeni-malatyaspor')
) v(raw_name, slug)
join public.teams t on t.slug = v.slug
on conflict (source_name, raw_name) do nothing;
