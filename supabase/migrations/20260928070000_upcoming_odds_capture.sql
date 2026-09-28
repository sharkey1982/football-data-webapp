-- ============================================================================
-- Upcoming-match odds: the market line beside the model on match pages
-- (modelling programme, decision 28 Sep 2026: after F1 found Dixon-Coles adds
-- no information to the market, match pages show both and state the gap).
--
-- football-data.co.uk publishes fixtures.csv (updated around Tuesday and
-- Friday) with pre-match odds for the next few days of matches: Bet365,
-- Betfair exchange, market maximum and market average, for 1X2, over/under
-- 2.5 and Asian handicap, plus closing columns when they exist.
--
-- * fixture_odds_snapshots: append-only; a row is added only when a price
--   changes (unique on the prices), so the table is a price history per
--   fixture. captured_at is when we first saw that price.
-- * capture_upcoming_odds(): fetches the file (User-Agent required), maps
--   Div to our leagues and team names via team_aliases (football-data.co.uk)
--   or canonical names, matches fixtures in the current season by pairing
--   and date (+/- 3 days, so repeated pairings in split leagues stay apart),
--   and inserts new prices. Logged in pipeline_runs (job 'capture-upcoming-odds').
-- * pg_cron 'capture-upcoming-odds' three times a day.
-- * fixture_market_latest (anon): per fixture, the latest market-average
--   1X2 price captured BEFORE kick-off, de-vigged (basic -- the F0 benchmark).
-- * model_vs_market_by_league (anon): how the model and the market's closing
--   line compare on played matches (model_scorecard_matches), for the
--   "which is more accurate" line on match pages.
-- * check_model_integrity(): 'upcoming_odds_fresh' warns if no odds were
--   captured for 8 days while fixtures are scheduled.
-- ============================================================================

create table public.fixture_odds_snapshots (
  snapshot_id bigint generated always as identity primary key,
  fixture_id bigint not null references public.fixtures (fixture_id) on delete cascade,
  captured_at timestamptz not null default now(),
  source_name text not null default 'football-data.co.uk fixtures.csv',
  bookmaker text not null,
  market text not null check (market in ('1x2', 'ou25', 'ah')),
  is_closing boolean not null default false,
  line numeric,
  price_home numeric, price_draw numeric, price_away numeric,
  price_over numeric, price_under numeric
);
create unique index fixture_odds_snapshots_prices on public.fixture_odds_snapshots (
  fixture_id, bookmaker, market, is_closing, coalesce(line, -99),
  coalesce(price_home, 0), coalesce(price_draw, 0), coalesce(price_away, 0),
  coalesce(price_over, 0), coalesce(price_under, 0));
create index fixture_odds_snapshots_fixture on public.fixture_odds_snapshots (fixture_id, market, bookmaker, captured_at desc);
alter table public.fixture_odds_snapshots enable row level security;
create policy fixture_odds_snapshots_read on public.fixture_odds_snapshots for select to anon, authenticated using (true);
grant select on public.fixture_odds_snapshots to anon, authenticated;

create trigger fixture_odds_snapshots_append_only before update or delete on public.fixture_odds_snapshots
for each row execute function public.refuse_snapshot_changes();

create or replace function public.capture_upcoming_odds()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_catalog'
as $$
declare
  v_run bigint;
  v_status int;
  v_body text;
  v_rows int := 0;
  v_matched int := 0;
  v_inserted int := 0;
  v_unmapped text[];
