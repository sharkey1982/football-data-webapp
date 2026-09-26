-- Live definition exported from the database (function sync_airtable_broadcasts_from_api(p_update_airtable boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sync_airtable_broadcasts_from_api(p_update_airtable boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault', 'pg_catalog'
AS $function$
declare
  v_token text; v_url text; v_offset text; v_status int; v_body jsonb;
  v_records jsonb := '[]'; v_pages int := 0; v_result jsonb;
  v_synced text[]; v_unmatched text[]; v_ticked text[]; v_to_tick text[]; v_to_untick text[];
  v_batch jsonb; v_patched int := 0; v_patch_errors int := 0; i int;
  v_prune text[]; v_pruned int := 0; v_prune_errors int := 0; v_qs text;
  c_base constant text := 'appstYcYUotrVwbVJ';
  c_table constant text := 'tblhMHaKsodKoD6sV';
  c_synced constant text := 'fldegUzhGYWDPaA2R';
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'airtable_token';
  if v_token is null then raise exception 'airtable_token not found in Vault'; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '30');

  -- page through every record (100 per page)
  loop
    v_url := format('https://api.airtable.com/v0/%s/%s?pageSize=100&returnFieldsByFieldId=true', c_base, c_table)
             || coalesce('&offset=' || v_offset, '');
    select status, content::jsonb into v_status, v_body
    from extensions.http(('GET', v_url, array[extensions.http_header('Authorization', 'Bearer ' || v_token)], null, null)::extensions.http_request);
    if v_status <> 200 then raise exception 'Airtable list returned HTTP % on page %', v_status, v_pages + 1; end if;
    v_pages := v_pages + 1;
    -- The API gives select values as plain strings; the sync expects the
    -- connector's {name: ...} shape. Normalise single- and multi-selects.
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
    perform pg_sleep(0.25); -- Airtable allows 5 requests/second per base
  end loop;

  v_result := public.sync_airtable_broadcasts(v_records);

  if p_update_airtable then
    v_synced := array(select jsonb_array_elements_text(v_result->'synced_ids'));
    v_unmatched := array(select x->>'id' from jsonb_array_elements(v_result->'unmatched_records') x where x->>'id' is not null);
    v_ticked := array(select r->>'id' from jsonb_array_elements(v_records) r where (r->'fields'->>c_synced)::boolean);
    v_to_tick := array(select unnest(v_synced) except select unnest(v_ticked));
    v_to_untick := array(select unnest(v_unmatched) intersect select unnest(v_ticked));

    -- PATCH in batches of 10 (Airtable's per-request limit)
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

  -- Prune: Airtable's free plan caps a base at 1,000 records, so rows for
  -- matches played more than a day ago are deleted from Airtable once the
  -- site holds them (the site copy is permanent; the sync never deletes a
  -- site row because Airtable no longer lists it). Unmatched records are
  -- never pruned -- they're not on the site yet.
  if p_update_airtable then
    v_prune := array(
      select fb.airtable_record_id from public.fixture_broadcasts fb
      join public.fixtures f on f.fixture_id = fb.fixture_id
      where fb.airtable_record_id = any(array(select jsonb_array_elements_text(v_result->'synced_ids')))
        and f.kickoff_date < current_date - 1);
    for i in 0 .. greatest(ceil(coalesce(array_length(v_prune,1),0) / 10.0)::int - 1, -1) loop
      select string_agg('records%5B%5D=' || id, '&') into v_qs
      from (select unnest(v_prune) id order by 1 offset i * 10 limit 10) b;
      select status into v_status from extensions.http((
        'DELETE', format('https://api.airtable.com/v0/%s/%s?%s', c_base, c_table, v_qs),
        array[extensions.http_header('Authorization', 'Bearer ' || v_token)], null, null)::extensions.http_request);
      if v_status = 200 then v_pruned := v_pruned + (length(v_qs) - length(replace(v_qs, 'records%5B%5D=', ''))) / length('records%5B%5D=');
      else v_prune_errors := v_prune_errors + 1; end if;
      perform pg_sleep(0.25);
    end loop;
  end if;

  update public.broadcast_sync_runs set notes = format('API pull: %s page(s); Airtable "Synced to site" updated on %s record(s), %s failed batch(es); pruned %s played record(s), %s failed batch(es)',
    v_pages, v_patched, v_patch_errors, v_pruned, v_prune_errors)
  where run_id = (v_result->>'run_id')::bigint;

  return (v_result - 'synced_ids') || jsonb_build_object('pages', v_pages, 'airtable_ticks_updated', v_patched, 'airtable_patch_errors', v_patch_errors, 'pruned', v_pruned, 'prune_errors', v_prune_errors);
end;
$function$
;
