-- FPL: start chances from the club pecking order (6 Oct 2026).
--
-- Chris: "The line up pecking order is supposed to deal with this." No
-- projection read team_player_tactical_defaults.depth_rank, so a returning
-- first choice (Saliba) took nothing from the players below him (Konsa,
-- Mosquera): each player's start chance was his own availability x his own
-- start rate, and Arsenal's total stayed under 10, so the club-level scaling
-- never applied.
--
-- scripts/fpl_depth_chart.py now fills each club's places down the pecking
-- order per fixture (first choices start at least 85% of the time when fit,
-- or the admin "first choice when fit" figure; a backup takes an open place
-- 90% of the time; open places pass down the order, then across the line).
-- The pipeline runs it after the availability refresh and stores the result
-- here; fpl_fallback_start_probability_v6 reads it ahead of its own estimate.
-- Goalkeepers and players not on a pecking order keep the previous model.
--
-- 1. fpl_depth_start_store (fixture, player) -> start chance.
-- 2. get_fpl_depth_inputs(): the script's input (service role only).
-- 3. fpl_replace_depth_start(jsonb): replaces the store in one go (service role only).
-- 4. fpl_fallback_start_probability_v6 uses the store first.

create table public.fpl_depth_start_store (
  fixture_id bigint not null,
  fpl_player_id bigint not null,
  team_id bigint not null,
  start_probability numeric not null check (start_probability >= 0 and start_probability <= 0.98),
  depth_group text,
  depth_rank integer,
  refreshed_at timestamptz not null default now(),
  primary key (fixture_id, fpl_player_id)
);
alter table public.fpl_depth_start_store enable row level security;
create policy fpl_depth_start_store_read on public.fpl_depth_start_store for select to anon, authenticated using (true);
grant select on public.fpl_depth_start_store to anon, authenticated;
comment on table public.fpl_depth_start_store is 'Start chance per fixture from the club pecking order (team_player_tactical_defaults.depth_rank), written by scripts/fpl_depth_chart.py in the FPL projections pipeline. Read by fpl_fallback_start_probability_v6 ahead of its own estimate. Outfield players on a pecking order only.';

create or replace function public.get_fpl_depth_inputs()
returns table(fixture_id bigint, team_id bigint, formation text, fpl_player_id bigint, element_type integer,
              tactical_role text, depth_rank integer, availability double precision, rate double precision,
              start_if_fit double precision)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select a.fixture_id::bigint, a.team_id::bigint, coalesce(c.formation, ''),
         d.fpl_player_id::bigint, p.element_type::integer, d.tactical_role, d.depth_rank::integer,
         a.availability::float8,
         case when p.element_type = 1 then null
              else least(0.97, (coalesce(sr.starts, 0) + coalesce(sr.prior_rate, 0.20)) / (coalesce(sr.available_matches, 0) + 1.0)) end::float8,
         fc.start_if_fit::float8
    from public.fpl_fixture_availability_store a
    join public.team_player_tactical_defaults d
      on d.fpl_player_id = a.fpl_player_id and d.team_id = a.team_id and d.season_id = public.fpl_current_season_id()
    join public.fpl_players p on p.fpl_player_id = a.fpl_player_id and p.season_id = public.fpl_current_season_id()
    left join public.fixture_team_tactical_consensus c on c.fixture_id = a.fixture_id and c.team_id = a.team_id
    left join public.fpl_player_start_record sr on sr.fpl_player_id = a.fpl_player_id
    left join lateral (
      select x.start_if_fit from public.fpl_player_first_choice x
       where x.fpl_player_id = a.fpl_player_id and x.removed_at is null
         and a.kickoff_date between x.effective_from and coalesce(x.effective_to, '9999-12-31'::date)
       order by x.set_at desc limit 1) fc on true;
$$;
revoke all on function public.get_fpl_depth_inputs() from public, anon, authenticated;
grant execute on function public.get_fpl_depth_inputs() to service_role;

