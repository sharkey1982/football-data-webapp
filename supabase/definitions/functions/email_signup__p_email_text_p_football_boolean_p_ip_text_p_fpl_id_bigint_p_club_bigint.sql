-- Live definition exported from the database (function email_signup(p_email text, p_football boolean, p_ip text, p_fpl_id bigint, p_club bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_signup(p_email text, p_football boolean, p_ip text, p_fpl_id bigint DEFAULT NULL::bigint, p_club bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fpl bigint := case when p_fpl_id between 1 and 99999999 then p_fpl_id end;
  v_club bigint := (select team_id from public.teams where team_id = p_club);
  e text := lower(trim(coalesce(p_email, '')));
  v_salt text := (select salt from private.email_settings where id);
  v_ip text; v_eh text; n_ip_h integer; n_ip_d integer; n_em integer; n_all integer;
  s private.email_subscribers; v_topics text[] := case when p_football then array['fpl', 'football_market'] else array['fpl'] end;
  v_tok text;
begin
  if length(e) > 254 or e !~ '^[^@\s<>,;"]+@[^@\s<>,;"]+\.[a-z]{2,}$' then
    return jsonb_build_object('action', 'invalid');
  end if;
  v_ip := case when coalesce(p_ip, '') <> '' then private.email_hash(v_salt || ':ip:' || p_ip) end;
  v_eh := private.email_hash(v_salt || ':em:' || e);

  select count(*) filter (where created_at > now() - interval '1 hour'), count(*) into n_ip_h, n_ip_d
    from private.email_signup_attempts where v_ip is not null and ip_hash = v_ip and created_at > now() - interval '24 hours';
  select count(*) into n_em from private.email_signup_attempts
   where email_hash = v_eh and created_at > now() - interval '24 hours' and outcome like 'sent%';
  select count(*) into n_all from private.email_signup_attempts
   where created_at > now() - interval '24 hours' and outcome like 'sent%';

  if n_ip_h >= 5 or n_ip_d >= 20 or n_em >= 3 or n_all >= 40 then
    insert into private.email_signup_attempts (ip_hash, email_hash, outcome)
    values (v_ip, v_eh, case when n_em >= 3 then 'rate_email' when n_all >= 40 then 'rate_global' else 'rate_ip' end);
    return jsonb_build_object('action', 'none', 'reason', 'rate limited');
  end if;

  select * into s from private.email_subscribers where email = e for update;
  if s.subscriber_id is not null and s.status = 'confirmed' then
    insert into private.email_signup_attempts (ip_hash, email_hash, outcome) values (v_ip, v_eh, 'sent_already');
    return jsonb_build_object('action', 'already', 'email', e,
                              'token', private.email_new_token(s.subscriber_id, 'manage', null));
  end if;

  if s.subscriber_id is null then
    insert into private.email_subscribers (email, status, topics, fpl_entry_id, club_team_id, consent_version, confirm_sent_at)
    values (e, 'pending', v_topics, v_fpl, v_club, 'fpl-weekly-v1', now())
    returning * into s;
  else
    update private.email_subscribers
       set status = 'pending', topics = v_topics, fpl_entry_id = v_fpl, club_team_id = v_club,
           consent_version = 'fpl-weekly-v1', confirm_sent_at = now(),
           confirmed_at = null, unsubscribed_at = null, updated_at = now()
     where subscriber_id = s.subscriber_id;
    delete from private.email_tokens where subscriber_id = s.subscriber_id and purpose = 'confirm';
  end if;
  v_tok := private.email_new_token(s.subscriber_id, 'confirm', interval '7 days');
  insert into private.email_signup_attempts (ip_hash, email_hash, outcome) values (v_ip, v_eh, 'sent_confirm');
  return jsonb_build_object('action', 'confirm', 'email', e, 'token', v_tok, 'football', coalesce(p_football, false));
end;
$function$
;
