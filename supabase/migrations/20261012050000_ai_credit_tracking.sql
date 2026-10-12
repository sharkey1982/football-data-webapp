-- ============================================================================
-- AI CREDIT ESTIMATE for /admin/ai-lab and /admin/ask.
--
-- Anthropic has no API for the remaining prepaid credit balance (it is only
-- shown in the Console), so the admin pages estimate it:
--   estimate left = the balance Chris last copied from the Console
--                   - everything recorded as spent since then.
-- "Recorded as spent" is
--   * ai_runs.cost_usd: every AI Lab / Ask FixtureShark answer (as now), and
--   * ai_external_spend: AI spend outside the site, i.e. the FPL eval runs
--     in GitHub Actions (.github/workflows/fpl-evals.yml inserts one row per
--     live run; the 4 runs of 11 Oct are backfilled below from their
--     committed results, via evals/fpl/scripts/spend.mjs).
--
-- 1. ai_credit_checks: balance readings Chris enters from the Console.
-- 2. ai_external_spend: one row per outside run, keyed (source, ref).
-- 3. ai_credit_summary(): admin-only figures for the panel.
-- New tables only; nothing existing changes. Safe to re-run.
-- ============================================================================

create table if not exists public.ai_credit_checks (
  check_id    bigserial primary key,
  balance_usd numeric(10,2) not null check (balance_usd >= 0),
  checked_at  timestamptz not null default now(),
  note        text,
  created_by  uuid default auth.uid()
);
alter table public.ai_credit_checks enable row level security;
drop policy if exists ai_credit_checks_admin_all on public.ai_credit_checks;
create policy ai_credit_checks_admin_all on public.ai_credit_checks for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.ai_external_spend (
  source    text not null,               -- e.g. 'fpl_evals'
  ref       text not null,               -- e.g. the results folder name
  cost_usd  numeric(12,6) not null check (cost_usd >= 0),
  spent_at  timestamptz not null default now(),
  note      text,
  primary key (source, ref)
);
alter table public.ai_external_spend enable row level security;
drop policy if exists ai_external_spend_admin_read on public.ai_external_spend;
create policy ai_external_spend_admin_read on public.ai_external_spend for select using (public.is_admin());

insert into public.ai_external_spend (source, ref, cost_usd, spent_at, note) values
  ('fpl_evals', '2026-10-11-1054-live-judge', 0.284336, '2026-10-11T10:54:17Z', 'backfill: live + judge, v1'),
  ('fpl_evals', '2026-10-11-1107-live-judge', 0.469540, '2026-10-11T11:07:57Z', 'backfill: live + judge, all prompts'),
  ('fpl_evals', '2026-10-11-1234-live-v2',    0.745458, '2026-10-11T12:34:40Z', 'backfill: live, v2'),
  ('fpl_evals', '2026-10-11-1259-live-v3',    0.248594, '2026-10-11T12:59:47Z', 'backfill: live, v3')
on conflict do nothing;

create or replace function public.ai_credit_summary()
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  site_month numeric; ext_month numeric; lim numeric;
  chk_id bigint; chk_balance numeric; chk_at timestamptz;
  site_since numeric := 0; ext_since numeric := 0;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;

  -- Same month and limit as the spend guard in ai-lab-run (UTC calendar month).
  select coalesce(sum(cost_usd), 0) into site_month from public.ai_runs where created_at >= month_start;
  select coalesce(sum(cost_usd), 0) into ext_month from public.ai_external_spend where spent_at >= month_start;
  select coalesce((select (value #>> '{}')::numeric from public.ai_lab_settings where key = 'monthly_cost_limit_usd'), 20) into lim;

  select check_id, balance_usd, checked_at into chk_id, chk_balance, chk_at
  from public.ai_credit_checks order by checked_at desc, check_id desc limit 1;
  if chk_id is not null then
    select coalesce(sum(cost_usd), 0) into site_since from public.ai_runs where created_at >= chk_at;
    select coalesce(sum(cost_usd), 0) into ext_since from public.ai_external_spend where spent_at >= chk_at;
  end if;

  return jsonb_build_object(
    'month_site_usd', round(site_month, 4),
    'month_external_usd', round(ext_month, 4),
    'monthly_limit_usd', lim,
    'last_check', case when chk_id is null then null else jsonb_build_object(
      'balance_usd', chk_balance, 'checked_at', chk_at,
      'spent_since_usd', round(site_since + ext_since, 4),
      'estimate_left_usd', round(chk_balance - site_since - ext_since, 2)) end
  );
end $$;
revoke all on function public.ai_credit_summary() from public, anon;
grant execute on function public.ai_credit_summary() to authenticated;
