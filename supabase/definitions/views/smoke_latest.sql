-- Live definition exported from the database (view smoke_latest).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.smoke_latest as
 SELECT r.smoke_run_id,
    r.started_at,
    r.kind,
    r.base_url,
    p.page_type,
    p.url,
    p.ok,
    p.errors,
    p.warnings,
    p.ttfb_ms,
    p.fcp_ms,
    p.lcp_ms,
    p.cls,
    p.tbt_ms,
    p.js_kb,
    p.requests,
    p.slowest_api_ms,
    p.slowest_api_url,
    p.api_kb,
    p.largest_api,
    p.lcp_element,
    p.cls_sources
   FROM (( SELECT smoke_runs.smoke_run_id,
            smoke_runs.started_at,
            smoke_runs.finished_at,
            smoke_runs.base_url,
            smoke_runs.kind,
            smoke_runs.mode,
            smoke_runs.pages_tested,
            smoke_runs.pages_failed,
            smoke_runs.pages_warned,
            smoke_runs.median_lcp_ms,
            smoke_runs.median_ttfb_ms,
            smoke_runs.median_js_kb,
            smoke_runs.summary,
            smoke_runs.workflow_run_id
           FROM smoke_runs
          WHERE (smoke_runs.kind = 'production'::text)
          ORDER BY smoke_runs.started_at DESC
         LIMIT 1) r
     JOIN smoke_page_results p USING (smoke_run_id));
