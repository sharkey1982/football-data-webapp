-- Watch Guide follow-ups (applied live 26 Sep 2026).
--
-- 1) Airtable pruning. The free plan caps a base at 1,000 records (660 on
--    day one), so sync_airtable_broadcasts_from_api() now deletes Airtable
--    rows for matches played more than a day ago, once the site holds them.
--    The site copy is permanent (the sync never deletes a site row because
--    Airtable stopped listing it); unmatched records are never pruned.
--    Delete path verified with a throwaway record (create 200, delete 200).
do $$
declare d text := pg_get_functiondef('public.sync_airtable_broadcasts_from_api(boolean)'::regprocedure);
begin
  if position('v_pruned' in d) > 0 then return; end if;
  d := replace(d, $a$v_batch jsonb; v_patched int := 0; v_patch_errors int := 0; i int;$a$,
                  $a$v_batch jsonb; v_patched int := 0; v_patch_errors int := 0; i int;
  v_prune text[]; v_pruned int := 0; v_prune_errors int := 0; v_qs text;$a$);
  d := replace(d, $a$  update public.broadcast_sync_runs set notes = format('API pull: %s page(s); Airtable "Synced to site" updated on %s record(s), %s failed batch(es)',
    v_pages, v_patched, v_patch_errors)$a$,
$a$  if p_update_airtable then
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
    v_pages, v_patched, v_patch_errors, v_pruned, v_prune_errors)$a$);
  d := replace(d, $a$jsonb_build_object('pages', v_pages, 'airtable_ticks_updated', v_patched, 'airtable_patch_errors', v_patch_errors)$a$,
                  $a$jsonb_build_object('pages', v_pages, 'airtable_ticks_updated', v_patched, 'airtable_patch_errors', v_patch_errors, 'pruned', v_pruned, 'prune_errors', v_prune_errors)$a$);
  if position('v_pruned := v_pruned' in d) = 0 then raise exception 'pruning patch not applied'; end if;
  execute d;
end $$;

-- 2) Club countries, competition type and tier on the guide view, for the
--    grouped team picker (columns appended; existing readers unaffected).
create or replace view public.upcoming_watch_guide with (security_invoker = true) as
select fb.broadcast_id, fb.market, fb.status, fb.broadcaster, fb.channel, fb.streaming_service, fb.service_product,
  fb.access_type, fb.delivery_methods, fb.platform_device, fb.is_live, fb.uk_available, fb.is_fast,
  fb.is_free_to_air, fb.is_subscription, fb.is_ppv, fb.watch_url, fb.confidence, fb.availability_notes,
  fb.source, fb.source_url, fb.verified_at,
  f.fixture_id, f.slug, f.kickoff_date, f.kickoff_time, f.league_id, l.code league_code, l.name league_name,
  co.name country_name, ht.team_id home_team_id, ht.display_name home_team_name,
  at.team_id away_team_id, at.display_name away_team_name, f.predicted_home_goals, f.predicted_away_goals,
  hc.name home_team_country, ac.name away_team_country, l.competition_type, l.tier league_tier
from public.fixture_broadcasts fb
join public.fixtures f on f.fixture_id = fb.fixture_id
join public.leagues l on l.league_id = f.league_id
join public.countries co on co.country_id = l.country_id
join public.teams ht on ht.team_id = f.home_team_id
join public.teams at on at.team_id = f.away_team_id
left join public.countries hc on hc.country_id = ht.country_id
left join public.countries ac on ac.country_id = at.country_id
where f.kickoff_date >= current_date
  and (fb.status = 'confirmed_not_televised' or coalesce(fb.uk_available, true))
order by f.kickoff_date, f.kickoff_time;
grant select on public.upcoming_watch_guide to anon, authenticated;