begin
  insert into public.pipeline_runs (job_name, started_at, status) values ('capture-upcoming-odds', now(), 'running') returning run_id into v_run;
  begin
    select status, content into v_status, v_body
    from extensions.http(('GET', 'https://www.football-data.co.uk/fixtures.csv',
      array[extensions.http_header('User-Agent', 'Mozilla/5.0 (compatible; fixtureshark-odds/1.0)')], null, null)::extensions.http_request);
    if v_status <> 200 then raise exception 'fixtures.csv returned HTTP %', v_status; end if;
    v_body := replace(v_body, chr(65279), '');

    drop table if exists _fx;
    create temp table _fx on commit drop as
    with lines as (select t.l, t.n from regexp_split_to_table(v_body, E'\r?\n') with ordinality t(l, n) where length(trim(t.l)) > 0),
    hdr as (select string_to_array(l, ',') h from lines where n = 1),
    rws as (select string_to_array(l, ',') r from lines where n > 1)
    select r, h, r[array_position(h, 'Div')] as div, r[array_position(h, 'HomeTeam')] as home_raw, r[array_position(h, 'AwayTeam')] as away_raw,
      to_date(r[array_position(h, 'Date')], 'DD/MM/YYYY') as d
    from rws, hdr;
    select count(*) into v_rows from _fx;
    if v_rows = 0 then raise exception 'fixtures.csv had no rows; format may have changed'; end if;

    drop table if exists _fxm;
    create temp table _fxm on commit drop as
    select x.*, f.fixture_id
    from (
      select fx.*, l.league_id, coalesce(ha.team_id, ht.team_id) home_id, coalesce(aa.team_id, at.team_id) away_id
      from _fx fx
      join public.leagues l on l.code = fx.div
      left join public.team_aliases ha on ha.source_name = 'football-data.co.uk' and ha.raw_name = fx.home_raw
      left join public.teams ht on ht.canonical_name = fx.home_raw
      left join public.team_aliases aa on aa.source_name = 'football-data.co.uk' and aa.raw_name = fx.away_raw
      left join public.teams at on at.canonical_name = fx.away_raw
    ) x
    left join lateral (
      select f.fixture_id from public.fixtures f
      where f.league_id = x.league_id and f.season_id = public.current_season_id()
        and f.home_team_id = x.home_id and f.away_team_id = x.away_id
        and f.kickoff_date between x.d - 3 and x.d + 3
      order by abs(f.kickoff_date - x.d) limit 1
    ) f on true;

    -- Only leagues we keep fixtures for; an unmapped club there is worth knowing.
    select array_agg(distinct n order by n) into v_unmapped from (
      select home_raw n from _fxm where home_id is null and exists (select 1 from public.fixtures f where f.league_id = _fxm.league_id)
      union select away_raw from _fxm where away_id is null and exists (select 1 from public.fixtures f where f.league_id = _fxm.league_id)) u;
    select count(*) into v_matched from _fxm where fixture_id is not null;

    with prices as (
      select m.fixture_id, b.bookmaker, b.market, b.is_closing,
        case when b.market = 'ah' then nullif(m.r[array_position(m.h, case when b.is_closing then 'AHCh' else 'AHh' end)], '')::numeric end as line,
        nullif(m.r[array_position(m.h, b.col_h)], '')::numeric ph, nullif(m.r[array_position(m.h, b.col_d)], '')::numeric pd,
        nullif(m.r[array_position(m.h, b.col_a)], '')::numeric pa,
        nullif(m.r[array_position(m.h, b.col_o)], '')::numeric po, nullif(m.r[array_position(m.h, b.col_u)], '')::numeric pu
      from _fxm m
      cross join (values
        ('Avg', '1x2', false, 'AvgH', 'AvgD', 'AvgA', null, null),
        ('Max', '1x2', false, 'MaxH', 'MaxD', 'MaxA', null, null),
        ('B365', '1x2', false, 'B365H', 'B365D', 'B365A', null, null),
        ('BFE', '1x2', false, 'BFEH', 'BFED', 'BFEA', null, null),
        ('Avg', '1x2', true, 'AvgCH', 'AvgCD', 'AvgCA', null, null),
        ('BFE', '1x2', true, 'BFECH', 'BFECD', 'BFECA', null, null),
        ('Avg', 'ou25', false, null, null, null, 'Avg>2.5', 'Avg<2.5'),
        ('BFE', 'ou25', false, null, null, null, 'BFE>2.5', 'BFE<2.5'),
        ('Avg', 'ah', false, 'AvgAHH', null, 'AvgAHA', null, null),
        ('Avg', 'ou25', true, null, null, null, 'AvgC>2.5', 'AvgC<2.5'),
        ('Avg', 'ah', true, 'AvgCAHH', null, 'AvgCAHA', null, null)
      ) b(bookmaker, market, is_closing, col_h, col_d, col_a, col_o, col_u)
      where m.fixture_id is not null
    )
    insert into public.fixture_odds_snapshots (fixture_id, bookmaker, market, is_closing, line, price_home, price_draw, price_away, price_over, price_under)
    select fixture_id, bookmaker, market, is_closing, line, ph, pd, pa, po, pu
    from prices
    where (market = '1x2' and ph > 1 and pd > 1 and pa > 1)
       or (market = 'ou25' and po > 1 and pu > 1)
       or (market = 'ah' and ph > 1 and pa > 1 and line is not null)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;

    update public.pipeline_runs set finished_at = now(),
      status = case when v_unmapped is null then 'success' else 'failed' end,
      summary = jsonb_build_object('rows', v_rows, 'matched_fixtures', v_matched, 'new_prices', v_inserted)::text,
      error_message = case when v_unmapped is not null then 'unmapped club names (add team_aliases, source football-data.co.uk): ' || array_to_string(v_unmapped, ', ') end
    where run_id = v_run;
    return jsonb_build_object('rows', v_rows, 'matched_fixtures', v_matched, 'new_prices', v_inserted, 'unmapped', v_unmapped);
  exception when others then
    -- Recorded rather than re-raised, so the failure record survives.
    update public.pipeline_runs set finished_at = now(), status = 'failed', error_message = sqlerrm where run_id = v_run;
    raise warning 'capture_upcoming_odds failed: %', sqlerrm;
    return jsonb_build_object('status', 'failed', 'error', sqlerrm);
  end;
end;
$$;

revoke all on function public.capture_upcoming_odds() from public, anon, authenticated;

select cron.schedule('capture-upcoming-odds', '10 7,13,19 * * *', $$select public.capture_upcoming_odds();$$)
where not exists (select 1 from cron.job where jobname = 'capture-upcoming-odds');

