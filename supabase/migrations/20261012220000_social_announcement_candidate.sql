-- ============================================================================
-- Social publishing, Phase 3 test: one announcement candidate for the first
-- explicitly approved post to @FixtureSharkHQ (docs/social-publishing.md).
-- No numbers, no link, no data claims. It still needs an admin to approve it
-- and press Publish with the kill switch off and live publishing on.
-- ============================================================================
alter table public.social_post_candidates drop constraint if exists social_post_candidates_post_type_check;
alter table public.social_post_candidates add constraint social_post_candidates_post_type_check
  check (post_type in ('fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight', 'announcement'));

insert into public.social_post_candidates (post_type, text, generated_text, source_data, model_version, snapshot_at, dedupe_key,
                                           expires_at, validation_status)
select 'announcement', t, t, jsonb_build_object('kind', 'phase3_test', 'note', 'Written by hand for the first live test; no data used'),
       null, now(), 'announcement:phase3_first_post', now() + interval '7 days', 'passed'
  from (values ('FixtureShark is now on X. Expect FPL captaincy projections, model forecasts checked against results, and verified football history. Every number comes from our data.')) v(t)
on conflict (dedupe_key) do nothing;

insert into public.social_audit_log (action, candidate_id, detail)
select 'candidate_created', candidate_id, '{"post_type": "announcement", "source": "migration"}'::jsonb
  from public.social_post_candidates c
 where dedupe_key = 'announcement:phase3_first_post'
   and not exists (select 1 from public.social_audit_log a where a.candidate_id = c.candidate_id and a.action = 'candidate_created');
