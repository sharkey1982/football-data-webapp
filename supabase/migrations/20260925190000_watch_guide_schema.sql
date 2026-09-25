-- ============================================================================
-- UK Watch Guide: richer viewing offers, Airtable sync, fixture watch status
--
-- Model: fixture -> 0..n viewing offers (fixture_broadcasts rows, status
-- 'confirmed_broadcast'). A fixture's watch status is derived, never stored
-- as a fake broadcaster row:
--   watch     -- at least one confirmed offer
--   not_live  -- an explicit, evidenced 'confirmed_not_televised' row
--                (the existing shape-checked status row, no broadcaster)
--   unknown   -- nothing confirmed. Absence of rows NEVER means "not on TV".
--
-- Backward compatible: every existing column stays; the legacy
-- is_free_to_air / is_subscription / is_ppv flags are still written by the
-- sync (derived from access_type) so existing readers keep working.
-- ============================================================================

alter table public.fixture_broadcasts
  add column if not exists airtable_record_id text,
  add column if not exists service_product text,
  add column if not exists access_type text,
  add column if not exists delivery_methods text[] not null default '{}',
  add column if not exists platform_device text,
  add column if not exists is_live boolean,
  add column if not exists uk_available boolean,
  add column if not exists is_fast boolean not null default false,
  add column if not exists confidence text,
  add column if not exists availability_notes text,
  add column if not exists competition_label text,
  add column if not exists last_synced_at timestamptz;

alter table public.fixture_broadcasts
  add constraint fixture_broadcasts_access_type_check
    check (access_type is null or access_type in ('free','free_compatible_device','subscription','ppv','unknown')),
  add constraint fixture_broadcasts_delivery_check
    check (delivery_methods <@ array['tv_channel','streaming','fast','web','app']::text[]),
  add constraint fixture_broadcasts_confidence_check
    check (confidence is null or confidence in ('confirmed_primary','confirmed_secondary','probable','needs_verification'));

-- One Airtable record = one viewing offer: the natural idempotency key.
create unique index if not exists fixture_broadcasts_airtable_record_key
  on public.fixture_broadcasts (airtable_record_id) where airtable_record_id is not null;

-- Airtable competition labels (old single-select + the free-text
-- "Competition (Extended)") -> FixtureShark league codes. Data, not code:
-- a new competition is one insert. Unmapped labels still sync by team+date.
create table if not exists public.broadcast_competition_map (
  label text primary key,
  league_code text not null
);
insert into public.broadcast_competition_map (label, league_code) values
  ('Premier League','E0'), ('Championship','E1'), ('League One','E2'), ('League Two','E3'),
  ('National League','EC'), ('EFL Cup','LC'), ('Carabao Cup','LC'), ('League Cup','LC'),
  ('UEFA Champions League','UCL'), ('Champions League','UCL'),
  ('UEFA Europa League','UEL'), ('Europa League','UEL'),
  ('UEFA Conference League','UECL'), ('Conference League','UECL'),
  ('Scottish Premiership','SC0'), ('Bundesliga','D1'), ('La Liga','SP1'), ('Serie A','I1'),
  ('Ligue 1','F1'), ('Eredivisie','N1'), ('Primeira Liga','P1')
on conflict (label) do nothing;

