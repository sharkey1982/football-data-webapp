-- ============================================================================
-- FPL projections: two fixes from docs/audit-2026-09-26.md (items 4 and 5).
--
-- 1) fixture_team_tactical_consensus only used manual and default team
--    formations for fixtures that had a retired 'leaguewide_v4' projection
--    (matchweeks 4-10). Every later fixture got a formation only if a lineup
--    source predicted one, so admin formation edits never reached them.
--    The guard now asks the question it meant to: is this an FPL fixture?
--    Upcoming fixtures with a team formation: 50 -> 326 (0 duplicate
--    team rows). Matchweeks 6-8, which the pipeline refreshes, were inside
--    the old v4 window, so their projections do not change; later
--    matchweeks pick up formations as they come into the refresh window.
--
-- 2) refresh_fpl_projection_fixture_v6_impl mapped minutes_source
--    'consensus_v3' to lineup_confidence 0.90, but the views emit
--    'lineup_consensus_v3', so those players fell through to 0.55 (65 live
--    rows, all from played fixtures on 14 Sep, which stay frozen).
--    lineup_confidence is display-only (no xPts effect). Both labels now map
--    to 0.90 for every new projection.
--
-- Both edited by anchored replacement on the live definitions.
-- ============================================================================

do $$
declare
  d   text := 'create or replace view public.fixture_team_tactical_consensus with (security_invoker=true) as '
              || pg_get_viewdef('public.fixture_team_tactical_consensus'::regclass);
  old text := $o$EXISTS ( SELECT 1
                   FROM fpl_player_projections p
                  WHERE ((p.fixture_id = f.fixture_id) AND (p.model_version = 'leaguewide_v4'::text)))$o$;
  new text := $n$EXISTS ( SELECT 1
                   FROM fpl_fixtures ff
                  WHERE ((ff.canonical_fixture_id = f.fixture_id) AND (ff.season_id = f.season_id)))$n$;
  n   int;
begin
  if position('leaguewide_v4' in d) = 0 then return; end if; -- already applied
  n := (length(d) - length(replace(d, old, ''))) / length(old);
  if n <> 2 then raise exception 'fixture_team_tactical_consensus: expected 2 anchors, found %', n; end if;
  execute replace(d, old, new);
end $$;
grant select on public.fixture_team_tactical_consensus to anon, authenticated, service_role;

do $$
declare
  d   text := pg_get_functiondef('public.refresh_fpl_projection_fixture_v6_impl(bigint)'::regprocedure);
  old text := $o$case m.minutes_source when 'consensus_v3' then .90$o$;
  new text := $n$case m.minutes_source when 'consensus_v3' then .90 when 'lineup_consensus_v3' then .90$n$;
  n   int;
begin
  if position('lineup_consensus_v3' in d) > 0 then return; end if; -- already applied
  n := (length(d) - length(replace(d, old, ''))) / length(old);
  if n <> 2 then raise exception 'refresh_fpl_projection_fixture_v6_impl: expected 2 anchors, found %', n; end if;
  execute replace(d, old, new);
end $$;

update public.fpl_player_projections p
   set lineup_confidence = .90
  from public.fixtures f
 where f.fixture_id = p.fixture_id
   and f.status <> 'played'
   and p.model_version = 'leaguewide_v6'
   and p.minutes_source = 'lineup_consensus_v3'
   and p.lineup_confidence is distinct from .90;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
values ('2026-09-26', 'prediction',
  'FPL: team formations reach every FPL fixture; lineup-confidence label fixed',
  'Manual and default formations only applied to fixtures with a retired leaguewide_v4 projection (matchweeks 4-10); predicted-lineup players showed 55% lineup confidence instead of 90% because of a label mismatch.',
  'Formation guard now checks fpl_fixtures instead of v4 projections: upcoming fixtures with a formation 50 -> 326. lineup_confidence is display-only; the 65 affected rows are all from played fixtures (14 Sep) and stay frozen; new projections use 0.90.',
  'leaguewide_v6', 'leaguewide_v6',
  'docs/audit-2026-09-26.md items 4-5; migration 20260926170000');
