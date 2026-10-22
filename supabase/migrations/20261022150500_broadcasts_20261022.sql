-- UK TV broadcasts: research run 2026-10-22 (first run, following docs/broadcast-research.md).
-- Horizon 2026-10-22 to 2026-11-12; competitions E0, E1, E2, E3, EC, SC0, UCL, UEL, UECL, LC, FAC, D1, I1, SP1, F1.
-- Checked and already complete (no change needed): E0 (all 30 fixtures decided), E1/E2/E3 Sky selections
--   (all 22 on the Sky Sports live EFL page are already listed), LC round four, UCL MD4 (TNT + Prime Video pick),
--   UEL and UECL (every match on TNT Sports).
-- Not found in an official source yet: FA Cup first round TV picks (draw 19 Oct; selections not yet published),
--   SPFL selections after 25 Oct beyond those listed, National League DAZN picks for 23-31 Oct
--   (the league's weekly "how to watch" pages render without content), LaLiga UK 2026/27 rights holder
--   (no primary source; trade press only), Bundesliga / Serie A / Ligue 1 Saturday afternoon games
--   (inside the UK 14:45-17:15 window; no fixture-level listing).
-- 2 rows.
select public.ingest_broadcasts($json$
[
  {"competition": "I1", "home_team": "AC Monza", "away_team": "Napoli",
   "kickoff_date": "2026-10-28", "kickoff_time": "19:45",
   "status": "confirmed_broadcast", "broadcaster": "DAZN", "channel": "DAZN",
   "streaming_service": "DAZN", "access_type": "subscription", "delivery_methods": ["streaming", "app"],
   "source": "DAZN: all 380 Serie A games available in the UK and Ireland in 2026-27, checked 22 Oct 2026",
   "source_url": "https://news-frontend.news.indazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
   "confidence": "probable",
   "availability_notes": "Whole-competition rights statement (every Serie A match on DAZN UK); no fixture-level listing yet."},
  {"competition": "I1", "home_team": "Genoa CFC", "away_team": "Juventus",
   "kickoff_date": "2026-10-28", "kickoff_time": "19:45",
   "status": "confirmed_broadcast", "broadcaster": "DAZN", "channel": "DAZN",
   "streaming_service": "DAZN", "access_type": "subscription", "delivery_methods": ["streaming", "app"],
   "source": "DAZN: all 380 Serie A games available in the UK and Ireland in 2026-27, checked 22 Oct 2026",
   "source_url": "https://news-frontend.news.indazn.com/en-US/news/soccer/serie-a-watch-in-uk-ireland-on-dazn/12b9k1cfyat9710b0eu33mtrdb",
   "confidence": "probable",
   "availability_notes": "Whole-competition rights statement (every Serie A match on DAZN UK); no fixture-level listing yet."}
]
$json$::jsonb, 'research 2026-10-22');