-- Latest pre-kick-off market-average 1X2 per fixture, de-vigged (basic).
create or replace view public.fixture_market_latest with (security_invoker = true) as
select distinct on (s.fixture_id)
  s.fixture_id, s.captured_at, s.price_home, s.price_draw, s.price_away,
  (1 / s.price_home) / (1 / s.price_home + 1 / s.price_draw + 1 / s.price_away) as market_home,
  (1 / s.price_draw) / (1 / s.price_home + 1 / s.price_draw + 1 / s.price_away) as market_draw,
  (1 / s.price_away) / (1 / s.price_home + 1 / s.price_draw + 1 / s.price_away) as market_away
from public.fixture_odds_snapshots s
join public.fixtures f using (fixture_id)
where s.bookmaker = 'Avg' and s.market = '1x2'
  and s.captured_at < (f.kickoff_date + coalesce(f.kickoff_time, time '12:00')) at time zone 'Europe/London'
order by s.fixture_id, s.is_closing desc, s.captured_at desc;

grant select on public.fixture_market_latest to anon, authenticated;

-- Model v market on played matches: the evidence for the match-page line.
create or replace view public.model_vs_market_by_league with (security_invoker = true) as
select league_id,
  min(match_date) as from_date, max(match_date) as to_date, count(*) as matches,
  avg(-ln(case result when 'H' then p_home when 'D' then p_draw else p_away end)) as model_log_loss,
  avg(-ln(case result when 'H' then m_home when 'D' then m_draw else m_away end)) as market_log_loss,
  avg((case result when 'H' then 1 else 0 end - p_home) ^ 2 + (case result when 'D' then 1 else 0 end - p_draw) ^ 2 + (case result when 'A' then 1 else 0 end - p_away) ^ 2) as model_brier,
  avg((case result when 'H' then 1 else 0 end - m_home) ^ 2 + (case result when 'D' then 1 else 0 end - m_draw) ^ 2 + (case result when 'A' then 1 else 0 end - m_away) ^ 2) as market_brier
from public.model_scorecard_matches
where m_home is not null and p_home is not null
group by league_id;

grant select on public.model_vs_market_by_league to anon, authenticated;

-- Freshness guard.
do $$
declare
  v_def text;
  v_anchor text := '-- Catalogue (2026-09-26)';
  v_add text := $add$-- Upcoming odds (2026-09-28): fixtures.csv prices should arrive at least
  -- weekly while fixtures are scheduled in the next fortnight.
  select 'upcoming_odds_fresh',
    case when not exists (select 1 from public.fixtures where status = 'scheduled' and kickoff_date between current_date and current_date + 14)
           or exists (select 1 from public.fixture_odds_snapshots where captured_at > now() - interval '8 days')
         then 'ok' else 'warning' end,
    (select count(*) from public.fixture_odds_snapshots where captured_at > now() - interval '8 days'),
    'Upcoming-match odds prices captured in the last 8 days (capture_upcoming_odds, pg_cron capture-upcoming-odds; see pipeline_runs)'
  union all
  $add$;
begin
  select pg_get_functiondef('public.check_model_integrity'::regproc) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_add || v_anchor);
end $$;

-- Catalogue.
select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'source', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Pre-match odds for upcoming fixtures from football-data.co.uk fixtures.csv: per fixture, bookmaker (Avg, Max, B365, BFE), market (1x2, ou25, ah) and opening/closing, a row per distinct price (append-only price history; captured_at = first seen). Feeds the market line on match pages (fixture_market_latest) and prospective model-v-market tests.',
  refresh_note = 'capture_upcoming_odds() via pg_cron capture-upcoming-odds (07:10, 13:10, 19:10 UTC); the file itself updates around Tuesday and Friday.',
  purpose_reviewed_at = now()
where node_key = 'object:fixture_odds_snapshots';

update public.meta_flow_nodes set layer = 'pipeline', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Fetches football-data.co.uk fixtures.csv (User-Agent header), maps Div and club names (team_aliases football-data.co.uk, else canonical name), matches current-season fixtures by pairing and date +/- 3 days, and inserts new prices into fixture_odds_snapshots. Logs to pipeline_runs (capture-upcoming-odds); unmapped club names in leagues we keep fixtures for mark the run failed.',
  refresh_note = 'pg_cron capture-upcoming-odds (07:10, 13:10, 19:10 UTC).',
  purpose_reviewed_at = now()
where node_key = 'function:capture_upcoming_odds()';

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Per fixture, the latest market-average 1X2 price captured before kick-off (closing if present), with de-vigged probabilities (basic, the F0 benchmark method). Shown beside the model on match pages.',
  refresh_note = 'View over fixture_odds_snapshots.', purpose_reviewed_at = now()
where node_key = 'object:fixture_market_latest';

update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'Per league, the model''s and the market-average closing line''s mean log loss and Brier score on played matches with both (model_scorecard_matches: point-in-time model predictions). Powers the "which is more accurate" line on match pages.',
  refresh_note = 'View over model_scorecard_matches (refreshed by refresh_model_scorecard, 10:00 and 22:00 UTC).', purpose_reviewed_at = now()
where node_key = 'object:model_vs_market_by_league';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key = 'function:check_model_integrity()';
