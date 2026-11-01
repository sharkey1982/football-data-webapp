-- ============================================================================
-- FixtureShark FPL weekly email (Chris, 1 Nov 2026: "build an email set up
-- based around FPL for now but can include football mispricing too").
--
-- One email per FPL gameweek, sent before the deadline: Thursday 18:00 UK when
-- the deadline is on a Friday or Saturday, otherwise 36 hours before it.
-- Double opt-in sign-up, one-click unsubscribe, no Resend Audiences (the
-- RESEND_API_KEY is a sending-only key).
--
-- Everything lives in the private schema with RLS on and no grants: the site
-- reaches it only through the edge functions (email-list for sign-up,
-- confirm, unsubscribe and manage; email-weekly for the send), which call the
-- service_role-only functions below, and the admin page through two
-- is_admin()-checked functions.
--
-- Stored per subscriber: the address (lower-cased), status, topics, the
-- sign-up wording version, and timestamps. Tokens are stored only as SHA-256
-- hashes. Sign-up attempts keep salted hashes of the IP and address for rate
-- limiting, for 2 days. Unconfirmed sign-ups go after 7 days; unsubscribed
-- addresses are deleted within 30 days (email-purge, daily).
--
-- Safe to re-run: create ... if not exists, create or replace, on conflict.
-- ============================================================================

-- ---------------------------------------------------------------- tables
create table if not exists private.email_settings (
  id boolean primary key default true check (id),
  salt text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  sending_enabled boolean not null default true,
  daily_limit integer not null default 100 check (daily_limit >= 0),     -- Resend free plan (as far as we know)
  monthly_limit integer not null default 3000 check (monthly_limit >= 0),
  updated_at timestamptz not null default now()
);
insert into private.email_settings (id) values (true) on conflict (id) do nothing;

create table if not exists private.email_subscribers (
  subscriber_id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and length(email) <= 254),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  topics text[] not null default array['fpl'],
  fpl_entry_id bigint check (fpl_entry_id between 1 and 99999999),   -- optional: personalises the email
  club_team_id bigint,                                               -- optional: public.teams.team_id
  watchlist integer[] not null default '{}' check (cardinality(watchlist) <= 20),  -- optional: FPL player ids
  consent_version text not null,
  created_at timestamptz not null default now(),
  confirm_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table private.email_subscribers is 'FPL weekly email list. topics: fpl (always), football_market (optional section). Optional fpl_entry_id, club_team_id and watchlist (FPL player ids) personalise it. See /privacy.';

create table if not exists private.email_tokens (
  token_hash text primary key,
  subscriber_id bigint not null references private.email_subscribers (subscriber_id) on delete cascade,
  purpose text not null check (purpose in ('confirm', 'manage')),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists email_tokens_subscriber on private.email_tokens (subscriber_id);

create table if not exists private.email_signup_attempts (
  attempt_id bigint generated always as identity primary key,
  ip_hash text,
  email_hash text not null,
  outcome text not null,
  created_at timestamptz not null default now()
);
create index if not exists email_signup_attempts_ip on private.email_signup_attempts (ip_hash, created_at);
create index if not exists email_signup_attempts_email on private.email_signup_attempts (email_hash, created_at);

create table if not exists private.email_outbound_days (
  day date primary key,
  sent integer not null default 0
);

create table if not exists private.email_sends (
  send_id bigint generated always as identity primary key,
  kind text not null check (kind in ('weekly', 'test')),
  issue_key text unique,                -- 'fpl-weekly:<season>:<gw>' for weekly sends; null for tests
  season_id bigint,
  fpl_event_id integer,
  subject text,
  status text not null default 'sending' check (status in ('sending', 'sent', 'partial', 'failed', 'skipped')),
  attempts integer not null default 1,
  recipients integer not null default 0,
  football integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  note text,
  pipeline_run_id bigint,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists private.email_failures (
  failure_id bigint generated always as identity primary key,
  send_id bigint references private.email_sends (send_id) on delete cascade,
  kind text not null,                   -- weekly, test, confirm, already, quota
  http_status integer,
  error text,                           -- addresses are stripped before it is stored
  recipients integer not null default 1,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['email_settings', 'email_subscribers', 'email_tokens', 'email_signup_attempts',
                           'email_outbound_days', 'email_sends', 'email_failures'] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('revoke all on private.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- helpers
create or replace function private.email_hash(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select encode(extensions.digest(p, 'sha256'), 'hex');
$$;

create or replace function private.email_new_token(p_subscriber bigint, p_purpose text, p_ttl interval)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into private.email_tokens (token_hash, subscriber_id, purpose, expires_at)
  values (private.email_hash(v), p_subscriber, p_purpose, case when p_ttl is not null then now() + p_ttl end);
  return v;
end;
$$;

-- The subscriber a token belongs to (null when unknown or expired).
create or replace function private.email_token_owner(p_token text, p_purposes text[])
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select t.subscriber_id from private.email_tokens t
   where coalesce(p_token, '') ~ '^[0-9a-f]{48}$'
     and t.token_hash = private.email_hash(p_token) and t.purpose = any (p_purposes)
     and (t.expires_at is null or t.expires_at > now());
$$;

-- Where admin-only mail goes: the social alerts address, else the admin's own.
create or replace function private.email_admin_address()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select notify_email from public.social_settings where id),
                  (select email from public.app_users where is_admin and email is not null order by created_at limit 1));
$$;

-- When the weekly email for a deadline is due.
create or replace function private.email_weekly_due_at(p_deadline timestamptz)
returns timestamptz language plpgsql stable set search_path = public, pg_temp as $$
declare l timestamp := p_deadline at time zone 'Europe/London'; d integer := extract(isodow from p_deadline at time zone 'Europe/London');
begin
  if d in (5, 6) then
    return ((l::date - (d - 4)) + time '18:00') at time zone 'Europe/London';   -- the Thursday before, 18:00 UK
  end if;
  return p_deadline - interval '36 hours';
end;
$$;

-- Fire-and-forget call to the email-weekly edge function (worker token, as social_notify).
create or replace function private.email_invoke(p_body jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform net.http_post(
    url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/email-weekly',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
    body := p_body, timeout_milliseconds := 120000);
end;
$$;

-- ---------------------------------------------------------------- sign-up (email-list edge function)
create or replace function public.email_signup(p_email text, p_football boolean, p_ip text,
                                               p_fpl_id bigint default null, p_club bigint default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_fpl bigint := case when p_fpl_id between 1 and 99999999 then p_fpl_id end;
  v_club bigint := (select team_id from public.teams where team_id = p_club);
  e text := lower(trim(coalesce(p_email, '')));
  v_salt text := (select salt from private.email_settings where id);
  v_ip text; v_eh text; n_ip_h integer; n_ip_d integer; n_em integer; n_all integer;
  s private.email_subscribers; v_topics text[] := case when p_football then array['fpl', 'football_market'] else array['fpl'] end;
  v_tok text;
begin
  if length(e) > 254 or e !~ '^[^@\s<>,;"]+@[^@\s<>,;"]+\.[a-z]{2,}$' then
    return jsonb_build_object('action', 'invalid');
  end if;
  v_ip := case when coalesce(p_ip, '') <> '' then private.email_hash(v_salt || ':ip:' || p_ip) end;
  v_eh := private.email_hash(v_salt || ':em:' || e);

  select count(*) filter (where created_at > now() - interval '1 hour'), count(*) into n_ip_h, n_ip_d
    from private.email_signup_attempts where v_ip is not null and ip_hash = v_ip and created_at > now() - interval '24 hours';
  select count(*) into n_em from private.email_signup_attempts
   where email_hash = v_eh and created_at > now() - interval '24 hours' and outcome like 'sent%';
  select count(*) into n_all from private.email_signup_attempts
   where created_at > now() - interval '24 hours' and outcome like 'sent%';

  if n_ip_h >= 5 or n_ip_d >= 20 or n_em >= 3 or n_all >= 40 then
    insert into private.email_signup_attempts (ip_hash, email_hash, outcome)
    values (v_ip, v_eh, case when n_em >= 3 then 'rate_email' when n_all >= 40 then 'rate_global' else 'rate_ip' end);
    return jsonb_build_object('action', 'none', 'reason', 'rate limited');
  end if;

  select * into s from private.email_subscribers where email = e for update;
  if s.subscriber_id is not null and s.status = 'confirmed' then
    insert into private.email_signup_attempts (ip_hash, email_hash, outcome) values (v_ip, v_eh, 'sent_already');
    return jsonb_build_object('action', 'already', 'email', e,
                              'token', private.email_new_token(s.subscriber_id, 'manage', null));
  end if;

  if s.subscriber_id is null then
    insert into private.email_subscribers (email, status, topics, fpl_entry_id, club_team_id, consent_version, confirm_sent_at)
    values (e, 'pending', v_topics, v_fpl, v_club, 'fpl-weekly-v1', now())
    returning * into s;
  else
    update private.email_subscribers
       set status = 'pending', topics = v_topics, fpl_entry_id = v_fpl, club_team_id = v_club,
           consent_version = 'fpl-weekly-v1', confirm_sent_at = now(),
           confirmed_at = null, unsubscribed_at = null, updated_at = now()
     where subscriber_id = s.subscriber_id;
    delete from private.email_tokens where subscriber_id = s.subscriber_id and purpose = 'confirm';
  end if;
  v_tok := private.email_new_token(s.subscriber_id, 'confirm', interval '7 days');
  insert into private.email_signup_attempts (ip_hash, email_hash, outcome) values (v_ip, v_eh, 'sent_confirm');
  return jsonb_build_object('action', 'confirm', 'email', e, 'token', v_tok, 'football', coalesce(p_football, false));
end;
$$;

create or replace function public.email_confirm(p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := private.email_token_owner(p_token, array['confirm']); s private.email_subscribers;
begin
  if v_id is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into s from private.email_subscribers where subscriber_id = v_id for update;
  if s.status = 'unsubscribed' then return jsonb_build_object('state', 'invalid'); end if;
  if s.status = 'confirmed' then
    return jsonb_build_object('state', 'already', 'football', 'football_market' = any (s.topics),
                              'manage', private.email_new_token(v_id, 'manage', null));
  end if;
  update private.email_subscribers set status = 'confirmed', confirmed_at = now(), updated_at = now() where subscriber_id = v_id;
  return jsonb_build_object('state', 'confirmed', 'football', 'football_market' = any (s.topics),
                            'manage', private.email_new_token(v_id, 'manage', null));
end;
$$;

create or replace function public.email_unsubscribe(p_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := private.email_token_owner(p_token, array['manage', 'confirm']); s private.email_subscribers;
begin
  if v_id is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into s from private.email_subscribers where subscriber_id = v_id for update;
  if s.status = 'unsubscribed' then return jsonb_build_object('state', 'already'); end if;
  update private.email_subscribers set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now() where subscriber_id = v_id;
  delete from private.email_tokens where subscriber_id = v_id and purpose = 'confirm';
  return jsonb_build_object('state', 'unsubscribed');
end;
$$;

-- Read (p_changes null) or change the subscriber's choices. p_changes keys,
-- each optional: football (boolean), fpl_id (number, null removes), club_id
-- (public.teams.team_id, null removes).
create or replace function public.email_manage(p_token text, p_changes jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint := private.email_token_owner(p_token, array['manage']); s private.email_subscribers; v_fpl bigint; v_club bigint;
begin
  if v_id is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into s from private.email_subscribers where subscriber_id = v_id for update;
  if s.status <> 'confirmed' then return jsonb_build_object('state', s.status); end if;
  if p_changes is not null and jsonb_typeof(p_changes) = 'object' then
    if p_changes ? 'football' and jsonb_typeof(p_changes->'football') = 'boolean' then
      s.topics := case when (p_changes->>'football')::boolean then array['fpl', 'football_market'] else array['fpl'] end;
    end if;
    if p_changes ? 'fpl_id' then
      v_fpl := case when jsonb_typeof(p_changes->'fpl_id') = 'number' and (p_changes->>'fpl_id')::numeric between 1 and 99999999
                    then (p_changes->>'fpl_id')::numeric::bigint end;
      s.fpl_entry_id := v_fpl;
    end if;
    if p_changes ? 'watchlist' then
      s.watchlist := coalesce((select array_agg(x.id order by x.ord)
                                 from (select distinct on (e::int) e::int id, ord
                                         from jsonb_array_elements_text(case when jsonb_typeof(p_changes->'watchlist') = 'array'
                                                                             then p_changes->'watchlist' else '[]' end) with ordinality t(e, ord)
                                        where e ~ '^\d{1,6}$'
                                        order by e::int, ord) x
                                 join public.fpl_players p on p.season_id = public.fpl_current_season_id() and p.fpl_player_id = x.id
                                where x.ord <= 20), '{}');
    end if;
    if p_changes ? 'club_id' then
      v_club := case when jsonb_typeof(p_changes->'club_id') = 'number'
                     then (select team_id from public.teams where team_id = (p_changes->>'club_id')::numeric::bigint) end;
      s.club_team_id := v_club;
    end if;
    update private.email_subscribers
       set topics = s.topics, fpl_entry_id = s.fpl_entry_id, club_team_id = s.club_team_id, watchlist = s.watchlist, updated_at = now()
     where subscriber_id = v_id;
  end if;
  return jsonb_build_object('state', 'ok', 'football', 'football_market' = any (s.topics), 'fpl_id', s.fpl_entry_id,
                            'club', (select jsonb_build_object('id', t.team_id, 'name', coalesce(t.display_name, t.canonical_name))
                                       from public.teams t where t.team_id = s.club_team_id),
                            'watchlist', (select coalesce(jsonb_agg(jsonb_build_object('id', p.fpl_player_id, 'name', p.web_name, 'team', ft.short_name,
                                                                                        'pos', case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end,
                                                                                        'price', round(p.now_cost / 10.0, 1))
                                                                     order by array_position(s.watchlist, p.fpl_player_id::int)), '[]')
                                            from public.fpl_players p
                                            left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
                                           where p.season_id = public.fpl_current_season_id() and p.fpl_player_id = any (s.watchlist)));
end;
$$;

-- ---------------------------------------------------------------- the weekly issue
-- The next gameweek and whether its email is due now.
create or replace function public.email_weekly_issue()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select jsonb_build_object('season_id', g.season_id, 'gw', g.fpl_event_id, 'deadline', g.deadline_time,
                              'due_at', private.email_weekly_due_at(g.deadline_time),
                              'due', now() >= private.email_weekly_due_at(g.deadline_time) and now() < g.deadline_time - interval '2 hours',
                              'issue_key', format('fpl-weekly:%s:%s', g.season_id, g.fpl_event_id),
                              'sent', (select to_jsonb(x) from (select send_id, status, sent, failed, started_at from private.email_sends
                                                                  where issue_key = format('fpl-weekly:%s:%s', g.season_id, g.fpl_event_id)) x))
      from public.fpl_gameweeks g
     where g.season_id = public.fpl_current_season_id() and g.deadline_time > now()
     order by g.deadline_time limit 1), '{}'::jsonb);
$$;

-- One player's facts for the email: the same numbers the site shows.
--   start, x1   start probability and projected points for the coming gameweek
--   x5          projected points over the coming five gameweeks
--   fixtures    the next three gameweeks' opponents
--   l5          the last five gameweeks: points, goals, assists, xG, xA,
--               minutes, and minutes in each of the last three (m3)
--   week_before price a week ago (snapshot); tonight: FPL's own predictor
--   p_blank     chance of 2 points or fewer, from the gameweek preview
-- p_ids null = every player with a price this season.
create or replace function private.email_player_facts(p_season bigint, p_gw integer, p_ids integer[])
returns table (fpl_player_id integer, f jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  with mv as (select model_version v from public.fpl_player_projections where season_id = p_season order by generated_at desc limit 1),
  pl as (
    select p.fpl_player_id::int id, p.fpl_team_id, p.web_name, p.slug, p.element_type,
           round(p.now_cost / 10.0, 1) price, round(coalesce(p.selected_by_percent, 0)::numeric, 1) own,
           p.status, p.chance_of_playing_next_round chance, nullif(trim(p.news), '') news, ft.short_name team
      from public.fpl_players p
      left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
     where p.season_id = p_season and p.now_cost > 0 and p.web_name is not null
       and (p_ids is null or p.fpl_player_id = any (p_ids))),
  proj as (
    select x.fpl_player_id::int id,
           sum(x.expected_fpl_points) filter (where ff.fpl_event_id = p_gw) x1,
           sum(x.expected_fpl_points) x5,
           max(x.start_probability) filter (where ff.fpl_event_id = p_gw) st
      from public.fpl_player_projections x
      join public.fpl_fixtures ff on ff.season_id = x.season_id and ff.canonical_fixture_id = x.fixture_id
      cross join mv
     where x.season_id = p_season and x.model_version = mv.v and coalesce(x.scenario_key, 'baseline') = 'baseline'
       and ff.fpl_event_id between p_gw and p_gw + 4
       and (p_ids is null or x.fpl_player_id = any (p_ids))
     group by 1),
  fx as (
    select pl.id, jsonb_agg(jsonb_build_object('gw', ff.fpl_event_id, 'opp', ot.short_name, 'home', ff.fpl_home_team_id = pl.fpl_team_id)
                            order by ff.kickoff_time, ff.fpl_fixture_id) fx
      from pl
      join public.fpl_fixtures ff on ff.season_id = p_season and ff.fpl_event_id between p_gw and p_gw + 2
                                 and pl.fpl_team_id in (ff.fpl_home_team_id, ff.fpl_away_team_id)
      join public.fpl_teams ot on ot.season_id = p_season
                              and ot.fpl_team_id = case when ff.fpl_home_team_id = pl.fpl_team_id then ff.fpl_away_team_id else ff.fpl_home_team_id end
     group by pl.id),
  h as (
    select g.fpl_player_id id, g.fpl_event_id gw, sum(g.minutes) mins, sum(g.total_points) pts, sum(g.goals_scored) gs,
           sum(g.assists) a, sum(g.expected_goals) xg, sum(g.expected_assists) xa
      from public.fpl_player_gameweeks g
      -- Finished games only: FPL lists a not-yet-played fixture with 0 minutes.
      join public.fpl_fixtures gf on gf.season_id = g.season_id and gf.fpl_fixture_id = g.fpl_fixture_id and gf.finished
     where g.season_id = p_season and g.fpl_event_id between p_gw - 5 and p_gw - 1
       and (p_ids is null or g.fpl_player_id = any (p_ids))
     group by 1, 2),
  l5 as (
    select id, count(*) gws, sum(pts) pts, sum(gs) g, sum(a) a, round(sum(xg), 2) xg, round(sum(xa), 2) xa, sum(mins) mins,
           jsonb_agg(mins order by gw) filter (where gw >= p_gw - 3) m3
      from h group by id),
  since as (select max(snapshot_date) d from public.fpl_player_snapshots
             where season_id = p_season and snapshot_date <= (now() at time zone 'Europe/London')::date - 7),
  wk as (
    select distinct on (s.fpl_player_id) s.fpl_player_id::int id, round(s.now_cost / 10.0, 1) before
      from public.fpl_player_snapshots s, since
     where s.season_id = p_season and s.snapshot_date = since.d and (p_ids is null or s.fpl_player_id = any (p_ids))
     order by s.fpl_player_id, s.captured_at desc),
  risk as (select r.fpl_player_id::int id, r.direction, r.outlook from public.get_price_change_risk(p_season) r
            where r.outlook in ('expected', 'possible')),
  blank as (
    select distinct on ((pc->>'id')::int) (pc->>'id')::int id, (pc->>'p_blank')::numeric p
      from public.fpl_gameweek_reports r, jsonb_array_elements(r.payload->'captains') pc
     where r.season_id = p_season and r.fpl_event_id = p_gw and r.kind = 'preview' and r.status = 'published' and pc->>'p_blank' is not null
     order by (pc->>'id')::int, r.version desc, r.published_at desc)
  select pl.id, jsonb_build_object(
           'id', pl.id, 'name', pl.web_name, 'team', pl.team, 'slug', pl.slug,
           'pos', case pl.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end,
           'price', pl.price, 'own', pl.own, 'status', pl.status, 'chance', pl.chance, 'news', pl.news,
           'start', round(proj.st, 2), 'x1', round(proj.x1, 2), 'x5', round(proj.x5, 2), 'fixtures', coalesce(fx.fx, '[]'),
           'l5', case when l5.id is not null then jsonb_build_object('gws', l5.gws, 'pts', l5.pts, 'g', l5.g, 'a', l5.a, 'xg', l5.xg,
                                                                     'xa', l5.xa, 'mins', l5.mins, 'm3', l5.m3) end,
           'week_before', wk.before, 'since', (select d from since),
           'tonight', case when risk.id is not null then jsonb_build_object('direction', risk.direction, 'outlook', risk.outlook) end,
           'p_blank', blank.p)
    from pl
    left join proj on proj.id = pl.id
    left join fx on fx.id = pl.id
    left join l5 on l5.id = pl.id
    left join wk on wk.id = pl.id
    left join risk on risk.id = pl.id
    left join blank on blank.id = pl.id;
$$;
revoke all on function private.email_player_facts(bigint, integer, integer[]) from public, anon, authenticated;

-- The issue's FPL sections. Generic (p_squad null) or for one subscriber's
-- squad (their FPL picks) and watchlist. Rules, all from the facts above:
--   captain   the highest projection among players 85%+ to start (else the
--             highest), and the best other option; from the squad when
--             there is one, with the overall pick alongside
--   change    up to 3 sell candidates (squad, else owned 15%+) each with the
--             like-for-like replacement: same position, price within
--             +-0.5m, available, not in the squad, 2+ more projected points
--             over the next five gameweeks
--   unlucky / lucky  goals + assists against xG + xA over the last five
--             gameweeks, 1.5+ apart, 180+ minutes (squad and watchlist,
--             else owned 5%+)
--   minutes   flagged, under 70% to start, or under 45 minutes in one of the
--             last three gameweeks (squad, else owned 10%+)
--   watchlist the subscriber's players
--   prices    the 3 most-owned players whose price moved this week; the
--             squad's moves (up to 6); tonight's likely changes for the
--             squad, else for players owned 10%+ (the watchlist section has
--             its own players' moves)
--   (lucky / unlucky: available or doubtful players only; change: each
--   player out and each replacement once)
create or replace function private.email_sections(p_season bigint, p_gw integer, p_squad integer[], p_watch integer[])
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_all jsonb; v_mine integer[] := coalesce(p_squad, '{}') || coalesce(p_watch, '{}');
  v_pick jsonb; v_alt jsonb; v_overall jsonb; v_change jsonb; v_unlucky jsonb; v_lucky jsonb; v_scope text;
  v_minutes jsonb; v_watch jsonb; v_notable jsonb; v_moves jsonb; v_tonight jsonb; v_since date; v_pairs jsonb; v_pair jsonb;
begin
  select coalesce(jsonb_agg(f), '[]') into v_all from private.email_player_facts(p_season, p_gw, null);
  select max((f->>'since')::date) into v_since from jsonb_array_elements(v_all) f;

  -- Captain.
  select f into v_overall from jsonb_array_elements(v_all) f
   where f->>'status' = 'a' and f->>'x1' is not null
   order by coalesce((f->>'start')::numeric, 0) >= 0.85 desc, (f->>'x1')::numeric desc, (f->>'id')::int limit 1;
  select f into v_pick from jsonb_array_elements(v_all) f
   where f->>'status' = 'a' and f->>'x1' is not null and (p_squad is null or (f->>'id')::int = any (p_squad))
   order by coalesce((f->>'start')::numeric, 0) >= 0.85 desc, (f->>'x1')::numeric desc, (f->>'id')::int limit 1;
  select f into v_alt from jsonb_array_elements(v_all) f
   where f->>'status' = 'a' and f->>'x1' is not null and (p_squad is null or (f->>'id')::int = any (p_squad))
     and (f->>'id')::int is distinct from (v_pick->>'id')::int
   order by (f->>'x1')::numeric desc, (f->>'id')::int limit 1;

  -- Who to change, and to whom.
  -- (Not 4.0m players: bench fodder bought not to play.)
  with c as (select f from jsonb_array_elements(v_all) f
              where case when p_squad is not null then (f->>'id')::int = any (p_squad) else (f->>'own')::numeric >= 15 end
                and (f->>'price')::numeric > 4.0),
  pairs as (
    select c.f out_f, r.f in_f, (r.f->>'x5')::numeric - coalesce((c.f->>'x5')::numeric, 0) gain,
           row_number() over (partition by c.f->>'id' order by (r.f->>'x5')::numeric desc, (r.f->>'id')::int) rn
      from c
      join jsonb_array_elements(v_all) r(f)
        on r.f->>'pos' = c.f->>'pos' and r.f->>'status' = 'a' and r.f->>'x5' is not null
       and (r.f->>'price')::numeric between (c.f->>'price')::numeric - 0.5 and (c.f->>'price')::numeric + 0.5
       and r.f->>'id' <> c.f->>'id' and not ((r.f->>'id')::int = any (coalesce(p_squad, '{}')))
     where (r.f->>'x5')::numeric - coalesce((c.f->>'x5')::numeric, 0) >= 2)
  -- Each player out once and each replacement once, biggest gains first.
  select coalesce(jsonb_agg(x.f order by x.ord), '[]') into v_pairs
    from (select jsonb_build_object('out', out_f, 'in', in_f, 'gain', round(gain, 1)) f,
                 row_number() over (order by gain desc, (out_f->>'own')::numeric desc, rn) ord
            from pairs where rn <= 5) x;
  v_change := '[]';
  for v_pair in select e from jsonb_array_elements(v_pairs) e loop
    exit when jsonb_array_length(v_change) >= 3;
    continue when exists (select 1 from jsonb_array_elements(v_change) d
                           where d->'out'->>'id' = v_pair->'out'->>'id' or d->'in'->>'id' = v_pair->'in'->>'id');
    v_change := v_change || jsonb_build_array(v_pair);
  end loop;

  -- Lucky and unlucky: the squad and watchlist first, else the most-owned.
  v_scope := case when cardinality(v_mine) > 0 then 'mine' else 'all' end;
  for i in 1..2 loop
    with pool as (
      select f, ((f->'l5'->>'g')::numeric + (f->'l5'->>'a')::numeric) - ((f->'l5'->>'xg')::numeric + (f->'l5'->>'xa')::numeric) d
        from jsonb_array_elements(v_all) f
       where jsonb_typeof(f->'l5') = 'object' and (f->'l5'->>'gws')::int >= 3 and (f->'l5'->>'mins')::int >= 180
         and f->>'status' in ('a', 'd')
         and case when v_scope = 'mine' then (f->>'id')::int = any (v_mine) else (f->>'own')::numeric >= 5 end)
    select (select coalesce(jsonb_agg(f || jsonb_build_object('diff', round(d, 2)) order by d), '[]')
              from (select * from pool where d <= -1.5 order by d limit 3) u),
           (select coalesce(jsonb_agg(f || jsonb_build_object('diff', round(d, 2)) order by d desc), '[]')
              from (select * from pool where d >= 1.5 order by d desc limit 3) l)
      into v_unlucky, v_lucky;
    exit when v_scope = 'all' or jsonb_array_length(v_unlucky) + jsonb_array_length(v_lucky) > 0;
    v_scope := 'all';
  end loop;

  -- Minutes and line-ups.
  select coalesce(jsonb_agg(f order by (f->>'own')::numeric desc), '[]') into v_minutes
    from (select f from jsonb_array_elements(v_all) f
           where case when p_squad is not null then (f->>'id')::int = any (p_squad) else (f->>'own')::numeric >= 10 end
             and (f->>'status' <> 'a'
                  or coalesce((f->>'start')::numeric, 0) < 0.7
                  or exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(f->'l5'->'m3') = 'array' then f->'l5'->'m3' else '[]' end) m
                              where m::int < 45))
           order by (f->>'own')::numeric desc limit 5) x;

  -- Watchlist.
  select coalesce(jsonb_agg(f order by array_position(p_watch, (f->>'id')::int)), '[]') into v_watch
    from jsonb_array_elements(v_all) f where (f->>'id')::int = any (coalesce(p_watch, '{}'));

  -- Prices.
  select coalesce(jsonb_agg(f order by (f->>'own')::numeric desc), '[]') into v_notable
    from (select f from jsonb_array_elements(v_all) f
           where f->>'week_before' is not null and (f->>'price')::numeric <> (f->>'week_before')::numeric
           order by (f->>'own')::numeric desc limit 3) x;
  -- (The watchlist section shows its own players' moves.)
  select coalesce(jsonb_agg(f order by (f->>'own')::numeric desc), '[]') into v_moves
    from (select f from jsonb_array_elements(v_all) f
           where (f->>'id')::int = any (coalesce(p_squad, '{}')) and f->>'week_before' is not null
             and (f->>'price')::numeric <> (f->>'week_before')::numeric
           order by (f->>'own')::numeric desc limit 6) x;
  select coalesce(jsonb_agg(f order by (f->>'own')::numeric desc), '[]') into v_tonight
    from (select f from jsonb_array_elements(v_all) f
           where jsonb_typeof(f->'tonight') = 'object'
             and case when p_squad is not null then (f->>'id')::int = any (p_squad) else (f->>'own')::numeric >= 10 end
           order by (f->>'own')::numeric desc limit 6) x;

  return jsonb_build_object(
    'personal', p_squad is not null,
    'captain', jsonb_build_object('pick', v_pick, 'alt', v_alt, 'overall', v_overall),
    'change', v_change,
    'luck_scope', v_scope, 'unlucky', v_unlucky, 'lucky', v_lucky,
    'minutes', v_minutes,
    'watchlist', v_watch,
    'prices', jsonb_build_object('since', v_since, 'notable', v_notable, 'mine', v_moves, 'tonight', v_tonight));
end;
$$;
revoke all on function private.email_sections(bigint, integer, integer[], integer[]) from public, anon, authenticated;

-- Everything the generic issue shows.
create or replace function public.email_weekly_content(p_season bigint, p_gw integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := (now() at time zone 'Europe/London')::date;
  v_deadline timestamptz; v_prev jsonb; v_market jsonb;
begin
  select deadline_time into v_deadline from public.fpl_gameweeks where season_id = p_season and fpl_event_id = p_gw;

  -- The gameweek preview, if published.
  select jsonb_build_object('title', r.title, 'path', format('/fpl/gameweek/%s/%s/preview', r.season_label, r.fpl_event_id),
                            'published_at', r.published_at)
    into v_prev
    from public.fpl_gameweek_reports r
   where r.season_id = p_season and r.fpl_event_id = p_gw and r.kind = 'preview' and r.status = 'published'
   order by r.version desc, r.published_at desc limit 1;

  -- Where our model and the market disagree: the daily_market post's logic
  -- (social_daily_games; rated teams only; biggest gap on any outcome, 5+
  -- points) over the games from today to three days after the deadline.
  with g as (
    select g.*, d::date as day
      from generate_series(v_today, coalesce((v_deadline at time zone 'Europe/London')::date, v_today) + 3, interval '1 day') d
      cross join lateral private.social_daily_games(d::date) g
     where g.status = 'scheduled' and not g.estimated
       and d::date + coalesce(g.kickoff_time, time '12:00') > now() at time zone 'Europe/London'),
  o as (
    select g.*, x.outcome, abs(x.pm - x.mm) gap,
           row_number() over (partition by g.fixture_id order by abs(x.pm - x.mm) desc, x.outcome) rn
      from g cross join lateral (values ('home', g.ph, g.mh), ('draw', g.pd, g.md), ('away', g.pa, g.ma)) x(outcome, pm, mm))
  select coalesce(jsonb_agg(jsonb_build_object('home', o.home, 'away', o.away, 'league', o.lg, 'day', o.day,
                                               'kickoff', to_char(o.kickoff_time, 'HH24:MI'), 'slug', f.slug,
                                               'outcome', o.outcome, 'gap', round(o.gap, 3),
                                               'market', jsonb_build_array(o.mh, o.md, o.ma), 'model', jsonb_build_array(o.ph, o.pd, o.pa))
                            order by o.gap desc, o.fixture_id), '[]')
    into v_market
    from (select * from o where rn = 1 and gap >= 0.05 order by gap desc, fixture_id limit 5) o
    left join public.fixtures f on f.fixture_id = o.fixture_id;

  return jsonb_build_object(
    'season_id', p_season, 'gw', p_gw, 'deadline', v_deadline, 'generated_at', now(),
    'sections', private.email_sections(p_season, p_gw, null, null),
    'preview', v_prev,
    'market', v_market);
end;
$$;

-- ---------------------------------------------------------------- sending (email-weekly edge function)
-- Opens a send. Weekly: once per gameweek (issue_key unique); a send that
-- reached nobody because it failed outright may be retried, up to 3 attempts.
create or replace function public.email_begin_send(p_kind text, p_season bigint, p_gw integer, p_subject text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_key text; v_send private.email_sends; v_run bigint;
begin
  if p_kind not in ('weekly', 'test') then raise exception 'bad kind %', p_kind; end if;
  if p_kind = 'weekly' then
    v_key := format('fpl-weekly:%s:%s', p_season, p_gw);
    insert into private.email_sends (kind, issue_key, season_id, fpl_event_id, subject)
    values ('weekly', v_key, p_season, p_gw, p_subject)
    on conflict (issue_key) do nothing
    returning * into v_send;
    if v_send.send_id is null then
      update private.email_sends
         set status = 'sending', attempts = attempts + 1, started_at = now(), finished_at = null, recipients = 0, football = 0,
             sent = 0, failed = 0, note = null, subject = p_subject
       where issue_key = v_key and status = 'failed' and sent = 0 and attempts < 3 and started_at < now() - interval '30 minutes'
      returning * into v_send;
      if v_send.send_id is null then
        return jsonb_build_object('skip', 'already sent (or being sent) for this gameweek', 'issue_key', v_key);
      end if;
    end if;
  else
    if exists (select 1 from private.email_sends where kind = 'test' and started_at > now() - interval '2 minutes') then
      return jsonb_build_object('skip', 'a test was sent in the last 2 minutes');
    end if;
    insert into private.email_sends (kind, season_id, fpl_event_id, subject)
    values ('test', p_season, p_gw, p_subject) returning * into v_send;
  end if;
  insert into public.pipeline_runs (job_name, started_at, status, summary)
  values (case when p_kind = 'weekly' then 'email-weekly' else 'email-weekly-test' end, now(), 'running', format('GW%s %s send started', p_gw, p_kind))
  returning run_id into v_run;
  update private.email_sends set pipeline_run_id = v_run where send_id = v_send.send_id;
  return jsonb_build_object('send_id', v_send.send_id, 'issue_key', v_send.issue_key, 'kind', v_send.kind);
end;
$$;

-- Who gets it, each with a fresh manage token (for unsubscribe and manage links).
-- A test goes to the admin address only, with no token (and, if given, an
-- example FPL ID and club so the admin sees the "Your team" section).
create or replace function public.email_recipients(p_send_id bigint, p_test_fpl_id bigint default null, p_test_club bigint default null,
                                                   p_test_watch integer[] default '{}')
returns table (subscriber_id bigint, email text, football boolean, token text, fpl_id bigint, club_id bigint, watchlist integer[])
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare v_kind text := (select kind from private.email_sends where send_id = p_send_id);
begin
  if v_kind is null then raise exception 'unknown send %', p_send_id; end if;
  if v_kind = 'test' then
    return query select null::bigint, private.email_admin_address(), true, null::text, p_test_fpl_id, p_test_club, p_test_watch
                  where private.email_admin_address() is not null;
  else
    return query
      select s.subscriber_id, s.email, 'football_market' = any (s.topics), private.email_new_token(s.subscriber_id, 'manage', null),
             s.fpl_entry_id, s.club_team_id, s.watchlist
        from private.email_subscribers s where s.status = 'confirmed' order by s.confirmed_at, s.subscriber_id;
  end if;
end;
$$;

-- Takes up to p_n from today's and this month's allowance; returns how many may go.
create or replace function public.email_quota_take(p_n integer)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare st private.email_settings; v_day integer; v_month integer; v_ok integer; v_today date := (now() at time zone 'UTC')::date;
begin
  select * into st from private.email_settings where id;
  if not st.sending_enabled then return 0; end if;
  insert into private.email_outbound_days (day, sent) values (v_today, 0) on conflict (day) do nothing;
  select sent into v_day from private.email_outbound_days where day = v_today for update;
  select coalesce(sum(sent), 0) into v_month from private.email_outbound_days where day >= date_trunc('month', v_today)::date;
  v_ok := greatest(0, least(p_n, st.daily_limit - v_day, st.monthly_limit - v_month));
  update private.email_outbound_days set sent = sent + v_ok where day = v_today;
  return v_ok;
end;
$$;

create or replace function public.email_log_failure(p_send_id bigint, p_kind text, p_http_status integer, p_error text, p_recipients integer)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into private.email_failures (send_id, kind, http_status, error, recipients)
  values (p_send_id, p_kind, p_http_status,
          left(regexp_replace(coalesce(p_error, ''), '[^\s<>"'',;:]+@[^\s<>"'',;:]+', '[address]', 'g'), 500),
          greatest(coalesce(p_recipients, 1), 0));
$$;

-- Closes a send, logs the run (counts only) and alerts the admin on any failure.
create or replace function public.email_finish_send(p_send_id bigint, p_recipients integer, p_football integer,
                                                    p_sent integer, p_failed integer, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v private.email_sends; v_status text;
begin
  v_status := case when p_failed > 0 and p_sent = 0 then 'failed' when p_failed > 0 then 'partial'
                   when p_recipients = 0 then 'skipped' else 'sent' end;
  update private.email_sends
     set status = v_status, recipients = p_recipients, football = p_football, sent = p_sent, failed = p_failed,
         note = left(p_note, 500), finished_at = now()
   where send_id = p_send_id
  returning * into v;
  if v.send_id is null then raise exception 'unknown send %', p_send_id; end if;
  update public.pipeline_runs
     set finished_at = now(),
         status = case v_status when 'failed' then 'failed' when 'partial' then 'warning' else 'success' end,
         summary = format('GW%s %s: %s recipients (%s with the football section), %s sent, %s failed%s',
                          v.fpl_event_id, v.kind, p_recipients, p_football, p_sent, p_failed, coalesce('. ' || left(p_note, 200), '')),
         error_message = case when p_failed > 0 then left(p_note, 500) end,
         rows_read = p_recipients, rows_inserted = p_sent, rows_changed = p_sent
   where run_id = v.pipeline_run_id;
  if p_failed > 0 then
    perform private.social_notify(jsonb_build_object('kind', 'email_failed', 'send_id', v.send_id, 'gw', v.fpl_event_id,
                                                     'send_kind', v.kind, 'sent', p_sent, 'failed', p_failed, 'note', left(p_note, 300)));
  end if;
end;
$$;

-- ---------------------------------------------------------------- "Your team" (optional personalisation)
-- A subscriber's FPL squad: the picks at the last deadline that has passed,
-- fetched from the FPL API by the database (the edge runtime's requests are
-- often refused by FPL; see fpl_entry_fetch). Cached per entry and gameweek
-- for 6 hours, so one send asks FPL once per entry. Shares the
-- 120-a-minute ceiling in private.fpl_entry_calls. Null on any failure: the
-- email then just leaves the section out. Only element ids are stored, and
-- only for 2 days.
create table if not exists private.email_fpl_picks (
  entry_id bigint not null,
  season_id bigint not null,
  fpl_event_id integer not null,
  picks integer[] not null,
  fetched_at timestamptz not null default now(),
  primary key (entry_id, season_id, fpl_event_id)
);
alter table private.email_fpl_picks enable row level security;
revoke all on private.email_fpl_picks from public, anon, authenticated;

create or replace function private.email_fpl_picks_for(p_entry bigint, p_season bigint, p_gw integer)
returns integer[] language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '6s' as $$
declare v integer[]; st integer; body text;
begin
  if p_entry is null or p_gw is null then return null; end if;
  select picks into v from private.email_fpl_picks
   where entry_id = p_entry and season_id = p_season and fpl_event_id = p_gw and fetched_at > now() - interval '6 hours';
  if v is not null then return v; end if;
  if (select count(*) from private.fpl_entry_calls where called_at > now() - interval '1 minute') >= 100 then return null; end if;
  insert into private.fpl_entry_calls default values;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '2500');
  select status, content into st, body
    from extensions.http_get(format('https://fantasy.premierleague.com/api/entry/%s/event/%s/picks/', p_entry, p_gw));
  if st <> 200 then return null; end if;
  select array_agg((x->>'element')::int order by (x->>'position')::int) into v from jsonb_array_elements(body::jsonb->'picks') x;
  if v is null then return null; end if;
  insert into private.email_fpl_picks (entry_id, season_id, fpl_event_id, picks) values (p_entry, p_season, p_gw, v)
  on conflict (entry_id, season_id, fpl_event_id) do update set picks = excluded.picks, fetched_at = now();
  delete from private.email_fpl_picks where fetched_at < now() - interval '2 days';
  return v;
exception when others then
  return null;
end;
$$;
revoke all on function private.email_fpl_picks_for(bigint, bigint, integer) from public, anon, authenticated;

-- One subscriber's personal data: their FPL squad's and watchlist's sections
-- (email_sections) and their club's next game (our model's chances, kick-off,
-- UK TV) and last result (get_my_club_cards, as on the personal home page),
-- with the competition and any shoot-out.
create or replace function public.email_personal(p_season bigint, p_gw integer, p_fpl_id bigint, p_club bigint, p_watch integer[] default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pick_gw integer; v_picks integer[]; v_sections jsonb; v_club jsonb; c jsonb; v_last jsonb;
  v_watch integer[] := case when cardinality(p_watch) > 0 then p_watch end;
begin
  if p_fpl_id is not null then
    select fpl_event_id into v_pick_gw from public.fpl_gameweeks
     where season_id = p_season and deadline_time < now() order by deadline_time desc limit 1;
    v_picks := private.email_fpl_picks_for(p_fpl_id, p_season, v_pick_gw);
  end if;
  if v_picks is not null or v_watch is not null then
    v_sections := private.email_sections(p_season, p_gw, v_picks, v_watch);
  end if;
  if p_club is not null then
    c := public.get_my_club_cards(array[p_club]::bigint[]) -> 0;
    if c is not null then
      -- The last result, with its competition and any shoot-out (a cup tie
      -- level after 90 minutes must not read as a plain draw).
      v_last := c->'recent'->0;
      if v_last is not null then
        select v_last || jsonb_build_object('competition', l.name, 'decided_by', m.decided_by,
                                            'pens', case when m.home_penalty_goals is not null and m.away_penalty_goals is not null
                                                         then jsonb_build_array(m.home_penalty_goals, m.away_penalty_goals) end)
          into v_last
          from public.fixtures f
          left join public.leagues l on l.league_id = f.league_id
          left join public.matches m on m.league_id = f.league_id and m.season_id = f.season_id
                                    and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id
                                    and m.match_date = f.kickoff_date
         where f.fixture_id = (v_last->>'fixture_id')::bigint;
        v_last := coalesce(v_last, c->'recent'->0);
      end if;
      v_club := jsonb_build_object('name', c->'team'->>'display_name', 'slug', c->'team'->>'slug', 'next', c->'next', 'last', v_last);
    end if;
  end if;
  return jsonb_build_object('picks_gw', case when v_picks is not null then v_pick_gw end,
                            'squad_size', cardinality(v_picks), 'sections', v_sections, 'club', v_club);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.email_signup(text, boolean, text, bigint, bigint)', 'public.email_confirm(text)', 'public.email_unsubscribe(text)',
                           'public.email_manage(text, jsonb)', 'public.email_weekly_issue()', 'public.email_weekly_content(bigint, integer)',
                           'public.email_begin_send(text, bigint, integer, text)', 'public.email_recipients(bigint, bigint, bigint, integer[])', 'public.email_personal(bigint, integer, bigint, bigint, integer[])',
                           'public.email_quota_take(integer)', 'public.email_log_failure(bigint, text, integer, text, integer)',
                           'public.email_finish_send(bigint, integer, integer, integer, integer, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke all on function private.email_new_token(bigint, text, interval) from public, anon, authenticated;
revoke all on function private.email_token_owner(text, text[]) from public, anon, authenticated;
revoke all on function private.email_admin_address() from public, anon, authenticated;
revoke all on function private.email_invoke(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- admin (/admin/email)
create or replace function public.get_email_admin()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_today date := (now() at time zone 'UTC')::date; st private.email_settings;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into st from private.email_settings where id;
  return jsonb_build_object(
    'counts', (select jsonb_build_object(
                 'pending', count(*) filter (where status = 'pending'),
                 'confirmed', count(*) filter (where status = 'confirmed'),
                 'unsubscribed', count(*) filter (where status = 'unsubscribed'),
                 'football', count(*) filter (where status = 'confirmed' and 'football_market' = any (topics)),
                 'confirmed_7d', count(*) filter (where status = 'confirmed' and confirmed_at > now() - interval '7 days'),
                 'unsubscribed_7d', count(*) filter (where unsubscribed_at > now() - interval '7 days'))
               from private.email_subscribers),
    'signups_24h', (select jsonb_object_agg(outcome, n) from (select outcome, count(*) n from private.email_signup_attempts
                     where created_at > now() - interval '24 hours' group by outcome) x),
    'quota', jsonb_build_object('today', coalesce((select sent from private.email_outbound_days where day = v_today), 0),
                                'month', (select coalesce(sum(sent), 0) from private.email_outbound_days where day >= date_trunc('month', v_today)::date),
                                'daily_limit', st.daily_limit, 'monthly_limit', st.monthly_limit, 'sending_enabled', st.sending_enabled),
    'next', public.email_weekly_issue(),
    'admin_address_set', private.email_admin_address() is not null,
    'sends', (select coalesce(jsonb_agg(to_jsonb(s) order by s.started_at desc), '[]') from (
               select send_id, kind, fpl_event_id, subject, status, attempts, recipients, football, sent, failed, note, started_at, finished_at
                 from private.email_sends order by started_at desc limit 12) s),
    'failures', (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]') from (
                  select failure_id, send_id, kind, http_status, error, recipients, created_at
                    from private.email_failures order by created_at desc limit 12) f));
end;
$$;
revoke all on function public.get_email_admin() from public, anon;
grant execute on function public.get_email_admin() to authenticated, service_role;

-- "Send test to admin": the next issue, to the admin address only. An FPL ID
-- and club (the admin's own browser preferences) add the "Your team" section.
create or replace function public.email_admin_send_test(p_fpl_id bigint default null, p_club bigint default null, p_watch integer[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  perform private.email_invoke(jsonb_build_object('mode', 'test', 'fpl_id', p_fpl_id, 'club_id', p_club, 'watchlist', to_jsonb(coalesce(p_watch, '{}'))));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.email_admin_send_test(bigint, bigint, integer[]) from public, anon;
grant execute on function public.email_admin_send_test(bigint, bigint, integer[]) to authenticated;

-- Player search for the watchlist on /email/manage: this season's players by
-- name (public data, the same as the site's player pages).
create or replace function public.email_player_search(p_q text)
returns table (id integer, name text, team text, pos text, price numeric)
language sql stable set search_path = public, pg_temp as $$
  select p.fpl_player_id::int, p.web_name, ft.short_name,
         case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end,
         round(p.now_cost / 10.0, 1)
    from public.fpl_players p
    left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
   where p.season_id = public.fpl_current_season_id() and p.now_cost > 0 and length(trim(coalesce(p_q, ''))) >= 2
     and (p.web_name ilike '%' || trim(p_q) || '%' or (p.first_name || ' ' || p.second_name) ilike '%' || trim(p_q) || '%'
          or public.unaccent(p.web_name) ilike '%' || public.unaccent(trim(p_q)) || '%')
   order by p.selected_by_percent desc nulls last, p.fpl_player_id
   limit 10;
$$;
grant execute on function public.email_player_search(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- schedule
-- Hourly: invoke the send once the issue is due and not yet sent (the edge
-- function checks again and email_begin_send makes it once per gameweek).
create or replace function private.email_weekly_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare i jsonb := public.email_weekly_issue();
begin
  if not coalesce((i->>'due')::boolean, false) then return jsonb_build_object('status', 'not due', 'gw', i->'gw', 'due_at', i->'due_at'); end if;
  if i->'sent' is not null and jsonb_typeof(i->'sent') = 'object'
     and not (i->'sent'->>'status' = 'failed' and (i->'sent'->>'sent')::int = 0
              and (select attempts < 3 and started_at < now() - interval '30 minutes' from private.email_sends where issue_key = i->>'issue_key')) then
    return jsonb_build_object('status', 'already sent', 'gw', i->'gw');
  end if;
  perform private.email_invoke(jsonb_build_object('mode', 'weekly'));
  return jsonb_build_object('status', 'invoked', 'gw', i->'gw');
end;
$$;

-- Daily: retention (see /privacy).
create or replace function private.email_purge()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n_unsub integer; n_pending integer; n_tok integer; n_att integer;
begin
  delete from private.email_subscribers where status = 'unsubscribed' and unsubscribed_at < now() - interval '29 days';
  get diagnostics n_unsub = row_count;
  delete from private.email_subscribers where status = 'pending' and coalesce(confirm_sent_at, created_at) < now() - interval '7 days';
  get diagnostics n_pending = row_count;
  delete from private.email_tokens where expires_at < now() or (purpose = 'manage' and created_at < now() - interval '400 days');
  get diagnostics n_tok = row_count;
  delete from private.email_signup_attempts where created_at < now() - interval '2 days';
  get diagnostics n_att = row_count;
  delete from private.email_outbound_days where day < current_date - 400;
  delete from private.email_failures where created_at < now() - interval '400 days';
  return jsonb_build_object('unsubscribed_deleted', n_unsub, 'pending_expired', n_pending, 'tokens', n_tok, 'attempts', n_att);
end;
$$;
revoke all on function private.email_weekly_tick() from public, anon, authenticated;
revoke all on function private.email_purge() from public, anon, authenticated;

select cron.unschedule('email-weekly-tick') where exists (select 1 from cron.job where jobname = 'email-weekly-tick');
select cron.schedule('email-weekly-tick', '7 * * * *', $$select private.email_weekly_tick()$$);
select cron.unschedule('email-purge') where exists (select 1 from cron.job where jobname = 'email-purge');
select cron.schedule('email-purge', '23 3 * * *', $$select private.email_purge()$$);

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, notes)
values
  ('email-weekly-tick', 'email', 'supabase_cron', '7 * * * *', interval '3 hours', interval '00:05:00', 'pg_cron', '^email-weekly-tick$', null,
   'Hourly: invokes email-weekly once the FPL weekly email is due (Thu 18:00 UK for a Fri/Sat deadline, else 36h before); no-op otherwise'),
  ('email-purge', 'email', 'supabase_cron', '23 3 * * *', interval '26 hours', interval '00:05:00', 'pg_cron', '^email-purge$', null,
   'Daily retention: unsubscribed addresses deleted within 30 days, unconfirmed after 7, expired tokens, 2-day sign-up attempt log'),
  ('email-weekly', 'email', 'edge_function', 'before each FPL deadline', interval '16 days', interval '00:15:00', 'pipeline_runs', '^email-weekly$', 'api.resend.com',
   'The FPL weekly email send (edge function email-weekly via email-weekly-tick). Counts only in pipeline_runs. Goes stale between seasons: set active = false over the summer')
on conflict (job_key) do update
  set schedule = excluded.schedule, expected_interval = excluded.expected_interval, max_duration = excluded.max_duration,
      run_log = excluded.run_log, run_key = excluded.run_key, upstream = excluded.upstream, notes = excluded.notes;

-- ---------------------------------------------------------------- one test issue
-- The "Send test to admin" path (public.email_admin_send_test does this after
-- its is_admin() check): the next issue to the admin address only, nobody
-- added to the list. pg_net sends it after this transaction commits; the
-- result is in private.email_sends and pipeline_runs (email-weekly-test).
-- Re-running sends another test, which is harmless.
select private.email_invoke(jsonb_build_object('mode', 'test'));
