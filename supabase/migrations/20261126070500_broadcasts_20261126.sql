-- UK TV broadcasts: research run 2026-11-26 (scheduled Claude task, following docs/broadcast-research.md).
-- Horizon 2026-11-26 to 2026-12-17, plus newly announced selections; competitions E0, E1, E2, E3, EC, SC0, UCL, UEL, UECL, LC, FAC, D1, I1, SP1, F1.
-- Added: Premier League matchweeks 21-23 (16 Jan - 1 Feb 2027) live UK selections, 21 rows (premierleague.com, 19 Nov 2026);
--   Carabao Cup QF Manchester City v Bradford, Tue 15 Dec 20:00, Sky Sports (mancity.com fixture confirmation);
--   Serie A 4-14 Dec, 16 rows (DAZN whole-competition rights, probable; Saturday games kicking off 14:00 or 17:00 left out as they overlap the 14:45-17:15 window);
--   LaLiga 4-7 Dec, 9 rows (Premier Sports / Disney+ late Saturday, whole-competition rights, probable; Sat 15:15 game left out).
-- Checked, nothing new: Sky Sports live EFL page (updated 16 Nov 2026) - every pick to 9 Jan already stored;
--   SPFL Premiership picks 28 Nov - 20 Dec already stored (no new spfl.co.uk page found).
-- Not found: UCL matchday 6 (8-9 Dec) - no primary source (Prime Video UK calendar shows TBD; Barcelona v Manchester City
--   reported as the Prime pick only by trade press; TNT Sports schedule not reachable); other Carabao Cup QF ties (15-17 Dec);
--   Ligue 1 (no 2026/27 every-match statement for Ligue 1+); Bundesliga per-match picks; National League DAZN picks;
--   LaLiga 13 Dec (kick-off times not set); EFL midweek 1, 8-9, 15 Dec games beyond Sky's picks.
-- 47 rows.
select public.ingest_broadcasts($json$
[
 {
  "competition": "E0",
  "home_team": "Coventry",
  "away_team": "Everton",
  "kickoff_date": "2027-01-16",
  "kickoff_time": "12:30",
  "status": "confirmed_broadcast",
  "broadcaster": "TNT Sports",
  "channel": "TNT Sports",
  "streaming_service": "HBO Max",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Aston Villa",
  "away_team": "Manchester United",
  "kickoff_date": "2027-01-16",
  "kickoff_time": "17:30",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Bournemouth",
  "away_team": "Ipswich",
  "kickoff_date": "2027-01-17",
  "kickoff_time": "14:00",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Tottenham",
  "away_team": "Leeds",
  "kickoff_date": "2027-01-17",
  "kickoff_time": "16:30",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Brentford",
  "away_team": "Brighton",
  "kickoff_date": "2027-01-18",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Arsenal",
  "away_team": "Newcastle",
  "kickoff_date": "2027-01-23",
  "kickoff_time": "17:30",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Brighton",
  "away_team": "Manchester City",
  "kickoff_date": "2027-01-23",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "broadcaster": "TNT Sports",
  "channel": "TNT Sports",
  "streaming_service": "HBO Max",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Crystal Palace",
  "away_team": "Tottenham",
  "kickoff_date": "2027-01-24",
  "kickoff_time": "14:00",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Everton",
  "away_team": "Brentford",
  "kickoff_date": "2027-01-24",
  "kickoff_time": "14:00",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Nottingham Forest",
  "away_team": "Bournemouth",
  "kickoff_date": "2027-01-24",
  "kickoff_time": "14:00",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Sunderland",
  "away_team": "Coventry",
  "kickoff_date": "2027-01-24",
  "kickoff_time": "14:00",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Manchester United",
  "away_team": "Liverpool",
  "kickoff_date": "2027-01-24",
  "kickoff_time": "16:30",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Leeds",
  "away_team": "Chelsea",
  "kickoff_date": "2027-01-25",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Liverpool",
  "away_team": "Everton",
  "kickoff_date": "2027-01-30",
  "kickoff_time": "12:30",
  "status": "confirmed_broadcast",
  "broadcaster": "TNT Sports",
  "channel": "TNT Sports",
  "streaming_service": "HBO Max",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Chelsea",
  "away_team": "Nottingham Forest",
  "kickoff_date": "2027-01-30",
  "kickoff_time": "17:30",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Bournemouth",
  "away_team": "Fulham",
  "kickoff_date": "2027-01-31",
  "kickoff_time": "14:00",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Coventry",
  "away_team": "Leeds",
  "kickoff_date": "2027-01-31",
  "kickoff_time": "14:00",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Hull",
  "away_team": "Crystal Palace",
  "kickoff_date": "2027-01-31",
  "kickoff_time": "14:00",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Tottenham",
  "away_team": "Sunderland",
  "kickoff_date": "2027-01-31",
  "kickoff_time": "14:00",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Manchester City",
  "away_team": "Arsenal",
  "kickoff_date": "2027-01-31",
  "kickoff_time": "16:30",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Brentford",
  "away_team": "Manchester United",
  "kickoff_date": "2027-02-01",
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
  "source": "Premier League official fixture amendments for January and early February (published 19 Nov 2026), checked 26 Nov 2026",
  "source_url": "https://www.premierleague.com/en/news/4764482/fixture-amendments-for-premier-league-matches-in-january-and-early-february/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "LC",
  "home_team": "Manchester City",
  "away_team": "Bradford",
  "kickoff_date": "2026-12-15",
  "kickoff_time": "20:00",
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
  "source": "Manchester City official: Carabao Cup quarter-final fixture confirmation ('shown live in the United Kingdom on Sky Sports'), checked 26 Nov 2026",
  "source_url": "https://www.mancity.com/news/mens/man-city-bradford-league-cup-quarter-final-fixture-confirmation-63929385",
  "confidence": "confirmed_primary",
  "availability_notes": "Club's official confirmation; channel not yet named."
 },
 {
  "competition": "I1",
  "home_team": "Bologna FC 1909",
  "away_team": "Roma",
  "kickoff_date": "2026-12-04",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Napoli",
  "away_team": "US Lecce",
  "kickoff_date": "2026-12-05",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Genoa CFC",
  "away_team": "Torino FC",
  "kickoff_date": "2026-12-06",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "SS Lazio",
  "away_team": "Atalanta",
  "kickoff_date": "2026-12-06",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Juventus",
  "away_team": "Udinese Calcio",
  "kickoff_date": "2026-12-06",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "AC Milan",
  "away_team": "Parma Calcio 1913",
  "kickoff_date": "2026-12-06",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Venezia FC",
  "away_team": "US Sassuolo Calcio",
  "kickoff_date": "2026-12-07",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "ACF Fiorentina",
  "away_team": "Cagliari Calcio",
  "kickoff_date": "2026-12-07",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Udinese Calcio",
  "away_team": "Frosinone Calcio",
  "kickoff_date": "2026-12-11",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Como",
  "away_team": "Bologna FC 1909",
  "kickoff_date": "2026-12-12",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "SS Lazio",
  "away_team": "Roma",
  "kickoff_date": "2026-12-13",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Inter Milan",
  "away_team": "Torino FC",
  "kickoff_date": "2026-12-13",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Parma Calcio 1913",
  "away_team": "ACF Fiorentina",
  "kickoff_date": "2026-12-13",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Napoli",
  "away_team": "AC Milan",
  "kickoff_date": "2026-12-13",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Atalanta",
  "away_team": "Genoa CFC",
  "kickoff_date": "2026-12-14",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "I1",
  "home_team": "Juventus",
  "away_team": "AC Monza",
  "kickoff_date": "2026-12-14",
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
  "source": "DAZN official: every 2026/27 Serie A game available on DAZN in the UK and Ireland (live or on demand; Saturday 14:45-17:15 games excepted); checked 26 Nov 2026",
  "source_url": "https://www.dazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
  "confidence": "probable",
  "availability_notes": "Whole-competition rights statement; no fixture-level listing checked. Not a Saturday 3pm-window game. The BBC also shows some Serie A games (not identified here)."
 },
 {
  "competition": "SP1",
  "home_team": "Deportivo Alaves",
  "away_team": "RCD Espanyol",
  "kickoff_date": "2026-12-04",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "access_type": "subscription",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Nov 2026",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Racing de Santander",
  "away_team": "Deportivo de La Coruna",
  "kickoff_date": "2026-12-05",
  "kickoff_time": "13:00",
  "status": "confirmed_broadcast",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "access_type": "subscription",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Nov 2026",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Villarreal",
  "away_team": "Real Sociedad",
  "kickoff_date": "2026-12-05",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "access_type": "subscription",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Nov 2026",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Barcelona",
  "away_team": "Celta Vigo",
  "kickoff_date": "2026-12-05",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "access_type": "subscription",
  "broadcaster": "Disney+",
  "channel": "Disney+",
  "streaming_service": "Disney+",
  "delivery_methods": [
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Disney+ exclusively streams all late Saturday LALIGA fixtures in the UK and Ireland (deal to 2027/28); checked 26 Nov 2026",
  "availability_notes": "Late-Saturday slot covered by LALIGA's exclusive Disney+ UK rights statement; no fixture-level listing checked."
 },
 {
  "competition": "SP1",
  "home_team": "CA Osasuna",
  "away_team": "Elche CF",
  "kickoff_date": "2026-12-06",
  "kickoff_time": "13:00",
  "status": "confirmed_broadcast",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "access_type": "subscription",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Nov 2026",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Athletic Bilbao",
  "away_team": "Real Madrid",
  "kickoff_date": "2026-12-06",
  "kickoff_time": "15:15",
  "status": "confirmed_broadcast",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "access_type": "subscription",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Nov 2026",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Getafe",
  "away_team": "Valencia CF",
  "kickoff_date": "2026-12-06",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "access_type": "subscription",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Nov 2026",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Atletico Madrid",
  "away_team": "Real Betis",
  "kickoff_date": "2026-12-06",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "access_type": "subscription",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Nov 2026",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 },
 {
  "competition": "SP1",
  "home_team": "Sevilla FC",
  "away_team": "Malaga CF",
  "kickoff_date": "2026-12-07",
  "kickoff_time": "20:00",
  "status": "confirmed_broadcast",
  "source_url": "https://www.laliga.com/en-GB/news/laliga-announces-landmark-broadcast-deals-with-premier-sports-and-disney-in-the-uk-and-ireland",
  "confidence": "probable",
  "access_type": "subscription",
  "broadcaster": "Premier Sports",
  "channel": "Premier Sports",
  "streaming_service": "Premier Sports Player",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "LALIGA official: Premier Sports primary UK broadcaster (340+ live matches a season) under the deal running to 2027/28; LaLiga fixture schedule; checked 26 Nov 2026",
  "availability_notes": "Whole-competition rights statement (Premier Sports is LALIGA's main UK partner); no fixture-level listing checked. Not a Saturday 3pm-window or late-Saturday (Disney+) slot."
 }
]
$json$::jsonb, 'research 2026-11-26');