create or replace function public.fpl_replace_depth_start(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare n integer;
begin
  delete from public.fpl_depth_start_store where true;
  insert into public.fpl_depth_start_store (fixture_id, fpl_player_id, team_id, start_probability, depth_group, depth_rank)
  select r.fixture_id, r.fpl_player_id, r.team_id, round(least(0.98, greatest(0, r.start_probability)), 4), r.depth_group, r.depth_rank
    from jsonb_to_recordset(p_rows) as r(fixture_id bigint, fpl_player_id bigint, team_id bigint,
                                         start_probability numeric, depth_group text, depth_rank integer);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fpl_replace_depth_start(jsonb) from public, anon, authenticated;
grant execute on function public.fpl_replace_depth_start(jsonb) to service_role;

create or replace view public.fpl_fallback_start_probability_v6 with (security_invoker=true) as
 WITH base AS (
         SELECT f.fixture_id,
            fp.canonical_team_id AS team_id,
            fp.fpl_player_id,
            fp.element_type,
            COALESCE(u.appearances, (0)::bigint) AS apps,
            COALESCE(u.likely_starts, (0)::bigint) AS starts,
            COALESCE(u.sub_appearances, (0)::bigint) AS subs,
            COALESCE(av.availability, ((COALESCE(fp.chance_of_playing_next_round, fp.chance_of_playing_this_round,
                CASE
                    WHEN (fp.status = ANY (ARRAY['i'::text, 'u'::text, 's'::text])) THEN 0
                    ELSE 100
                END))::numeric / (100)::numeric)) AS availability,
            COALESCE(h.squad_status, 'unknown'::text) AS squad_status,
            COALESCE(sr.starts, 0) AS sr_starts,
            COALESCE(sr.available_matches, 0) AS sr_available,
            sr.prior_rate,
            fc.start_if_fit,
            ds.start_probability AS depth_start
           FROM fixtures f
             JOIN leagues l ON l.league_id = f.league_id
             JOIN fpl_players fp ON fp.season_id = f.season_id AND (fp.canonical_team_id = f.home_team_id OR fp.canonical_team_id = f.away_team_id)
             LEFT JOIN fpl_player_substitution_usage u ON u.season_id = fp.season_id AND u.fpl_player_id = fp.fpl_player_id
             LEFT JOIN player_squad_hierarchy h ON h.season_id = fp.season_id AND h.fpl_player_id = fp.fpl_player_id
             LEFT JOIN fpl_fixture_availability_store av ON av.fixture_id = f.fixture_id AND av.fpl_player_id = fp.fpl_player_id
             LEFT JOIN fpl_player_start_record sr ON sr.fpl_player_id = fp.fpl_player_id
             LEFT JOIN fpl_depth_start_store ds ON ds.fixture_id = f.fixture_id AND ds.fpl_player_id = fp.fpl_player_id AND ds.team_id = fp.canonical_team_id
             LEFT JOIN LATERAL ( SELECT c.start_if_fit
                   FROM fpl_player_first_choice c
                  WHERE ((c.fpl_player_id = fp.fpl_player_id) AND (c.removed_at IS NULL) AND (f.kickoff_date >= c.effective_from) AND (f.kickoff_date <= COALESCE(c.effective_to, '9999-12-31'::date)))
                  ORDER BY c.set_at DESC
                 LIMIT 1) fc ON (true)
          WHERE ((f.season_id = ( SELECT fpl_current_season_id() AS fpl_current_season_id)) AND (l.code = 'E0'::text))
        )
 SELECT fixture_id,
    team_id,
    fpl_player_id,
    -- Pecking order first (6 Oct 2026): already includes availability and
    -- the admin "first choice when fit" setting.
    COALESCE(depth_start, LEAST(0.98, (availability *
        CASE
            -- Set by an admin as first choice when fit (6 Oct 2026): his start
            -- chance WHEN AVAILABLE; fixture availability still applies.
            WHEN (start_if_fit IS NOT NULL) THEN start_if_fit
            -- Outfield (2026-10-05, backtested on GW3-5 starts: Brier 0.0992 ->
            -- 0.0944, log-loss 0.333 -> 0.313): starts over the matches he was
            -- AVAILABLE for, plus last season's start rate counted as one more
            -- match (0.20 with no Premier League record).
            WHEN (element_type <> 1) THEN LEAST(0.97, (((sr_starts)::numeric + COALESCE(prior_rate, 0.20)) / ((sr_available)::numeric + 1.0)))
            -- Goalkeepers: unchanged (not covered by the backtest).
            WHEN ((apps >= 4) AND (starts = apps)) THEN 0.96
            WHEN ((apps = 3) AND (starts = 3)) THEN 0.94
            WHEN ((apps >= 3) AND (starts >= (apps - 1))) THEN 0.84
            WHEN (apps > 0) THEN GREATEST(0.05, LEAST(0.90, (((starts)::numeric + 0.5) / ((apps)::numeric + 1.0))))
            ELSE
            CASE squad_status
                WHEN 'first_choice'::text THEN 0.72
                WHEN 'rotation'::text THEN 0.38
                WHEN 'backup'::text THEN 0.12
                ELSE 0.18
            END
        END))) AS start_probability,
    availability,
    apps,
    starts,
    subs,
        CASE
            -- Pecking-order starts are labelled by size (the label only sets
            -- the projection's confidence score).
            WHEN (depth_start IS NOT NULL) THEN
                CASE WHEN depth_start >= 0.80 THEN 'nailed_history'::text
                     WHEN depth_start >= 0.55 THEN 'strong_history'::text
                     ELSE 'history_hierarchy'::text END
            WHEN (start_if_fit IS NOT NULL) THEN 'nailed_history'::text
            WHEN ((element_type <> 1) AND (sr_available >= 3) AND (sr_starts >= sr_available)) THEN 'nailed_history'::text
            WHEN ((element_type <> 1) AND (sr_available >= 3) AND (sr_starts >= (sr_available - 1))) THEN 'strong_history'::text
            WHEN (element_type <> 1) THEN 'history_hierarchy'::text
            WHEN ((apps >= 3) AND (starts = apps)) THEN 'nailed_history'::text
            WHEN ((apps >= 3) AND (starts >= (apps - 1))) THEN 'strong_history'::text
            ELSE 'history_hierarchy'::text
        END AS probability_source
   FROM base;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
values ('2026-10-06', 'prediction',
  'FPL: start chances from the club pecking order',
  'The pecking order on Starting Lineups (depth_rank) was not used by any projection: a returning first choice (Saliba) took no starts from the players below him (Konsa, Mosquera).',
  'scripts/fpl_depth_chart.py fills each club''s places down the pecking order per fixture: first choices start at least 85% of the time when fit (or the admin first-choice figure), a backup takes an open place 90% of the time, open places pass down the order then across the line (DEF/MID/FWD). Stored in fpl_depth_start_store; used first by fpl_fallback_start_probability_v6. Goalkeepers and players not on a pecking order unchanged.',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261006140000');

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Start chance per fixture from the club pecking order (Starting Lineups depth ranks), read by the FPL start probability ahead of its own estimate.',
  refresh_note = 'Written by scripts/fpl_depth_chart.py in the FPL projections pipeline (twice daily).', purpose_reviewed_at = now()
where node_key = 'object:fpl_depth_start_store';
