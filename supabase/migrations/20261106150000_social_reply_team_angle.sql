-- ============================================================================
-- X reply ideas (6 Nov 2026): team angle keeps the fixture run.
--
-- After 20261106140000_social_reply_past_performance.sql the Spurs idea's
-- team "angle" (goals v xG over the last 5, then the fixture run and top
-- picks) was too long, so it dropped the fixture run. A shorter run clause
-- ("Their next 5 rank 3rd easiest of the 20 by FPL difficulty; our top Spurs
-- picks: ...") now comes before the version without it. Nothing else in
-- private.social_reply_facts changes.
--
-- x-replies (same PR) now tells the drafter to start from the "angle" fact
-- and never to write a difference it worked out itself. Then redrafts the
-- open ideas from the last 36 hours (kind 'redraft': no X reads).
-- Safe to re-run: create or replace; a redraft only rewrites open ideas.
-- ============================================================================

create or replace function private.social_reply_facts(p_text text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
with inp as (select coalesce(p_text, '') v),
s as (select public.fpl_current_season_id() sid),
g as (select fg.fpl_event_id gw, fg.deadline_time from public.fpl_gameweeks fg join s on fg.season_id = s.sid
       where fg.deadline_time > now() order by fg.deadline_time limit 1),
mv as (select 'leaguewide_v6'::text model_version),
t as (select ' ' || public.unaccent(inp.v) || ' ' raw, lower(public.unaccent(inp.v)) low from inp),
-- Player names: web name and full name, case-sensitive, whole words. A few
-- surnames that are everyday words are left out.
pn as (
  select pl.fpl_player_id, pl.selected_by_percent own, n.name
    from public.fpl_players pl join s on pl.season_id = s.sid
    cross join lateral (values (public.unaccent(pl.web_name)), (public.unaccent(pl.first_name || ' ' || pl.second_name))) n(name)
   where (pl.selected_by_percent >= 0.5 or pl.minutes >= 90) and pl.now_cost > 0
     and char_length(n.name) >= 4
     and n.name not in ('King', 'Hope', 'Mount', 'Young', 'Little', 'Bell', 'Ward', 'Hill', 'Bond', 'Gray', 'Kelly', 'Long',
                        'Cash', 'Hall', 'White', 'Green', 'Brown', 'Dean', 'Rose', 'Way', 'Moore', 'Field', 'Read', 'Shaw', 'Mark')),
hit as (
  select pn.*, strpos(t.raw, pn.name) pos from pn, t
   where t.raw ~ ('[^[:alnum:]]' || regexp_replace(pn.name, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '[^[:alnum:]]')),
-- A name two players share counts only when one is far more owned.
pick as (
  select fpl_player_id, pos from (
    select h.*, count(*) over (partition by h.name) n, lead(h.own) over (partition by h.name order by h.own desc) own2,
           row_number() over (partition by h.name order by h.own desc) rn from hit h) x
   where rn = 1 and (n = 1 or own >= 5 * coalesce(own2, 0))),
players as (select fpl_player_id, min(pos) pos from pick group by 1 order by 2 limit 3),
-- Projected points per player and gameweek, the next 10 gameweeks (current model, double gameweeks summed).
pp as (
  select v.fpl_player_id, ff.fpl_event_id gw, sum(v.expected_fpl_points) xp
    from public.fpl_projection_frontend_feed_v6 v join s on true cross join g
    join public.fpl_fixtures ff on ff.season_id = s.sid and ff.canonical_fixture_id = v.fixture_id
   where ff.fpl_event_id between g.gw and g.gw + 9
   group by 1, 2),
pmax as (select max(gw) gw from pp),
-- Every player this season: next 5, next GW, the 5 after; out (injured, suspended, 25% or less) or doubtful.
ps as (
  select pl.fpl_player_id, pl.web_name, pl.slug, pl.element_type et, pl.now_cost cost, pl.selected_by_percent own, pl.total_points,
         pl.goals_scored, pl.assists, pl.fpl_team_id, ft.short_name team, ft.name team_name, ft.canonical_team_id,
         pl.status, pl.news, pl.chance_of_playing_next_round cop,
         (pl.status in ('i', 's', 'n') or (pl.status = 'd' and coalesce(pl.chance_of_playing_next_round, 100) <= 25)) missing,
         (pl.status = 'd' and coalesce(pl.chance_of_playing_next_round, 100) > 25) doubtful,
         round(coalesce(sum(pp.xp) filter (where pp.gw between g.gw and g.gw + 4), 0), 1) n5,
         round(coalesce(sum(pp.xp) filter (where pp.gw = g.gw), 0), 1) n1,
         round(sum(pp.xp) filter (where pp.gw between g.gw + 5 and g.gw + 9), 1) l5
    from public.fpl_players pl join s on pl.season_id = s.sid cross join g
    join public.fpl_teams ft on ft.season_id = s.sid and ft.fpl_team_id = pl.fpl_team_id
    left join pp on pp.fpl_player_id = pl.fpl_player_id
   where pl.now_cost > 0 and pl.status <> 'u'
   group by pl.fpl_player_id, pl.web_name, pl.slug, pl.element_type, pl.now_cost, pl.selected_by_percent, pl.total_points,
            pl.goals_scored, pl.assists, pl.fpl_team_id, ft.short_name, ft.name, ft.canonical_team_id,
            pl.status, pl.news, pl.chance_of_playing_next_round, g.gw),
-- Available players with their rank in their club and position (next 5).
av as (
  select ps.*, rank() over (partition by ps.fpl_team_id order by ps.n5 desc) team_rank,
         rank() over (partition by ps.et order by ps.n5 desc) pos_rank
    from ps where not ps.missing),
-- What has happened: FPL's per-gameweek figures, the gameweeks before the next deadline.
hg as (
  select pg.fpl_player_id, pg.fpl_event_id gw, pg.total_points, pg.minutes,
         coalesce((pg.source_payload->'stats'->>'starts')::int, 0) starts, pg.goals_scored, pg.assists, pg.bonus, pg.clean_sheets,
         pg.expected_goals xg, pg.expected_assists xa, pg.expected_goal_involvements xgi
    from public.fpl_player_gameweeks pg join s on pg.season_id = s.sid cross join g where pg.fpl_event_id < g.gw),
hw as (select min(gw) gw1, max(gw) gwn from hg),
h0 as (
  select hg.fpl_player_id, sum(hg.total_points) pts, sum(hg.minutes) mins, sum(hg.starts) starts, sum(hg.goals_scored) gls,
         sum(hg.assists) ast, sum(hg.bonus) bonus, sum(hg.clean_sheets) cs, round(sum(hg.xg), 1) xg, round(sum(hg.xa), 1) xa,
         round(sum(hg.xgi), 1) xgi, sum(hg.xgi) xgi_raw,
         coalesce(sum(hg.total_points) filter (where hg.gw > hw.gwn - 5), 0) pts5,
         coalesce(sum(hg.minutes) filter (where hg.gw > hw.gwn - 5), 0) mins5,
         coalesce(sum(hg.goals_scored) filter (where hg.gw > hw.gwn - 5), 0) gls5,
         coalesce(sum(hg.assists) filter (where hg.gw > hw.gwn - 5), 0) ast5,
         coalesce(round(sum(hg.xgi) filter (where hg.gw > hw.gwn - 5), 1), 0) xgi5
    from hg cross join hw group by hg.fpl_player_id),
-- Per 90 from 270 minutes; goals plus assists v xGI (as shown, to 1 dp); ranks in club and position.
hr as (
  select h.*,
         rank() over (partition by h.fpl_team_id order by h.pts desc) c_pts, rank() over (partition by h.et order by h.pts desc) p_pts,
         rank() over (partition by h.fpl_team_id order by h.xgi desc) c_xgi, rank() over (partition by h.et order by h.xgi desc) p_xgi,
         rank() over (partition by h.fpl_team_id order by h.p90 desc nulls last) c_p90, rank() over (partition by h.et order by h.p90 desc nulls last) p_p90,
         rank() over (partition by h.fpl_team_id order by h.x90 desc nulls last) c_x90, rank() over (partition by h.et order by h.x90 desc nulls last) p_x90,
         rank() over (partition by h.fpl_team_id order by h.pts5 desc) c_pts5, rank() over (partition by h.et order by h.pts5 desc) p_pts5,
         rank() over (partition by h.fpl_team_id order by h.xgi5 desc) c_xgi5, rank() over (partition by h.et order by h.xgi5 desc) p_xgi5,
         -- xGI rank among the club's available players ("best underlying numbers")
         rank() over (partition by h.fpl_team_id, h.missing order by h.xgi desc) av_xgi
    from (
      select h0.*, ps.fpl_team_id, ps.et, ps.missing, ps.web_name, ps.team_name,
             case when h0.mins >= 270 then round(h0.pts * 90.0 / h0.mins, 1) end p90,
             case when h0.mins >= 270 then round(h0.xgi_raw * 90 / h0.mins, 2) end x90,
             h0.gls + h0.ast ga, h0.gls5 + h0.ast5 ga5,
             private.social_luck(h0.gls + h0.ast, h0.xgi) luck, private.social_luck(h0.gls5 + h0.ast5, h0.xgi5) luck5
        from h0 join ps on ps.fpl_player_id = h0.fpl_player_id where h0.mins > 0) h),
-- Each club's goals v xG and conceded v xGC (xG summed from its players), finished games.
pgx as (
  select pg.fpl_fixture_id, pg.opponent_fpl_team_id opp, sum(pg.expected_goals) xg
    from public.fpl_player_gameweeks pg join s on pg.season_id = s.sid group by 1, 2),
tgm as (
  select ft.fpl_team_id, ff.fpl_event_id gw,
         case when ff.fpl_home_team_id = ft.fpl_team_id then ff.team_h_score else ff.team_a_score end gf,
         case when ff.fpl_home_team_id = ft.fpl_team_id then ff.team_a_score else ff.team_h_score end gc,
         coalesce(x.xg, 0) xg, coalesce(c.xg, 0) xgc
    from public.fpl_teams ft join s on ft.season_id = s.sid cross join g
    join public.fpl_fixtures ff on ff.season_id = s.sid and ft.fpl_team_id in (ff.fpl_home_team_id, ff.fpl_away_team_id)
     and ff.finished and ff.fpl_event_id < g.gw
    left join pgx x on x.fpl_fixture_id = ff.fpl_fixture_id
     and x.opp = case when ff.fpl_home_team_id = ft.fpl_team_id then ff.fpl_away_team_id else ff.fpl_home_team_id end
    left join pgx c on c.fpl_fixture_id = ff.fpl_fixture_id and c.opp = ft.fpl_team_id),
txg as (
  select tgm.fpl_team_id, sum(tgm.gf) gf, round(sum(tgm.xg), 1) xg, sum(tgm.gc) gc, round(sum(tgm.xgc), 1) xgc,
         sum(tgm.gf) filter (where tgm.gw > hw.gwn - 5) gf5, round(sum(tgm.xg) filter (where tgm.gw > hw.gwn - 5), 1) xg5,
         sum(tgm.gc) filter (where tgm.gw > hw.gwn - 5) gc5, round(sum(tgm.xgc) filter (where tgm.gw > hw.gwn - 5), 1) xgc5,
         rank() over (order by sum(tgm.xg) desc) xg_rank, rank() over (order by sum(tgm.xgc)) xgc_rank, count(*) over () nteams
    from tgm cross join hw group by tgm.fpl_team_id),
-- Each club's fixtures, the next 10 gameweeks, with FPL's difficulty (1 easiest, 5 hardest).
tfx as (
  select ft.fpl_team_id, ff.fpl_event_id gw, ff.kickoff_time, ot.short_name opp, ff.fpl_home_team_id = ft.fpl_team_id home,
         case when ff.fpl_home_team_id = ft.fpl_team_id then ff.team_h_difficulty else ff.team_a_difficulty end d
    from public.fpl_teams ft join s on ft.season_id = s.sid cross join g
    join public.fpl_fixtures ff on ff.season_id = s.sid and ft.fpl_team_id in (ff.fpl_home_team_id, ff.fpl_away_team_id)
     and ff.fpl_event_id between g.gw and g.gw + 9
    join public.fpl_teams ot on ot.season_id = s.sid
     and ot.fpl_team_id = case when ff.fpl_home_team_id = ft.fpl_team_id then ff.fpl_away_team_id else ff.fpl_home_team_id end),
trun0 as (
  select tfx.fpl_team_id,
         string_agg(format('%s (%s) %s', tfx.opp, case when tfx.home then 'H' else 'A' end, tfx.d), ', ' order by tfx.gw, tfx.kickoff_time)
           filter (where tfx.gw <= g.gw + 4) run5,
         round(avg(tfx.d) filter (where tfx.gw <= g.gw + 4), 1) d5,
         string_agg(format('%s (%s) %s', tfx.opp, case when tfx.home then 'H' else 'A' end, tfx.d), ', ' order by tfx.gw, tfx.kickoff_time)
           filter (where tfx.gw > g.gw + 4) runl,
         round(avg(tfx.d) filter (where tfx.gw > g.gw + 4), 1) dl,
         count(*) filter (where tfx.gw > g.gw + 4) nl
    from tfx cross join g group by tfx.fpl_team_id, g.gw),
trun as (
  select trun0.*, ft.short_name team, ft.name team_name, ft.canonical_team_id,
         rank() over (order by trun0.d5) d5_rank, count(*) over () nteams
    from trun0 join s on true join public.fpl_teams ft on ft.season_id = s.sid and ft.fpl_team_id = trun0.fpl_team_id),
-- Players FPL has out or doubtful, per club (only those who matter: 3%+ owned or 30+ points).
miss as (
  select ps.fpl_team_id,
         string_agg(format('%s (%s)', ps.web_name, rtrim(btrim(coalesce(nullif(btrim(ps.news), ''), 'unavailable')), '.')), '; ' order by ps.own desc)
           filter (where ps.missing) out_list,
         string_agg(format('%s (%s)', ps.web_name, rtrim(btrim(coalesce(nullif(btrim(ps.news), ''), 'doubtful')), '.')), '; ' order by ps.own desc)
           filter (where ps.doubtful) doubt_list
    from ps where (ps.missing or ps.doubtful) and (ps.own >= 3 or ps.total_points >= 30)
   group by 1),
-- The players the post names.
pd as (
  select row_number() over (order by players.pos) rn, ps.*, av.team_rank, av.pos_rank
    from players join ps on ps.fpl_player_id = players.fpl_player_id
    left join av on av.fpl_player_id = players.fpl_player_id),
px as (
  select pd.*, tr.run5, tr.d5, tr.runl, tr.dl, tr.nl, tr.d5_rank, tr.nteams,
         lead.list lead_list, lead.n lead_n, und.list und_list, und.name und_name, und.own und_own, und.n5 und_n5,
         top.list top_list, val.list val_list, val.n val_n, val.name val_name, val.team val_team, val.cost val_cost, val.n5 val_n5,
         band.n band_n, band.r band_r, firstout.name first_out, firstout.id first_out_id, lead.id lead_id, val.id val_id
    from pd
    left join trun tr on tr.fpl_team_id = pd.fpl_team_id
    -- teammates projected at least 1 point more, top 2
    left join lateral (
      select string_agg(private.social_pl_short(a.web_name, a.cost, a.own, a.n5), ' and ' order by a.n5 desc) list, count(*) n,
             (array_agg(a.fpl_player_id order by a.n5 desc))[1] id
        from (select * from av a where a.fpl_team_id = pd.fpl_team_id and a.fpl_player_id <> pd.fpl_player_id and a.n5 >= pd.n5 + 1
               order by a.n5 desc limit 2) a) lead on true
    -- the club's best under-owned (under 10%) options, other than him
    left join lateral (
      select string_agg(private.social_pl(a.web_name, a.et, a.cost, a.own, a.n5), ', ' order by a.n5 desc) list,
             (array_agg(a.web_name order by a.n5 desc))[1] name, (array_agg(a.own order by a.n5 desc))[1] own,
             (array_agg(a.n5 order by a.n5 desc))[1] n5
        from (select * from av a where a.fpl_team_id = pd.fpl_team_id and a.fpl_player_id <> pd.fpl_player_id and a.own < 10 and a.n5 >= 1
               order by a.n5 desc limit 2) a) und on true
    -- the club's top 4 available
    left join lateral (
      select string_agg(private.social_pl(a.web_name, a.et, a.cost, a.own, a.n5), ', ' order by a.n5 desc) list
        from (select * from av a where a.fpl_team_id = pd.fpl_team_id order by a.n5 desc limit 4) a) top on true
    -- same position, within £0.5m, projected more, any club, top 3
    left join lateral (
      select string_agg(private.social_pl(a.web_name, a.et, a.cost, a.own, a.n5, a.team), ', ' order by a.n5 desc) list, count(*) n,
             (array_agg(a.web_name order by a.n5 desc))[1] name, (array_agg(a.team order by a.n5 desc))[1] team,
             (array_agg(a.cost order by a.n5 desc))[1] cost, (array_agg(a.n5 order by a.n5 desc))[1] n5,
             (array_agg(a.fpl_player_id order by a.n5 desc))[1] id
        from (select * from av a where a.et = pd.et and abs(a.cost - pd.cost) <= 5 and a.fpl_player_id <> pd.fpl_player_id and a.n5 > pd.n5
               order by a.n5 desc limit 3) a) val on true
    left join lateral (
      select count(*) n, 1 + count(*) filter (where a.n5 > pd.n5) r
        from av a where a.et = pd.et and abs(a.cost - pd.cost) <= 5 and (a.fpl_player_id <> pd.fpl_player_id)) band on true
    left join lateral (
      select a.web_name name, a.fpl_player_id id from ps a where a.fpl_team_id = pd.fpl_team_id and a.missing and a.fpl_player_id <> pd.fpl_player_id
         and (a.own >= 3 or a.total_points >= 30) order by a.own desc limit 1) firstout on true),
-- Named teams (not just a named player's club).
tn as (
  select ft.canonical_team_id team_id, a.alias
    from public.fpl_teams ft join s on ft.season_id = s.sid
    left join public.teams tm on tm.team_id = ft.canonical_team_id
    cross join lateral (values (ft.name), (tm.display_name), (tm.canonical_name)) a(alias)
   where a.alias is not null
  union
  select tm.team_id, a.alias from (values ('Forest', 'nottingham-forest'), ('Villa', 'aston-villa'), ('Palace', 'crystal-palace'),
                                         ('Spurs', 'tottenham'), ('Man United', 'manchester-united'), ('Gunners', 'arsenal')) a(alias, slug)
    join public.teams tm on tm.slug = a.slug),
thit as (
  select tn.team_id, min(strpos(t.raw, tn.alias)) pos from tn, t
   where t.raw ~ ('[^[:alnum:]]' || regexp_replace(tn.alias, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '[^[:alnum:]]')
   group by 1 order by 2 limit 2),
tx as (
  select row_number() over (order by thit.pos) rn, tr.*,
         top.list top_list, top.name top_name, top.cost top_cost, top.own top_own, top.n5 top_n5,
         und.list und_list, und.name und_name, und.cost und_cost, und.own und_own, und.n5 und_n5, pos.list pos_list
    from thit join trun tr on tr.canonical_team_id = thit.team_id
    left join lateral (
      select string_agg(private.social_pl_short(a.web_name, a.cost, a.own, a.n5), ' and ' order by a.n5 desc) list,
             (array_agg(a.web_name order by a.n5 desc))[1] name, (array_agg(a.cost order by a.n5 desc))[1] cost,
             (array_agg(a.own order by a.n5 desc))[1] own, (array_agg(a.n5 order by a.n5 desc))[1] n5
        from (select * from av a where a.fpl_team_id = tr.fpl_team_id order by a.n5 desc limit 2) a) top on true
    left join lateral (
      select string_agg(private.social_pl(a.web_name, a.et, a.cost, a.own, a.n5), ', ' order by a.n5 desc) list,
             (array_agg(a.web_name order by a.n5 desc))[1] name, (array_agg(a.cost order by a.n5 desc))[1] cost,
             (array_agg(a.own order by a.n5 desc))[1] own, (array_agg(a.n5 order by a.n5 desc))[1] n5
        from (select * from av a where a.fpl_team_id = tr.fpl_team_id and a.own < 10 and a.n5 >= 1 order by a.n5 desc limit 2) a) und on true
    left join lateral (
      select string_agg(format('%s %s (%s, %s%% owned) %s', (array['GKP', 'DEF', 'MID', 'FWD'])[b.et], b.web_name, private.social_m(b.cost),
                               private.social_1(b.own), private.social_1(b.n5)), ', ' order by b.et) list
        from (select distinct on (a.et) a.* from av a where a.fpl_team_id = tr.fpl_team_id order by a.et, a.n5 desc) b) pos on true),
-- The next Premier League game of each named team, and our forecast.
tf0 as (
  select distinct on (th.team_id) th.team_id, th.pos, f.fixture_id, f.slug, f.kickoff_date, f.home_team_id, f.away_team_id,
         coalesce(hd.display_name, hd.canonical_name) home, coalesce(aw.display_name, aw.canonical_name) away,
         coalesce(f.market_home_goals, f.predicted_home_goals)::numeric lh, coalesce(f.market_away_goals, f.predicted_away_goals)::numeric la
    from thit th
    join public.fixtures f on f.league_id = 1 and f.status = 'scheduled'
     and f.kickoff_date >= (now() at time zone 'Europe/London')::date and th.team_id in (f.home_team_id, f.away_team_id)
    join public.teams hd on hd.team_id = f.home_team_id join public.teams aw on aw.team_id = f.away_team_id
   order by th.team_id, f.kickoff_date, f.kickoff_time),
tf as (
  select distinct on (fixture_id) tf0.*,
         (select count(*) from thit where thit.team_id in (tf0.home_team_id, tf0.away_team_id)) named
    from tf0 order by fixture_id, pos),
-- That game's top projected player and best under-owned one.
mx as (
  select tf.*, top.web_name top_name, top.team top_team, top.cost top_cost, top.xp top_xp,
         und.web_name und_name, und.team und_team, und.cost und_cost, und.own und_own, und.xp und_xp
    from tf
    left join lateral (
      select ps.web_name, ps.team, ps.cost, ps.own, round(sum(v.expected_fpl_points), 1) xp
        from public.fpl_projection_frontend_feed_v6 v join ps on ps.fpl_player_id = v.fpl_player_id and not ps.missing
       where v.fixture_id = tf.fixture_id group by 1, 2, 3, 4 order by 5 desc limit 1) top on true
    left join lateral (
      select ps.web_name, ps.team, ps.cost, ps.own, round(sum(v.expected_fpl_points), 1) xp
        from public.fpl_projection_frontend_feed_v6 v join ps on ps.fpl_player_id = v.fpl_player_id and not ps.missing and ps.own < 10
       where v.fixture_id = tf.fixture_id group by 1, 2, 3, 4 order by 5 desc limit 1) und on true),
-- Clubs to describe: named teams and named players' clubs.
clubs as (
  select distinct on (fpl_team_id) fpl_team_id, o from (
    select pd.fpl_team_id, pd.rn * 100 + 50 o from pd
    union all select tx.fpl_team_id, 1000 + tx.rn * 100 + 50 from tx) c order by fpl_team_id, o),
-- Every player in the context: those named first, then each one's club top 4 and best under-owned,
-- the same-position alternatives within £0.5m, and for a named team its top 2, best per position
-- and best under-owned. src is the named player an alternative is set against.
rel as (
  select pd.rn * 100 o, pd.fpl_player_id src, pd.fpl_player_id pid from pd
  union all
  select 10000 + pd.rn * 100 + 10 + a.k, pd.fpl_player_id, a.fpl_player_id from pd cross join lateral (
    select x.fpl_player_id, row_number() over (order by x.n5 desc) k
      from av x where x.fpl_team_id = pd.fpl_team_id and x.fpl_player_id <> pd.fpl_player_id order by x.n5 desc limit 4) a
  union all
  select 10000 + pd.rn * 100 + 30 + a.k, pd.fpl_player_id, a.fpl_player_id from pd cross join lateral (
    select x.fpl_player_id, row_number() over (order by x.n5 desc) k
      from av x where x.fpl_team_id = pd.fpl_team_id and x.fpl_player_id <> pd.fpl_player_id and x.own < 10 and x.n5 >= 1
     order by x.n5 desc limit 2) a
  union all
  select 10000 + pd.rn * 100 + 50 + a.k, pd.fpl_player_id, a.fpl_player_id from pd cross join lateral (
    select x.fpl_player_id, row_number() over (order by x.n5 desc) k
      from av x where x.et = pd.et and abs(x.cost - pd.cost) <= 5 and x.fpl_player_id <> pd.fpl_player_id and x.n5 > pd.n5
     order by x.n5 desc limit 3) a
  union all
  select 20000 + tx.rn * 100 + a.k, null::int, a.fpl_player_id from tx cross join lateral (
    select y.fpl_player_id, min(y.k) k from (
      (select x.fpl_player_id, 10 + row_number() over (order by x.n5 desc) k from av x where x.fpl_team_id = tx.fpl_team_id order by x.n5 desc limit 2)
      union all
      (select distinct on (x.et) x.fpl_player_id, 20 + x.et from av x where x.fpl_team_id = tx.fpl_team_id order by x.et, x.n5 desc)
      union all
      (select x.fpl_player_id, 30 + row_number() over (order by x.n5 desc) k from av x
        where x.fpl_team_id = tx.fpl_team_id and x.own < 10 and x.n5 >= 1 order by x.n5 desc limit 2)) y group by 1) a),
ctx as (
  select hr.*, ps.cost, ps.n5, ps.slug, ps.team, c.o, row_number() over (order by c.o, c.pid) n
    from (select pid, min(o) o from rel group by pid order by 2 limit 24) c
    join hr on hr.fpl_player_id = c.pid join ps on ps.fpl_player_id = c.pid),
-- A named player set against each alternative (club or position): price, season, next 5.
vs as (
  select distinct on (r.src, r.pid) r.o, a.web_name a_name, a.fpl_player_id a_id, a.cost a_cost, a.n5 a_n5, a.slug a_slug,
         b.web_name b_name, b.fpl_player_id b_id, b.team b_team, b.cost b_cost, b.n5 b_n5, b.fpl_team_id = a.fpl_team_id same_club,
         ha.pts a_pts, ha.gls a_g, ha.ast a_a, ha.xgi a_xgi, hb.pts b_pts, hb.gls b_g, hb.ast b_a, hb.xgi b_xgi
    from rel r join ps a on a.fpl_player_id = r.src join ps b on b.fpl_player_id = r.pid
    join hr ha on ha.fpl_player_id = a.fpl_player_id join hr hb on hb.fpl_player_id = b.fpl_player_id
   where r.src is not null and r.src <> r.pid
     -- same position, or a teammate projected at least 1 point more (Ødegaard and Havertz v Rice)
     and (b.et = a.et or b.n5 >= a.n5 + 1)
   order by r.src, r.pid, r.o),
-- The comparative sentence for each named player (the template's reply).
pang0 as (
  select px.*,
    case
      when px.missing then
        format('FPL has %s out (%s). %s''s top projected available pick over the next 5 GWs is %s.', px.web_name,
               rtrim(btrim(coalesce(nullif(btrim(px.news), ''), 'unavailable')), '.'), px.team_name,
               (select private.social_pl_short(a.web_name, a.cost, a.own, a.n5) from av a where a.fpl_team_id = px.fpl_team_id order by a.n5 desc limit 1))
      when px.lead_n > 0 then
        concat(case when px.first_out is not null then format('With %s out, ', px.first_out) end,
               format('%s isn''t our top %s pick. Over the next 5 GWs we project %s, v %s''s %s at %s.',
                      px.web_name, px.team_name, px.lead_list, px.web_name, private.social_1(px.n5), private.social_m(px.cost)))
      when px.val_n > 0 and px.val_n5 >= px.n5 + 1 then
        format('Over the next 5 GWs we project %s (%s, %s) %s, v %s''s %s at %s.', px.val_name, px.val_team, private.social_m(px.val_cost),
               private.social_1(px.val_n5), px.web_name, private.social_1(px.n5), private.social_m(px.cost))
      else
        format('%s is our top projected %s pick over the next 5 GWs at %s, and no %s within £0.5m of his %s is projected more. Fixtures: %s.',
               px.web_name, px.team_name, private.social_1(px.n5), (array['goalkeeper', 'defender', 'midfielder', 'forward'])[px.et],
               private.social_m(px.cost), px.run5)
    end a1,
    -- the under-owned clause, when that teammate is projected more than him
    case when px.und_name is not null and px.und_n5 > px.n5 and not px.missing
         then format(' %s (%s%% owned) is the under-owned %s option.', px.und_name, private.social_1(px.und_own), px.team_name) end a2
    from px),
-- What has happened, then what we project (Chris, 6 Nov 2026): his output v his underlying numbers, the
-- alternative's, then price and the next 5. Without an alternative: his past, then the projection sentence.
pang1 as (
  select p.*, alt.web_name alt_name, alt.team alt_team, alt.cost alt_cost, alt.n5 alt_n5, alt.fpl_team_id = p.fpl_team_id alt_same,
         hp.gls p_g, hp.ast p_a, hp.xgi p_xgi, hp.luck p_luck, ha.gls a_g, ha.ast a_a, ha.xgi a_xgi, ha.luck a_luck, ha.av_xgi a_av_xgi,
         ho.xgi out_xgi
    from pang0 p
    left join hr hp on hp.fpl_player_id = p.fpl_player_id
    left join ps alt on alt.fpl_player_id = coalesce(p.lead_id, case when p.val_n5 >= p.n5 + 1 then p.val_id end)
    left join hr ha on ha.fpl_player_id = alt.fpl_player_id
    left join hr ho on ho.fpl_player_id = p.first_out_id),
pang as (
  select p.*,
    case when p.p_xgi is not null and not p.missing then
      case p.p_luck
        when 'running hot' then format('%s''s %s have come from %s xGI, so some of that is finishing luck.', p.web_name,
                                       private.social_ga(p.p_g, p.p_a), private.social_1(p.p_xgi))
        when 'unlucky' then format('%s has %s from %s xGI: the chances have been there.', p.web_name,
                                   private.social_ga(p.p_g, p.p_a), private.social_1(p.p_xgi))
        else format('%s has %s from %s xGI this season.', p.web_name, private.social_ga(p.p_g, p.p_a), private.social_1(p.p_xgi)) end
    end b1,
    case when p.alt_name is not null and p.a_xgi is not null and not p.missing then
      concat(
        case when p.a_luck = 'unlucky' and p.p_luck = 'running hot'
               then format('%s is the reverse: %s from %s xGI', p.alt_name, private.social_ga(p.a_g, p.a_a), private.social_1(p.a_xgi))
             when p.a_luck = 'unlucky'
               then format('%s has %s from %s xGI, so the chances have been there', p.alt_name, private.social_ga(p.a_g, p.a_a), private.social_1(p.a_xgi))
             else format('%s has %s from %s xGI', p.alt_name, private.social_ga(p.a_g, p.a_a), private.social_1(p.a_xgi)) end,
        case when p.alt_same and p.a_av_xgi = 1
             then format(', %s''s best underlying numbers%s', p.team_name,
                         case when p.first_out is not null and p.out_xgi > p.a_xgi then format(' with %s out', p.first_out) end)
             when not p.alt_same then format(' (%s)', p.alt_team) end,
        format('. He''s %s, and we project him %s pts over the next 5 GWs v %s''s %s.',
               case when p.alt_cost < p.cost then private.social_m(p.cost - p.alt_cost) || ' cheaper'
                    when p.alt_cost > p.cost then private.social_m(p.alt_cost - p.cost) || ' dearer'
                    else 'the same price' end,
               private.social_1(p.alt_n5), p.web_name, private.social_1(p.n5)))
    end b2
    from pang1 p),
tang as (
  select tx.*,
         format('%s''s next 5 (%s) rank %s easiest of the %s by FPL difficulty. Our top %s picks over that run: %s.',
                tx.team_name, tx.run5, private.social_ord(tx.d5_rank), tx.nteams, tx.team_name, tx.top_list) a1,
         case when tx.und_name is not null and strpos(coalesce(tx.top_list, ''), tx.und_name || ' (') = 0
              then format(' Under-owned: %s (%s%% owned) %s.', tx.und_name, private.social_1(tx.und_own), private.social_1(tx.und_n5)) end a2,
         format('Our top %s picks over the next 5 GWs: %s.', tx.team_name, tx.top_list) a3,
         -- the run's rank without the fixture list
         format('Their next 5 rank %s easiest of the %s by FPL difficulty; our top %s picks: %s.',
                private.social_ord(tx.d5_rank), tx.nteams, tx.team_name, tx.top_list) a4,
         -- what has happened: the last 5 GWs' goals v xG and conceded v xGC
         case when txg.xg5 is not null
              then format('Over the last 5 GWs %s scored %s from %s xG and conceded %s from %s xGC.', tx.team_name, txg.gf5,
                          private.social_1(txg.xg5), txg.gc5, private.social_1(txg.xgc5)) end b1
    from tx left join txg on txg.fpl_team_id = tx.fpl_team_id),
facts as (
  -- ---------------------------------------------------------------- players
  -- the comparative sentence; the shorter form when the long one is too long
  -- (past and projection first: his output v xGI and the alternative's, then price and the next 5)
  select pang.rn * 100 o, jsonb_build_object('id', 'p' || pang.fpl_player_id || ':angle', 'kind', 'angle', 'about', pang.web_name,
           'source', 'FPL and FixtureShark model',
           'text', pick.txt,
           'link', 'https://fixtureshark.com/fpl/players/' || pang.slug) f
    from pang cross join lateral (
      select c.txt from (values (1, concat_ws(' ', pang.b1, pang.b2)), (2, concat_ws(' ', pang.b1, pang.a1)),
                                (3, concat(pang.a1, pang.a2)), (4, pang.a1)) c(k, txt)
       where (c.k > 2 or (c.k = 1 and pang.b2 is not null) or (c.k = 2 and pang.b1 is not null))
         -- 256 + a space + a link (23) = 280, X's limit
         and public.social_weighted_length(c.txt) <= case when c.k <= 2 then 256 else 250 end
       order by c.k limit 1) pick
  union all
  -- FPL's own figures
  select pd.rn * 100 + 1, jsonb_build_object('id', 'p' || pd.fpl_player_id || ':fpl', 'kind', 'player', 'about', pd.web_name, 'source', 'FPL',
           'text', format('%s (%s, %s) is owned by %s%% of FPL managers and has %s FPL points this season (%s goal%s, %s assist%s).',
                          pd.web_name, pd.team, private.social_m(pd.cost), private.social_1(pd.own), pd.total_points,
                          pd.goals_scored, case when pd.goals_scored = 1 then '' else 's' end, pd.assists, case when pd.assists = 1 then '' else 's' end),
           'link', 'https://fixtureshark.com/fpl/players/' || pd.slug)
    from pd
  union all
  -- next 5: his points, ranks and the fixtures
  select px.rn * 100 + 2, jsonb_build_object('id', 'p' || px.fpl_player_id || ':run', 'kind', 'player', 'about', px.web_name, 'source', 'FixtureShark model',
           'text', concat(format('Next 5 gameweeks (GW%s to GW%s): FixtureShark projects %s %s points (%s in GW%s)', g.gw, g.gw + 4, px.web_name,
                                 private.social_1(px.n5), private.social_1(px.n1), g.gw),
                          case when px.team_rank is not null
                               then format(', %s of %s''s available players and %s of all %s', private.social_ord(px.team_rank), px.team_name,
                                           private.social_ord(px.pos_rank), (array['goalkeepers', 'defenders', 'midfielders', 'forwards'])[px.et]) end,
                          format('. %s''s fixtures: %s (FPL difficulty, 1 easiest to 5 hardest; average %s, %s easiest of the %s teams).',
                                 px.team_name, px.run5, private.social_1(px.d5), private.social_ord(px.d5_rank), px.nteams)),
           'link', 'https://fixtureshark.com/fpl/players/' || px.slug)
    from px cross join g where px.run5 is not null
  union all
  -- his club's top projected available players
  select px.rn * 100 + 3, jsonb_build_object('id', 'p' || px.fpl_player_id || ':team', 'kind', 'player', 'about', px.web_name, 'source', 'FixtureShark model',
           'text', concat(format('%s''s top projected available players over the next 5 gameweeks: %s.', px.team_name, px.top_list),
                          case when coalesce(px.team_rank, 99) > 4 and not px.missing
                               then format(' %s is %s with %s.', px.web_name, private.social_ord(px.team_rank), private.social_1(px.n5)) end,
                          ' FPL allows at most 3 players from one club.'),
           'link', 'https://fixtureshark.com/fpl/players/' || px.slug)
    from px where px.top_list is not null
  union all
  -- the club's best under-owned options
  select px.rn * 100 + 4, jsonb_build_object('id', 'p' || px.fpl_player_id || ':under', 'kind', 'player', 'about', px.web_name, 'source', 'FixtureShark model',
           'text', format('%s''s best under-owned options (under 10%% owned) over the next 5 gameweeks, other than %s: %s.', px.team_name, px.web_name, px.und_list),
           'link', 'https://fixtureshark.com/fpl/players/' || px.slug)
    from px where px.und_list is not null
  union all
  -- better value in his position, any club, within £0.5m
  select px.rn * 100 + 5, jsonb_build_object('id', 'p' || px.fpl_player_id || ':value', 'kind', 'player', 'about', px.web_name, 'source', 'FixtureShark model',
           'text', case when px.val_n > 0
                        then format('%s within £0.5m of %s''s %s projected more than his %s over the next 5 gameweeks: %s. %s is %s of %s %s in that price band.',
                                    initcap((array['goalkeepers', 'defenders', 'midfielders', 'forwards'])[px.et]), px.web_name, private.social_m(px.cost),
                                    private.social_1(px.n5), px.val_list, px.web_name, private.social_ord(px.band_r), px.band_n + 1,
                                    (array['goalkeepers', 'defenders', 'midfielders', 'forwards'])[px.et])
                        else format('No %s within £0.5m of %s''s %s is projected more than his %s over the next 5 gameweeks.',
                                    (array['goalkeeper', 'defender', 'midfielder', 'forward'])[px.et], px.web_name, private.social_m(px.cost), private.social_1(px.n5)) end,
           'link', 'https://fixtureshark.com/fpl/value')
    from px where not px.missing
  union all
  -- the 5 gameweeks after that
  select px.rn * 100 + 6, jsonb_build_object('id', 'p' || px.fpl_player_id || ':later', 'kind', 'player', 'about', px.web_name, 'source', 'FixtureShark model',
           'text', concat(format('After that, GW%s to GW%s, %s play %s (average FPL difficulty %s, v %s over the next 5)', g.gw + 5, g.gw + 9, px.team_name,
                                 px.runl, private.social_1(px.dl), private.social_1(px.d5)),
                          case when (select gw from pmax) >= g.gw + 9 and px.l5 is not null
                               then format(', and FixtureShark projects %s %s points over them, v %s over the next 5', px.web_name,
                                           private.social_1(px.l5), private.social_1(px.n5)) end, '.'),
           'link', 'https://fixtureshark.com/fpl/fixtures')
    from px cross join g where px.nl > 0
  union all
  -- FPL's availability flag
  select pd.rn * 100 + 7, jsonb_build_object('id', 'p' || pd.fpl_player_id || ':status', 'kind', 'player', 'about', pd.web_name, 'source', 'FPL',
           'text', format('FPL flags %s: %s.', pd.web_name, rtrim(btrim(pd.news), '.')), 'link', 'https://fixtureshark.com/fpl/injuries')
    from pd where pd.status <> 'a' and coalesce(btrim(pd.news), '') <> ''
  union all
  -- FPL's own price predictor, when he is at least half way to a change
  select pd.rn * 100 + 8, jsonb_build_object('id', 'p' || pd.fpl_player_id || ':price', 'kind', 'player', 'about', pd.web_name, 'source', 'FPL price predictor',
           'text', case when abs(risk.progress) >= 100
                        then format('FPL''s own price predictor has %s past the line for a price %s at the next overnight update (%s%%).',
                                    pd.web_name, risk.direction, round(abs(risk.progress)))
                        else format('FPL''s own price predictor has %s %s%% of the way to a price %s.', pd.web_name, round(abs(risk.progress)), risk.direction) end,
           'link', 'https://fixtureshark.com/fpl/price-risk')
    from pd join (select r.fpl_player_id::int fpl_player_id, r.progress, r.direction from public.get_price_change_risk((select sid from s)) r) risk
      on risk.fpl_player_id = pd.fpl_player_id
   where abs(risk.progress) >= 50 and risk.direction in ('rise', 'fall')
  union all
  -- ------------------------------------------------------------------ clubs
  -- who FPL has out or doubtful (named players' clubs and named teams)
  select clubs.o, jsonb_build_object('id', 't' || tr.canonical_team_id || ':missing', 'kind', 'team', 'about', tr.team_name, 'source', 'FPL',
           'text', concat_ws(' ', case when miss.out_list is not null then format('FPL has these %s players out: %s.', tr.team_name, miss.out_list) end,
                             case when miss.doubt_list is not null then format('Doubtful for %s: %s.', tr.team_name, miss.doubt_list) end),
           'link', 'https://fixtureshark.com/fpl/injuries')
    from clubs join trun tr on tr.fpl_team_id = clubs.fpl_team_id join miss on miss.fpl_team_id = clubs.fpl_team_id
  union all
  -- named teams: the comparative sentence
  select 1000 + tang.rn * 100, jsonb_build_object('id', 't' || tang.canonical_team_id || ':angle', 'kind', 'angle', 'about', tang.team_name,
           'source', 'FixtureShark model and FPL',
           'text', case when tang.b1 is not null and public.social_weighted_length(concat_ws(' ', tang.b1, tang.a1)) <= 250
                          then concat_ws(' ', tang.b1, tang.a1)
                        when tang.b1 is not null and public.social_weighted_length(concat_ws(' ', tang.b1, tang.a4)) <= 256
                          then concat_ws(' ', tang.b1, tang.a4)
                        when tang.b1 is not null and public.social_weighted_length(concat_ws(' ', tang.b1, tang.a3)) <= 250
                          then concat_ws(' ', tang.b1, tang.a3)
                        when public.social_weighted_length(concat(tang.a1, tang.a2)) <= 250 then concat(tang.a1, tang.a2)
                        when public.social_weighted_length(tang.a1) <= 250 then tang.a1 else concat(tang.a3, tang.a2) end,
           'link', 'https://fixtureshark.com/fpl/fixtures')
    from tang where tang.top_list is not null
  union all
  -- named teams: fixture run, its rank, and the 5 after
  select 1000 + tx.rn * 100 + 1, jsonb_build_object('id', 't' || tx.canonical_team_id || ':run', 'kind', 'team', 'about', tx.team_name, 'source', 'FPL and FixtureShark',
           'text', concat(format('%s''s next 5 gameweeks (GW%s to GW%s): %s (FPL difficulty, 1 easiest to 5 hardest), average %s, the %s easiest of the %s teams.',
                                 tx.team_name, g.gw, g.gw + 4, tx.run5, private.social_1(tx.d5), private.social_ord(tx.d5_rank), tx.nteams),
                          case when tx.nl > 0 then format(' After that (GW%s to GW%s): %s, average %s.', g.gw + 5, g.gw + 9, tx.runl, private.social_1(tx.dl)) end),
           'link', 'https://fixtureshark.com/fpl/fixtures')
    from tx cross join g where tx.run5 is not null
  union all
  -- named teams: top projected player in each position
  select 1000 + tx.rn * 100 + 2, jsonb_build_object('id', 't' || tx.canonical_team_id || ':assets', 'kind', 'team', 'about', tx.team_name, 'source', 'FixtureShark model',
           'text', format('%s''s top projected available player in each position over the next 5 gameweeks: %s. FPL allows at most 3 players from one club.',
                          tx.team_name, tx.pos_list),
           'link', 'https://fixtureshark.com/fpl/fixtures')
    from tx where tx.pos_list is not null
  union all
  -- named teams: under-owned options
  select 1000 + tx.rn * 100 + 3, jsonb_build_object('id', 't' || tx.canonical_team_id || ':under', 'kind', 'team', 'about', tx.team_name, 'source', 'FixtureShark model',
           'text', format('%s''s best under-owned options (under 10%% owned) over the next 5 gameweeks: %s.', tx.team_name, tx.und_list),
           'link', 'https://fixtureshark.com/fpl/fixtures')
    from tx where tx.und_list is not null
  union all
  -- the next game of each named team: forecast
  select 1000 + tf.pos, jsonb_build_object('id', 't' || tf.team_id || ':next', 'kind', 'team',
           'about', case when tf.team_id = tf.home_team_id then tf.home else tf.away end, 'source', 'FixtureShark model',
           'text', format('%s v %s, %s: FixtureShark''s forecast is %s v %s in expected goals.', tf.home, tf.away, to_char(tf.kickoff_date, 'Dy FMDD Mon'),
                          private.social_1(tf.lh), private.social_1(tf.la)),
           'link', 'https://fixtureshark.com/football/matches/' || tf.slug)
    from tf where tf.lh is not null and tf.la is not null
  union all
  -- that game: forecast with its most interesting player (first when the post names both sides)
  select case when mx.named = 2 then 999 else 2000 + mx.pos end,
         jsonb_build_object('id', 'm' || mx.fixture_id || ':angle', 'kind', 'angle', 'about', mx.home || ' v ' || mx.away, 'source', 'FixtureShark model',
           'text', concat(format('Our forecast for %s v %s is %s v %s in expected goals', mx.home, mx.away, private.social_1(mx.lh), private.social_1(mx.la)),
                          case when mx.top_name is not null then format(', and our top projected player in it is %s (%s, %s) with %s points',
                                                                         mx.top_name, mx.top_team, private.social_m(mx.top_cost), private.social_1(mx.top_xp)) end,
                          case when mx.und_name is not null and mx.und_name <> coalesce(mx.top_name, '')
                               then format('; the best under 10%% owned is %s (%s, %s, %s%% owned) with %s', mx.und_name, mx.und_team,
                                           private.social_m(mx.und_cost), private.social_1(mx.und_own), private.social_1(mx.und_xp)) end, '.'),
           'link', 'https://fixtureshark.com/football/matches/' || mx.slug)
    from mx where mx.lh is not null and mx.la is not null
  union all
  -- -------------------------------------------------------- what has happened
  -- season to date, every player in the context
  select case when ctx.o < 10000 then ctx.o + 10 else 3000 + ctx.n * 10 end,
         jsonb_build_object('id', 'p' || ctx.fpl_player_id || ':past', 'kind', 'past', 'about', ctx.web_name, 'source', 'FPL',
           'text', concat(
             format('Season to date (GW%s to GW%s): %s (%s, %s) has %s FPL points in %s minutes (%s start%s), %s from %s xG and %s xA (%s xGI), %s bonus',
                    hw.gw1, hw.gwn, ctx.web_name, ctx.team, private.social_m(ctx.cost), ctx.pts, ctx.mins, ctx.starts,
                    case when ctx.starts = 1 then '' else 's' end, private.social_ga(ctx.gls, ctx.ast),
                    private.social_1(ctx.xg), private.social_1(ctx.xa), private.social_1(ctx.xgi), ctx.bonus),
             case when ctx.et in (1, 2) then format(', %s clean sheet%s', ctx.cs, case when ctx.cs = 1 then '' else 's' end) end, '.',
             case when ctx.p90 is not null then format(' Per 90: %s points and %s xGI.', private.social_1(ctx.p90), to_char(ctx.x90, 'FM990.00')) end,
             format(' Goals plus assists %s v %s xGI (%s)', ctx.ga, private.social_1(ctx.xgi), private.social_signed(ctx.ga - ctx.xgi)),
             case ctx.luck when 'running hot' then ': running hot, more output than the chances suggest'
                           when 'unlucky' then ': unlucky, the chances have been there' end, '.'),
           'link', 'https://fixtureshark.com/fpl/players/' || ctx.slug)
    from ctx cross join hw
  union all
  -- the last 5 gameweeks
  select case when ctx.o < 10000 then ctx.o + 11 else 3000 + ctx.n * 10 + 1 end,
         jsonb_build_object('id', 'p' || ctx.fpl_player_id || ':form', 'kind', 'past', 'about', ctx.web_name, 'source', 'FPL',
           'text', concat(
             format('Last 5 gameweeks (GW%s to GW%s): %s has %s FPL points in %s minutes, %s from %s xGI (%s)', greatest(hw.gw1, hw.gwn - 4), hw.gwn,
                    ctx.web_name, ctx.pts5, ctx.mins5, private.social_ga(ctx.gls5, ctx.ast5), private.social_1(ctx.xgi5),
                    private.social_signed(ctx.ga5 - ctx.xgi5)),
             case ctx.luck5 when 'running hot' then ': running hot' when 'unlucky' then ': unlucky, the chances have been there' end, '.'),
           'link', 'https://fixtureshark.com/fpl/players/' || ctx.slug)
    from ctx cross join hw
  union all
  -- each figure's rank in his club and in his position
  select case when ctx.o < 10000 then ctx.o + 12 else 3000 + ctx.n * 10 + 2 end,
         jsonb_build_object('id', 'p' || ctx.fpl_player_id || ':ranks', 'kind', 'past', 'about', ctx.web_name, 'source', 'FPL',
           'text', concat(
             format('%s''s ranks at %s and among all %s: season FPL points %s and %s, season xGI %s and %s', ctx.web_name, ctx.team_name,
                    (array['goalkeepers', 'defenders', 'midfielders', 'forwards'])[ctx.et],
                    private.social_ord(ctx.c_pts), private.social_ord(ctx.p_pts), private.social_ord(ctx.c_xgi), private.social_ord(ctx.p_xgi)),
             case when ctx.p90 is not null then format(', points per 90 %s and %s, xGI per 90 %s and %s (270+ minutes)',
                    private.social_ord(ctx.c_p90), private.social_ord(ctx.p_p90), private.social_ord(ctx.c_x90), private.social_ord(ctx.p_x90)) end,
             format(', last-5 points %s and %s, last-5 xGI %s and %s.', private.social_ord(ctx.c_pts5), private.social_ord(ctx.p_pts5),
                    private.social_ord(ctx.c_xgi5), private.social_ord(ctx.p_xgi5))),
           'link', 'https://fixtureshark.com/fpl/players/' || ctx.slug)
    from ctx
  union all
  -- a named player against each alternative: price, season, next 5
  select vs.o - 8000, jsonb_build_object('id', 'p' || vs.a_id || ':v' || vs.b_id, 'kind', 'past', 'about', vs.a_name, 'source', 'FPL and FixtureShark model',
           'text', format('%s (%s%s) is %s %s (%s). Season: %s %s pts, %s, %s xGI; %s %s pts, %s, %s xGI. Over the next 5 GWs we project %s %s pts v %s''s %s.',
                          vs.b_name, case when vs.same_club then '' else vs.b_team || ', ' end, private.social_m(vs.b_cost),
                          case when vs.b_cost < vs.a_cost then private.social_m(vs.a_cost - vs.b_cost) || ' cheaper than'
                               when vs.b_cost > vs.a_cost then private.social_m(vs.b_cost - vs.a_cost) || ' dearer than' else 'the same price as' end,
                          vs.a_name, private.social_m(vs.a_cost),
                          vs.b_name, vs.b_pts, private.social_ga(vs.b_g, vs.b_a), private.social_1(vs.b_xgi),
                          vs.a_name, vs.a_pts, private.social_ga(vs.a_g, vs.a_a), private.social_1(vs.a_xgi),
                          vs.b_name, private.social_1(vs.b_n5), vs.a_name, private.social_1(vs.a_n5)),
           'link', 'https://fixtureshark.com/fpl/players/' || vs.a_slug)
    from vs
  union all
  -- each club in the context: goals v xG, conceded v xGC
  select clubs.o + 1, jsonb_build_object('id', 't' || tr.canonical_team_id || ':xg', 'kind', 'past', 'about', tr.team_name, 'source', 'FPL',
           'text', concat(
             format('%s this season (GW%s to GW%s): %s goals from %s xG (%s, %s of the %s for xG), %s conceded from %s xGC (%s, %s of the %s for fewest xGC).',
                    tr.team_name, hw.gw1, hw.gwn, txg.gf, private.social_1(txg.xg), private.social_signed(txg.gf - txg.xg),
                    private.social_ord(txg.xg_rank), txg.nteams, txg.gc, private.social_1(txg.xgc), private.social_signed(txg.gc - txg.xgc),
                    private.social_ord(txg.xgc_rank), txg.nteams),
             case when txg.xg5 is not null then format(' Last 5 GWs: %s from %s xG, %s conceded from %s xGC.', txg.gf5, private.social_1(txg.xg5),
                                                       txg.gc5, private.social_1(txg.xgc5)) end),
           'link', 'https://fixtureshark.com/fpl/fixtures')
    from clubs join trun tr on tr.fpl_team_id = clubs.fpl_team_id join txg on txg.fpl_team_id = clubs.fpl_team_id cross join hw
  union all
  -- ----------------------------------------------------------------- topics
  -- captaincy, when the post talks about it
  select 9000, jsonb_build_object('id', 'captaincy', 'kind', 'topic', 'about', 'captaincy', 'source', 'FixtureShark model',
           'text', format('FixtureShark''s top projected captains for GW%s: %s.', g.gw,
                          (select string_agg(c->>'web_name' || ' ' || to_char((c->>'xpts')::numeric, 'FM990.0'), ', ' order by (c->>'rank')::int)
                             from jsonb_array_elements(private.social_captaincy_top((select sid from s), g.gw, (select model_version from mv), 3)) c)),
           'link', 'https://fixtureshark.com/fpl/gameweek')
    from g, t where t.low ~ '\m(captain|captaincy|captains|armband|skipper)\M'
  union all
  -- price changes, when the post talks about them
  select 9100, jsonb_build_object('id', 'prices', 'kind', 'topic', 'about', 'price changes', 'source', 'FPL price predictor',
           'text', 'FPL''s own price predictor, most owned first: ' || x.list || '.', 'link', 'https://fixtureshark.com/fpl/price-risk')
    from t, (select string_agg(format('%s %s%% to a %s', r.web_name, round(abs(r.progress)), r.direction), ', ' order by r.ownership desc) list
               from (select * from public.get_price_change_risk((select sid from s)) r
                      where abs(r.progress) >= 90 and r.ownership >= 1 order by r.ownership desc limit 3) r) x
   where t.low ~ '\m(price|prices|risers?|fallers?)\M' and x.list is not null)
select jsonb_build_object(
  'gw', (select gw from g), 'deadline', (select deadline_time from g), 'model_version', (select model_version from mv),
  -- "Spurs's" -> "Spurs'"
  'facts', coalesce((select jsonb_agg(jsonb_set(f, '{text}', to_jsonb(regexp_replace(f->>'text', 's''s([^[:alnum:]])', 's''\1', 'g'))) order by o)
                       from facts where coalesce(f->>'text', '') <> ''), '[]'::jsonb))
$$;
revoke all on function private.social_reply_facts(text) from public, anon, authenticated;

-- Redraft the open ideas from the last 36 hours (no X reads).
select private.social_replies_call('redraft', 'angle-first');
