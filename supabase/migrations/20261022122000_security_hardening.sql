-- ============================================================================
-- Security hardening from the 22 Oct 2026 audit (SEC-07, SEC-09, SEC-18) and
-- the Supabase advisors (function_search_path_mutable, auth_rls_initplan,
-- duplicate_index). Safe to re-run.
--
-- Not here, because the migration role (postgres) does not own the objects:
-- SEC-05 (anon EXECUTE on extensions.http_* / net.http_*) and SEC-06
-- (cron.schedule): those grants were made by supabase_admin, and a REVOKE by
-- postgres is a no-op (tested 22 Oct in a rolled-back transaction). anon has
-- no USAGE on schema cron. See the audit report for what Chris can do.
-- ============================================================================

-- SEC-07: TRUNCATE ignores RLS; TRIGGER, REFERENCES and MAINTAIN are never
-- needed by the API roles. Existing tables in the app schemas, then the
-- default for new tables postgres creates in public.
do $$
declare s text;
begin
  foreach s in array array['public', 'sf', 'tennis', 'nfl', 'intl', 'intlw', 'ga', 'gsc', 'private'] loop
    if exists (select 1 from pg_namespace where nspname = s) then
      execute format('revoke truncate, trigger, references, maintain on all tables in schema %I from anon, authenticated', s);
    end if;
  end loop;
end $$;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references, maintain on tables from anon, authenticated;

-- SEC-09: anonymous visitors could read sf.fantasy_managers.user_id (the
-- admin's auth UUID). anon keeps the other columns (public.sf_leaderboard,
-- security_invoker, reads id, display_name, is_bot, bot_kind). authenticated
-- keeps user_id: the sf.entry_picks "own" policy and public.sf_my_team need it.
revoke select on sf.fantasy_managers from anon;
grant select (id, display_name, is_bot, bot_kind, bot_key, created_at) on sf.fantasy_managers to anon;

-- SEC-18: stale backups (22-24 Sep, one with RLS off) and a one-off staging
-- table; nothing reads them (no function, view or script references).
drop table if exists public.backup_fpl_player_projections_gw4_20260922;
drop table if exists public.backup_fpl_teams_20260924;
drop table if exists public.backup_fpl_gameweeks_20260924;
drop table if exists public.backup_fpl_fixtures_20260924;
drop table if exists public.backup_fpl_player_gameweeks_20260924;
drop table if exists public.ingest_finance_stage_tmp;

-- Advisor function_search_path_mutable: pin search_path on the flagged
-- functions. Left alone on purpose: fpl_score_calc, tennis.level_of(text,
-- text,text), tennis.level_rank, tennis.result_of(text,integer[]) and
-- tennis.round_order. They are SQL functions used inside views, and a SET
-- clause stops Postgres inlining them (slower views; /tennis is already
-- near the 3 s limit for anon).
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proconfig is null and not p.prosecdef
       and ((n.nspname = 'public' and p.proname in ('ai_fpl_position', 'social_numbers', 'social_has_url', 'social_weighted_length'))
         or (n.nspname = 'private' and p.proname in ('fpl_gameweek_reports_guard', 'social_audit_append_only', 'social_check',
                                                       'social_fmt', 'social_posts', 'social_price_text', 'social_k', 'social_news'))
         or (n.nspname = 'tennis' and p.proname in ('slugify_city', 'rebuild_events', 'rebuild_summaries', 'model_p', 'rebuild_ratings'))
         or (n.nspname = 'tennis' and p.oid::regprocedure::text in ('tennis.level_of(text,text)', 'tennis.result_of(text)')))
  loop
    execute format('alter function %s set search_path = %I, public, extensions, pg_temp',
                   f, (select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.oid = f));
  end loop;
end $$;

-- Advisor auth_rls_initplan: evaluate auth.uid() once per query, not per row.
drop policy if exists "app_users read own row" on public.app_users;
create policy "app_users read own row" on public.app_users for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists own on sf.entry_picks;
create policy own on sf.entry_picks for select to authenticated
  using (exists (select 1 from sf.entries e join sf.fantasy_managers m on m.id = e.manager_id
                  where e.id = entry_picks.entry_id and m.user_id = (select auth.uid())));

-- Advisor duplicate_index: the constraint's index stays.
drop index if exists public.team_tactical_defaults_season_team_uidx;
