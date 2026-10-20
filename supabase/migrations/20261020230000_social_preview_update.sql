-- ============================================================================
-- Gameweek log on X (Chris, 20 Oct 2026):
--   * the preview's evening team-news update (after the press conferences)
--     becomes its own automatic thread, once per gameweek, no link;
--   * the gameweek thread revalidation treats an update as current while its
--     version still carries the newest team news;
--   * up to 5 posts a day (a Friday can carry price changes, the preview,
--     captaincy and the evening update).
-- The preview itself now first publishes on Friday for weekend deadlines
-- (scripts/fpl_gameweek_report.py).
-- ============================================================================
create or replace function private.social_detect_gameweek_threads(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  rep record; v_posts text[]; v_url text; v_key text; v_text text; v_id bigint; v_checks jsonb; v_expires timestamptz;
  v_out jsonb := '[]'; v_too_long integer;
begin
  for rep in
    select distinct on (r.kind) r.report_id, r.season_label, r.fpl_event_id gw, r.kind, r.version, r.published_at, r.x_thread
      from public.fpl_gameweek_reports r
     where r.season_id = v_season and r.status = 'published' and not r.frozen
       and r.published_at > now() - interval '4 days'
     order by r.kind, r.fpl_event_id desc, r.version desc
  loop
    if exists (select 1 from public.social_post_candidates c where c.post_type = 'gameweek_thread'
                 and (c.source_data->>'season_id')::bigint = v_season and (c.source_data->>'gw')::int = rep.gw
                 and c.source_data->>'kind' = rep.kind and c.publication_status in ('publishing', 'published', 'needs_check')) then
      v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'none', 'reason', 'already posted');
      continue;
    end if;
    v_key := format('gameweek_thread:%s:%s:%s:v%s', v_season, rep.gw, rep.kind, rep.version);
    if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
      v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'none', 'reason', 'version already queued');
      continue;
    end if;

    v_url := format('https://fixtureshark.com/fpl/gameweek/%s/%s/%s', rep.season_label, rep.gw, rep.kind);
    -- Links come out of every post; a post that was only a link ("...: <url>") goes.
    select array_agg(q order by n) into v_posts
      from (select n, btrim(regexp_replace(p, '\s*https?://\S+', '', 'g')) q
              from jsonb_array_elements_text(coalesce(rep.x_thread, '[]')) with ordinality t(p, n)) x
     where q <> '' and q !~ ':$' and not public.social_has_url(q);
    if rep.kind = 'preview' and v_posts is not null then
      v_posts[1] := v_posts[1] || ' ' || v_url;
    end if;
    select count(*) into v_too_long from unnest(coalesce(v_posts, '{}')) p where public.social_weighted_length(p) > 280;
    v_checks := jsonb_build_array(
      private.social_check('thread has posts', coalesce(array_length(v_posts, 1), 0) >= 2, jsonb_build_object('posts', coalesce(array_length(v_posts, 1), 0))),
      private.social_check('every post within 280', v_too_long = 0, jsonb_build_object('too_long', v_too_long)));
    if coalesce(array_length(v_posts, 1), 0) < 2 or v_too_long > 0 then
      v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'rejected', 'checks', v_checks);
      continue;
    end if;

    select deadline_time into v_expires from public.fpl_gameweeks
     where season_id = v_season and fpl_event_id = case when rep.kind = 'preview' then rep.gw else rep.gw + 1 end;
    v_expires := coalesce(v_expires, now() + interval '3 days');
    v_text := array_to_string(v_posts, E'\n\n');

    -- A newer version replaces an older one that hasn't gone out.
    update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
     where post_type = 'gameweek_thread' and approval_status in ('pending', 'approved') and publication_status in ('unpublished', 'failed')
       and (source_data->>'season_id')::bigint = v_season and (source_data->>'gw')::int = rep.gw and source_data->>'kind' = rep.kind;

    insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                               expires_at, validation_status, validation_errors, detector_run_id)
    values ('gameweek_thread', v_text, v_text, to_jsonb(v_posts),
            jsonb_build_object('season_id', v_season, 'gw', rep.gw, 'kind', rep.kind, 'report_id', rep.report_id,
                               'version', rep.version, 'url', v_url, 'checks', v_checks),
            rep.published_at, v_key, v_expires, 'passed', '[]', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'gameweek_thread', 'run_id', p_run_id));
    v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'created', 'candidate_id', v_id);
  end loop;

  -- The evening team-news update (after the press conferences): once per
  -- gameweek, from the newest preview version that carries one. No link.
  for rep in
    select r.report_id, r.season_label, r.fpl_event_id gw, r.version, r.published_at, r.payload->'x_update' posts
      from public.fpl_gameweek_reports r
     where r.season_id = v_season and r.kind = 'preview' and r.status = 'published' and not r.frozen
       and jsonb_typeof(r.payload->'x_update') = 'array' and jsonb_array_length(r.payload->'x_update') >= 2
       and r.published_at > now() - interval '1 day'
       and extract(hour from r.published_at at time zone 'Europe/London') >= 16
     order by r.fpl_event_id desc, r.version desc limit 1
  loop
    if exists (select 1 from public.social_post_candidates c where c.post_type = 'gameweek_thread'
                 and (c.source_data->>'season_id')::bigint = v_season and (c.source_data->>'gw')::int = rep.gw
                 and c.source_data->>'kind' = 'preview_update' and c.publication_status in ('publishing', 'published', 'needs_check')) then
      v_out := v_out || jsonb_build_object('kind', 'preview_update', 'gw', rep.gw, 'status', 'none', 'reason', 'already posted');
      continue;
    end if;
    v_key := format('gameweek_thread:%s:%s:preview_update:v%s', v_season, rep.gw, rep.version);
    if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
      v_out := v_out || jsonb_build_object('kind', 'preview_update', 'gw', rep.gw, 'status', 'none', 'reason', 'version already queued');
      continue;
    end if;
    select array_agg(q order by n) into v_posts
      from (select n, btrim(regexp_replace(p, '\s*https?://\S+', '', 'g')) q
              from jsonb_array_elements_text(rep.posts) with ordinality t(p, n)) x
     where q <> '' and q !~ ':$' and not public.social_has_url(q);
    select count(*) into v_too_long from unnest(coalesce(v_posts, '{}')) p where public.social_weighted_length(p) > 280;
    v_checks := jsonb_build_array(
      private.social_check('thread has posts', coalesce(array_length(v_posts, 1), 0) >= 2, jsonb_build_object('posts', coalesce(array_length(v_posts, 1), 0))),
      private.social_check('every post within 280', v_too_long = 0, jsonb_build_object('too_long', v_too_long)));
    if coalesce(array_length(v_posts, 1), 0) < 2 or v_too_long > 0 then
      v_out := v_out || jsonb_build_object('kind', 'preview_update', 'gw', rep.gw, 'status', 'rejected', 'checks', v_checks);
      continue;
    end if;
    select deadline_time into v_expires from public.fpl_gameweeks where season_id = v_season and fpl_event_id = rep.gw;
    if v_expires is null or v_expires < now() + interval '1 hour' then continue; end if;
    v_text := array_to_string(v_posts, E'\n\n');
    update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
     where post_type = 'gameweek_thread' and approval_status in ('pending', 'approved') and publication_status in ('unpublished', 'failed')
       and (source_data->>'season_id')::bigint = v_season and (source_data->>'gw')::int = rep.gw and source_data->>'kind' = 'preview_update';
    insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                               expires_at, validation_status, validation_errors, detector_run_id)
    values ('gameweek_thread', v_text, v_text, to_jsonb(v_posts),
            jsonb_build_object('season_id', v_season, 'gw', rep.gw, 'kind', 'preview_update', 'report_id', rep.report_id,
                               'version', rep.version, 'checks', v_checks),
            rep.published_at, v_key, v_expires, 'passed', '[]', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'gameweek_thread', 'kind', 'preview_update', 'run_id', p_run_id));
    v_out := v_out || jsonb_build_object('kind', 'preview_update', 'gw', rep.gw, 'status', 'created', 'candidate_id', v_id);
  end loop;
  return jsonb_build_object('status', case when exists (select 1 from jsonb_array_elements(v_out) e where e->>'status' = 'created') then 'created' else 'none' end,
                            'fixtures', v_out);
