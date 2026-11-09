-- Live definition exported from the database (function social_reply_state(p_kind text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_reply_state(p_kind text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'me', (select x_user_id from public.social_x_connection where status = 'connected'),
    'me_username', (select x_username from public.social_x_connection where status = 'connected'),
    'settings', (select jsonb_build_object('reply_ideas_per_day', reply_ideas_per_day, 'auto_mention_replies', auto_mention_replies,
                                           'reply_reads_budget_usd', reply_reads_budget_usd) from public.social_settings where id),
    'ideas_today', (select count(*) from public.social_reply_ideas
                     where created_at >= date_trunc('day', now() at time zone 'Europe/London') at time zone 'Europe/London'),
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.handle) from public.social_reply_accounts a), '[]'),
    -- since_id only within X's 7-day search window
    'newest_id', (select newest_id from public.social_reply_runs where kind = p_kind and status = 'ok' and newest_id is not null
                    and started_at > now() - interval '6 days' order by started_at desc limit 1),
    'timeline_newest_id', (select timeline_newest_id from public.social_reply_runs where kind = 'ideas' and timeline_newest_id is not null
                             and started_at > now() - interval '6 days' order by started_at desc limit 1),
    'open_ideas', coalesce((select jsonb_agg(jsonb_build_object('idea_id', idea_id, 'x_post_id', x_post_id, 'created_at', created_at))
                              from public.social_reply_ideas where status = 'suggested' and created_at > now() - interval '72 hours'), '[]'),
    'known_mentions', coalesce((select jsonb_agg(x_post_id) from public.social_mentions where received_at > now() - interval '3 days'), '[]'));
$function$
;
