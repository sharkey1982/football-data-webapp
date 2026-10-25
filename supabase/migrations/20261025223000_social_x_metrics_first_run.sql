-- First read of X post engagement now, rather than on Monday 07:40 (#451).
-- Fire-and-forget call to the x-metrics Edge Function; results land in
-- social_metrics_runs / social_post_metrics. Safe to re-run (one more read,
-- ~$0.03 for today's ~26 posts).
select private.social_metrics_call();
