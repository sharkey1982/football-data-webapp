-- Rewrites today's three queued X posts as insight, not lists (Chris, 23 Nov
-- 09:41: "they're purely factual. Insights - Wirtz is now ranked x in point
-- scoring but was y % owned ... What do Liverpool's upcoming fixtures look
-- like though? Are people knee jerking if anyone else previously well owned
-- hasn't scored but is about to enter a good run of games").
-- Figures (FPL 09:50 UK; FixtureShark projections leaguewide_v6 generated
-- 06:56 UK; ownership at the GW11 deadline from fpl_player_snapshots):
--   Haaland: GW9-11 2, 2, 2 pts, xG 0.47 + 0.50 + 1.03 = 2.00; 72,605 sold;
--     next five ARS (A), LEE (H), BRE (A), CHE (H), HUL (H); projected 36.6
--     over GW12-16, top in the game, 6.2 clear of Tavernier (30.4).
--   Wirtz: 60 pts, 12th in the game, 3rd midfielder; 6.5% owned at the
--     deadline; 166,862 bought; next five EVE (A), SUN (H), CHE (A), LEE (H),
--     TOT (H); projected 22.2 over GW12-16, 9th midfielder.
--   Palmer: 62,864 sold; Chelsea next NFO (A), CRY (H); projected 10.9 over
--     GW12-13, 3rd midfielder (Wirtz 9.0, 10th). Joao Pedro, also sold, is
--     injured (thigh, no return date), so he is not the example.
-- Only posts not yet published are changed. Safe to re-run.
update public.social_post_candidates c
   set text = t.txt, generated_text = t.txt, updated_at = now(),
       source_data = c.source_data || jsonb_build_object('rewritten', '2026-11-23T10:00:00Z')
  from (values
    ('fact:gw11:haaland-blanks',
     E'Haaland: three blanks in a row (2, 2, 2) from 2.00 xG, and 72,605 managers have sold him.\n\nArsenal away is the hardest of his next five. Then: Leeds (H), Brentford (A), Chelsea (H), Hull (H).\n\nOur model still has him top over those five: 36.6 pts, 6.2 clear of anyone else.'),
    ('fact:gw11:transfers',
     E'Wirtz was FPL''s 12th-highest scorer (60 pts) yet only 6.5% owned at the GW11 deadline. After 14 v Man Utd, 166,862 have bought him.\n\nLiverpool next: EVE (A), SUN (H), CHE (A), LEE (H), TOT (H). Decent, not special.\n\nOur model ranks him 9th among midfielders over that run.'),
    ('fact:gw11:top-scorers',
     E'62,864 managers have sold Palmer since the deadline after 2 points against Leeds.\n\nChelsea''s next two: Forest away, Palace at home.\n\nOur model has him the 3rd-best midfielder for GW12-13 (10.9 points), ahead of Wirtz (9.0), who 166,862 have just bought.')
  ) as t(k, txt)
 where c.dedupe_key = t.k and c.publication_status = 'unpublished';
