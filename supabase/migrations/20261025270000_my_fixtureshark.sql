-- ============================================================================
-- My FixtureShark (Chris, 25 Oct 2026): a home page built from the visitor's
-- preferences (kept in their browser). Two small read functions:
--
--   get_my_club_options()        every club in a league we predict this
--                                season (Premier League to National League,
--                                Serie A, Scottish Premiership), for the
--                                preferences picker.
--   get_my_club_cards(team_ids)  one card per club, in the order given: next
--                                game (model 1X2 and expected goals, the
--                                market when priced, the UK channel when
--                                confirmed), the last three results (with
--                                what the model and the market gave), and the
--                                league table around the club, from
--                                league_standings -- the same source as the
--                                site's league table, deductions included.
--
-- Read-only, public data; SECURITY DEFINER only so the model probabilities
-- can use private.social_result_probs. At most 4 clubs per call.
-- ============================================================================

create or replace function public.get_my_club_options()
returns table (team_id bigint, name text, slug text, league_id bigint, league_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct on (t.team_id) t.team_id, t.display_name, t.slug, l.league_id, l.name
    from public.fixtures f
    join public.teams t on t.team_id in (f.home_team_id, f.away_team_id)
    join public.leagues l on l.league_id = f.league_id
   where f.league_id in (1, 2, 3, 4, 5, 15, 22)
     and f.kickoff_date between (now() at time zone 'Europe/London')::date - 120 and (now() at time zone 'Europe/London')::date + 240
   order by t.team_id, f.kickoff_date desc
$$;

create or replace function private.my_club_card(p_team_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with p as (select p_team_id tid, (now() at time zone 'Europe/London')::date today),
  t as (select tm.team_id, tm.display_name, tm.slug from public.teams tm, p where tm.team_id = p.tid),
  fx as (
    select f.fixture_id, f.slug, f.league_id, f.season_id, f.kickoff_date, f.kickoff_time, f.status, f.home_team_id, f.away_team_id,
           f.predicted_home_goals lh, f.predicted_away_goals la,
           coalesce(m.full_time_home_goals, f.reported_home_goals) hg, coalesce(m.full_time_away_goals, f.reported_away_goals) ag
      from public.fixtures f cross join p
      left join public.matches m on m.league_id = f.league_id and m.season_id = f.season_id
                                and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
     where p.tid in (f.home_team_id, f.away_team_id) and f.kickoff_date between p.today - 200 and p.today + 200),
  nxt as (select fx.* from fx, p where fx.hg is null and fx.status = 'scheduled' and fx.kickoff_date >= p.today
           order by fx.kickoff_date, fx.kickoff_time nulls last limit 1),
  played as (select fx.* from fx where fx.hg is not null order by fx.kickoff_date desc, fx.kickoff_time desc nulls last limit 3),
  lg as (select fx.league_id, fx.season_id from fx where fx.league_id in (1, 2, 3, 4, 5, 15, 22)
          order by (fx.hg is not null) desc, fx.kickoff_date desc limit 1),
  st as (select s.position, s.team_id, s.played, s.goals_for - s.goals_against gd, s.points
           from public.league_standings s join lg using (league_id, season_id)),
  me as (select st.position from st, p where st.team_id = p.tid)
  select case when not exists (select 1 from t) then null else jsonb_build_object(
    'team', (select to_jsonb(t) from t),
    'league', (select jsonb_build_object('league_id', l.league_id, 'name', l.name, 'slug', l.slug) from public.leagues l join lg using (league_id)),
    'next', (select jsonb_build_object(
                'fixture_id', n.fixture_id, 'slug', n.slug, 'league', (select name from public.leagues where league_id = n.league_id),
                'date', n.kickoff_date, 'time', n.kickoff_time,
                'home', (select display_name from public.teams where team_id = n.home_team_id),
                'away', (select display_name from public.teams where team_id = n.away_team_id),
                'is_home', n.home_team_id = (select tid from p),
                'model', case when n.lh is not null then private.social_result_probs(n.lh::numeric, n.la::numeric) end,
                'xg', case when n.lh is not null then jsonb_build_array(round(n.lh::numeric, 1), round(n.la::numeric, 1)) end,
                'market', (select jsonb_build_object('home', k.market_home, 'draw', k.market_draw, 'away', k.market_away)
                             from public.fixture_market_latest k where k.fixture_id = n.fixture_id),
                'tv', (select case when b.status = 'confirmed_not_televised' then 'Not on UK TV' else b.broadcaster end
                         from public.fixture_broadcasts b
                        where b.fixture_id = n.fixture_id and b.market = 'GB'
                          and (b.status = 'confirmed_not_televised' or (b.status = 'confirmed_broadcast' and b.confidence like 'confirmed%'))
                        order by (b.status = 'confirmed_broadcast') desc, b.broadcast_id limit 1))
               from nxt n),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
                  'fixture_id', r.fixture_id, 'slug', r.slug, 'date', r.kickoff_date,
                  'home', (select display_name from public.teams where team_id = r.home_team_id),
                  'away', (select display_name from public.teams where team_id = r.away_team_id),
                  'is_home', r.home_team_id = (select tid from p), 'hg', r.hg, 'ag', r.ag,
                  'model', case when r.lh is not null then private.social_result_probs(r.lh::numeric, r.la::numeric) end,
                  'market', (select jsonb_build_object('home', k.market_home, 'draw', k.market_draw, 'away', k.market_away)
                               from public.fixture_market_latest k where k.fixture_id = r.fixture_id))
                 order by r.kickoff_date desc), '[]') from played r),
    'table', (select coalesce(jsonb_agg(jsonb_build_object('position', st.position, 'team_id', st.team_id, 'name', tm.display_name,
                  'slug', tm.slug, 'played', st.played, 'gd', st.gd, 'points', st.points) order by st.position), '[]')
                from st join public.teams tm on tm.team_id = st.team_id, me
               where st.position between me.position - 3 and me.position + 3)
  ) end
$$;

create or replace function public.get_my_club_cards(p_team_ids bigint[])
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(c.card order by u.ord), '[]')
    from unnest(p_team_ids[1:4]) with ordinality u(tid, ord)
    cross join lateral (select private.my_club_card(u.tid) card) c
   where c.card is not null
$$;

revoke all on function private.my_club_card(bigint) from public, anon, authenticated;
grant execute on function public.get_my_club_options() to anon, authenticated;
grant execute on function public.get_my_club_cards(bigint[]) to anon, authenticated;