end;
$$;


-- A preview_update is about its own version's team news: a newer preview version
-- without a fresh update must not make it stale. Other kinds unchanged.
do $$
declare d text := pg_get_functiondef('private.social_revalidate(bigint)'::regprocedure);
  a text := $a$  elsif c.post_type = 'gameweek_thread' then
    if exists (select 1 from public.fpl_gameweek_reports r where r.season_id = (s->>'season_id')::bigint and r.fpl_event_id = (s->>'gw')::int
                 and r.kind = s->>'kind' and r.status = 'published' and not r.frozen and r.version > (s->>'version')::int) then$a$;
  b text := $b$  elsif c.post_type = 'gameweek_thread' then
    if exists (select 1 from public.fpl_gameweek_reports r where r.season_id = (s->>'season_id')::bigint and r.fpl_event_id = (s->>'gw')::int
                 and r.kind = case when s->>'kind' = 'preview_update' then 'preview' else s->>'kind' end
                 and r.status = 'published' and not r.frozen and r.version > (s->>'version')::int
                 and (s->>'kind' <> 'preview_update' or jsonb_array_length(coalesce(r.payload->'x_update', '[]')) >= 2)) then$b$;
begin
  if position(b in d) > 0 then return; end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'revalidate anchor not found exactly once'; end if;
  execute replace(d, a, b);
end $$;

update public.social_settings set max_posts_per_day = greatest(max_posts_per_day, 5), updated_at = now() where id;
