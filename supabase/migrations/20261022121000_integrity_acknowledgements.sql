-- ============================================================================
-- Integrity acknowledgements (audit P-02) and the social_finish_publish
-- overload (audit P-09). 22 Oct 2026.
--
-- The daily integrity run had been red for 25 days on known failures, so a
-- new failure looked like the old ones. scripts/run_integrity_checks.py now
-- reads this table: an acknowledged failure is reported as a warning, with
-- its reason, until acknowledged_until (inclusive), then fails again by
-- itself. subject null = the whole check; a subject = one item of a list
-- check such as jobs_stale (the check still fails while any other item in
-- it is not acknowledged). Add rows by migration; keep the dates short.
-- Safe to re-run.
-- ============================================================================

create table if not exists public.integrity_acknowledgements (
  ack_id bigserial primary key,
  check_name text not null,
  subject text,
  reason text not null,
  acknowledged_until date not null,
  created_at timestamptz not null default now()
);
create unique index if not exists integrity_acknowledgements_key
  on public.integrity_acknowledgements (check_name, coalesce(subject, ''));
alter table public.integrity_acknowledgements enable row level security;
revoke all on public.integrity_acknowledgements from anon, authenticated;
comment on table public.integrity_acknowledgements is
  'Known integrity failures reported as warnings until a date (scripts/run_integrity_checks.py; audit P-02)';

-- Tennis: the import runs only from Chris's PC (tennis-data.co.uk refuses
-- cloud downloads) and has not run since 5 Oct. Accepted until 5 Nov while
-- a cloud source is found (audit P-05).
insert into public.integrity_acknowledgements (check_name, subject, reason, acknowledged_until) values
  ('tennis_fresh', null, 'Tennis import is PC-only and stopped on 5 Oct; cloud source pending (audit P-05)', '2026-11-05'),
  ('tennis_source_coverage_atp', null, 'Tennis import is PC-only and stopped on 5 Oct; cloud source pending (audit P-05)', '2026-11-05'),
  ('tennis_source_coverage_wta', null, 'Tennis import is PC-only and stopped on 5 Oct; cloud source pending (audit P-05)', '2026-11-05'),
  ('jobs_stale', 'tennis_import', 'Tennis import is PC-only and stopped on 5 Oct; cloud source pending (audit P-05)', '2026-11-05')
on conflict do nothing;

-- P-09: the 5-argument wrapper of social_finish_publish made
-- unique_function_names fail. The only caller (x-publish, deployed v3)
-- always passes p_x_post_ids, so it resolves to the 6-argument form.
drop function if exists public.social_finish_publish(bigint, text, integer, text, text);
