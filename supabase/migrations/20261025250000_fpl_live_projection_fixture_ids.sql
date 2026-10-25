-- FPL live page: projected final score wrong (Chris, 25 Oct 2026).
-- fpl_live_entry sent each projection keyed by fpl_projection_snapshots.fixture_id,
-- which is OUR fixture id (Arsenal v Everton = 379), while the live page
-- matches on FPL's fixture id (71). Most lookups missed, and where the two
-- numberings overlap (GW8: our 71-80 v FPL's 71-80) a player picked up
-- another game's projection and match state. Send FPL's fixture id.
create or replace function pg_temp.patch(p_sig text, p_old text, p_new text) returns void language plpgsql as $f$
declare d text; n integer;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_new in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, p_old, ''))) / length(p_old);
  if n <> 1 then raise exception 'patch: % anchor found % times: %', p_sig, n, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end;
$f$;

select pg_temp.patch('public.fpl_live_entry(bigint, integer)',
  $o$jsonb_build_object('element', s.fpl_player_id, 'fixture', s.fixture_id, 'xp', round(s.expected_fpl_points, 2))$o$,
  $n$jsonb_build_object('element', s.fpl_player_id,
        'fixture', coalesce((select ff.fpl_fixture_id from public.fpl_fixtures ff
                              where ff.season_id = v_season and ff.canonical_fixture_id = s.fixture_id limit 1), s.fixture_id),
        'xp', round(s.expected_fpl_points, 2))$n$);
