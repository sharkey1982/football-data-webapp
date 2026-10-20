-- ============================================================================
-- Announcement that @FixtureSharkHQ now posts automatically (Chris, 20 Oct
-- 2026). Queued for the first automatic slot: hold_until is earlier than the
-- GW7 reflection thread's, so it goes first at 07:00 UK on 21 Oct (posting
-- hours 07:00-22:00), with the thread an hour later (60-minute gap). No
-- numbers, no link. Hold or reject it on /admin/social.
-- ============================================================================
insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                           expires_at, validation_status, approval_status, approved_at, auto, hold_until)
select 'announcement', t, t, jsonb_build_object('kind', 'auto_posting_live', 'note', 'Written for the start of automatic posting; no data used'),
       now(), 'announcement:auto_posting_live', timestamptz '2026-10-23 21:00:00+00', 'passed', 'approved', now(), true,
       timestamptz '2026-10-21 00:00:00+00'
  from (values ('FixtureShark now posts here automatically: FPL price changes each morning, captaincy projections before each deadline, and our gameweek previews and reflections. Every number comes from our data and is checked again just before it goes out.')) v(t)
on conflict (dedupe_key) do nothing;

insert into public.social_audit_log (action, candidate_id, detail)
select 'auto_queued', candidate_id, '{"source": "migration 20261020220000_social_auto_announcement"}'::jsonb
  from public.social_post_candidates c
 where dedupe_key = 'announcement:auto_posting_live'
   and not exists (select 1 from public.social_audit_log a where a.candidate_id = c.candidate_id and a.action = 'auto_queued');
