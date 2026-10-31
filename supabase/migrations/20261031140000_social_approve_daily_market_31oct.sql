-- Chris, 31 Oct 2026 13:49: "Go ahead with the post" (today's daily market
-- thread, candidate 64: Barnsley v Oxford gap). It waited for his approval,
-- the approval email never reached him (RESEND_API_KEY not set) and it
-- expired at 12:15. Approve it and give it until 14:50 (kick-off 15:00);
-- the worker revalidates it against the data before it posts.
-- Safe to re-run: only while it is unpublished and before 14:45.
update public.social_post_candidates
   set approval_status = 'approved', approved_at = now(), auto = true,
       hold_until = now(), expires_at = timestamptz '2026-10-31 14:50:00+00',
       validation_status = 'passed', updated_at = now()
 where candidate_id = 64 and publication_status = 'unpublished'
   and now() < timestamptz '2026-10-31 14:45:00+00';
