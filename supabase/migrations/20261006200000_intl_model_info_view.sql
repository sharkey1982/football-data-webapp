-- ============================================================================
-- International match pages (6 Oct 2026): the browser works out what model
-- IP1 expected for any game -- played or coming -- from the two teams' Elo
-- ratings, so it needs the fitted parameters. Read-only view over
-- intl.model_info (scripts/intl_projections.py writes it daily).
-- ============================================================================

create or replace view public.intl_model_info with (security_invoker = true) as
select model, params, fitted_through, updated_at from intl.model_info;

grant select on public.intl_model_info to anon, authenticated;
