-- Three factual X posts for Monday 23 Nov (Chris, 09:33: "Are there any x
-- posts today? There should be plenty to write about"). The detectors only
-- post around deadlines, so the days after a gameweek were empty.
-- Figures read from FPL at 09:40 UK (bootstrap-static, event/11/live,
-- fixtures?event=11):
--   Haaland 78.1% owned; GW9-11: 2, 2, 2 pts, 0 goals, xG 0.47 + 0.50 + 1.03
--     = 2.00; 72,334 transfers out since the GW11 deadline. GW12: Arsenal (A).
--   Transfers since the GW11 deadline: out Cherki 139,668 (benched at City),
--     Raya 113,075 (shoulder, 75%), Gvardiol 75,826, Joao Pedro 74,432;
--     in Wirtz 165,509, Evanilson 103,897, Tavernier 79,568.
--   GW11 top scorers (Brentford v Everton tonight): Okafor 15 (1.0% owned),
--     Wirtz 14 (8.4%), Hill 14 (3.9%), Ngumoha 13 (0.6%), McBurnie 13 (1.8%).
-- Auto, held to 10:30, 13:30 and 17:30 UK. Safe to re-run.
insert into public.social_post_candidates
  (post_type, text, generated_text, source_data, snapshot_at, dedupe_key, expires_at,
   validation_status, validation_errors, approval_status, approved_at, auto, hold_until, notified_at)
select 'fact', t.txt, t.txt, jsonb_build_object('kind', 'gw11_monday', 'season_id', 13, 'gw', 11, 'read_at', '2026-11-23T09:40:00Z'),
       now(), t.k, t.h + interval '8 hours', 'passed', '[]', 'approved', now(), true, t.h, now()
  from (values
    ('fact:gw11:haaland-blanks', timestamptz '2026-11-23 10:30:00+00',
     E'Haaland (78% owned) has now blanked three gameweeks running: 2, 2 and 2 points.\n\nNot for lack of chances: 2.00 xG across those three games (0.47, 0.50, 1.03) and no goals.\n\n72,334 managers have already sold him. Next up: Arsenal away.'),
    ('fact:gw11:transfers', timestamptz '2026-11-23 13:30:00+00',
     E'Most sold since the GW11 deadline:\nCherki 139,668 (benched at City)\nRaya 113,075 (shoulder, 75%)\nGvardiol 75,826\nJoão Pedro 74,432\n\nMost bought:\nWirtz 165,509\nEvanilson 103,897\nTavernier 79,568'),
    ('fact:gw11:top-scorers', timestamptz '2026-11-23 17:30:00+00',
     E'GW11''s top scorers so far were barely owned:\n\nOkafor 15 pts (1.0% owned)\nWirtz 14 (8.4%)\nHill 14 (3.9%)\nNgumoha 13 (0.6%)\nMcBurnie 13 (1.8%), a stoppage-time double at Brighton\n\nBrentford v Everton to come tonight.')
  ) as t(k, h, txt)
 where not exists (select 1 from public.social_post_candidates x where x.dedupe_key = t.k);