-- Records the sync could not place on a fixture: kept and reported, never
-- silently dropped. Resolved automatically when a later sync matches them.
create table if not exists public.broadcast_sync_unmatched (
  airtable_record_id text primary key,
  match_label text,
  kickoff_date date,
  home_raw text,
  away_raw text,
  competition_label text,
  reason text not null,
  record jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.broadcast_sync_runs (
  run_id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  records_seen int not null default 0,
  inserted int not null default 0,
  updated int not null default 0,
  unchanged int not null default 0,
  kept_stronger int not null default 0,
  unmatched int not null default 0,
  notes text
);

alter table public.broadcast_competition_map enable row level security;
alter table public.broadcast_sync_unmatched enable row level security;
alter table public.broadcast_sync_runs enable row level security;
create policy "broadcast map public read" on public.broadcast_competition_map for select using (true);
create policy "broadcast map admin write" on public.broadcast_competition_map for all using (public.is_admin()) with check (public.is_admin());
create policy "broadcast unmatched admin" on public.broadcast_sync_unmatched for all using (public.is_admin()) with check (public.is_admin());
create policy "broadcast runs admin" on public.broadcast_sync_runs for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Team resolution for Airtable's free-text names. Most specific first:
-- an explicit 'Airtable' alias, then canonical/display name, then any other
-- source's alias. A level only counts if it points at exactly one club --
-- an ambiguous name is reported, never guessed.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_broadcast_team(p_raw text)
returns bigint language sql stable set search_path to 'public', 'pg_temp' as $$
  with c as (
    select 1 lvl, team_id from public.team_aliases where source_name = 'Airtable' and raw_name = p_raw
    union all select 2, team_id from public.teams where lower(canonical_name) = lower(p_raw) or lower(display_name) = lower(p_raw)
    union all select 3, team_id from public.team_aliases where raw_name = p_raw
  ), lv as (
    select lvl, min(team_id) team_id, count(distinct team_id) n from c group by lvl
  )
  select team_id from lv where n = 1 order by lvl limit 1;
$$;

create or replace function public.broadcast_confidence_rank(p text)
returns int language sql immutable set search_path to pg_catalog as $$
  -- Legacy rows (null) were hand-verified from primary sources, so they
  -- rank alongside a reliable secondary rather than below 'probable'.
  select case p when 'confirmed_primary' then 4 when 'confirmed_secondary' then 3
    when 'probable' then 2 when 'needs_verification' then 1 else 3 end;
$$;

-- ---------------------------------------------------------------------------
-- sync_airtable_broadcasts(records): records is the Airtable records array
-- as the API/connector returns it ([{id, cellValuesByFieldId|fields}]).
-- Idempotent and safe to re-run. Never deletes an offer because a later
-- read doesn't list it. Returns a summary including the record ids that
-- landed (to tick "Synced to site") and those that didn't.
-- ---------------------------------------------------------------------------
create or replace function public.sync_airtable_broadcasts(p_records jsonb)
returns jsonb language plpgsql set search_path to 'public', 'pg_temp' as $$
declare
  r jsonb; f jsonb; rid text;
  v_match text; v_date date; v_home_raw text; v_away_raw text; v_comp text; v_code text; v_league bigint;
  v_home bigint; v_away bigint; v_fixture bigint; v_tie boolean; v_reason text;
  v_status text; v_access text; v_conf text; v_delivery text[];
  v_row public.fixture_broadcasts%rowtype; v_existing public.fixture_broadcasts%rowtype; v_found boolean;
  n_seen int := 0; n_ins int := 0; n_upd int := 0; n_same int := 0; n_kept int := 0; n_unm int := 0;
  synced text[] := '{}'; unmatched jsonb := '[]'; v_run bigint;
  sel constant text := 'name';
begin
  for r in select * from jsonb_array_elements(p_records) loop
    n_seen := n_seen + 1;
    rid := r->>'id';
    f := coalesce(r->'cellValuesByFieldId', r->'fields', '{}'::jsonb);
    v_match    := f->>'flddeM6xuoqoaPzea';
    v_date     := nullif(f->>'fldMtKYUVzWSvfjsw','')::date;
    v_home_raw := trim(f->>'fldiJTg56BqKPlJgd');
    v_away_raw := trim(f->>'fldpfiQHbbfjbDhn7');
    v_comp     := coalesce(nullif(trim(f->>'fldmK8oDxqwE9qzqJ'),''), f->'fldBFu0wI75sQ8k6B'->>sel, f->>'fldBFu0wI75sQ8k6B');
    v_code     := (select league_code from public.broadcast_competition_map where label = v_comp);
    v_league   := (select league_id from public.leagues where code = v_code);
    v_reason := null; v_fixture := null;

    if rid is null or v_date is null or v_home_raw is null or v_away_raw is null then
      v_reason := 'missing record id, date or team';
    else
      v_home := public.resolve_broadcast_team(v_home_raw);
      v_away := public.resolve_broadcast_team(v_away_raw);
      if v_home is null then v_reason := 'unknown team: ' || v_home_raw; end if;
      if v_away is null then v_reason := coalesce(v_reason || '; ', '') || 'unknown team: ' || v_away_raw; end if;
      if v_comp is not null and v_code is null then
        v_reason := coalesce(v_reason || '; ', '') || 'competition not mapped: ' || v_comp;
      elsif v_code is not null and v_league is null then
        v_reason := coalesce(v_reason || '; ', '') || 'competition not in database: ' || v_comp;
      end if;
    end if;

    if v_reason is null then
      -- nearest fixture within 3 days (Airtable dates are day-only and picks
      -- can move a day); a tie between two fixtures is reported, not guessed
      select x.fixture_id, x.tie into v_fixture, v_tie from (
        select fx.fixture_id,
          count(*) over (partition by abs(fx.kickoff_date - v_date)) > 1 tie,
          abs(fx.kickoff_date - v_date) dist
        from public.fixtures fx
        where fx.home_team_id = v_home and fx.away_team_id = v_away
          and fx.kickoff_date between v_date - 3 and v_date + 3
          and (v_league is null or fx.league_id = v_league)
        order by dist limit 1) x;
      if v_fixture is null then v_reason := 'no fixture within 3 days';
      elsif v_tie then v_reason := 'ambiguous fixture'; v_fixture := null; end if;
    end if;

    if v_reason is not null then
      n_unm := n_unm + 1;
      unmatched := unmatched || jsonb_build_object('id', rid, 'match', v_match, 'reason', v_reason);
      insert into public.broadcast_sync_unmatched (airtable_record_id, match_label, kickoff_date, home_raw, away_raw, competition_label, reason, record)
      values (coalesce(rid, 'missing-' || md5(r::text)), v_match, v_date, v_home_raw, v_away_raw, v_comp, v_reason, r)
      on conflict (airtable_record_id) do update set match_label = excluded.match_label, kickoff_date = excluded.kickoff_date,
        home_raw = excluded.home_raw, away_raw = excluded.away_raw, competition_label = excluded.competition_label,
        reason = excluded.reason, record = excluded.record, last_seen_at = now(), resolved_at = null;
      continue;
    end if;

    -- ---- build the offer row ----
    v_status := case when (f->'fld2ke4qZAxCzthoG'->>sel) = 'Confirmed not televised' then 'confirmed_not_televised' else 'confirmed_broadcast' end;
    v_access := case f->'fldC79K6Q8tQJEGzn'->>sel
      when 'Free' then 'free' when 'Free with compatible device' then 'free_compatible_device'
      when 'Subscription' then 'subscription' when 'PPV' then 'ppv' when 'Unknown' then 'unknown'
      else case when (f->>'fldZmTOM5AulyXZ3j')::boolean then 'ppv'
                when (f->>'fldJcv7Kh5u3HkCj8')::boolean then 'free'
                when (f->>'fldgg1RA8DF9oTFrV')::boolean then 'subscription' end end;
    v_conf := case f->'fld2paMWsFES1xcJW'->>sel
      when 'Confirmed - primary source' then 'confirmed_primary' when 'Confirmed - reliable secondary' then 'confirmed_secondary'
      when 'Probable' then 'probable' when 'Needs verification' then 'needs_verification' end;
    select coalesce(array_agg(distinct case d->>sel when 'TV channel' then 'tv_channel' when 'Streaming' then 'streaming'
      when 'FAST' then 'fast' when 'Web' then 'web' when 'App' then 'app' end) filter (where d->>sel is not null), '{}')
      into v_delivery from jsonb_array_elements(coalesce(f->'fld4n1V81E2yrUfHc', '[]'::jsonb)) d;

    v_row := null;
    v_row.fixture_id := v_fixture; v_row.market := 'GB'; v_row.status := v_status;
    v_row.airtable_record_id := rid; v_row.competition_label := v_comp;
    v_row.source := coalesce(nullif(f->>'fldfCjtvOiCOVhnCn',''), 'Airtable');
    v_row.source_url := nullif(f->>'fldBXex42rGUfLPOv','');
    v_row.verified_at := coalesce(nullif(f->>'fldfJd50DRoyC5S3D','')::timestamptz, now());
    v_row.confidence := v_conf;
    v_row.availability_notes := nullif(coalesce(f->>'fldCitDScZReOzIje', f->>'fldP2hFkflQx0r94y'),'');
    v_row.delivery_methods := '{}'; v_row.is_fast := false;
    v_row.is_free_to_air := false; v_row.is_subscription := false; v_row.is_ppv := false;
    if v_status = 'confirmed_broadcast' then
      v_row.broadcaster := coalesce(nullif(trim(f->>'fld2FM3N1abudVRXm'),''), 'Unknown');
      v_row.channel := nullif(trim(f->>'fldi4828fym50CtEk'),'');
      v_row.streaming_service := nullif(trim(f->>'fldJvGS3iqvmD568s'),'');
      v_row.service_product := nullif(trim(f->>'fldaSUf1mQ1hjlRvf'),'');
      v_row.watch_url := nullif(f->>'fldnN8HersdQmC6t2','');
      v_row.access_type := v_access;
      v_row.delivery_methods := v_delivery;
      v_row.platform_device := nullif(trim(f->>'fldzUcmQsuCu3nOjU'),'');
      v_row.is_live := coalesce((f->>'fldthqHgW0SyD7aaU')::boolean, true);
      v_row.uk_available := coalesce((f->>'fldig3IxVuSB2OY8F')::boolean, true);
      v_row.is_fast := coalesce((f->>'fldrz9HaAUpscP5dA')::boolean, false) or 'fast' = any(v_delivery);
      v_row.is_free_to_air := v_access in ('free','free_compatible_device');
      v_row.is_subscription := v_access = 'subscription';
      v_row.is_ppv := v_access = 'ppv';
    end if;

    -- ---- find the existing row: by record id, else adopt a pre-sync row
    --      for the same fixture/status/broadcaster (the 119 hand-synced) ----
    select * into v_existing from public.fixture_broadcasts where airtable_record_id = rid;
    v_found := found;
    if not v_found then
      select * into v_existing from public.fixture_broadcasts fb
      where fb.airtable_record_id is null and fb.fixture_id = v_fixture and fb.status = v_status
        and (v_status = 'confirmed_not_televised' or lower(fb.broadcaster) = lower(v_row.broadcaster))
      order by fb.broadcast_id limit 1;
      v_found := found;
    end if;

    if not v_found then
      insert into public.fixture_broadcasts (fixture_id, market, status, broadcaster, channel, streaming_service, is_free_to_air, is_subscription, is_ppv,
        watch_url, source, source_url, verified_at, airtable_record_id, service_product, access_type, delivery_methods, platform_device,
        is_live, uk_available, is_fast, confidence, availability_notes, competition_label, last_synced_at)
      values (v_row.fixture_id, v_row.market, v_row.status, v_row.broadcaster, v_row.channel, v_row.streaming_service, v_row.is_free_to_air,
        v_row.is_subscription, v_row.is_ppv, v_row.watch_url, v_row.source, v_row.source_url, v_row.verified_at, rid, v_row.service_product,
        v_row.access_type, v_row.delivery_methods, v_row.platform_device, v_row.is_live, v_row.uk_available, v_row.is_fast, v_row.confidence,
        v_row.availability_notes, v_row.competition_label, now());
      n_ins := n_ins + 1;
    elsif public.broadcast_confidence_rank(v_existing.confidence) > public.broadcast_confidence_rank(v_row.confidence)
          and v_existing.airtable_record_id is not distinct from rid then
      -- weaker evidence never overwrites stronger evidence for the same offer
      update public.fixture_broadcasts set last_synced_at = now() where broadcast_id = v_existing.broadcast_id;
      n_kept := n_kept + 1;
    elsif (v_existing.fixture_id, v_existing.status, v_existing.broadcaster, v_existing.channel, v_existing.streaming_service,
           v_existing.service_product, v_existing.access_type, v_existing.delivery_methods, v_existing.platform_device, v_existing.is_live,
           v_existing.uk_available, v_existing.is_fast, v_existing.confidence, v_existing.availability_notes, v_existing.watch_url,
           v_existing.source, v_existing.source_url, v_existing.verified_at, v_existing.airtable_record_id)
      is not distinct from
          (v_row.fixture_id, v_row.status, v_row.broadcaster, v_row.channel, v_row.streaming_service,
           v_row.service_product, v_row.access_type, v_row.delivery_methods, v_row.platform_device, v_row.is_live,
           v_row.uk_available, v_row.is_fast, v_row.confidence, v_row.availability_notes, v_row.watch_url,
           v_row.source, v_row.source_url, v_row.verified_at, rid) then
      update public.fixture_broadcasts set last_synced_at = now() where broadcast_id = v_existing.broadcast_id;
      n_same := n_same + 1;
    else
      update public.fixture_broadcasts set fixture_id = v_row.fixture_id, status = v_row.status, broadcaster = v_row.broadcaster,
        channel = v_row.channel, streaming_service = v_row.streaming_service, is_free_to_air = v_row.is_free_to_air,
        is_subscription = v_row.is_subscription, is_ppv = v_row.is_ppv, watch_url = coalesce(v_row.watch_url, watch_url),
        source = v_row.source, source_url = v_row.source_url, verified_at = v_row.verified_at, airtable_record_id = rid,
        service_product = v_row.service_product, access_type = v_row.access_type, delivery_methods = v_row.delivery_methods,
        platform_device = v_row.platform_device, is_live = v_row.is_live, uk_available = v_row.uk_available, is_fast = v_row.is_fast,
        confidence = v_row.confidence, availability_notes = v_row.availability_notes, competition_label = v_row.competition_label,
        last_synced_at = now(), updated_at = now()
      where broadcast_id = v_existing.broadcast_id;
      n_upd := n_upd + 1;
    end if;

    synced := synced || rid;
    update public.broadcast_sync_unmatched set resolved_at = now() where airtable_record_id = rid and resolved_at is null;
  end loop;

  insert into public.broadcast_sync_runs (records_seen, inserted, updated, unchanged, kept_stronger, unmatched)
  values (n_seen, n_ins, n_upd, n_same, n_kept, n_unm) returning run_id into v_run;

  return jsonb_build_object('run_id', v_run, 'seen', n_seen, 'inserted', n_ins, 'updated', n_upd, 'unchanged', n_same,
    'kept_stronger', n_kept, 'unmatched', n_unm, 'synced_ids', to_jsonb(synced), 'unmatched_records', unmatched);
end;
$$;
revoke all on function public.sync_airtable_broadcasts(jsonb) from public, anon, authenticated;
revoke all on function public.resolve_broadcast_team(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Watch Guide feed: every upcoming fixture with any evidence (offers or an
-- explicit not-televised row), one row per offer. The older
-- upcoming_broadcast_fixtures view is left exactly as it was for its
-- existing readers.
-- ---------------------------------------------------------------------------
create or replace view public.upcoming_watch_guide with (security_invoker = true) as
select fb.broadcast_id, fb.market, fb.status, fb.broadcaster, fb.channel, fb.streaming_service, fb.service_product,
  fb.access_type, fb.delivery_methods, fb.platform_device, fb.is_live, fb.uk_available, fb.is_fast,
  fb.is_free_to_air, fb.is_subscription, fb.is_ppv, fb.watch_url, fb.confidence, fb.availability_notes,
  fb.source, fb.source_url, fb.verified_at,
  f.fixture_id, f.slug, f.kickoff_date, f.kickoff_time, f.league_id, l.code league_code, l.name league_name,
  co.name country_name, ht.team_id home_team_id, ht.display_name home_team_name,
  at.team_id away_team_id, at.display_name away_team_name, f.predicted_home_goals, f.predicted_away_goals
from public.fixture_broadcasts fb
join public.fixtures f on f.fixture_id = fb.fixture_id
join public.leagues l on l.league_id = f.league_id
join public.countries co on co.country_id = l.country_id
join public.teams ht on ht.team_id = f.home_team_id
join public.teams at on at.team_id = f.away_team_id
where f.kickoff_date >= current_date
  and (fb.status = 'confirmed_not_televised' or coalesce(fb.uk_available, true))
order by f.kickoff_date, f.kickoff_time;
grant select on public.upcoming_watch_guide to anon, authenticated;

-- First sync (25 Sep 2026, run via sync_airtable_broadcasts): 158 Airtable
-- records -> 119 existing rows adopted (record ids attached, no
-- duplicates), 32 offers added, 7 left in broadcast_sync_unmatched
-- (6 Scottish Championship/League One -- leagues not in the database --
-- and Rangers v Aberdeen, dated 24 Nov in Airtable vs 31 Oct in the
-- fixture feed). One name alias was needed:
insert into public.team_aliases (team_id, source_name, raw_name)
select team_id, 'Airtable', 'Sheff Utd' from public.teams where canonical_name = 'Sheffield United'
on conflict do nothing;
