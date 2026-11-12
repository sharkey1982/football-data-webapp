-- UK TV broadcasts: research run 2026-11-12 (scheduled Claude task, following docs/broadcast-research.md).
-- Horizon 2026-11-12 to 2026-12-03, plus newly announced selections; competitions E0, E1, E2, E3, EC, SC0, UCL, UEL, UECL, LC, FAC, D1, I1, SP1, F1.
-- Added: LaLiga 27-30 Nov (9 rows, Premier Sports / Disney+ whole-competition rights, probable);
--   Serie A 27-30 Nov (8 rows, DAZN whole-competition rights, probable; Saturday 14:45-17:15 games left out);
--   SPFL festive period selections 26 Dec - 3 Jan (6 rows, spfl.co.uk).
-- Checked, nothing new: Sky Sports live EFL page (9 Nov 2026) - every pick in the horizon is already stored;
--   Premier League (no new selections since the December announcement).
-- Not found: SPFL selections for 21-29 Nov beyond those stored and 2 Dec beyond Dundee v Celtic;
--   UCL matchday 5 TNT channel allocations (rows stay needs_verification); National League DAZN per-match picks;
--   EFL midweek 24-25 Nov / 1 Dec games beyond the Sky picks (no per-round listing); BBC's Serie A picks;
--   Saturday 14:00-17:15 foreign-league games (UK 3pm window).
-- Left out: St Johnstone v Rangers (SPFL pick for Sun 13 Dec 12:00, 'postponed if Rangers are in the Premier Sports Cup final');
--   the site has it on 13 Jan 2027, so no 13 Dec fixture to attach it to.
-- 23 rows.
select public.ingest_broadcasts($json$
[
 {
  "competition": "SP1",
  "home_team": "Levante UD",
  "away_team": "Racing de Santander",
  "kickoff_date": "2026-11-27",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 12 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Real Betis",
  "away_team": "Rayo Vallecano",
  "kickoff_date": "2026-11-28",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 12 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Elche CF",
  "away_team": "Atletico Madrid",
  "kickoff_date": "2026-11-28",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 12 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Real Madrid",
  "away_team": "Deportivo Alaves",
  "kickoff_date": "2026-11-28",
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
  "source": "LALIGA official: Disney+ exclusively streams all late Saturday LALIGA fixtures in the UK and Ireland (deal to 2027/28); checked 12 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Late-Saturday slot covered by LALIGA's exclusive Disney+ UK rights statement; no fixture-level listing checked."
 },
 {
  "competition": "SP1",
  "home_team": "Valencia CF",
  "away_team": "CA Osasuna",
  "kickoff_date": "2026-11-29",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 12 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Deportivo de La Coruna",
  "away_team": "Barcelona",
  "kickoff_date": "2026-11-29",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 12 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Celta Vigo",
  "away_team": "Villarreal",
  "kickoff_date": "2026-11-29",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 12 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Real Sociedad",
  "away_team": "Sevilla FC",
  "kickoff_date": "2026-11-29",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 12 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "RCD Espanyol",
  "away_team": "Getafe",
  "kickoff_date": "2026-11-30",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 12 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "I1",
  "home_team": "Venezia FC",
  "away_team": "Bologna FC 1909",
  "kickoff_date": "2026-11-27",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "DAZN",
  "channel": "DAZN",
  "streaming_service": "DAZN",
  "access_type": "subscription",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "watch_url": "https://www.dazn.com/en-GB",
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 12 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Inter Milan",
  "away_team": "Genoa CFC",
  "kickoff_date": "2026-11-28",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "DAZN",
  "channel": "DAZN",
  "streaming_service": "DAZN",
  "access_type": "subscription",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "watch_url": "https://www.dazn.com/en-GB",
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 12 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Udinese Calcio",
  "away_team": "ACF Fiorentina",
  "kickoff_date": "2026-11-29",
  "kickoff_time": "11:30",
  "status": "confirmed_broadcast",
  "broadcaster": "DAZN",
  "channel": "DAZN",
  "streaming_service": "DAZN",
  "access_type": "subscription",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "watch_url": "https://www.dazn.com/en-GB",
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 12 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "US Sassuolo Calcio",
  "away_team": "Napoli",
  "kickoff_date": "2026-11-29",
  "kickoff_time": "14:00",
  "status": "confirmed_broadcast",
  "broadcaster": "DAZN",
  "channel": "DAZN",
  "streaming_service": "DAZN",
  "access_type": "subscription",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "watch_url": "https://www.dazn.com/en-GB",
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 12 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Roma",
  "away_team": "AC Monza",
  "kickoff_date": "2026-11-29",
  "kickoff_time": "17:00",
  "status": "confirmed_broadcast",
  "broadcaster": "DAZN",
  "channel": "DAZN",
  "streaming_service": "DAZN",
  "access_type": "subscription",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "watch_url": "https://www.dazn.com/en-GB",
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 12 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Como",
  "away_team": "Juventus",
  "kickoff_date": "2026-11-29",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "DAZN",
  "channel": "DAZN",
  "streaming_service": "DAZN",
  "access_type": "subscription",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "watch_url": "https://www.dazn.com/en-GB",
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 12 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "US Lecce",
  "away_team": "Atalanta",
  "kickoff_date": "2026-11-30",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "broadcaster": "DAZN",
  "channel": "DAZN",
  "streaming_service": "DAZN",
  "access_type": "subscription",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "watch_url": "https://www.dazn.com/en-GB",
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 12 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Cagliari Calcio",
  "away_team": "AC Milan",
  "kickoff_date": "2026-11-30",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "DAZN",
  "channel": "DAZN",
  "streaming_service": "DAZN",
  "access_type": "subscription",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "watch_url": "https://www.dazn.com/en-GB",
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 12 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "SC0",
  "home_team": "Kilmarnock",
  "away_team": "Rangers",
  "kickoff_date": "2026-12-26",
  "kickoff_time": "17:45",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports (channel TBC)",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "SPFL official live broadcast selections, checked 12 Nov 2026",
  "source_url": "https://spfl.co.uk/news/festive-period-tv-selections",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "SC0",
  "home_team": "Hearts",
  "away_team": "Hibernian",
  "kickoff_date": "2026-12-27",
  "kickoff_time": "12:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports (channel TBC)",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "SPFL official live broadcast selections, checked 12 Nov 2026",
  "source_url": "https://spfl.co.uk/news/festive-period-tv-selections",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "SC0",
  "home_team": "Dundee United",
  "away_team": "Celtic",
  "kickoff_date": "2026-12-30",
  "kickoff_time": "19:45",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports (channel TBC)",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "SPFL official live broadcast selections, checked 12 Nov 2026",
  "source_url": "https://spfl.co.uk/news/festive-period-tv-selections",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "SC0",
  "home_team": "Dundee",
  "away_team": "Dundee United",
  "kickoff_date": "2027-01-02",
  "kickoff_time": "12:30",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports (channel TBC)",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "SPFL official live broadcast selections, checked 12 Nov 2026",
  "source_url": "https://spfl.co.uk/news/festive-period-tv-selections",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "SC0",
  "home_team": "Rangers",
  "away_team": "Celtic",
  "kickoff_date": "2027-01-03",
  "kickoff_time": "12:00",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports (channel TBC)",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "SPFL official live broadcast selections, checked 12 Nov 2026",
  "source_url": "https://spfl.co.uk/news/festive-period-tv-selections",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "SC0",
  "home_team": "St Mirren",
  "away_team": "Aberdeen",
  "kickoff_date": "2027-01-03",
  "kickoff_time": "14:30",
  "status": "confirmed_broadcast",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports (channel TBC)",
  "streaming_service": "Premier Sports Player",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "SPFL official live broadcast selections, checked 12 Nov 2026",
  "source_url": "https://spfl.co.uk/news/festive-period-tv-selections",
  "confidence": "confirmed_primary"
 }
]
$json$::jsonb, 'research 2026-11-12');
