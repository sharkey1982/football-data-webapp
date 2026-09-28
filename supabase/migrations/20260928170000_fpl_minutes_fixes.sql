-- ============================================================================
-- FPL minutes: two bugs found in gameweek 6 projections (28 Sep 2026).
--
-- 1. fpl_player_substitution_usage counted a "start" as any match of 60+
--    minutes, so a starter taken off before 60 was logged as a substitute
--    appearance. Ndoye (started 5 of 5: 61, 65, 58, 74, 58 minutes) came out
--    as 3 starts + 2 sub appearances, start probability 0.46; N. Angulo,
--    Stroud, Kayode, Cherki alike, and "average sub minutes" were inflated
--    (58 for Ndoye). Now uses FPL's own starts stat (per-fixture stats),
--    falling back to 60+ minutes only where the stat is missing. Column
--    names and types unchanged; read by fpl_fallback_start_probability_v6,
--    fixture_player_expected_minutes_fallback and _v2.
--
-- 2. fpl_player_squad_state was loaded once from the FPL API on 14 Sep and
--    never refreshed. Its injured / doubtful / suspended rows (87) kept
--    overriding the live availability (fpl_players, refreshed 6-hourly) --
--    16 players FPL now lists as fully available were still forced down,
--    e.g. Reinildo "suspended until 10 Oct" held at 0 for gameweek 6, Doku,
--    Baleba, Sarr, Henderson, Tonali, Gomez, Cash, Shaw. Those rows are
--    closed (effective_to = now(), history kept); live FPL status and chance
--    of playing already drive availability. "transferred" rows (players who
--    left) and any manual_tactical_override rows are untouched. Integrity
--    check fpl_squad_state_not_stale guards against a repeat.
-- ============================================================================

create or replace view public.fpl_player_substitution_usage as
select p.season_id,
    p.fpl_player_id,
    count(g.fpl_fixture_id) filter (where g.minutes > 0) as appearances,
    count(g.fpl_fixture_id) filter (where g.minutes > 0
      and coalesce((g.source_payload -> 'stats' ->> 'starts')::int = 1, g.minutes >= 60)) as likely_starts,
    count(g.fpl_fixture_id) filter (where g.minutes > 0
      and not coalesce((g.source_payload -> 'stats' ->> 'starts')::int = 1, g.minutes >= 60)) as sub_appearances,
    coalesce(avg(g.minutes) filter (where g.minutes > 0
      and not coalesce((g.source_payload -> 'stats' ->> 'starts')::int = 1, g.minutes >= 60)), (20)::numeric) as avg_sub_minutes
from public.fpl_players p
left join public.fpl_player_gameweeks g on g.fpl_player_id = p.fpl_player_id and g.season_id = p.season_id
group by p.season_id, p.fpl_player_id;

update public.fpl_player_squad_state
set effective_to = now(), updated_at = now(),
    evidence = coalesce(evidence, '') || ' [closed 2026-09-28: one-off 14 Sep snapshot; live FPL status/chance of playing now used]'
where source_name = 'official_fpl_api'
  and state in ('injured', 'doubtful', 'suspended')
  and (effective_to is null or effective_to > now());

-- Integrity: availability-type squad states from the FPL API must not
-- outlive a week without being refreshed (live FPL status is the source).
do $$
declare
  def text := pg_get_functiondef('public.check_model_integrity'::regproc);
  anchor text := '  -- Catalogue (2026-09-26)';
  addition text := $add$  -- Squad state (2026-09-28): API-sourced injured/doubtful/suspended rows
  -- that are still active after 7 days override the live FPL availability.
  select 'fpl_squad_state_not_stale',
    case when count(*) = 0 then 'ok' else 'warning' end,
    count(*),
    'Active injured/doubtful/suspended squad-state rows from the FPL API older than 7 days (they override live availability): ' || coalesce(string_agg(fpl_player_id::text, ', '), '')
  from public.fpl_player_squad_state_current
  where source_name = 'official_fpl_api' and state in ('injured', 'doubtful', 'suspended')
    and updated_at < now() - interval '7 days'
  union all
$add$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(def, anchor, addition || anchor);
end $$;

select public.meta_refresh_flow();

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key in ('object:fpl_player_substitution_usage', 'object:fpl_player_squad_state', 'function:check_model_integrity()');
