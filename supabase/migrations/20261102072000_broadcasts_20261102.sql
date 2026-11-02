-- UK TV broadcasts: research run 2026-11-02 (scheduled Claude task, following docs/broadcast-research.md).
-- Horizon 2026-11-02 to 2026-11-23, plus newly announced selections; competitions E0, E1, E2, E3, EC, SC0, UCL, UEL, UECL, LC, FAC, D1, I1, SP1, F1.
-- Added: LaLiga 20-23 Nov (9 rows, Premier Sports / Disney+ whole-competition rights, probable).
-- Checked, nothing new: Sky Sports live EFL page (updated 31 Oct 2026) - every pick through 9 Jan 2027 is already stored;
--   Premier League (next selections, matchweeks 21-23, due w/c 30 Nov).
-- Not found: SPFL selections for 7-8 and 21 Nov (spfl.co.uk and Sky fixture pages name no broadcaster; Celtic v Kilmarnock 8 Nov 16:00 still open);
--   UCL matchday 4 TNT channel allocations (no 2026/27 primary TNT page reachable; rows stay needs_verification);
--   National League DAZN per-match picks; FA Cup first round games beyond the TV picks already stored (second round picks not yet announced);
--   EFL 3-4 Nov midweek games beyond the Sky picks (no per-round listing); Saturday 14:00-17:15 foreign-league games (UK 3pm window).
-- 9 rows.
select public.ingest_broadcasts($json$
[
 {
  "competition": "SP1",
  "home_team": "Athletic Bilbao",
  "away_team": "RCD Espanyol",
  "kickoff_date": "2026-11-20",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 2 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Deportivo Alaves",
  "away_team": "Deportivo de La Coruna",
  "kickoff_date": "2026-11-21",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 2 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Sevilla FC",
  "away_team": "Real Betis",
  "kickoff_date": "2026-11-21",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 2 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Real Madrid",
  "away_team": "Celta Vigo",
  "kickoff_date": "2026-11-21",
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
  "source": "LALIGA official: Disney+ exclusively streams all late Saturday LALIGA fixtures in the UK and Ireland (deal to 2027/28); checked 2 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Late-Saturday slot covered by LALIGA's exclusive Disney+ UK rights statement; no fixture-level listing checked."
 },
 {
  "competition": "SP1",
  "home_team": "Barcelona",
  "away_team": "Villarreal",
  "kickoff_date": "2026-11-22",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 2 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Racing de Santander",
  "away_team": "Real Sociedad",
  "kickoff_date": "2026-11-22",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 2 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "CA Osasuna",
  "away_team": "Malaga CF",
  "kickoff_date": "2026-11-22",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 2 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Getafe",
  "away_team": "Atletico Madrid",
  "kickoff_date": "2026-11-22",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 2 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Levante UD",
  "away_team": "Elche CF",
  "kickoff_date": "2026-11-23",
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
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 2 Nov 2026",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 }
]
$json$::jsonb, 'research 2026-11-02');
