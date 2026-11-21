-- FPL insider signals (Chris, 21 Nov 2026: "there are players and staff from
-- pl clubs whose team selections often provide inside information about
-- player availability ... Can we build any analysis of this into the site?
-- Especially into the x posting"; "go with recommendations").
--
-- Recommendations agreed: Premier League PLAYERS only, whose FPL accounts
-- are publicly identified (no club staff: private individuals); report what
-- is public after the deadline as a signal, never as injury news; posts need
-- Chris's approval; FPL content, not betting. Context: Arsenal banned players
-- picking themselves after Tzolis's FPL moves leaked team news (ESPN, 20 Nov
-- 2026); Chelsea warned staff after João Pedro was sold before his injury
-- was public.
--
-- FPL hides picks until the deadline, then any team's picks and transfers
-- are public. FPL refuses many cloud servers, so requests go out from the
-- database (extensions.http_get, as public.fpl_entry_fetch does).
--
--   public.fpl_insider_accounts   watchlist; 'candidate' until Chris approves
--   public.fpl_insider_gw         an account's picks for a gameweek
--   public.fpl_insider_transfers  its transfers
--   public.fpl_insider_signals    view: telling moves and, once played, whether
--                                 they came true (the track record)
--   private.fpl_insider_import_league(league, source)  candidates from a
--                                 mini-league, kept only if the manager's name
--                                 matches a current Premier League player
--   private.fpl_insider_tick()    every 10 minutes: fetches what approved
--                                 accounts are missing (40 requests at most)
-- Safe to re-run.

create table if not exists public.fpl_insider_accounts (
  entry_id bigint primary key,
  entry_name text,
  person_name text not null,
  fpl_player_id int not null,
  team_id bigint references public.teams (team_id),
  role text not null default 'player' check (role = 'player'),
  source_url text not null,
  status text not null default 'candidate' check (status in ('candidate', 'approved', 'rejected')),
  notes text,
  transfers_fetched_at timestamptz,
  added_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.fpl_insider_gw (
  entry_id bigint not null references public.fpl_insider_accounts (entry_id) on delete cascade,
  gw int not null,
  picks jsonb,
  active_chip text,
  http_status int,
  -- FPL's status for each picked player when we read it (just after the deadline for live gameweeks).
  status_snapshot jsonb,
  fetched_at timestamptz not null default now(),
  primary key (entry_id, gw)
);

create table if not exists public.fpl_insider_transfers (
  entry_id bigint not null references public.fpl_insider_accounts (entry_id) on delete cascade,
  gw int not null,
  element_in int not null,
  element_out int not null,
  transfer_time timestamptz not null,
  primary key (entry_id, transfer_time, element_in)
);

alter table public.fpl_insider_accounts enable row level security;
alter table public.fpl_insider_gw enable row level security;
alter table public.fpl_insider_transfers enable row level security;
revoke all on public.fpl_insider_accounts, public.fpl_insider_gw, public.fpl_insider_transfers from anon, authenticated;
grant select on public.fpl_insider_accounts, public.fpl_insider_gw, public.fpl_insider_transfers to service_role;

-- A current Premier League player for a manager's real name (FPL shows it on
-- mini-league tables): full name, FPL's known name, or first name + surname.
create or replace function private.fpl_insider_match_player(p_name text)
returns int language sql stable security definer set search_path = '' as $f$
  with n as (select lower(public.unaccent(trim(coalesce(p_name, '')))) nm)
  select p.fpl_player_id from public.fpl_players p, n
   where p.season_id = 13 and n.nm <> '' and position(' ' in n.nm) > 0
     and (n.nm = lower(public.unaccent(coalesce(p.source_payload->>'first_name', '') || ' ' || coalesce(p.source_payload->>'second_name', '')))
       or n.nm = lower(public.unaccent(coalesce(nullif(p.source_payload->>'known_name', ''), '~')))
       or n.nm = lower(public.unaccent(split_part(coalesce(p.source_payload->>'first_name', ''), ' ', 1) || ' '
                 || coalesce(p.source_payload->>'second_name', ''))))
   order by coalesce((p.source_payload->>'minutes')::int, 0) desc
   limit 1
$f$;

