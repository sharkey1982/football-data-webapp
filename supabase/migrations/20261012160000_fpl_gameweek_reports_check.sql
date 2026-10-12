-- Integrity check for the weekly FPL log (12 Oct 2026): warns when
--   - the next deadline is under 24 hours away and its preview isn't published;
--   - a deadline passed more than 24 hours ago and its preview isn't locked
--     (the frozen version from the deadline snapshot);
--   - a gameweek's last match kicked off more than 72 hours ago and its
--     reflection isn't published.
-- From GW7 for previews and GW6 for reflections (the log's first entries).
-- Warning, not failure: the site works without them. Skipped if present.

do $$
declare
  def text := pg_get_functiondef('public.check_model_integrity'::regproc);
  anchor text := '  -- Catalogue (2026-09-26)';
  addition text := $add$  -- Gameweek log (2026-10-12): previews and reflections on time.
  select 'fpl_gameweek_reports_on_time',
    case when n = 0 then 'ok' else 'warning' end, n,
    'Gameweek log items late: ' || coalesce(detail, 'none') || ' (scripts/fpl_gameweek_report.py, pipeline step "Gameweek report")'
  from (
    select count(*) n, string_agg(item, '; ' order by item) detail from (
      select 'GW' || g.fpl_event_id || ' preview not published' item
        from public.fpl_gameweeks g
       where g.season_id = public.fpl_current_season_id() and g.fpl_event_id >= 7
         and g.deadline_time between now() and now() + interval '24 hours'
         and not exists (select 1 from public.fpl_gameweek_reports r where r.season_id = g.season_id and r.fpl_event_id = g.fpl_event_id
                           and r.kind = 'preview' and r.status = 'published')
      union all
      select 'GW' || g.fpl_event_id || ' preview not locked'
        from public.fpl_gameweeks g
       where g.season_id = public.fpl_current_season_id() and g.fpl_event_id >= 7
         and g.deadline_time < now() - interval '24 hours' and g.deadline_time > now() - interval '14 days'
         and not exists (select 1 from public.fpl_gameweek_reports r where r.season_id = g.season_id and r.fpl_event_id = g.fpl_event_id
                           and r.kind = 'preview' and r.status = 'published' and r.frozen)
      union all
      select 'GW' || g.fpl_event_id || ' reflection not published'
        from public.fpl_gameweeks g
       where g.season_id = public.fpl_current_season_id() and g.fpl_event_id >= 6
         and (select max(f.kickoff_time) from public.fpl_fixtures f where f.season_id = g.season_id and f.fpl_event_id = g.fpl_event_id)
             between now() - interval '14 days' and now() - interval '72 hours'
         and not exists (select 1 from public.fpl_gameweek_reports r where r.season_id = g.season_id and r.fpl_event_id = g.fpl_event_id
                           and r.kind = 'reflection' and r.status = 'published')
    ) late
  ) x
  union all
$add$;
begin
  if position('fpl_gameweek_reports_on_time' in def) > 0 then return; end if;
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(def, anchor, addition || anchor);
end $$;
