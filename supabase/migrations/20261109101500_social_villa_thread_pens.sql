-- Villa thread post 2 (Chris, 9 Nov 2026 09:56: "McGinn took a pen yesterday
-- - who is ahead of him?"). FPL's taker order still lists Buendía first, but
-- Buendía hasn't started since GW7 (unused sub in GW10). McGinn took Villa's
-- last two penalties: GW9 v Fulham (missed, FPL penalties_missed 1, 0.79 xG)
-- and GW10 v Man United (scored, 1 goal from exactly 0.79 xG). So "second on
-- pens" undersold it, and "2 goals from 3.2 xG" counted 1.58 xG of penalties.
-- Safe to re-run: only while unpublished.
update public.social_post_candidates
   set thread = jsonb_set(thread, '{1}', to_jsonb(E'Jackson (£7.1m, 30% owned) has 44 pts in his last 5, with 6 goals from 3.5 xG: well above his chances.\n\nThe under-owned route in: McGinn, £5.4m, 3.4% owned. He''s taken Villa''s last two penalties and is on corners. We project 19.1 pts over GW11-15.'::text)),
       updated_at = now()
 where dedupe_key = 'fixture_swing:2026-11-09' and publication_status = 'unpublished';
