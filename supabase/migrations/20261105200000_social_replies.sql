-- ============================================================================
-- Reply support for @FixtureSharkHQ (Chris approved 5 Nov 2026).
-- Runbook: docs/social-publishing.md, "Replies".
--
-- 1. Reply ideas (Chris posts them himself). Once a day (17:40 UK by
--    default, social_settings.reply_ideas_hours), Edge Function x-replies
--    reads the newest posts from a short list of big FPL and football
--    accounts (social_reply_accounts, handles verified with X), keeps those
--    where our data adds something (a player, a team, captaincy or price
--    changes we hold numbers on: private.social_reply_facts), drafts a reply
--    from those facts only, and stores at most 3 a day in social_reply_ideas
--    with a one-tap X intent link and the post link. X refuses automated
--    replies to accounts that have not mentioned us, so these are never
--    posted by the API.
-- 2. Mentions. Every 3 hours x-replies reads @FixtureSharkHQ's mentions
--    (owned reads), records each in social_mentions, skips spam, abuse, bots
--    and anything not worth answering, and drafts a reply for each genuine
--    question or comment as a social_post_candidates row (post_type
--    'mention_reply', in_reply_to_x_id) that waits for Chris's approval
--    (social-notify kind 'draft', /admin/social). x-publish posts it as a
--    reply. social_settings.auto_mention_replies (off) would queue them for
--    automatic posting after the normal hold instead.
-- 3. Both admin emails (19:25 and 07:30) get "Reply ideas" and "Mentions"
--    sections after the X section (private.admin_reply_sections, added in
--    private.admin_digest).
--
-- Cost (X pay-per-use, Nov 2026): other accounts' posts $0.005 each, owned
-- reads (our mentions and timeline) $0.001, user objects $0.010. Ideas: one
-- search a day, at most 10 posts ($0.05), plus our own timeline (at most
-- 10, only while an idea is open) to see which ideas Chris posted. Mentions:
-- only what is returned. social_settings.reply_reads_budget_usd ($1.50 a
-- month) caps all of it: the ideas read keeps pace with the month and leaves
-- $0.06 for mentions; nothing reads once the month's X spend (posts, metric
-- reads and these) would pass monthly_budget_usd. Each run's estimate is in
-- social_reply_runs.estimated_cost_usd.
--
-- Mention replies have their own limits (max_replies_per_day, 5 minutes
-- apart) instead of the post limits, so a reply never uses up the day's
-- posts (private.social_limit_reasons gains p_post_type; the two callers are
-- patched by anchored string replacement).
--
-- No secrets here. Safe to re-run: if not exists, create or replace,
-- on conflict do nothing, guarded cron and constraint changes.
-- ============================================================================

-- ==================================================================== settings
alter table public.social_settings
  add column if not exists auto_mention_replies boolean not null default false,
  add column if not exists reply_ideas_enabled boolean not null default true,
  add column if not exists mentions_enabled boolean not null default true,
  add column if not exists reply_ideas_hours int[] not null default '{17}',
  add column if not exists reply_ideas_per_day int not null default 3,
  add column if not exists reply_reads_budget_usd numeric not null default 1.50,
  add column if not exists max_replies_per_day int not null default 5;

-- ================================================================== candidates
alter table public.social_post_candidates add column if not exists in_reply_to_x_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'social_post_candidates_post_type_check'
                   and pg_get_constraintdef(oid) like '%mention_reply%') then
    alter table public.social_post_candidates drop constraint if exists social_post_candidates_post_type_check;
    alter table public.social_post_candidates add constraint social_post_candidates_post_type_check check (post_type = any (array[
      'fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight', 'announcement', 'fpl_price_changes',
      'gameweek_thread', 'fpl_availability', 'fpl_market', 'fpl_week_changes', 'gameweek_outlook', 'fixture_moved',
      'match_predictions', 'quiz', 'quiz_answer', 'fact', 'daily_market', 'lineup_vs_model', 'team_news', 'fpl_price_watch',
      'mention_reply']));
  end if;
end $$;

-- ====================================================================== tables
create table if not exists public.social_reply_accounts (
  handle text primary key,
  x_user_id text,
  display_name text,
  followers int,
  active boolean not null default true,
  verified_at timestamptz,
  checked_at timestamptz,
  note text,
  added_at timestamptz not null default now()
);

create table if not exists public.social_reply_runs (
  run_id bigserial primary key,
  kind text not null check (kind in ('ideas', 'mentions')),
  triggered_by text not null default 'schedule',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text check (status in ('ok', 'skipped', 'error')),
  posts_read int not null default 0,      -- other accounts' posts ($0.005)
  owned_read int not null default 0,      -- our mentions and timeline ($0.001)
  users_read int not null default 0,      -- user objects ($0.010)
  estimated_cost_usd numeric not null default 0,
  llm_cost_usd numeric not null default 0,
  newest_id text,                         -- since_id for the next run
  timeline_newest_id text,
  made int not null default 0,            -- ideas or mention drafts
  note text,
  error text,
  detail jsonb not null default '{}'
);
create index if not exists social_reply_runs_kind on public.social_reply_runs (kind, started_at desc);

create table if not exists public.social_reply_ideas (
  idea_id bigserial primary key,
  run_id bigint references public.social_reply_runs (run_id),
  x_post_id text not null unique,
  author_handle text not null,
  author_x_id text,
  post_text text not null,
  post_created_at timestamptz,
  post_metrics jsonb,
  draft_text text not null,
  facts jsonb not null default '[]',      -- facts offered to the drafter
  facts_used jsonb not null default '[]', -- the ones the draft uses
  link text,
  intent_url text not null,
  post_url text not null,
  drafted_by text,
  score numeric,
  status text not null default 'suggested' check (status in ('suggested', 'posted', 'ignored')),
  status_at timestamptz,
  status_note text,
  posted_x_post_id text,
  created_at timestamptz not null default now()
);
create index if not exists social_reply_ideas_created on public.social_reply_ideas (created_at desc);

