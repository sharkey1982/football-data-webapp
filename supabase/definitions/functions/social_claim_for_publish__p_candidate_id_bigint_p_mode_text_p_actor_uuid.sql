-- Live definition exported from the database (function social_claim_for_publish(p_candidate_id bigint, p_mode text, p_actor uuid)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_claim_for_publish(p_candidate_id bigint, p_mode text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  s public.social_settings; x public.social_x_connection; c public.social_post_candidates;
  r jsonb := '[]'; v_url boolean; v_cost numeric; v_day integer; v_month integer; v_spend numeric; v_last timestamptz;
  v_attempt bigint; v_london_today timestamptz; v_london_month timestamptz;
begin
  if p_mode not in ('dry_run', 'live') then raise exception 'mode must be dry_run or live'; end if;
  select * into s from public.social_settings for update;   -- one publisher at a time
  select * into x from public.social_x_connection;
  select * into c from public.social_post_candidates where candidate_id = p_candidate_id for update;
  if c.candidate_id is null then return jsonb_build_object('ok', false, 'reasons', jsonb_build_array('candidate not found')); end if;

  r := private.social_revalidate(p_candidate_id);
  if c.approval_status <> 'approved' then r := r || to_jsonb(format('not approved (%s)', c.approval_status)); end if;
  if c.publication_status not in ('unpublished', 'failed') then r := r || to_jsonb(format('already %s', c.publication_status)); end if;
  if c.publish_attempts >= s.max_live_attempts then r := r || to_jsonb(format('%s live attempts already made', c.publish_attempts)); end if;
  if exists (select 1 from public.social_post_candidates o where o.candidate_id <> c.candidate_id
               and o.publication_status in ('publishing', 'published', 'needs_check')
               and md5(lower(regexp_replace(btrim(o.text), '\s+', ' ', 'g'))) = md5(lower(regexp_replace(btrim(c.text), '\s+', ' ', 'g')))) then
    r := r || to_jsonb('the same text has already been posted'::text);
  end if;
  v_url := public.social_has_url(c.text);
  if v_url and not s.allow_urls then r := r || to_jsonb('links are switched off (a post with a link costs more)'::text); end if;
  v_cost := case when v_url then s.cost_per_post_with_url_usd else s.cost_per_post_usd end;

  v_london_today := date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London';
  v_london_month := date_trunc('month', now() at time zone 'Europe/London') at time zone 'Europe/London';
  select count(*) filter (where started_at >= v_london_today), count(*) filter (where started_at >= v_london_month),
         coalesce(sum(estimated_cost_usd) filter (where started_at >= v_london_month), 0), max(started_at)
    into v_day, v_month, v_spend, v_last
    from public.social_publish_attempts where mode = 'live' and (outcome is null or outcome in ('posted', 'unknown'));

  if p_mode = 'live' then
    if s.kill_switch then r := r || to_jsonb('kill switch is on'::text); end if;
    if not s.live_enabled then r := r || to_jsonb('live publishing is not enabled'::text); end if;
    if x.status <> 'connected' then r := r || to_jsonb(format('X account not connected (%s)', x.status)); end if;
    if lower(coalesce(x.x_username, '')) <> lower(s.allowed_x_username)
       or (s.allowed_x_user_id is not null and x.x_user_id is distinct from s.allowed_x_user_id) then
      r := r || to_jsonb(format('connected account is not @%s', s.allowed_x_username));
    end if;
  end if;
  -- Limits are reported on dry runs too, so a dry run shows what a live attempt would hit.
  if v_day >= s.max_posts_per_day then r := r || to_jsonb(format('daily limit reached (%s)', s.max_posts_per_day)); end if;
  if v_month >= s.max_posts_per_month then r := r || to_jsonb(format('monthly limit reached (%s)', s.max_posts_per_month)); end if;
  if v_last is not null and v_last > now() - make_interval(mins => s.min_minutes_between_posts) then
    r := r || to_jsonb(format('last post was under %s minutes ago', s.min_minutes_between_posts));
  end if;
  if v_spend + v_cost > s.monthly_budget_usd then
    r := r || to_jsonb(format('monthly budget: $%s spent + $%s would exceed $%s', v_spend, v_cost, s.monthly_budget_usd));
  end if;

  insert into public.social_publish_attempts (candidate_id, mode, requested_by, request_text, has_url, estimated_cost_usd, outcome, blocked_reasons, finished_at)
  values (p_candidate_id, p_mode, p_actor, c.text, v_url, case when p_mode = 'live' then v_cost else 0 end,
          case when jsonb_array_length(r) > 0 then 'blocked' when p_mode = 'dry_run' then 'dry_run_ok' end,
          r, case when jsonb_array_length(r) > 0 or p_mode = 'dry_run' then now() end)
  returning attempt_id into v_attempt;
  perform private.social_audit(case when p_mode = 'live' then 'publish_requested' else 'dry_run' end, p_candidate_id, p_actor,
                               jsonb_build_object('attempt_id', v_attempt, 'blocked', r));

  if jsonb_array_length(r) > 0 then
    return jsonb_build_object('ok', false, 'attempt_id', v_attempt, 'reasons', r, 'text', c.text, 'estimated_cost_usd', v_cost);
  end if;
  if p_mode = 'live' then
    update public.social_post_candidates set publication_status = 'publishing', publish_attempts = publish_attempts + 1, updated_at = now()
     where candidate_id = p_candidate_id;
  end if;
  return jsonb_build_object('ok', true, 'attempt_id', v_attempt, 'mode', p_mode, 'text', c.text, 'estimated_cost_usd', v_cost,
                            'spend_this_month_usd', v_spend, 'posts_today', v_day);
end;
$function$
;
