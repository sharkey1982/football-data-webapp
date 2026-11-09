-- Live definition exported from the database (function tennis_upsert_matches(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.tennis_upsert_matches(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int; r record; base text; s text; k int; pid bigint;
begin
  for r in
    select distinct x->>'tour' tour, x->>'tournament' nm from jsonb_array_elements(rows) x
    where not exists (select 1 from tennis.tournaments t where t.tour = x->>'tour' and t.name = x->>'tournament')
  loop
    base := tennis.slugify(r.nm);
    s := base; k := 1;
    while exists (select 1 from tennis.tournaments q where q.tour = r.tour and q.slug = s) loop
      k := k + 1; s := base || '-' || k;
    end loop;
    insert into tennis.tournaments (tour, name, slug) values (r.tour, r.nm, s);
  end loop;

  for r in
    select distinct x->>'tour' tour, nm
    from jsonb_array_elements(rows) x, lateral (values (x->>'winner'), (x->>'loser')) v(nm)
    where not exists (select 1 from tennis.player_aliases a where a.tour = x->>'tour' and a.source_name = nm)
  loop
    base := tennis.slugify(r.nm);
    s := base; k := 1;
    while exists (select 1 from tennis.players q where q.tour = r.tour and q.slug = s) loop
      k := k + 1; s := base || '-' || k;
    end loop;
    insert into tennis.players (tour, name, slug) values (r.tour, r.nm, s) returning player_id into pid;
    insert into tennis.player_aliases (tour, source_name, player_id) values (r.tour, r.nm, pid);
  end loop;

  insert into tennis.matches (source_key, tour, year, tournament_id, location, series, court, surface, round,
    best_of, match_date, winner_id, loser_id, w_rank, l_rank, w_pts, l_pts, w_games, l_games, w_sets, l_sets,
    status, b365_w, b365_l, ps_w, ps_l, max_w, max_l, avg_w, avg_l, bfe_w, bfe_l, raw, imported_at)
  select x->>'source_key', x->>'tour', (x->>'year')::int, t.tournament_id, x->>'location', x->>'series',
    x->>'court', x->>'surface', x->>'round', (x->>'best_of')::int, (x->>'match_date')::date,
    aw.player_id, al.player_id, (x->>'w_rank')::int, (x->>'l_rank')::int, (x->>'w_pts')::int, (x->>'l_pts')::int,
    array(select jsonb_array_elements_text(x->'w_games')::int), array(select jsonb_array_elements_text(x->'l_games')::int),
    (x->>'w_sets')::int, (x->>'l_sets')::int, x->>'status',
    (x->>'b365_w')::numeric, (x->>'b365_l')::numeric, (x->>'ps_w')::numeric, (x->>'ps_l')::numeric,
    (x->>'max_w')::numeric, (x->>'max_l')::numeric, (x->>'avg_w')::numeric, (x->>'avg_l')::numeric,
    (x->>'bfe_w')::numeric, (x->>'bfe_l')::numeric, x->'raw', now()
  from jsonb_array_elements(rows) x
  join tennis.tournaments t on t.tour = x->>'tour' and t.name = x->>'tournament'
  join tennis.player_aliases aw on aw.tour = x->>'tour' and aw.source_name = x->>'winner'
  join tennis.player_aliases al on al.tour = x->>'tour' and al.source_name = x->>'loser'
  on conflict (source_key) do update set
    tournament_id = excluded.tournament_id, location = excluded.location, series = excluded.series,
    court = excluded.court, surface = excluded.surface, best_of = excluded.best_of,
    match_date = excluded.match_date, w_rank = excluded.w_rank, l_rank = excluded.l_rank,
    w_pts = excluded.w_pts, l_pts = excluded.l_pts, w_games = excluded.w_games, l_games = excluded.l_games,
    w_sets = excluded.w_sets, l_sets = excluded.l_sets, status = excluded.status,
    b365_w = excluded.b365_w, b365_l = excluded.b365_l, ps_w = excluded.ps_w, ps_l = excluded.ps_l,
    max_w = excluded.max_w, max_l = excluded.max_l, avg_w = excluded.avg_w, avg_l = excluded.avg_l,
    bfe_w = excluded.bfe_w, bfe_l = excluded.bfe_l, raw = excluded.raw, imported_at = now()
  where tennis.matches.raw is distinct from excluded.raw;
  get diagnostics n = row_count;
  return n;
end $function$
;
