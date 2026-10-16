-- ============================================================================
-- UK Watch Guide: unmatched Airtable broadcast records (16 Oct 2026).
--
-- The Airtable sync succeeds every 3 hours but leaves 47 records unmatched.
-- Each was checked on 16 Oct:
--   2. Bundesliga 25, EFL Trophy 12, Scottish Championship 3, Scottish
--   League One 3, Premier Sports Cup 2: the site holds no fixtures for these
--   competitions (no fixture source), so there is nothing to match them to.
--   Their "unknown team" reasons (Hertha, Chelsea U21, Raith Rovers ...) are
--   a consequence, not a separate alias problem. Not matched, not marked
--   "not televised", kept as they are.
--   1 record (Barnsley v Sheffield Wednesday, 20 Nov) is labelled
--   Championship but is League One fixture 1296 on that exact date: the
--   competition label is wrong, the fixture is not. Resolvable.
--   1 record (reclyW8GFvHNn0mci) is an empty Airtable row (no fields).
--
-- Changes:
-- * broadcast_competition_coverage lists competitions the site does not
--   cover; their records get the reason "competition not covered by site
--   fixtures" instead of "not mapped".
-- * Matching: when nothing is found in the labelled competition, a fixture
--   with BOTH teams on the EXACT date is accepted if it is the only one in
--   any competition. No date tolerance and no partial team match, so nothing
--   speculative is matched; the record's own competition label is kept.
-- * broadcast_unmatched_classified gives each open unmatched record one
--   category: competition_not_covered / record_empty / competition_unmapped /
--   team_alias_missing / no_fixture / ambiguous.
-- The editorial harvesting workflow (ChatGPT -> Airtable) is not touched.
-- ============================================================================

create table if not exists public.broadcast_competition_coverage (
  label text primary key,
  status text not null default 'not_covered' check (status in ('not_covered')),
  note text not null
);
alter table public.broadcast_competition_coverage enable row level security;
revoke all on public.broadcast_competition_coverage from anon, authenticated;
grant select on public.broadcast_competition_coverage to service_role;

insert into public.broadcast_competition_coverage (label, note) values
  ('2. Bundesliga', 'No 2. Bundesliga fixtures or results on the site (football-data D2 not loaded)'),
  ('EFL Trophy', 'No EFL Trophy fixtures on the site; Premier League academy (U21) sides are not teams here'),
  ('Scottish Championship', 'Only the Scottish Premiership is loaded'),
  ('Scottish League One', 'Only the Scottish Premiership is loaded'),
  ('Premier Sports Cup', 'Scottish League Cup: no fixtures on the site')
on conflict (label) do nothing;

do $$
declare d text;
  a1 text := '      if v_fixture is null then v_reason := ''no fixture within 3 days'';';
  a2 text := '        v_reason := coalesce(v_reason || ''; '', '''') || ''competition not mapped: '' || v_comp;';
begin
  d := pg_get_functiondef('public.sync_airtable_broadcasts(jsonb)'::regprocedure);
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 then raise exception 'sync_airtable_broadcasts anchor 1 not found exactly once'; end if;
  if (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then raise exception 'sync_airtable_broadcasts anchor 2 not found exactly once'; end if;
  d := replace(d, a1, '      -- 2026-10-16: nothing in the labelled competition -> both teams on the EXACT
      -- date, unique across competitions (a mislabelled record, e.g. a League One
      -- game labelled Championship). No tolerance, no partial match.
      if v_fixture is null and v_league is not null then
        select min(fx.fixture_id) into v_fixture from public.fixtures fx
         where fx.home_team_id = v_home and fx.away_team_id = v_away and fx.kickoff_date = v_date
        having count(*) = 1;
        v_tie := false;
      end if;
' || a1);
  d := replace(d, a2, '        v_reason := coalesce(v_reason || ''; '', '''') ||
          case when exists (select 1 from public.broadcast_competition_coverage c where c.label = v_comp)
               then ''competition not covered by site fixtures: '' else ''competition not mapped: '' end || v_comp;');
  execute d;
end $$;

create or replace view public.broadcast_unmatched_classified as
select u.airtable_record_id, u.kickoff_date, u.competition_label, u.home_raw, u.away_raw, u.reason,
       case
         when u.record -> 'fields' = '{}'::jsonb or (u.home_raw is null and u.away_raw is null and u.kickoff_date is null) then 'record_empty'
         when u.reason ilike '%competition not covered%'
           or exists (select 1 from public.broadcast_competition_coverage c where c.label = u.competition_label) then 'competition_not_covered'
         when u.reason ilike '%competition not mapped%' or u.reason ilike '%competition not in database%' then 'competition_unmapped'
         when u.reason ilike '%unknown team%' then 'team_alias_missing'
         when u.reason ilike '%ambiguous%' then 'ambiguous'
         when u.reason ilike '%no fixture%' then 'no_fixture'
         else 'other'
       end as category,
       u.kickoff_date < current_date as is_past,
       u.first_seen_at, u.last_seen_at
from public.broadcast_sync_unmatched u
where u.resolved_at is null;
revoke all on public.broadcast_unmatched_classified from anon, authenticated;
grant select on public.broadcast_unmatched_classified to service_role;
comment on view public.broadcast_unmatched_classified is
  'Open unmatched Airtable broadcast records, one category each. competition_not_covered and record_empty are expected; the others need a mapping, alias or fixture fix.';

-- Re-sync now (the cron job does the same every 3 hours). An Airtable outage
-- must not fail the migration.
do $$
begin
  perform public.sync_airtable_broadcasts_from_api(true);
exception when others then
  raise warning 'Airtable re-sync skipped: %', sqlerrm;
end $$;
