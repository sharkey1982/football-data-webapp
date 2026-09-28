-- ============================================================================
-- FPL appearance and clean-sheet points from exit bands (Model Lab P2
-- passed, 28 Sep 2026: exit-band log loss 0.674 v 0.718 for position shares
-- on the holdout, t 12.3; appearance points closer than "2 for every
-- starter", t 9.4).
--
-- fpl_player_exit_bands: per current-season player, how his next start is
-- likely to end -- off before 60 / off at 60-84 / 85+ -- written by
-- scripts/refresh_exit_bands.py at the start of the FPL pipeline.
--
-- fpl_projection_leaguewide_points, scored as FPL scores it:
--   appearance   P(start) x (2 - P(off before 60)) + P(sub)       [was P(start) x 2 + P(sub)]
--   clean sheet  points x P(start) x (P(85+) x CS + P(60-84) x CS^(72.7/90))
--                [was points x P(start) x CS]; none if off before 60. For
--                60-84 the clean sheet is over his minutes on the pitch
--                (average exit 72.7 minutes; goals spread evenly, which if
--                anything understates it -- more goals come late).
-- A player missing from the table gets exactly the old values (P(off before
-- 60) = 0, P(85+) = 1), so this is safe before the first refresh.
-- ============================================================================

create table public.fpl_player_exit_bands (
  season_id bigint not null,
  fpl_player_id integer not null,
  p_off_before_60 numeric not null check (p_off_before_60 between 0 and 1),
  p_off_60_84 numeric not null check (p_off_60_84 between 0 and 1),
  p_full numeric not null check (p_full between 0 and 1),
  starts_seen integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season_id, fpl_player_id)
);

comment on table public.fpl_player_exit_bands is 'How each current-season FPL player''s next start is likely to end (off before 60 / 60-84 / 85+), from every recorded start since 2022/23 (Model Lab P2). Written by scripts/refresh_exit_bands.py; read by fpl_projection_leaguewide_points.';

alter table public.fpl_player_exit_bands enable row level security;
create policy "fpl_player_exit_bands public read" on public.fpl_player_exit_bands for select using (true);
grant select on public.fpl_player_exit_bands to anon, authenticated;
grant select, insert, update, delete on public.fpl_player_exit_bands to service_role;

do $$
declare
  def text := pg_get_viewdef('public.fpl_projection_leaguewide_points'::regclass);
  opts text;
  cs text := $cs$CASE
            WHEN (a.team_id = f.home_team_id) THEN exp((- COALESCE(f.market_away_goals, f.predicted_away_goals)))
            ELSE exp((- COALESCE(f.market_home_goals, f.predicted_home_goals)))
        END$cs$;
  app_old text := '((a.prob_starting_xi * (2)::numeric) + a.prob_sub_appearance) AS xpts_appearance';
  app_new text := '((a.prob_starting_xi * ((2)::numeric - COALESCE(eb.p_off_before_60, (0)::numeric))) + a.prob_sub_appearance) AS xpts_appearance';
  cs_start text := 'AS xpts_assists,';
  cs_end text := ' AS xpts_clean_sheet';
  from_end text := '(dc.fpl_player_id = a.fpl_player_id))));';
  i int; j int;
  n int;
begin
  -- Each anchor exactly once, or stop.
  foreach n in array array[
    (length(def) - length(replace(def, app_old, ''))) / length(app_old),
    (length(def) - length(replace(def, cs_start, ''))) / length(cs_start),
    (length(def) - length(replace(def, cs_end, ''))) / length(cs_end),
    (length(def) - length(replace(def, from_end, ''))) / length(from_end),
    (length(def) - length(replace(def, cs, ''))) / length(cs) - 1   -- the clean-sheet CASE appears twice
  ] loop
    if n <> 1 then raise exception 'fpl_projection_leaguewide_points: an anchor did not match exactly once (%)', n; end if;
  end loop;
  if right(def, length(from_end)) <> from_end then raise exception 'view does not end with the expected FROM clause'; end if;

  def := replace(def, app_old, app_new);
  i := strpos(def, cs_start) + length(cs_start);
  j := strpos(def, cs_end);
  def := substr(def, 1, i - 1) || E'\n    ((((\n        CASE\n            WHEN (a.element_type = ANY (ARRAY[1, 2])) THEN 4\n            WHEN (a.element_type = 3) THEN 1\n            ELSE 0\n        END)::double precision * (a.prob_starting_xi)::double precision) * '
    || '(((COALESCE(eb.p_full, (1)::numeric))::double precision * ' || cs || ') + '
    || '((COALESCE(eb.p_off_60_84, (0)::numeric))::double precision * power(' || cs || ', ((72.7)::double precision / (90)::double precision))))))'
    || substr(def, j);
  def := left(def, length(def) - 1)
    || E'\n     LEFT JOIN fpl_player_exit_bands eb ON (((eb.season_id = p.season_id) AND (eb.fpl_player_id = a.fpl_player_id)))';

  select case when c.reloptions is null then '' else ' with (' || array_to_string(c.reloptions, ', ') || ')' end
    into opts from pg_class c where c.oid = 'public.fpl_projection_leaguewide_points'::regclass;
  execute format('create or replace view public.fpl_projection_leaguewide_points%s as %s', opts, def);
end $$;

-- Integrity: while Premier League fixtures are scheduled in the next
-- fortnight, the exit bands should have been refreshed in the last 2 days.
do $$
declare
  def text := pg_get_functiondef('public.check_model_integrity'::regproc);
  anchor text := '  -- Catalogue (2026-09-26)';
  addition text := $add$  -- FPL exit bands (2026-09-28): refreshed at the start of every FPL
  -- pipeline run; stale bands mean appearance and clean-sheet points drift.
  select 'fpl_exit_bands_fresh',
    case when not exists (select 1 from public.fixtures where league_id = 1 and status = 'scheduled' and kickoff_date between current_date and current_date + 14)
           or exists (select 1 from public.fpl_player_exit_bands where season_id = public.fpl_current_season_id() and updated_at > now() - interval '2 days')
         then 'ok' else 'warning' end,
    (select count(*) from public.fpl_player_exit_bands where season_id = public.fpl_current_season_id() and updated_at > now() - interval '2 days'),
    'Current-season players with exit bands refreshed in the last 2 days (refresh_exit_bands.py; without them FPL points fall back to 2 appearance points and the full-match clean sheet for every starter)'
  union all
$add$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(def, anchor, addition || anchor);
end $$;

select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'How each current-season FPL player''s next start is likely to end: P(off before 60), P(off at 60-84), P(85+), from every recorded start since 2022/23 (recency-weighted, blended with position shares; Model Lab P2). Drives appearance and clean-sheet points in fpl_projection_leaguewide_points.',
  refresh_note = 'Written by scripts/refresh_exit_bands.py at the start of the FPL projections pipeline.', purpose_reviewed_at = now()
where node_key = 'object:fpl_player_exit_bands';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key in ('object:fpl_projection_leaguewide_points', 'function:check_model_integrity()');
