-- UK TV broadcasts: research run 2026-10-26 (scheduled Claude task, following docs/broadcast-research.md).
-- Horizon 2026-10-26 to 2026-11-16; competitions E0, E1, E2, E3, EC, SC0, UCL, UEL, UECL, LC, FAC, D1, I1, SP1, F1.
-- Added: League One / League Two 27 Oct games now on Sky Sports' live EFL page (6), Hearts v Rangers 28 Oct (Sky, SPFL),
--   FA Cup first round TV picks (6 rows on 5 site fixtures), LaLiga 30 Oct - 8 Nov (18, Premier Sports / Disney+ rights, probable).
-- Not found / not placed: FA Cup R1 Cray Wanderers v Stockport, Wimborne Town v Crawley Town, Plymouth Parkway v Berkhamsted
--   (no site fixture); National League DAZN picks (dazn.com refuses fetches); other SPFL selections 28 Oct - 8 Nov;
--   EFL 3-4 Nov midweek games beyond the two Sky picks (no per-round listing); LaLiga Saturday 15:15 games (UK 3pm window);
--   Bundesliga / Serie A / Ligue 1 Saturday afternoon games (UK 14:45-17:15 window).
-- Kick-off note: The FA lists Stafford Rangers v Grimsby on Sunday 8 Nov 12:00; the site has Saturday 7 Nov.
-- 31 rows.
select public.ingest_broadcasts($json$
[
 {
  "competition": "E2",
  "home_team": "Leicester",
  "away_team": "Wigan",
  "kickoff_date": "2026-10-27",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports / Sky Sports+",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "Sky Sports live EFL 2026/27 fixtures page (updated 23 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.skysports.com/football/news/11688/13550693/live-efl-2026-27-fixtures-on-sky-sports-championship-league-one-league-two-games-dates-kick-off-times",
  "confidence": "confirmed_secondary",
  "availability_notes": "Named live on Sky Sports' own EFL schedule; the page does not say which channel (main channel or Sky Sports+)."
 },
 {
  "competition": "E2",
  "home_team": "Luton",
  "away_team": "Doncaster",
  "kickoff_date": "2026-10-27",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports / Sky Sports+",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "Sky Sports live EFL 2026/27 fixtures page (updated 23 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.skysports.com/football/news/11688/13550693/live-efl-2026-27-fixtures-on-sky-sports-championship-league-one-league-two-games-dates-kick-off-times",
  "confidence": "confirmed_secondary",
  "availability_notes": "Named live on Sky Sports' own EFL schedule; the page does not say which channel (main channel or Sky Sports+)."
 },
 {
  "competition": "E2",
  "home_team": "Milton Keynes Dons",
  "away_team": "Bromley",
  "kickoff_date": "2026-10-27",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports / Sky Sports+",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "Sky Sports live EFL 2026/27 fixtures page (updated 23 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.skysports.com/football/news/11688/13550693/live-efl-2026-27-fixtures-on-sky-sports-championship-league-one-league-two-games-dates-kick-off-times",
  "confidence": "confirmed_secondary",
  "availability_notes": "Named live on Sky Sports' own EFL schedule; the page does not say which channel (main channel or Sky Sports+)."
 },
 {
  "competition": "E2",
  "home_team": "Oxford",
  "away_team": "Stockport",
  "kickoff_date": "2026-10-27",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports / Sky Sports+",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "Sky Sports live EFL 2026/27 fixtures page (updated 23 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.skysports.com/football/news/11688/13550693/live-efl-2026-27-fixtures-on-sky-sports-championship-league-one-league-two-games-dates-kick-off-times",
  "confidence": "confirmed_secondary",
  "availability_notes": "Named live on Sky Sports' own EFL schedule; the page does not say which channel (main channel or Sky Sports+)."
 },
 {
  "competition": "E2",
  "home_team": "Sheffield Wednesday",
  "away_team": "Cambridge",
  "kickoff_date": "2026-10-27",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports / Sky Sports+",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "Sky Sports live EFL 2026/27 fixtures page (updated 23 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.skysports.com/football/news/11688/13550693/live-efl-2026-27-fixtures-on-sky-sports-championship-league-one-league-two-games-dates-kick-off-times",
  "confidence": "confirmed_secondary",
  "availability_notes": "Named live on Sky Sports' own EFL schedule; the page does not say which channel (main channel or Sky Sports+)."
 },
 {
  "competition": "E3",
  "home_team": "Barnet",
  "away_team": "York",
  "kickoff_date": "2026-10-27",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports / Sky Sports+",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "Sky Sports live EFL 2026/27 fixtures page (updated 23 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.skysports.com/football/news/11688/13550693/live-efl-2026-27-fixtures-on-sky-sports-championship-league-one-league-two-games-dates-kick-off-times",
  "confidence": "confirmed_secondary",
  "availability_notes": "Named live on Sky Sports' own EFL schedule; the page does not say which channel (main channel or Sky Sports+)."
 },
 {
  "competition": "SC0",
  "home_team": "Hearts",
  "away_team": "Rangers",
  "kickoff_date": "2026-10-28",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "SPFL official site match banner: Live on Sky Sports, Wednesday October 28, Heart of Midlothian v Rangers 8.00pm; checked 26 Oct 2026",
  "source_url": "https://spfl.co.uk/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Oxford City",
  "away_team": "Leicester",
  "kickoff_date": "2026-11-06",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "TNT Sports",
  "channel": "TNT Sports 1",
  "streaming_service": "HBO Max",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "The FA: TV picks confirmed for Emirates FA Cup First Round (22 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.thefa.com/news/2026/oct/22/emirates-fa-cup-first-round-tv-picks-20262210",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Altrincham",
  "away_team": "Notts County",
  "kickoff_date": "2026-11-07",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "broadcaster": "TNT Sports",
  "channel": "TNT Sports 1",
  "streaming_service": "HBO Max",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "The FA: TV picks confirmed for Emirates FA Cup First Round (22 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.thefa.com/news/2026/oct/22/emirates-fa-cup-first-round-tv-picks-20262210",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Altrincham",
  "away_team": "Notts County",
  "kickoff_date": "2026-11-07",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "broadcaster": "BBC",
  "channel": "BBC Two",
  "streaming_service": "BBC iPlayer",
  "access_type": "free",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "The FA: TV picks confirmed for Emirates FA Cup First Round (22 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.thefa.com/news/2026/oct/22/emirates-fa-cup-first-round-tv-picks-20262210",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Peterborough",
  "away_team": "Reading",
  "kickoff_date": "2026-11-07",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "broadcaster": "TNT Sports",
  "channel": "TNT Sports 1",
  "streaming_service": "HBO Max",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "The FA: TV picks confirmed for Emirates FA Cup First Round (22 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.thefa.com/news/2026/oct/22/emirates-fa-cup-first-round-tv-picks-20262210",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Stafford Rangers",
  "away_team": "Grimsby",
  "kickoff_date": "2026-11-08",
  "kickoff_time": "12:00",
  "status": "confirmed_broadcast",
  "broadcaster": "TNT Sports",
  "channel": "TNT Sports 1",
  "streaming_service": "HBO Max",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "The FA: TV picks confirmed for Emirates FA Cup First Round (22 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.thefa.com/news/2026/oct/22/emirates-fa-cup-first-round-tv-picks-20262210",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Oldham",
  "away_team": "Sheffield Wednesday",
  "kickoff_date": "2026-11-08",
  "kickoff_time": "17:15",
  "status": "confirmed_broadcast",
  "broadcaster": "TNT Sports",
  "channel": "TNT Sports 1",
  "streaming_service": "HBO Max",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "The FA: TV picks confirmed for Emirates FA Cup First Round (22 Oct 2026), checked 26 Oct 2026",
  "source_url": "https://www.thefa.com/news/2026/oct/22/emirates-fa-cup-first-round-tv-picks-20262210",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "SP1",
  "home_team": "Villarreal",
  "away_team": "RCD Espanyol",
  "kickoff_date": "2026-10-30",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Levante UD",
  "away_team": "Atletico Madrid",
  "kickoff_date": "2026-10-31",
  "kickoff_time": "13:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Real Betis",
  "away_team": "Malaga CF",
  "kickoff_date": "2026-10-31",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Barcelona",
  "away_team": "Deportivo Alaves",
  "kickoff_date": "2026-10-31",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Disney+",
  "channel": "Disney+",
  "streaming_service": "Disney+",
  "access_type": "subscription",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Disney+ exclusively streams all late Saturday LALIGA fixtures in the UK and Ireland (deal to 2027/28); checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Late-Saturday slot covered by LALIGA's exclusive Disney+ UK rights statement; no fixture-level listing checked."
 },
 {
  "competition": "SP1",
  "home_team": "Getafe",
  "away_team": "Sevilla FC",
  "kickoff_date": "2026-11-01",
  "kickoff_time": "13:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Racing de Santander",
  "away_team": "Real Madrid",
  "kickoff_date": "2026-11-01",
  "kickoff_time": "15:15",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Elche CF",
  "away_team": "Valencia CF",
  "kickoff_date": "2026-11-01",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Athletic Bilbao",
  "away_team": "Real Sociedad",
  "kickoff_date": "2026-11-01",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Deportivo de La Coruna",
  "away_team": "CA Osasuna",
  "kickoff_date": "2026-11-02",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Sevilla FC",
  "away_team": "Deportivo Alaves",
  "kickoff_date": "2026-11-06",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Malaga CF",
  "away_team": "Racing de Santander",
  "kickoff_date": "2026-11-07",
  "kickoff_time": "13:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "CA Osasuna",
  "away_team": "Athletic Bilbao",
  "kickoff_date": "2026-11-07",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Valencia CF",
  "away_team": "Real Madrid",
  "kickoff_date": "2026-11-07",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Disney+",
  "channel": "Disney+",
  "streaming_service": "Disney+",
  "access_type": "subscription",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Disney+ exclusively streams all late Saturday LALIGA fixtures in the UK and Ireland (deal to 2027/28); checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Late-Saturday slot covered by LALIGA's exclusive Disney+ UK rights statement; no fixture-level listing checked."
 },
 {
  "competition": "SP1",
  "home_team": "Elche CF",
  "away_team": "Real Betis",
  "kickoff_date": "2026-11-08",
  "kickoff_time": "13:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Real Sociedad",
  "away_team": "Rayo Vallecano",
  "kickoff_date": "2026-11-08",
  "kickoff_time": "15:15",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Celta Vigo",
  "away_team": "Levante UD",
  "kickoff_date": "2026-11-08",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Villarreal",
  "away_team": "Getafe",
  "kickoff_date": "2026-11-08",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Atletico Madrid",
  "away_team": "Barcelona",
  "kickoff_date": "2026-11-08",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Oct 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 }
]
$json$::jsonb, 'research 2026-10-26');