create table if not exists public.social_mentions (
  x_post_id text primary key,
  run_id bigint references public.social_reply_runs (run_id),
  author_x_id text,
  author_username text,
  author_name text,
  author_followers int,
  author_created_at timestamptz,
  text text not null,
  created_at_x timestamptz,
  conversation_id text,
  replied_to_x_id text,                   -- the post it replies to, if any
  replied_to_ours boolean not null default false,
  category text check (category in ('question', 'comment', 'spam', 'abuse', 'bot', 'not_worth', 'own')),
  reason text,
  candidate_id bigint references public.social_post_candidates (candidate_id),
  received_at timestamptz not null default now()
);
create index if not exists social_mentions_received on public.social_mentions (received_at desc);

alter table public.social_reply_accounts enable row level security;
alter table public.social_reply_runs enable row level security;
alter table public.social_reply_ideas enable row level security;
alter table public.social_mentions enable row level security;
do $$
declare t text;
begin
  foreach t in array array['social_reply_accounts', 'social_reply_runs', 'social_reply_ideas', 'social_mentions'] loop
    if not exists (select 1 from pg_policy where polname = t || '_admin_read') then
      execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_admin_read', t);
    end if;
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Seed: big FPL and football accounts. x-replies checks each with X before
-- its first read and switches off any that X does not know.
insert into public.social_reply_accounts (handle, note) values
  ('OfficialFPL', 'Fantasy Premier League'),
  ('PremierLeague', 'Premier League'),
  ('OptaJoe', 'Opta stats'),
  ('FFScout', 'Fantasy Football Scout'),
  ('FPLGeneral', 'FPL General'),
  ('BenCrellin', 'Ben Crellin, fixtures and FPL schedules'),
  ('LetsTalk_FPL', 'Let''s Talk FPL'),
  ('FPLFocal', 'FPL Focal')
on conflict (handle) do nothing;

