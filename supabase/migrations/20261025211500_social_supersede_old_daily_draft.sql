-- Today's daily market draft (25 Oct) was made by the first version, before
-- the "lead with the difference / skip days with no angle" rewrite. The type
-- is now automatic, so withdraw it rather than let the old text post.
update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
 where post_type = 'daily_market' and dedupe_key = 'daily_market:2026-10-25'
   and publication_status = 'unpublished' and approval_status in ('pending', 'approved');
