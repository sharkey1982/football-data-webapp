-- UK TV broadcasts: research run 2026-11-16 (scheduled Claude task, following docs/broadcast-research.md).
-- Horizon 2026-11-16 to 2026-12-07, plus newly announced selections; competitions E0, E1, E2, E3, EC, SC0, UCL, UEL, UECL, LC, FAC, D1, I1, SP1, F1.
-- Ships alongside 20261112065733_broadcasts_20261112.sql (the 12 Nov run, whose PR #574 was never merged).
-- Added: SPFL Premiership Dundee United v Rangers, Sat 9 Jan 2027 17:30, Sky Sports (spfl.co.uk, 13 Nov 2026).
-- Checked, nothing new: Sky Sports live EFL page (9 Nov 2026) - every pick 16 Nov - 10 Dec already stored;
--   SPFL TV selections (22 Sep) - every Premiership pick 21-29 Nov already stored, none listed for 1-10 Dec.
-- Not found (sources unreachable from this run): FA Cup second round TV picks 5-7 Dec (TNT Sports article region-blocked,
--   thefa.com fetch not permitted); premierleague.com and efl.com news; DAZN Serie A / LALIGA / Ligue 1+ rights pages,
--   so no whole-competition rows for Serie A 4-7 Dec, LaLiga 6 Dec (times not set) or Ligue 1 4-6 Dec;
--   spfl.co.uk "SPFL TV Guide" (6 Nov) and "Rearranged fixtures" (6 Nov); National League DAZN picks; Bundesliga per-match picks.
-- 1 row.
select public.ingest_broadcasts($json$
[
 {
  "competition": "SC0",
  "home_team": "Dundee United",
  "away_team": "Rangers",
  "kickoff_date": "2027-01-09",
  "kickoff_time": "17:30",
  "status": "confirmed_broadcast",
  "broadcaster": "Sky Sports",
  "channel": "Sky Sports (channel TBC)",
  "streaming_service": "Sky Go / NOW",
  "access_type": "subscription",
  "delivery_methods": ["tv_channel", "streaming", "app"],
  "source": "SPFL official 'Premiership fixture update' (13 Nov 2026), checked 16 Nov 2026",
  "source_url": "https://spfl.co.uk/news/premiership-fixture-update-51518",
  "confidence": "confirmed_primary"
 }
]
$json$::jsonb, 'research 2026-11-16');