-- ======================================================================= facts
-- What our data says about the players, teams and topics a post names. Every
-- fact is a full sentence with its numbers and the page it comes from. A
-- draft may only use numbers that appear in these sentences.
create or replace function private.social_reply_facts(p_text text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
with inp as (select coalesce(p_text, '') v),
s as (select public.fpl_current_season_id() sid),
g as (select fg.fpl_event_id gw, fg.deadline_time from public.fpl_gameweeks fg join s on fg.season_id = s.sid
       where fg.deadline_time > now() order by fg.deadline_time limit 1),
mv as (select p.model_version from public.fpl_player_projections p join s on p.season_id = s.sid order by p.generated_at desc limit 1),
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
pd as (
  select pl.fpl_player_id, pl.web_name, pl.slug, pl.element_type, pl.status, pl.news, pl.now_cost, pl.selected_by_percent own,
         pl.total_points, pl.goals_scored, pl.assists, pl.fpl_team_id, ft.short_name team, players.pos
    from players join s on true
    join public.fpl_players pl on pl.season_id = s.sid and pl.fpl_player_id = players.fpl_player_id
    join public.fpl_teams ft on ft.season_id = pl.season_id and ft.fpl_team_id = pl.fpl_team_id),
-- Projected points for the next gameweek, as the captaincy post sums them
-- (latest model version, baseline scenario, double gameweeks counted twice).
proj as (
  select p.fpl_player_id, round(sum(p.expected_fpl_points), 2) xp
    from public.fpl_player_projections p
    join s on p.season_id = s.sid join mv on p.model_version = mv.model_version
    join public.fpl_fixtures ff on ff.season_id = p.season_id and ff.canonical_fixture_id = p.fixture_id
    join g on ff.fpl_event_id = g.gw
   where coalesce(p.scenario_key, 'baseline') = 'baseline'
   group by 1),
rk as (
  select proj.*, rank() over (order by proj.xp desc) r_all, rank() over (partition by pl.element_type order by proj.xp desc) r_pos
    from proj join s on true join public.fpl_players pl on pl.season_id = s.sid and pl.fpl_player_id = proj.fpl_player_id),
opp as (
  select pd.fpl_player_id,
         string_agg(ot.short_name || case when ff.fpl_home_team_id = pd.fpl_team_id then ' at home' else ' away' end, ' and ' order by ff.kickoff_time) opp
    from pd join s on true join g on true
    join public.fpl_fixtures ff on ff.season_id = s.sid and ff.fpl_event_id = g.gw and pd.fpl_team_id in (ff.fpl_home_team_id, ff.fpl_away_team_id)
    join public.fpl_teams ot on ot.season_id = s.sid
     and ot.fpl_team_id = case when ff.fpl_home_team_id = pd.fpl_team_id then ff.fpl_away_team_id else ff.fpl_home_team_id end
   group by 1),
risk as (select r.fpl_player_id::int fpl_player_id, r.progress, r.direction from public.get_price_change_risk((select sid from s)) r),
-- Teams: FPL name, display and canonical names, and a few short forms.
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
tf0 as (
  select distinct on (th.team_id) th.team_id, th.pos, f.fixture_id, f.slug, f.kickoff_date, f.home_team_id,
         coalesce(hd.display_name, hd.canonical_name) home, coalesce(aw.display_name, aw.canonical_name) away,
         coalesce(f.market_home_goals, f.predicted_home_goals) lh, coalesce(f.market_away_goals, f.predicted_away_goals) la
    from thit th
    join public.fixtures f on f.league_id = 1 and f.status = 'scheduled'
     and f.kickoff_date >= (now() at time zone 'Europe/London')::date and th.team_id in (f.home_team_id, f.away_team_id)
    join public.teams hd on hd.team_id = f.home_team_id join public.teams aw on aw.team_id = f.away_team_id
   order by th.team_id, f.kickoff_date, f.kickoff_time),
tf as (select distinct on (fixture_id) * from tf0 order by fixture_id, pos),
facts as (
  -- FPL's own figures for each player named
  select pd.pos * 10 + 1 o, jsonb_build_object('id', 'p' || pd.fpl_player_id || ':fpl', 'kind', 'player', 'about', pd.web_name, 'source', 'FPL',
           'text', format('%s (%s, £%sm) is owned by %s%% of FPL managers and has %s FPL points this season (%s goals, %s assists).',
                          pd.web_name, pd.team, to_char(pd.now_cost / 10.0, 'FM990.0'), to_char(pd.own, 'FM990.0'), pd.total_points, pd.goals_scored, pd.assists),
           'link', 'https://fixtureshark.com/fpl/players/' || pd.slug) f
    from pd
  union all
  -- our projection for the next gameweek, with his rank
  select pd.pos * 10 + 2, jsonb_build_object('id', 'p' || pd.fpl_player_id || ':proj', 'kind', 'player', 'about', pd.web_name, 'source', 'FixtureShark model',
           'text', format('FixtureShark projects %s %s points for GW%s (%s), %s.', pd.web_name, to_char(rk.xp, 'FM990.0'), g.gw, opp.opp,
                          case when rk.r_all = 1 then 'the most of any player'
                               else concat_ws(' ', rk.r_all || case when rk.r_all % 100 in (11, 12, 13) then 'th' when rk.r_all % 10 = 1 then 'st'
                                                                   when rk.r_all % 10 = 2 then 'nd' when rk.r_all % 10 = 3 then 'rd' else 'th' end,
                                              'of all players and',
                                              rk.r_pos || case when rk.r_pos % 100 in (11, 12, 13) then 'th' when rk.r_pos % 10 = 1 then 'st'
                                                               when rk.r_pos % 10 = 2 then 'nd' when rk.r_pos % 10 = 3 then 'rd' else 'th' end,
                                              'of ' || case pd.element_type when 1 then 'goalkeepers' when 2 then 'defenders' when 3 then 'midfielders'
                                                                            when 4 then 'forwards' else 'players in his position' end) end),
           'link', 'https://fixtureshark.com/fpl/players/' || pd.slug)
    from pd join rk using (fpl_player_id) join opp using (fpl_player_id) cross join g
   where rk.xp >= 0.5
  union all
  -- FPL's availability flag
  select pd.pos * 10 + 3, jsonb_build_object('id', 'p' || pd.fpl_player_id || ':status', 'kind', 'player', 'about', pd.web_name, 'source', 'FPL',
           'text', format('FPL flags %s: %s.', pd.web_name, rtrim(btrim(pd.news), '.')), 'link', 'https://fixtureshark.com/fpl/injuries')
    from pd where pd.status <> 'a' and coalesce(btrim(pd.news), '') <> ''
  union all
  -- FPL's own price predictor, when he is at least half way to a change
  select pd.pos * 10 + 4, jsonb_build_object('id', 'p' || pd.fpl_player_id || ':price', 'kind', 'player', 'about', pd.web_name, 'source', 'FPL price predictor',
           'text', case when abs(risk.progress) >= 100
                        then format('FPL''s own price predictor has %s past the line for a price %s at the next overnight update (%s%%).',
                                    pd.web_name, risk.direction, round(abs(risk.progress)))
                        else format('FPL''s own price predictor has %s %s%% of the way to a price %s.', pd.web_name, round(abs(risk.progress)), risk.direction) end,
           'link', 'https://fixtureshark.com/fpl/price-risk')
    from pd join risk using (fpl_player_id) where abs(risk.progress) >= 50 and risk.direction in ('rise', 'fall')
  union all
  -- the next Premier League game of each team named
  select 500 + tf.pos, jsonb_build_object('id', 't' || tf.team_id || ':next', 'kind', 'team',
           'about', case when tf.team_id = tf.home_team_id then tf.home else tf.away end, 'source', 'FixtureShark model',
           'text', format('%s v %s, %s: FixtureShark''s forecast is %s v %s in expected goals.', tf.home, tf.away, to_char(tf.kickoff_date, 'Dy FMDD Mon'),
                          to_char(tf.lh, 'FM990.0'), to_char(tf.la, 'FM990.0')),
           'link', 'https://fixtureshark.com/football/matches/' || tf.slug)
    from tf where tf.lh is not null and tf.la is not null
  union all
  -- captaincy, when the post talks about it
  select 900, jsonb_build_object('id', 'captaincy', 'kind', 'topic', 'about', 'captaincy', 'source', 'FixtureShark model',
           'text', format('FixtureShark''s top projected captains for GW%s: %s.', g.gw,
                          (select string_agg(c->>'web_name' || ' ' || to_char((c->>'xpts')::numeric, 'FM990.0'), ', ' order by (c->>'rank')::int)
                             from jsonb_array_elements(private.social_captaincy_top((select sid from s), g.gw, (select model_version from mv), 3)) c)),
           'link', 'https://fixtureshark.com/fpl/gameweek')
    from g, t where t.low ~ '\m(captain|captaincy|captains|armband|skipper)\M'
  union all
  -- price changes, when the post talks about them
  select 910, jsonb_build_object('id', 'prices', 'kind', 'topic', 'about', 'price changes', 'source', 'FPL price predictor',
           'text', 'FPL''s own price predictor, most owned first: ' || x.list || '.', 'link', 'https://fixtureshark.com/fpl/price-risk')
    from t, (select string_agg(format('%s %s%% to a %s', r.web_name, round(abs(r.progress)), r.direction), ', ' order by r.ownership desc) list
               from (select * from public.get_price_change_risk((select sid from s)) r
                      where abs(r.progress) >= 90 and r.ownership >= 1 order by r.ownership desc limit 3) r) x
   where t.low ~ '\m(price|prices|risers?|fallers?)\M' and x.list is not null)
select jsonb_build_object(
  'gw', (select gw from g), 'deadline', (select deadline_time from g), 'model_version', (select model_version from mv),
  'facts', coalesce((select jsonb_agg(f order by o) from facts where f->>'text' is not null), '[]'::jsonb))
$$;
revoke all on function private.social_reply_facts(text) from public, anon, authenticated;

create or replace function public.social_reply_facts(p_text text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select private.social_reply_facts(p_text);
$$;
revoke all on function public.social_reply_facts(text) from public, anon, authenticated;
grant execute on function public.social_reply_facts(text) to service_role;

-- ======================================================================= check
-- House rules for a drafted reply. Returns the reasons it fails (empty = ok):
-- under 280 (links count 23), every number in the facts, at most one link and
-- only a fact's fixtureshark.com page (none when p_allow_link is false), no
-- @ or #, and no betting, hype or exclamation (private.social_hook_ok).
create or replace function public.social_reply_check(p_text text, p_facts jsonb, p_allow_link boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  e jsonb := '[]'; v text := btrim(coalesce(p_text, '')); v_facts text; v_links text[]; v_urls text[]; v_rest text; u text;
begin
  if v = '' then return jsonb_build_array('empty'); end if;
  if public.social_weighted_length(v) > 280 then e := e || to_jsonb(format('too long: %s of 280', public.social_weighted_length(v))); end if;
  select string_agg(f->>'text', ' '), array_agg(distinct f->>'link') filter (where f->>'link' is not null)
    into v_facts, v_links from jsonb_array_elements(coalesce(p_facts, '[]')) f;
  if not (public.social_numbers(regexp_replace(v, 'https?://\S+', '', 'g')) <@ public.social_numbers(coalesce(v_facts, ''))) then
    e := e || to_jsonb('a number that is not in our facts'::text);
  end if;
  select coalesce(array_agg(m[1]), '{}') into v_urls from regexp_matches(v, '(https?://\S+)', 'g') m;
  if cardinality(v_urls) > (case when p_allow_link then 1 else 0 end) then
    e := e || to_jsonb(case when p_allow_link then 'more than one link' else 'a link (not allowed here)' end);
  end if;
  foreach u in array v_urls loop
    if not (rtrim(u, '.,)') = any (coalesce(v_links, '{}'))) then e := e || to_jsonb(format('link is not one of our fact pages: %s', u)); end if;
  end loop;
  v_rest := regexp_replace(v, 'https?://\S+', '', 'g');
  if public.social_has_url(v_rest) then e := e || to_jsonb('a bare web address'::text); end if;
  if v ~ '[@#]' then e := e || to_jsonb('no @ or # in a reply'::text); end if;
  if not private.social_hook_ok(v_rest) then e := e || to_jsonb('betting or hype words, an emoji or an exclamation mark'::text); end if;
  return e;
end;
$$;
revoke all on function public.social_reply_check(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.social_reply_check(text, jsonb, boolean) to service_role;

-- ====================================================================== budget
-- Month to date (London month): this feature's reads, X metric reads and
-- live posting, and whether a run of p_kind with p_estimate may go.
-- Ideas keep pace with the month (allowance to tomorrow) and leave $0.06 for
-- mentions; mentions may use the whole cap. Nothing goes past the X budget.
create or replace function public.social_reply_budget(p_kind text, p_estimate numeric)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.social_settings;
  v_m0 timestamptz := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
  v_day int := extract(day from now() at time zone 'Europe/London');
  v_days int := extract(day from (date_trunc('month', now() at time zone 'Europe/London') + interval '1 month - 1 day'));
  v_reply numeric; v_metrics numeric; v_posts numeric; v_total numeric; v_allow numeric; r jsonb := '[]';
begin
  select * into s from public.social_settings where id;
  select coalesce(sum(estimated_cost_usd), 0) into v_reply from public.social_reply_runs where started_at >= v_m0;
  select coalesce(sum(estimated_cost_usd), 0) into v_metrics from public.social_metrics_runs where started_at >= v_m0;
  select coalesce(sum(estimated_cost_usd), 0) into v_posts from public.social_publish_attempts
   where mode = 'live' and (outcome is null or outcome in ('posted', 'unknown')) and started_at >= v_m0;
  v_total := v_reply + v_metrics + v_posts;
  v_allow := case when p_kind = 'ideas' then (s.reply_reads_budget_usd - 0.06) * least(1, (v_day + 1)::numeric / v_days)
                  else s.reply_reads_budget_usd end;
  if p_kind = 'ideas' and not s.reply_ideas_enabled then r := r || to_jsonb('reply ideas are switched off'::text); end if;
  if p_kind = 'mentions' and not s.mentions_enabled then r := r || to_jsonb('mention reading is switched off'::text); end if;
  if v_reply + p_estimate > v_allow then
    r := r || to_jsonb(format('reply reads: $%s this month + $%s would pass $%s%s', round(v_reply, 3), round(p_estimate, 3), round(v_allow, 3),
                              case when p_kind = 'ideas' and v_allow < s.reply_reads_budget_usd - 0.06 then ' (pace for the month so far)' else '' end));
  end if;
  if v_total + p_estimate > s.monthly_budget_usd then
    r := r || to_jsonb(format('X budget: $%s this month + $%s would pass $%s', round(v_total, 3), round(p_estimate, 3), s.monthly_budget_usd));
  end if;
  return jsonb_build_object('ok', jsonb_array_length(r) = 0, 'reasons', r, 'reply_mtd', round(v_reply, 4), 'metrics_mtd', round(v_metrics, 4),
                            'posts_mtd', round(v_posts, 4), 'total_mtd', round(v_total, 4), 'allowance', round(v_allow, 4),
                            'cap', s.reply_reads_budget_usd, 'budget', s.monthly_budget_usd);
end;
$$;
revoke all on function public.social_reply_budget(text, numeric) from public, anon, authenticated;
grant execute on function public.social_reply_budget(text, numeric) to service_role;

-- What x-replies needs to start a run.
create or replace function public.social_reply_state(p_kind text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'me', (select x_user_id from public.social_x_connection where status = 'connected'),
    'me_username', (select x_username from public.social_x_connection where status = 'connected'),
    'settings', (select jsonb_build_object('reply_ideas_per_day', reply_ideas_per_day, 'auto_mention_replies', auto_mention_replies,
                                           'reply_reads_budget_usd', reply_reads_budget_usd) from public.social_settings where id),
    'ideas_today', (select count(*) from public.social_reply_ideas
                     where created_at >= date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London'),
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.handle) from public.social_reply_accounts a), '[]'),
    -- since_id only within X's 7-day search window
    'newest_id', (select newest_id from public.social_reply_runs where kind = p_kind and status = 'ok' and newest_id is not null
                    and started_at > now() - interval '6 days' order by started_at desc limit 1),
    'timeline_newest_id', (select timeline_newest_id from public.social_reply_runs where kind = 'ideas' and timeline_newest_id is not null
                             and started_at > now() - interval '6 days' order by started_at desc limit 1),
    'open_ideas', coalesce((select jsonb_agg(jsonb_build_object('idea_id', idea_id, 'x_post_id', x_post_id, 'created_at', created_at))
                              from public.social_reply_ideas where status = 'suggested' and created_at > now() - interval '72 hours'), '[]'),
    'known_mentions', coalesce((select jsonb_agg(x_post_id) from public.social_mentions where received_at > now() - interval '3 days'), '[]'));
$$;
revoke all on function public.social_reply_state(text) from public, anon, authenticated;
grant execute on function public.social_reply_state(text) to service_role;

-- ============================================================ mention drafts
-- A drafted reply to a recorded mention becomes a candidate that waits for
-- Chris (draft email), or, with auto_mention_replies on and automatic
-- posting on, is queued after the normal hold (social_auto_tick posts it).
create or replace function public.social_mention_candidate(p_mention_id text, p_text text, p_facts jsonb, p_detail jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.social_mentions; s public.social_settings; v_err jsonb; v_id bigint; v_auto boolean; v_hold timestamptz;
begin
  select * into m from public.social_mentions where x_post_id = p_mention_id for update;
  if m.x_post_id is null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('mention not recorded')); end if;
  if m.candidate_id is not null then return jsonb_build_object('ok', false, 'errors', jsonb_build_array('already drafted'), 'candidate_id', m.candidate_id); end if;
  select * into s from public.social_settings where id;
  -- No link: a post with a link costs $0.200 v $0.015 and the week's one link is kept for the preview thread.
  v_err := public.social_reply_check(p_text, p_facts, false);
  if jsonb_array_length(v_err) > 0 then return jsonb_build_object('ok', false, 'errors', v_err); end if;
  insert into public.social_post_candidates (post_type, sport, text, generated_text, source_data, model_version, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validated_at, approval_status, in_reply_to_x_id)
  values ('mention_reply', 'football', btrim(p_text), btrim(p_text),
          coalesce(p_detail, '{}') || jsonb_build_object(
            'facts', coalesce(p_facts, '[]'),
            'mention', jsonb_build_object('x_post_id', m.x_post_id, 'author', m.author_username, 'text', m.text, 'category', m.category,
                                          'url', format('https://x.com/%s/status/%s', coalesce(m.author_username, 'i'), m.x_post_id)),
            'checks', jsonb_build_array(
              jsonb_build_object('check', format('Replying to @%s: "%s"', m.author_username, private.digest_clip(regexp_replace(m.text, '\s+', ' ', 'g'), 160)),
                                 'ok', true, 'detail', format('https://x.com/%s/status/%s', coalesce(m.author_username, 'i'), m.x_post_id)),
              jsonb_build_object('check', 'every number is in our data; no link, @, betting or hype words; under 280', 'ok', true))),
          p_detail->>'model', now(), 'mention_reply:' || m.x_post_id,
          greatest(now(), coalesce(m.created_at_x, now())) + interval '48 hours', 'passed', now(), 'pending', m.x_post_id)
  returning candidate_id into v_id;
  update public.social_mentions set candidate_id = v_id where x_post_id = m.x_post_id;
  perform private.social_audit('mention_drafted', v_id, null, jsonb_build_object('mention', m.x_post_id, 'author', m.author_username));
  v_auto := s.auto_mention_replies and s.auto_publish_enabled;
  if v_auto then
    v_hold := now() + make_interval(mins => s.hold_minutes);
    update public.social_post_candidates set approval_status = 'approved', approved_at = now(), approved_by = null, auto = true,
           hold_until = v_hold, updated_at = now() where candidate_id = v_id;
    perform private.social_audit('auto_queued', v_id, null, jsonb_build_object('hold_until', v_hold, 'mention_reply', true));
  else
    update public.social_post_candidates set notified_at = now() where candidate_id = v_id;
    perform private.social_notify(jsonb_build_object('kind', 'draft', 'candidate_id', v_id));
  end if;
  return jsonb_build_object('ok', true, 'candidate_id', v_id, 'auto', v_auto);
end;
$$;
revoke all on function public.social_mention_candidate(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.social_mention_candidate(text, text, jsonb, jsonb) to service_role;

-- ===================================================================== limits
-- Mention replies: their own daily limit and a 5-minute gap; they do not use
-- up the posts' daily or monthly limits or the 60-minute gap. Spend and
-- links count everything, as before.
drop function if exists private.social_limit_reasons(numeric, boolean);
create or replace function private.social_limit_reasons(p_cost numeric, p_has_url boolean, p_post_type text default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s public.social_settings; r jsonb := '[]'; v_day integer; v_month integer; v_spend numeric; v_last timestamptz; v_links integer;
  v_rday integer; v_rlast timestamptz;
  v_today timestamptz := date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London';
  v_month0 timestamptz := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
  v_week0 timestamptz := date_trunc('week', now() at time zone 'Europe/London') at time zone 'Europe/London';
begin
  select * into s from public.social_settings;
  select count(*) filter (where a.started_at >= v_today and not a.rep), count(*) filter (where a.started_at >= v_month0 and not a.rep),
         coalesce(sum(a.estimated_cost_usd) filter (where a.started_at >= v_month0), 0), max(a.started_at) filter (where not a.rep),
         count(*) filter (where a.started_at >= v_week0 and a.has_url),
         count(*) filter (where a.started_at >= v_today and a.rep), max(a.started_at) filter (where a.rep)
    into v_day, v_month, v_spend, v_last, v_links, v_rday, v_rlast
    from (select a.started_at, a.estimated_cost_usd, a.has_url, coalesce(c.post_type = 'mention_reply', false) rep
            from public.social_publish_attempts a left join public.social_post_candidates c on c.candidate_id = a.candidate_id
           where a.mode = 'live' and (a.outcome is null or a.outcome in ('posted', 'unknown'))) a;
  if p_has_url and not s.allow_urls then r := r || to_jsonb('links are switched off (a post with a link costs more)'::text); end if;
  if p_has_url and v_links >= s.max_links_per_week then r := r || to_jsonb(format('weekly link limit reached (%s)', s.max_links_per_week)); end if;
  if p_post_type = 'mention_reply' then
    if v_rday >= s.max_replies_per_day then r := r || to_jsonb(format('daily reply limit reached (%s)', s.max_replies_per_day)); end if;
    if v_rlast is not null and v_rlast > now() - interval '5 minutes' then r := r || to_jsonb('last reply was under 5 minutes ago'::text); end if;
  else
    if v_day >= s.max_posts_per_day then r := r || to_jsonb(format('daily limit reached (%s)', s.max_posts_per_day)); end if;
    if v_month >= s.max_posts_per_month then r := r || to_jsonb(format('monthly limit reached (%s)', s.max_posts_per_month)); end if;
    if v_last is not null and v_last > now() - make_interval(mins => s.min_minutes_between_posts) then
      r := r || to_jsonb(format('last post was under %s minutes ago', s.min_minutes_between_posts));
    end if;
  end if;
  if v_spend + p_cost > s.monthly_budget_usd then
    r := r || to_jsonb(format('monthly budget: $%s spent + $%s would exceed $%s', v_spend, p_cost, s.monthly_budget_usd));
  end if;
  return r;
end;
$$;
revoke all on function private.social_limit_reasons(numeric, boolean, text) from public, anon, authenticated;

-- The two callers pass the candidate's type (anchored replacement on the
-- live definition; each anchor must occur exactly once).
do $$
declare
  f record; v_def text; n int;
begin
  for f in select * from (values
      ('public.social_claim_for_publish(bigint, text, uuid)', 'private.social_limit_reasons(v_cost, v_url)', 'private.social_limit_reasons(v_cost, v_url, c.post_type)'),
      ('public.social_auto_tick()', 'private.social_limit_reasons(private.social_cost(c), v_url)', 'private.social_limit_reasons(private.social_cost(c), v_url, c.post_type)'))
      x(fn, anchor, repl) loop
    v_def := pg_get_functiondef(f.fn::regprocedure);
    if strpos(v_def, f.repl) > 0 then continue; end if;   -- already patched
    n := (length(v_def) - length(replace(v_def, f.anchor, ''))) / length(f.anchor);
    if n <> 1 then raise exception '% : anchor found % times', f.fn, n; end if;
    execute replace(v_def, f.anchor, f.repl);
  end loop;
end $$;

-- ====================================================================== emails
-- "Reply ideas" and "Mentions" for both admin emails. Ideas: open ones made
-- in the last 36 hours (Chris posts them), ones he posted in the window, and
-- the last read. Mentions: those received in the window with their draft's
-- state, earlier drafts still waiting, what was skipped, and the last read.
create or replace function private.admin_reply_sections(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_to timestamptz := least(now(), p_to); tz text := 'Europe/London';
  s public.social_settings; v_lines text[]; v_out jsonb := '[]'; i record; r record; m record;
  v_mtd numeric; v_n int; v_posted text; v_skipped text; v_waiting int;
begin
  select * into s from public.social_settings where id;
  select coalesce(sum(estimated_cost_usd), 0) into v_mtd from public.social_reply_runs
   where started_at >= date_trunc('month', now() at time zone tz) at time zone tz;

  -- ------------------------------------------------------------ reply ideas
  v_lines := '{}'; v_n := 0;
  for i in select * from public.social_reply_ideas
            where status = 'suggested' and created_at >= v_to - interval '36 hours' and created_at < v_to
            order by created_at desc limit 4 loop
    v_n := v_n + 1;
    v_lines := v_lines || format(E'@%s, %s: "%s"\nPost: %s\nDraft: %s\nOne tap: %s',
      i.author_handle, to_char(coalesce(i.post_created_at, i.created_at) at time zone tz, 'Dy HH24:MI'),
      private.digest_clip(regexp_replace(i.post_text, '\s+', ' ', 'g'), 140), i.post_url, i.draft_text, i.intent_url);
  end loop;
  if v_n > 0 then
    v_lines := array[format('%s from big accounts. X does not let us reply to these automatically, so you post them yourself, signed in as @FixtureSharkHQ:',
                            private.digest_n(v_n, 'reply idea'))] || v_lines;
  end if;
  select string_agg(format('@%s: you replied at %s%s', author_handle, to_char(status_at at time zone tz, 'Dy HH24:MI'),
                           coalesce(' https://x.com/FixtureSharkHQ/status/' || posted_x_post_id, '')), E'\n' order by status_at)
    into v_posted from public.social_reply_ideas where status = 'posted' and status_at >= p_from and status_at < v_to;
  if v_posted is not null then v_lines := v_lines || ('Posted:' || E'\n' || v_posted); end if;
  select * into r from public.social_reply_runs where kind = 'ideas' order by started_at desc limit 1;
  v_lines := v_lines || case
    when r.run_id is null then 'No read yet. The first read runs at ' || array_to_string(s.reply_ideas_hours, ':40, ') || ':40 UK.'
    when r.status = 'ok' then format('Last read %s: %s from %s, %s.', to_char(r.started_at at time zone tz, 'Dy HH24:MI'),
                                     private.digest_n(r.posts_read, 'post'), private.digest_n(coalesce((r.detail->>'accounts')::int, 0), 'account'),
                                     private.digest_n(r.made, 'new idea'))
    when r.status = 'skipped' then format('Last read skipped %s: %s', to_char(r.started_at at time zone tz, 'Dy HH24:MI'), coalesce(r.note, 'no reason'))
    when r.status = 'error' then format('Last read FAILED %s: %s', to_char(r.started_at at time zone tz, 'Dy HH24:MI'), left(coalesce(r.error, 'no detail'), 160))
    else format('Read in progress since %s.', to_char(r.started_at at time zone tz, 'HH24:MI')) end;
  if v_n = 0 and v_posted is null then v_lines := array['No open reply ideas.'] || v_lines; end if;
  if v_n > 0 then
    v_lines := v_lines || 'If the one-tap link opens a new post rather than a reply (X''s Android app drops the reply part), open the post link, tap Reply and paste the draft.'::text;
  end if;
  v_out := v_out || jsonb_build_object('key', 'replies', 'title', 'Reply ideas', 'link', 'https://x.com/FixtureSharkHQ', 'lines', to_jsonb(v_lines));

  -- ------------------------------------------------------------ mentions
  v_lines := '{}'; v_n := 0;
  for m in select mt.*, c.candidate_id cid, c.text ctext, c.approval_status, c.publication_status, c.hold_until, c.auto, c.expires_at,
                  c.published_at, c.x_post_id our_id
             from public.social_mentions mt left join public.social_post_candidates c on c.candidate_id = mt.candidate_id
            where mt.received_at >= p_from and mt.received_at < v_to and mt.category in ('question', 'comment')
            order by mt.received_at desc limit 5 loop
    v_n := v_n + 1;
    v_lines := v_lines || (format(E'@%s, %s: "%s"\n%s', m.author_username, to_char(coalesce(m.created_at_x, m.received_at) at time zone tz, 'Dy HH24:MI'),
                                  private.digest_clip(regexp_replace(m.text, '\s+', ' ', 'g'), 140),
                                  format('https://x.com/%s/status/%s', coalesce(m.author_username, 'i'), m.x_post_id))
      || E'\n' || case
        when m.cid is null then 'No draft: ' || coalesce(m.reason, 'nothing from our data to add')
        when m.publication_status = 'published' then format('Replied %s: https://x.com/FixtureSharkHQ/status/%s', to_char(m.published_at at time zone tz, 'Dy HH24:MI'), m.our_id)
        when m.approval_status = 'pending' and m.expires_at > now() then format('Draft #%s, waiting for your OK: %s', m.cid, m.ctext)
        when m.approval_status = 'approved' and m.auto then format('Draft #%s, posts at %s unless you hold it: %s', m.cid, to_char(m.hold_until at time zone tz, 'Dy HH24:MI'), m.ctext)
        when m.approval_status = 'approved' then format('Draft #%s approved, not posted yet: %s', m.cid, m.ctext)
        when m.expires_at <= now() then format('Draft #%s expired unposted.', m.cid)
        else format('Draft #%s %s.', m.cid, m.approval_status) end);
  end loop;
  select count(*) into v_waiting from public.social_post_candidates c
   where c.post_type = 'mention_reply' and c.approval_status = 'pending' and c.expires_at > now() and c.created_at < p_from;
  select string_agg(format('%s %s', n, category), ', ' order by n desc) into v_skipped
    from (select category, count(*) n from public.social_mentions
           where received_at >= p_from and received_at < v_to and category not in ('question', 'comment') group by 1) x;
  if v_n = 0 then v_lines := array['No questions or comments for @FixtureSharkHQ in this window.']; end if;
  if v_waiting > 0 then v_lines := v_lines || (private.digest_n(v_waiting, 'earlier reply draft') || ' still waiting for your OK.'); end if;
  if v_skipped is not null then v_lines := v_lines || ('Not answered: ' || v_skipped || '.'); end if;
  select * into r from public.social_reply_runs where kind = 'mentions' order by started_at desc limit 1;
  v_lines := v_lines || case
    when r.run_id is null then 'Mentions are read every 3 hours; no read yet.'
    when r.status = 'error' then format('Last mentions read FAILED %s: %s', to_char(r.started_at at time zone tz, 'Dy HH24:MI'), left(coalesce(r.error, 'no detail'), 160))
    when r.status = 'skipped' then format('Last mentions read skipped %s: %s', to_char(r.started_at at time zone tz, 'Dy HH24:MI'), coalesce(r.note, 'no reason'))
    else format('Mentions are read every 3 hours; last %s.', to_char(r.started_at at time zone tz, 'Dy HH24:MI')) end;
  -- (the link ends the line: a full stop after it would become part of it)
  v_lines := v_lines || format('Reply reads this month: $%s of $%s. %s https://fixtureshark.com/admin/social?show=queue',
    to_char(v_mtd, 'FM990.00'), to_char(s.reply_reads_budget_usd, 'FM990.00'),
    case when s.auto_mention_replies then format('Replies to mentions post automatically after a %s-minute hold; hold or reject them here:', s.hold_minutes)
         else 'Replies to mentions go out only after you approve and post them here:' end);
  v_out := v_out || jsonb_build_object('key', 'mentions', 'title', 'Mentions', 'link', 'https://fixtureshark.com/admin/social?show=queue', 'lines', to_jsonb(v_lines));
  return v_out;
end;
$$;
revoke all on function private.admin_reply_sections(timestamptz, timestamptz) from public, anon, authenticated;

-- private.admin_digest (20261105080000) with the two sections placed after X.
create or replace function private.admin_digest(p_from timestamptz, p_to timestamptz, p_edition text default 'evening')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_from timestamptz := p_from; v_to timestamptz := p_to; v jsonb; v_extra jsonb; v_x numeric;
begin
  if p_edition = 'evening' then
    v := private.admin_daily_digest(coalesce((p_from at time zone 'Europe/London')::date, (now() at time zone 'Europe/London')::date))
         || jsonb_build_object('edition', 'evening');
    v_from := coalesce(p_from, date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London');
    v_to := coalesce(p_to, now());
  elsif p_edition = 'morning' then
    if v_from is null or v_to is null then
      select coalesce(v_from, w.w_from), coalesce(v_to, w.w_to) into v_from, v_to
        from private.admin_morning_window((now() at time zone 'Europe/London')::date) w;
    end if;
    v := private.admin_overnight_digest(v_from, v_to);
  else
    raise exception 'unknown edition %', p_edition;
  end if;
  begin
    v_extra := private.admin_reply_sections(v_from, v_to);
  exception when others then
    v_extra := jsonb_build_array(jsonb_build_object('key', 'replies', 'title', 'Reply ideas and mentions', 'link', 'https://fixtureshark.com/admin/social',
                                                    'lines', jsonb_build_array('Could not build this section: ' || left(sqlerrm, 200))));
  end;
  select a.o into v_x from jsonb_array_elements(v->'sections') with ordinality a(e, o) where a.e->>'key' = 'x' limit 1;
  v_x := coalesce(v_x, jsonb_array_length(v->'sections'));
  return jsonb_set(v, '{sections}', (
    select jsonb_agg(z.e order by z.o) from (
      select a.e, a.o::numeric o from jsonb_array_elements(v->'sections') with ordinality a(e, o)
      union all
      select b.e, v_x + b.o / 10.0 from jsonb_array_elements(v_extra) with ordinality b(e, o)) z));
end;
$$;
revoke all on function private.admin_digest(timestamptz, timestamptz, text) from public, anon, authenticated;

-- ==================================================================== schedule
create or replace function private.social_replies_call(p_kind text, p_triggered_by text default 'schedule')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_kind not in ('ideas', 'mentions') then raise exception 'unknown kind %', p_kind; end if;
  perform net.http_post(
    url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/x-replies',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
    body := jsonb_build_object('kind', p_kind, 'triggered_by', p_triggered_by), timeout_milliseconds := 120000);
end;
$$;
revoke all on function private.social_replies_call(text, text) from public, anon, authenticated;

-- Hourly at :40; reads only in the London hours listed in reply_ideas_hours
-- (default 17, so 17:40 UK, before the 19:25 email) and once per hour.
create or replace function private.social_reply_ideas_tick()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.social_settings;
begin
  select * into s from public.social_settings where id;
  if not s.reply_ideas_enabled then return 'off'; end if;
  if not (extract(hour from now() at time zone 'Europe/London')::int = any (s.reply_ideas_hours)) then return 'not due'; end if;
  if exists (select 1 from public.social_reply_runs where kind = 'ideas' and triggered_by = 'schedule' and started_at > now() - interval '50 minutes') then
    return 'already ran';
  end if;
  perform private.social_replies_call('ideas');
  return 'called';
end;
$$;
revoke all on function private.social_reply_ideas_tick() from public, anon, authenticated;

-- Every 3 hours at :10 UTC (06:10 and 18:10 UTC are before both emails in
-- GMT; 07:10 and 19:10 UK in BST).
create or replace function private.social_mentions_tick()
returns text language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (select mentions_enabled from public.social_settings where id) then return 'off'; end if;
  perform private.social_replies_call('mentions');
  return 'called';
end;
$$;
revoke all on function private.social_mentions_tick() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'social-reply-ideas') then
    perform cron.schedule('social-reply-ideas', '40 * * * *', 'select private.social_reply_ideas_tick()');
  end if;
  if not exists (select 1 from cron.job where jobname = 'social-mentions') then
    perform cron.schedule('social-mentions', '10 */3 * * *', 'select private.social_mentions_tick()');
  end if;
end $$;

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, notes)
values
  ('social-reply-ideas', 'social', 'supabase_cron', '40 * * * *', interval '02:00:00', interval '00:05:00', 'pg_cron', '^social-reply-ideas$', 'api.x.com',
   'Hourly at :40: private.social_reply_ideas_tick(); calls x-replies (kind ideas) only in the London hours in social_settings.reply_ideas_hours (default 17). Search of the big accounts, at most 10 posts ($0.05), plus our timeline while ideas are open. Runs in social_reply_runs'),
  ('social-mentions', 'social', 'supabase_cron', '10 */3 * * *', interval '04:00:00', interval '00:05:00', 'pg_cron', '^social-mentions$', 'api.x.com',
   'Every 3 hours at :10 UTC: private.social_mentions_tick(); x-replies (kind mentions) reads @FixtureSharkHQ mentions (owned reads) and drafts replies for approval. Runs in social_reply_runs')
on conflict (job_key) do nothing;

-- ================================================================== first run
-- One read of each now (the ideas read also checks the account handles).
select private.social_replies_call('ideas', 'first-run');
select private.social_replies_call('mentions', 'first-run');
