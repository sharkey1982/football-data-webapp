-- Live definition exported from the database (function social_reply_check(p_text text, p_facts jsonb, p_allow_link boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_reply_check(p_text text, p_facts jsonb, p_allow_link boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  e jsonb := '[]'; v text := btrim(coalesce(p_text, '')); v_facts text; v_links text[]; v_urls text[]; v_rest text; u text;
begin
  if v = '' then return jsonb_build_array('empty'); end if;
  if public.social_weighted_length(v) > 280 then e := e || to_jsonb(format('too long: %s of 280', public.social_weighted_length(v))); end if;
  select string_agg(f->>'text', ' '), array_agg(distinct f->>'link') filter (where f->>'link' is not null)
    into v_facts, v_links from jsonb_array_elements(coalesce(p_facts, '[]')) f;
  if not (public.social_numbers(regexp_replace(v, 'https?://\S+', '', 'g')) <@ public.social_numbers(coalesce(v_facts, ''))) then
    e := e || to_jsonb('a number that is not in our facts'::text);
  end if;
  select coalesce(array_agg(m[1]), '{}') into v_urls from regexp_matches(v, '(https?://\S+)', 'g') m;
  if cardinality(v_urls) > (case when p_allow_link then 1 else 0 end) then
    e := e || to_jsonb(case when p_allow_link then 'more than one link' else 'a link (not allowed here)' end);
  end if;
  foreach u in array v_urls loop
    if not (rtrim(u, '.,)') = any (coalesce(v_links, '{}'))) then e := e || to_jsonb(format('link is not one of our fact pages: %s', u)); end if;
  end loop;
  v_rest := regexp_replace(v, 'https?://\S+', '', 'g');
  if public.social_has_url(v_rest) then e := e || to_jsonb('a bare web address'::text); end if;
  if v ~ '[@#]' then e := e || to_jsonb('no @ or # in a reply'::text); end if;
  if not private.social_hook_ok(v_rest) then e := e || to_jsonb('betting or hype words, an emoji or an exclamation mark'::text); end if;
  return e;
end;
$function$
;
