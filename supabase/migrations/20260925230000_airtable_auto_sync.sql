-- Automatic Airtable -> Supabase broadcast sync (applied live 25 Sep 2026).
--
-- Why: relaying records through chat stopped scaling (660 records ~130KB;
-- the connector's search also caps at 500). The database now pulls the
-- table itself with a token held in Vault ('airtable_token', scoped to the
-- UK Broadcasts base: data.records:read/write, schema.bases:read). The
-- token never appears in code, chat or logs.
--
-- First run: 660 records -> 651 on site (500 new, 119 corrected, 31
-- unchanged), 9 held in broadcast_sync_unmatched (6 Scottish lower-league,
-- Rangers v Aberdeen and Barnsley v Sheffield Wednesday with no fixture
-- within 3 days, 1 record missing date/teams). Re-run: 0 changes.

-- Same Airtable record = the same source correcting itself, so its latest
-- version always wins. The earlier "keep stronger confidence" branch kept
-- 119 stale Premier League/UCL rows after ChatGPT's review honestly
-- re-labelled them (e.g. some "confirmed" -> "Probable") -- preserving the
-- over-claiming the review was meant to fix. kept_stronger is now always 0.
do $$
declare d text := pg_get_functiondef('public.sync_airtable_broadcasts(jsonb)'::regprocedure);
declare old_branch text := $a$    elsif public.broadcast_confidence_rank(v_existing.confidence) > public.broadcast_confidence_rank(v_row.confidence)
          and v_existing.airtable_record_id is not distinct from rid then
      update public.fixture_broadcasts set last_synced_at = now() where broadcast_id = v_existing.broadcast_id;
      n_kept := n_kept + 1;
$a$;
begin
  if position(old_branch in d) > 0 then
    execute replace(d, old_branch, '');
  end if;
end $$;

create or replace function public.sync_airtable_broadcasts_from_api(p_update_airtable boolean default true)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'extensions', 'vault', 'pg_catalog'
as $function$
declare
  v_token text; v_url text; v_offset text; v_status int; v_body jsonb;
  v_records jsonb := '[]'; v_pages int := 0; v_result jsonb;
  v_synced text[]; v_unmatched text[]; v_ticked text[]; v_to_tick text[]; v_to_untick text[];
  v_batch jsonb; v_patched int := 0; v_patch_errors int := 0; i int;
  c_base constant text := 'appstYcYUotrVwbVJ';
  c_table constant text := 'tblhMHaKsodKoD6sV';
  c_synced constant text := 'fldegUzhGYWDPaA2R';
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'airtable_token';
  if v_token is null then raise exception 'airtable_token not found in Vault'; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '30');

  loop
    v_url := format('https://api.airtable.com/v0/%s/%s?pageSize=100&returnFieldsByFieldId=true', c_base, c_table)
             || coalesce('&offset=' || v_offset, '');
    select status, content::jsonb into v_status, v_body
    from extensions.http(('GET', v_url, array[extensions.http_header('Authorization', 'Bearer ' || v_token)], null, null)::extensions.http_request);
    if v_status <> 200 then raise exception 'Airtable list returned HTTP % on page %', v_status, v_pages + 1; end if;
    v_pages := v_pages + 1;
    -- API select values are plain strings; the sync expects {name: ...}.
    v_records := v_records || coalesce((
      select jsonb_agg(jsonb_build_object('id', r->>'id', 'fields',
        (select coalesce(jsonb_object_agg(k,
           case
             when k in ('fld2ke4qZAxCzthoG','fldC79K6Q8tQJEGzn','fld2paMWsFES1xcJW','fldBFu0wI75sQ8k6B') and jsonb_typeof(v) = 'string'
               then jsonb_build_object('name', v #>> '{}')
             when k = 'fld4n1V81E2yrUfHc' and jsonb_typeof(v) = 'array'
               then (select coalesce(jsonb_agg(case when jsonb_typeof(x) = 'string' then jsonb_build_object('name', x #>> '{}') else x end), '[]') from jsonb_array_elements(v) x)
             else v end), '{}')
         from jsonb_each(r->'fields') as e(k, v))))
      from jsonb_array_elements(v_body->'records') r), '[]');
    v_offset := v_body->>'offset';
    exit when v_offset is null;
    perform pg_sleep(0.25);
  end loop;

  v_result := public.sync_airtable_broadcasts(v_records);

  if p_update_airtable then
    v_synced := array(select jsonb_array_elements_text(v_result->'synced_ids'));
    v_unmatched := array(select x->>'id' from jsonb_array_elements(v_result->'unmatched_records') x where x->>'id' is not null);
    v_ticked := array(select r->>'id' from jsonb_array_elements(v_records) r where (r->'fields'->>c_synced)::boolean);
    v_to_tick := array(select unnest(v_synced) except select unnest(v_ticked));
    v_to_untick := array(select unnest(v_unmatched) intersect select unnest(v_ticked));

    for i in 0 .. greatest(ceil((coalesce(array_length(v_to_tick,1),0) + coalesce(array_length(v_to_untick,1),0)) / 10.0)::int - 1, -1) loop
      select jsonb_build_object('records', jsonb_agg(jsonb_build_object('id', id, 'fields', jsonb_build_object(c_synced, val))))
      into v_batch
      from (select id, val from (
              select unnest(v_to_tick) id, true val
              union all select unnest(v_to_untick), false) all_changes
            order by id offset i * 10 limit 10) b;
      select status into v_status from extensions.http((
        'PATCH', format('https://api.airtable.com/v0/%s/%s', c_base, c_table),
        array[extensions.http_header('Authorization', 'Bearer ' || v_token)], 'application/json', v_batch::text)::extensions.http_request);
      if v_status = 200 then v_patched := v_patched + jsonb_array_length(v_batch->'records');
      else v_patch_errors := v_patch_errors + 1; end if;
      perform pg_sleep(0.25);
    end loop;
  end if;

  update public.broadcast_sync_runs set notes = format('API pull: %s page(s); Airtable "Synced to site" updated on %s record(s), %s failed batch(es)',
    v_pages, v_patched, v_patch_errors)
  where run_id = (v_result->>'run_id')::bigint;

  return (v_result - 'synced_ids') || jsonb_build_object('pages', v_pages, 'airtable_ticks_updated', v_patched, 'airtable_patch_errors', v_patch_errors);
end;
$function$;
revoke all on function public.sync_airtable_broadcasts_from_api(boolean) from public, anon, authenticated;

-- Every 3 hours at :40, clear of the FPL jobs (:17, :23).
select cron.schedule('sync-airtable-broadcasts-3-hourly', '40 */3 * * *', $$select public.sync_airtable_broadcasts_from_api(true);$$)
where not exists (select 1 from cron.job where jobname = 'sync-airtable-broadcasts-3-hourly');
