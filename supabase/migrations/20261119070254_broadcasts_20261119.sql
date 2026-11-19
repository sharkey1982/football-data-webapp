-- UK TV broadcasts: research run 2026-11-19 (scheduled Claude task, following docs/broadcast-research.md).
-- Horizon 2026-11-19 to 2026-12-10, plus newly announced selections; competitions E0, E1, E2, E3, EC, SC0, UCL, UEL, UECL, LC, FAC, D1, I1, SP1, F1.
-- Added: Emirates FA Cup second round TV picks 5-7 Dec (6 rows on 5 site fixtures; thefa.com, 12 Nov 2026).
-- Checked, nothing new: Sky Sports live EFL page (16 Nov 2026) - every pick 20 Nov - 19 Dec already stored;
--   spfl.co.uk TV selection pages reachable this run are all from the 2025/26 season (no new Premiership picks for 21 Nov - 13 Dec).
-- Not placed (no site fixture): FA Cup R2 Wimborne Town v Bradford City (Fri 4 Dec 19:30, TNT Sports 1),
--   Salisbury v Blackpool (Sun 6 Dec 12:15, TNT Sports 2 + BBC Two), Plymouth Parkway v Barnet (Sun 6 Dec 17:30, TNT Sports 1).
-- Not found (sources unreachable from this run): Amazon Prime Video UK Champions League calendar (matchday 6 pick, 8 Dec) and
--   TNT Sports UCL listings, so no UCL matchday 6 rows; DAZN Serie A rights page (no Serie A 4-7 Dec rows);
--   LALIGA 6 Dec (kick-off times not set); Ligue 1+; National League DAZN picks; Bundesliga per-match picks;
--   Premier League (no new selections; matchweeks 21-23 due w/c 30 Nov); EFL midweek games beyond Sky's picks.
-- 6 rows.
select public.ingest_broadcasts($json$
[
 {
  "competition": "FAC",
  "home_team": "Dover Athletic",
  "away_team": "Leicester",
  "kickoff_date": "2026-12-05",
  "kickoff_time": "17:15",
  "status": "confirmed_broadcast",
  "broadcaster": "TNT Sports",
  "channel": "TNT Sports 2",
  "streaming_service": "HBO Max",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "The FA: Emirates FA Cup second round television broadcast selections confirmed (12 Nov 2026), checked 19 Nov 2026",
  "source_url": "https://www.thefa.com/news/2026/nov/12/efac-second-round-broadcast-selections-20261211",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Dover Athletic",
  "away_team": "Leicester",
  "kickoff_date": "2026-12-05",
  "kickoff_time": "17:15",
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
  "source": "The FA: Emirates FA Cup second round television broadcast selections confirmed (12 Nov 2026), checked 19 Nov 2026",
  "source_url": "https://www.thefa.com/news/2026/nov/12/efac-second-round-broadcast-selections-20261211",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Barrow",
  "away_team": "Kidderminster",
  "kickoff_date": "2026-12-05",
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
  "source": "The FA: Emirates FA Cup second round television broadcast selections confirmed (12 Nov 2026), checked 19 Nov 2026",
  "source_url": "https://www.thefa.com/news/2026/nov/12/efac-second-round-broadcast-selections-20261211",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Fylde",
  "away_team": "Luton",
  "kickoff_date": "2026-12-06",
  "kickoff_time": "14:30",
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
  "source": "The FA: Emirates FA Cup second round television broadcast selections confirmed (12 Nov 2026), checked 19 Nov 2026",
  "source_url": "https://www.thefa.com/news/2026/nov/12/efac-second-round-broadcast-selections-20261211",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Crewe",
  "away_team": "Plymouth",
  "kickoff_date": "2026-12-06",
  "kickoff_time": "15:15",
  "status": "confirmed_broadcast",
  "broadcaster": "TNT Sports",
  "channel": "TNT Sports 2",
  "streaming_service": "HBO Max",
  "access_type": "subscription",
  "delivery_methods": [
   "tv_channel",
   "streaming",
   "app"
  ],
  "source": "The FA: Emirates FA Cup second round television broadcast selections confirmed (12 Nov 2026), checked 19 Nov 2026",
  "source_url": "https://www.thefa.com/news/2026/nov/12/efac-second-round-broadcast-selections-20261211",
  "confidence": "confirmed_primary"
 },
 {
  "competition": "FAC",
  "home_team": "Guiseley",
  "away_team": "Notts County",
  "kickoff_date": "2026-12-07",
  "kickoff_time": "19:30",
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
  "source": "The FA: Emirates FA Cup second round television broadcast selections confirmed (12 Nov 2026), checked 19 Nov 2026",
  "source_url": "https://www.thefa.com/news/2026/nov/12/efac-second-round-broadcast-selections-20261211",
  "confidence": "confirmed_primary"
 }
]
$json$::jsonb, 'research 2026-11-19');