-- Candidates from a mini-league (e.g. FPL Focal's "The Players League").
-- Members whose name doesn't match a current PL player are not stored.
create or replace function private.fpl_insider_import_league(p_league bigint, p_source text)
returns jsonb language plpgsql volatile security definer set search_path = '' set statement_timeout = '60s' as $f$
declare st int; body text; j jsonb; r jsonb; page int := 1; n_seen int := 0; n_added int := 0; v_pid int;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
  loop
    select status, content into st, body
      from extensions.http_get('https://fantasy.premierleague.com/api/leagues-classic/' || p_league || '/standings/?page_standings=' || page);
    if st <> 200 then return jsonb_build_object('status', 'error', 'http', st, 'page', page, 'seen', n_seen, 'added', n_added); end if;
    j := body::jsonb;
    for r in select * from jsonb_array_elements(coalesce(j->'standings'->'results', '[]'::jsonb)) loop
      n_seen := n_seen + 1;
      v_pid := private.fpl_insider_match_player(r->>'player_name');
      if v_pid is not null then
        insert into public.fpl_insider_accounts (entry_id, entry_name, person_name, fpl_player_id, team_id, source_url, notes)
        select (r->>'entry')::bigint, r->>'entry_name', r->>'player_name', v_pid, p.canonical_team_id, p_source,
               'from mini-league ' || p_league
          from public.fpl_players p where p.fpl_player_id = v_pid and p.season_id = 13
        on conflict (entry_id) do update set entry_name = excluded.entry_name;
        n_added := n_added + 1;
      end if;
    end loop;
    exit when not coalesce((j->'standings'->>'has_next')::boolean, false) or page >= 20;
    page := page + 1;
  end loop;
  return jsonb_build_object('status', 'ok', 'league', p_league, 'pages', page, 'seen', n_seen, 'matched_players', n_added);
end;
$f$;

-- Fetch what approved accounts are missing: every deadline-passed gameweek's
-- picks, and transfers once after each deadline. At most p_budget requests.
create or replace function private.fpl_insider_tick(p_budget int default 40)
returns jsonb language plpgsql volatile security definer set search_path = '' set statement_timeout = '240s' as $f$
declare
  v_cur int; v_deadline timestamptz; a record; g int; st int; body text; j jsonb;
  used int := 0; n_gw int := 0; n_tr int := 0;
begin
  select max(fpl_event_id), max(deadline_time) into v_cur, v_deadline
    from public.fpl_gameweeks where season_id = 13 and deadline_time < now() - interval '2 minutes';
  if v_cur is null then return jsonb_build_object('status', 'no_deadline'); end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '4000');

  for a in select * from public.fpl_insider_accounts where status = 'approved' order by entry_id loop
    -- Transfers: once after each deadline.
    if used < p_budget and (a.transfers_fetched_at is null or a.transfers_fetched_at < v_deadline) then
      used := used + 1;
      begin
        select status, content into st, body from extensions.http_get('https://fantasy.premierleague.com/api/entry/' || a.entry_id || '/transfers/');
      exception when others then st := 0;
      end;
      if st = 200 then
        insert into public.fpl_insider_transfers (entry_id, gw, element_in, element_out, transfer_time)
        select a.entry_id, (t->>'event')::int, (t->>'element_in')::int, (t->>'element_out')::int, (t->>'time')::timestamptz
          from jsonb_array_elements(body::jsonb) t
        on conflict do nothing;
        update public.fpl_insider_accounts set transfers_fetched_at = now() where entry_id = a.entry_id;
        n_tr := n_tr + 1;
      end if;
    end if;
    -- Picks for each passed gameweek not yet read.
    for g in select s from generate_series(1, v_cur) s
              where not exists (select 1 from public.fpl_insider_gw x where x.entry_id = a.entry_id and x.gw = s and x.http_status in (200, 404))
              order by s desc loop
      exit when used >= p_budget;
      used := used + 1;
      begin
        select status, content into st, body from extensions.http_get('https://fantasy.premierleague.com/api/entry/' || a.entry_id || '/event/' || g || '/picks/');
      exception when others then st := 0;
      end;
      if st = 200 then
        j := body::jsonb;
        insert into public.fpl_insider_gw (entry_id, gw, picks, active_chip, http_status, status_snapshot, fetched_at)
        values (a.entry_id, g, j->'picks', j->>'active_chip', 200,
                case when g = v_cur then (select jsonb_object_agg(p.fpl_player_id::text, jsonb_build_object('status', p.status,
                        'chance', p.chance_of_playing_next_round, 'news', p.source_payload->>'news'))
                     from public.fpl_players p where p.season_id = 13
                      and p.fpl_player_id in (select (x->>'element')::int from jsonb_array_elements(j->'picks') x)) end,
                now())
        on conflict (entry_id, gw) do update set picks = excluded.picks, active_chip = excluded.active_chip, http_status = 200,
          status_snapshot = coalesce(public.fpl_insider_gw.status_snapshot, excluded.status_snapshot), fetched_at = now();
        n_gw := n_gw + 1;
      elsif st = 404 then
        -- Joined after that gameweek.
        insert into public.fpl_insider_gw (entry_id, gw, http_status) values (a.entry_id, g, 404)
        on conflict (entry_id, gw) do update set http_status = 404, fetched_at = now();
      end if;
    end loop;
    exit when used >= p_budget;
  end loop;

  if used > 0 then
    insert into public.pipeline_runs (job_name, started_at, finished_at, status, summary, rows_inserted)
    values ('fpl_insiders', now(), now(), 'success',
            format('GW%s: %s requests, %s gameweek picks, %s transfer lists', v_cur, used, n_gw, n_tr), n_gw);
  end if;
  return jsonb_build_object('status', 'ok', 'gw', v_cur, 'requests', used, 'picks', n_gw, 'transfers', n_tr);
