-- Live definition exported from the database (view social_weekly_report).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.social_weekly_report with (security_invoker=true) as
 WITH w AS (
         SELECT (date_trunc('week'::text, (social_post_candidates.created_at AT TIME ZONE 'Europe/London'::text)))::date AS week_start,
            social_post_candidates.post_type,
            count(*) AS generated,
            count(*) FILTER (WHERE (social_post_candidates.validation_status = 'passed'::text)) AS passed_checks,
            count(*) FILTER (WHERE (social_post_candidates.approval_status = 'approved'::text)) AS approved,
            count(*) FILTER (WHERE (social_post_candidates.approval_status = 'rejected'::text)) AS rejected,
            count(*) FILTER (WHERE (social_post_candidates.approval_status = 'superseded'::text)) AS superseded,
            count(*) FILTER (WHERE (social_post_candidates.publication_status = 'published'::text)) AS published,
            count(*) FILTER (WHERE (social_post_candidates.publication_status = ANY (ARRAY['failed'::text, 'needs_check'::text]))) AS failed
           FROM social_post_candidates
          GROUP BY ((date_trunc('week'::text, (social_post_candidates.created_at AT TIME ZONE 'Europe/London'::text)))::date), social_post_candidates.post_type
        ), a AS (
         SELECT (date_trunc('week'::text, (a_1.started_at AT TIME ZONE 'Europe/London'::text)))::date AS week_start,
            c.post_type,
            count(*) FILTER (WHERE (a_1.mode = 'dry_run'::text)) AS dry_runs,
            count(*) FILTER (WHERE (a_1.mode = 'live'::text)) AS live_attempts,
            count(*) FILTER (WHERE (a_1.outcome = 'blocked'::text)) AS blocked,
            COALESCE(sum(a_1.estimated_cost_usd) FILTER (WHERE ((a_1.mode = 'live'::text) AND (a_1.outcome = ANY (ARRAY['posted'::text, 'unknown'::text])))), (0)::numeric) AS spend_usd
           FROM (social_publish_attempts a_1
             JOIN social_post_candidates c USING (candidate_id))
          GROUP BY ((date_trunc('week'::text, (a_1.started_at AT TIME ZONE 'Europe/London'::text)))::date), c.post_type
        )
 SELECT COALESCE(w.week_start, a.week_start) AS week_start,
    COALESCE(w.post_type, a.post_type) AS post_type,
    COALESCE(w.generated, (0)::bigint) AS generated,
    COALESCE(w.passed_checks, (0)::bigint) AS passed_checks,
    COALESCE(w.approved, (0)::bigint) AS approved,
    COALESCE(w.rejected, (0)::bigint) AS rejected,
    COALESCE(w.superseded, (0)::bigint) AS superseded,
    COALESCE(w.published, (0)::bigint) AS published,
    COALESCE(w.failed, (0)::bigint) AS failed,
    COALESCE(a.dry_runs, (0)::bigint) AS dry_runs,
    COALESCE(a.live_attempts, (0)::bigint) AS live_attempts,
    COALESCE(a.blocked, (0)::bigint) AS blocked,
    COALESCE(a.spend_usd, (0)::numeric) AS spend_usd
   FROM (w
     FULL JOIN a ON (((a.week_start = w.week_start) AND (a.post_type = w.post_type))));
