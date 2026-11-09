-- Chris, 9 Nov 2026 07:31: "The week ahead" (#86) is a boring post on an
-- international break; replace it with fixture-block planning content.
-- Reject #86 if it hasn't gone out. Safe to re-run.
update public.social_post_candidates
   set approval_status = 'rejected', rejected_reason = 'Chris: boring on an international break; replaced by a GW11-15 fixture-swing post',
       scheduled_for = null, updated_at = now()
 where candidate_id = 86 and publication_status = 'unpublished' and approval_status <> 'rejected';