end;
$f$;
revoke all on function private.fpl_insider_match_player(text), private.fpl_insider_import_league(bigint, text), private.fpl_insider_tick(int)
  from public, anon, authenticated;

-- The signals and their track record. A "teammate" is anyone at the
-- account holder's club now. Negative moves (sold, benched) predict the
-- player does not start that gameweek; positive moves (bought, captained
-- himself) predict he starts. Scored from FPL's starts once the gameweek is
-- finished.
create or replace view public.fpl_insider_signals with (security_invoker = true) as
with acc as (select * from public.fpl_insider_accounts where status = 'approved'),
mates as (select a.entry_id, p.fpl_player_id, p.web_name, (p.fpl_player_id = a.fpl_player_id) is_self
            from acc a join public.fpl_players p on p.season_id = 13 and p.canonical_team_id = a.team_id),
xi as (select g.entry_id, g.gw, (x->>'element')::int pid, (x->>'position')::int pos, coalesce((x->>'is_captain')::boolean, false) cap
         from public.fpl_insider_gw g, jsonb_array_elements(g.picks) x where g.http_status = 200),
moves as (
  select t.entry_id, t.gw, t.element_out pid, 'sold' move, t.transfer_time at_time from public.fpl_insider_transfers t
  union all
  select t.entry_id, t.gw, t.element_in, 'bought', t.transfer_time from public.fpl_insider_transfers t
  union all
  -- Benched: on the bench this gameweek after starting in his XI the week before.
  select c.entry_id, c.gw, c.pid, 'benched', null from xi c join xi p on p.entry_id = c.entry_id and p.gw = c.gw - 1 and p.pid = c.pid
   where c.pos > 11 and p.pos <= 11
  union all
  select c.entry_id, c.gw, c.pid, 'captained', null from xi c where c.cap),
res as (select fpl_player_id, fpl_event_id gw, sum(minutes) minutes,
               sum(coalesce((source_payload->'stats'->>'starts')::int, 0)) starts
          from public.fpl_player_gameweeks where season_id = 13 group by 1, 2)
select m.entry_id, a.person_name, a.team_id, m.gw, m.move,
       case when mt.is_self then m.move || '_self' else m.move || '_teammate' end kind,
       m.pid subject_fpl_player_id, mt.web_name subject, m.at_time,
       case when m.move in ('sold', 'benched') then 'not_start' else 'start' end predicts,
       g.status_snapshot->(m.pid::text)->>'status' fpl_status_then,
       (gw.finished) gw_finished, r.starts, r.minutes,
       case when not coalesce(gw.finished, false) then null
            when m.move in ('sold', 'benched') then coalesce(r.starts, 0) = 0
            else coalesce(r.starts, 0) > 0 end came_true
  from moves m
  join acc a on a.entry_id = m.entry_id
  join mates mt on mt.entry_id = m.entry_id and mt.fpl_player_id = m.pid
  left join public.fpl_insider_gw g on g.entry_id = m.entry_id and g.gw = m.gw
  left join public.fpl_gameweeks gw on gw.season_id = 13 and gw.fpl_event_id = m.gw
  left join res r on r.fpl_player_id = m.pid and r.gw = m.gw
 where not (m.move = 'captained' and not mt.is_self);
grant select on public.fpl_insider_signals to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'fpl-insiders-tick') then
    perform cron.schedule('fpl-insiders-tick', '*/10 * * * *', 'select private.fpl_insider_tick(40)');
  end if;
end $$;

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, notes)
values ('fpl-insiders-tick', 'fpl', 'supabase_cron', '*/10 * * * *', interval '00:10:00', interval '00:04:00', 'pg_cron', '^fpl-insiders-tick$', 'fantasy.premierleague.com',
        'Approved insider accounts (PL players only): picks and transfers after each deadline; feeds public.fpl_insider_signals')
on conflict (job_key) do nothing;
