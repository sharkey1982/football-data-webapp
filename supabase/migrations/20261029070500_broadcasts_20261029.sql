-- UK TV broadcasts: research run 2026-10-29 (scheduled Claude task, following docs/broadcast-research.md).
-- Horizon 2026-10-29 to 2026-11-19, plus newly announced selections; competitions E0, E1, E2, E3, EC, SC0, UCL, UEL, UECL, LC, FAC, D1, I1, SP1, F1.
-- Added: Falkirk v Celtic 1 Nov (Sky Sports, SPFL); Premier League December selections 1-21 Dec (29 rows, PL fixture amendments of 19 Oct 2026).
-- Not found: SPFL broadcaster for Celtic v Kilmarnock 8 Nov 16:00 and other 31 Oct - 8 Nov games; National League per-match DAZN picks;
--   UCL matchday 4 TNT channel allocations (TNT pages geo-blocked; rows stay needs_verification); EFL games not on Sky's live page
--   (incl. Bradford v Huddersfield 31 Oct 12:30, Sheffield Wednesday v Blackpool 1 Nov); Saturday 14:00-17:15 foreign-league games (UK 3pm window).
-- 30 rows.
select public.ingest_broadcasts($json$
[
 {
  "competition": "SC0",
  "home_team": "Falkirk",
  "away_team": "Celtic",
  "kickoff_date": "2026-11-01",
  "kickoff_time": "13:00",
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
  "source": "SPFL official news 'Live on Sky Sports' (18 Sep 2026): Falkirk v Celtic, Sunday 1 November 1.00pm; checked 29 Oct 2026",
  "source_url": "https://spfl.co.uk/news/live-on-sky-sports-51416",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Coventry",
  "away_team": "Ipswich",
  "kickoff_date": "2026-12-01",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Chelsea",
  "away_team": "Crystal Palace",
  "kickoff_date": "2026-12-02",
  "kickoff_time": "19:30",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Hull",
  "away_team": "Nottingham Forest",
  "kickoff_date": "2026-12-02",
  "kickoff_time": "19:30",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Liverpool",
  "away_team": "Sunderland",
  "kickoff_date": "2026-12-02",
  "kickoff_time": "19:30",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Manchester City",
  "away_team": "Leeds",
  "kickoff_date": "2026-12-02",
  "kickoff_time": "19:30",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Bournemouth",
  "away_team": "Brighton",
  "kickoff_date": "2026-12-02",
  "kickoff_time": "20:15",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Aston Villa",
  "away_team": "Everton",
  "kickoff_date": "2026-12-02",
  "kickoff_time": "20:15",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Brentford",
  "away_team": "Arsenal",
  "kickoff_date": "2026-12-02",
  "kickoff_time": "20:15",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Newcastle",
  "away_team": "Manchester United",
  "kickoff_date": "2026-12-02",
  "kickoff_time": "20:15",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Tottenham",
  "away_team": "Fulham",
  "kickoff_date": "2026-12-03",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Chelsea",
  "away_team": "Liverpool",
  "kickoff_date": "2026-12-05",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Nottingham Forest",
  "away_team": "Brighton",
  "kickoff_date": "2026-12-05",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Brentford",
  "away_team": "Manchester City",
  "kickoff_date": "2026-12-05",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Everton",
  "away_team": "Fulham",
  "kickoff_date": "2026-12-06",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Newcastle",
  "away_team": "Sunderland",
  "kickoff_date": "2026-12-06",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Tottenham",
  "away_team": "Arsenal",
  "kickoff_date": "2026-12-06",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Manchester City",
  "away_team": "Chelsea",
  "kickoff_date": "2026-12-12",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Arsenal",
  "away_team": "Bournemouth",
  "kickoff_date": "2026-12-13",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Brighton",
  "away_team": "Everton",
  "kickoff_date": "2026-12-13",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Sunderland",
  "away_team": "Nottingham Forest",
  "kickoff_date": "2026-12-13",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Coventry",
  "away_team": "Aston Villa",
  "kickoff_date": "2026-12-13",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Crystal Palace",
  "away_team": "Manchester United",
  "kickoff_date": "2026-12-13",
  "kickoff_time": "19:00",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Hull",
  "away_team": "Tottenham",
  "kickoff_date": "2026-12-14",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Brentford",
  "away_team": "Newcastle",
  "kickoff_date": "2026-12-19",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Liverpool",
  "away_team": "Tottenham",
  "kickoff_date": "2026-12-19",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Brighton",
  "away_team": "Ipswich",
  "kickoff_date": "2026-12-20",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Sunderland",
  "away_team": "Crystal Palace",
  "kickoff_date": "2026-12-20",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Arsenal",
  "away_team": "Manchester United",
  "kickoff_date": "2026-12-20",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "E0",
  "home_team": "Chelsea",
  "away_team": "Aston Villa",
  "kickoff_date": "2026-12-21",
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
  "source": "Premier League official fixture amendments for December (published 19 Oct 2026), checked 29 Oct 2026",
  "source_url": "https://www.premierleague.com/en/news/4743152/fixture-amendments-for-premier-league-matches-in-december/",
  "confidence": "confirmed_primary",
  "availability_notes": "Premier League: moves to Saturday 19 Dec 20:00 if Chelsea play in the EFL Cup that week."
 }
]
$json$::jsonb, 'research 2026-10-29');
