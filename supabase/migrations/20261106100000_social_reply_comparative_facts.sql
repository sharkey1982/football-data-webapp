-- ============================================================================
-- X reply ideas (6 Nov 2026): comparative facts.
--
-- Chris, 6 Nov, on "Rice ... is owned by 12.6% ... FixtureShark projects Rice
-- 5.2 points for GW10": saying what the model says one player scores is not
-- engaging. Say whether there is better value, whether his fixtures are good,
-- and whether he is the best of a club's 3 (with Saka out, is there an
-- under-owned Arsenal player?).
--
-- private.social_reply_facts now gives, for every player a post names
-- (projections: public.fpl_projection_frontend_feed_v6, the current model):
--   p<id>:run    next 5 gameweeks' projected points (and the next GW alone),
--                his rank among his club's available players and in his
--                position, and the club's fixtures with FPL difficulty;
--   p<id>:team   his club's top projected available players (FPL's 3-a-club);
--   t<id>:missing the club's players FPL has out or doubtful;
--   p<id>:under  the club's best under-owned (under 10%) options;
--   p<id>:value  players in his position within £0.5m projected more;
--   p<id>:later  the 5 gameweeks after that: fixtures, difficulty, points;
--   p<id>:angle  one comparative sentence (the template's fallback reply).
-- For a team a post names: t<id>:run (fixture run, its difficulty rank of the
-- 20, the next 5 after), t<id>:assets (top projected player per position),
-- t<id>:under, t<id>:missing, t<id>:angle. For its next game: the forecast
-- (t<id>:next, as before) and m<fixture>:angle, the forecast with the game's
-- top projected player and best under-owned one.
-- FPL's own figures, injury flags, price predictor, captaincy and price-change
-- facts are as before. Every number a draft uses must be in these sentences
-- (public.social_reply_check, unchanged).
--
-- Then redrafts today's open ideas with the new facts (x-replies kind
-- 'redraft': no X reads). Safe to re-run: create or replace; a redraft only
-- rewrites open ideas.
-- ============================================================================

create or replace function private.social_ord(n bigint)
returns text language sql immutable set search_path = pg_temp as $$
  select n || case when n % 100 in (11, 12, 13) then 'th' when n % 10 = 1 then 'st' when n % 10 = 2 then 'nd'
                   when n % 10 = 3 then 'rd' else 'th' end;
$$;

-- £ price from FPL's now_cost (74 -> £7.4m)
create or replace function private.social_m(c numeric)
returns text language sql immutable set search_path = pg_temp as $$
  select '£' || to_char(c / 10.0, 'FM990.0') || 'm';
$$;

create or replace function private.social_1(x numeric)
returns text language sql immutable set search_path = pg_temp as $$
  select to_char(x, 'FM990.0');
$$;

-- "Havertz (FWD, £7.4m, 5.8% owned) 24.4"
create or replace function private.social_pl(p_name text, p_et int, p_cost numeric, p_own numeric, p_pts numeric, p_team text default null)
returns text language sql immutable set search_path = pg_temp as $$
  select format('%s (%s, %s, %s%% owned) %s', p_name,
                concat_ws(' ', p_team, (array['GKP', 'DEF', 'MID', 'FWD'])[p_et]),
                private.social_m(p_cost), private.social_1(p_own), private.social_1(p_pts));
$$;

-- "Ødegaard (£6.7m) 27.2", with ownership when under 10%
create or replace function private.social_pl_short(p_name text, p_cost numeric, p_own numeric, p_pts numeric)
returns text language sql immutable set search_path = pg_temp as $$
  select format('%s (%s%s) %s', p_name, private.social_m(p_cost),
                case when p_own < 10 then ', ' || private.social_1(p_own) || '% owned' else '' end, private.social_1(p_pts));
$$;
revoke all on function private.social_ord(bigint), private.social_m(numeric), private.social_1(numeric),
  private.social_pl(text, int, numeric, numeric, numeric, text), private.social_pl_short(text, numeric, numeric, numeric)
  from public, anon, authenticated;

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
         band.n band_n, band.r band_r, firstout.name first_out
    from pd
    left join trun tr on tr.fpl_team_id = pd.fpl_team_id
    -- teammates projected at least 1 point more, top 2
    left join lateral (
      select string_agg(private.social_pl_short(a.web_name, a.cost, a.own, a.n5), ' and ' order by a.n5 desc) list, count(*) n
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
             (array_agg(a.cost order by a.n5 desc))[1] cost, (array_agg(a.n5 order by a.n5 desc))[1] n5
        from (select * from av a where a.et = pd.et and abs(a.cost - pd.cost) <= 5 and a.fpl_player_id <> pd.fpl_player_id and a.n5 > pd.n5
               order by a.n5 desc limit 3) a) val on true
    left join lateral (
      select count(*) n, 1 + count(*) filter (where a.n5 > pd.n5) r
        from av a where a.et = pd.et and abs(a.cost - pd.cost) <= 5 and (a.fpl_player_id <> pd.fpl_player_id)) band on true
    left join lateral (
      select a.web_name name from ps a where a.fpl_team_id = pd.fpl_team_id and a.missing and a.fpl_player_id <> pd.fpl_player_id
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
-- The comparative sentence for each named player (the template's reply).
pang as (
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
tang as (
  select tx.*,
         format('%s''s next 5 (%s) rank %s easiest of the %s by FPL difficulty. Our top %s picks over that run: %s.',
                tx.team_name, tx.run5, private.social_ord(tx.d5_rank), tx.nteams, tx.team_name, tx.top_list) a1,
         case when tx.und_name is not null and strpos(coalesce(tx.top_list, ''), tx.und_name || ' (') = 0
              then format(' Under-owned: %s (%s%% owned) %s.', tx.und_name, private.social_1(tx.und_own), private.social_1(tx.und_n5)) end a2,
         format('%s''s top %s picks over the next 5 GWs: %s.', tx.team_name, tx.team_name, tx.top_list) a3
    from tx),
facts as (
  -- ---------------------------------------------------------------- players
  -- the comparative sentence; the shorter form when the long one is too long
  select pang.rn * 100 o, jsonb_build_object('id', 'p' || pang.fpl_player_id || ':angle', 'kind', 'angle', 'about', pang.web_name,
           'source', 'FixtureShark model and FPL',
           'text', case when public.social_weighted_length(concat(pang.a1, pang.a2)) <= 250 then concat(pang.a1, pang.a2) else pang.a1 end,
           'link', 'https://fixtureshark.com/fpl/players/' || pang.slug) f
    from pang where public.social_weighted_length(pang.a1) <= 250
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
           'text', case when public.social_weighted_length(concat(tang.a1, tang.a2)) <= 250 then concat(tang.a1, tang.a2)
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

-- Redraft today's open ideas with the new facts (no X reads).
select private.social_replies_call('redraft', 'comparative-facts');
