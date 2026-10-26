-- ============================================================================
-- Team news post, simpler wording (Chris, 26 Oct 2026: "you can just make it
-- something like - non starters for the following fpl assets owned by more
-- than 10 % of players: Bruno fernandes abc, Wissa def and maybe include
-- their official status").
--
-- One list only: players owned by 10%+ who are not in the XI, each with club,
-- ownership and FPL's official status as it stands now (available, or FPL's
-- own note such as "knock, 75% chance"). Our own reasons (cup starts and so
-- on) and the "starting despite a doubt" section are dropped from the post;
-- the facts stay in source_data. Still a draft: team_news is not in
-- auto_post_types.
-- ============================================================================

-- Official FPL status for a player, short.
create or replace function private.social_fpl_status_label(p_status text, p_news text)
returns text language sql immutable as $$
  select case
    when coalesce(p_status, 'a') = 'a' then 'available'
    when nullif(trim(p_news), '') is not null then
      lower(left(p_news, 1)) || substr(replace(regexp_replace(regexp_replace(trim(p_news), ' - ', ', '), ' chance of playing$', ' chance'), ', Expected', ', expected'), 2)
    when p_status = 'd' then 'doubtful'
    when p_status = 'i' then 'injured'
    when p_status = 's' then 'suspended'
    when p_status = 'u' then 'unavailable'
    when p_status = 'n' then 'not available'
    else 'available' end
$$;

create or replace function private.social_detect_team_news(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_slot timestamptz; v_key text; v_f jsonb; v_out jsonb := '[]'; v_label text; v_head text;
  v_text text; v_id bigint; v_n integer;
begin
  for v_slot in
    select distinct ff.kickoff_time from public.fpl_fixtures ff
     where ff.season_id = v_season and ff.kickoff_time between now() - interval '45 minutes' and now() - interval '5 minutes'
  loop
    v_key := format('team_news:%s', to_char(v_slot at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI'));
    if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then continue; end if;
    -- Wait for every team in the slot until kick-off + 25, then go with those that are in.
    v_f := private.social_team_news_facts(v_season, v_slot, now() < v_slot + interval '25 minutes');
    if not (v_f->>'ready')::boolean then
      v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'none', 'reason', 'line-ups not all in yet');
      continue;
    end if;
    if jsonb_array_length(v_f->'not_starting') = 0 then
      v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'none', 'reason', 'no player owned by 10%+ left out');
      continue;
    end if;

    v_label := case when jsonb_array_length(v_f->'games') = 1
                    then (v_f->'games'->0->>'home') || ' v ' || (v_f->'games'->0->>'away')
                    else to_char(v_slot at time zone 'Europe/London', 'FMHH24:MI') || ' games' end;
    v_head := format('Team news, %s. Not starting, from the FPL players owned by 10%%+ of managers:', v_label);

    -- Full lines first; if too long, drop the status, then the least-owned names.
    v_n := jsonb_array_length(v_f->'not_starting');
    loop
      select v_head || E'\n\n' || string_agg(
               format('%s (%s, %s%% owned) · FPL status: %s', x->>'name', x->>'team', x->>'own',
                      private.social_fpl_status_label(p.status, p.news)), E'\n' order by ord)
        into v_text
        from jsonb_array_elements(v_f->'not_starting') with ordinality t(x, ord)
        left join public.fpl_players p on p.season_id = v_season and p.fpl_player_id = (x->>'id')::int
       where ord <= v_n;
      exit when public.social_weighted_length(v_text) <= 280;
      select v_head || E'\n\n' || string_agg(format('%s (%s, %s%%)', x->>'name', x->>'team', x->>'own'), E'\n' order by ord)
        into v_text
        from jsonb_array_elements(v_f->'not_starting') with ordinality t(x, ord)
       where ord <= v_n;
      exit when public.social_weighted_length(v_text) <= 280 or v_n = 1;
      v_n := v_n - 1;
    end loop;
    if public.social_weighted_length(v_text) > 280 then
      v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'rejected', 'reason', 'post is over 280 characters');
      continue;
    end if;

    insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                               expires_at, validation_status, validation_errors, detector_run_id)
    values ('team_news', v_text, v_text, null,
            jsonb_build_object('season_id', v_season, 'slot', v_slot) || v_f,
            now(), v_key, v_slot + interval '60 minutes', 'passed', '[]', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'team_news', 'run_id', p_run_id));
    v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'created', 'candidate_id', v_id);
  end loop;
  return jsonb_build_object('status', case when exists (select 1 from jsonb_array_elements(v_out) e where e->>'status' = 'created') then 'created' else 'none' end,
                            'slots', v_out);
end;
$$;
