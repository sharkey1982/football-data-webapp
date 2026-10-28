-- Chris, 28 Oct 2026, 16:57: "don't mind you reposting that message then"
-- (he deleted the 07:25 daily market thread, candidate 40, after misreading
-- the unlabelled "Home / draw / away" columns). Repost it before the 17:30
-- kick-off with the teams named. Approved here (Chris asked), so the worker
-- posts it on its next tick; revalidated at claim time like any post, so it
-- does not go if the model or market has moved, or after kick-off.
-- Safe to re-run: only if no daily_market post holds today's key.
insert into public.social_post_candidates
  (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key, expires_at,
   validation_status, validation_errors, approval_status, approved_at, auto, hold_until, notified_at, detector_run_id)
select 'daily_market',
       array_to_string(t.posts, E'\n\n'), array_to_string(t.posts, E'\n\n'), to_jsonb(t.posts),
       (c.source_data - 'deleted_on_x' - 'deleted_on_x_at') || jsonb_build_object('repost_of', c.candidate_id),
       now(), 'daily_market:2026-10-28', timestamptz '2026-10-28 17:25:00+00',
       'passed', '[]', 'approved', now(), true, now(), now(), c.detector_run_id
  from public.social_post_candidates c
 cross join lateral (select array[
   replace(c.thread->>0, E'\n\nHome / draw / away\n', E'\n\nVenezia FC / draw / Inter Milan\n'),
   c.thread->>1] posts) t
 where c.candidate_id = 40
   and now() < timestamptz '2026-10-28 17:20:00+00'
   and not exists (select 1 from public.social_post_candidates x where x.dedupe_key = 'daily_market:2026-10-28');
