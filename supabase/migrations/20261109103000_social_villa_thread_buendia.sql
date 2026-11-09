-- Villa thread post 2, Chris 9 Nov 2026 09:58: add the context that McGinn
-- took the last two penalties in Buendía's absence (FPL lists Buendía first;
-- he hasn't started since GW7). 277 characters. Safe to re-run: only while
-- unpublished.
update public.social_post_candidates
   set thread = jsonb_set(thread, '{1}', to_jsonb(E'Jackson (£7.1m, 30% owned) has 44 pts in his last 5, with 6 goals from 3.5 xG: well above his chances.\n\nThe under-owned route in: McGinn, £5.4m, 3.4% owned. With Buendía out of the side, he''s taken Villa''s last two penalties and is on corners. We project 19.1 pts over GW11-15.'::text)),
       updated_at = now()
 where dedupe_key = 'fixture_swing:2026-11-09' and publication_status = 'unpublished';
