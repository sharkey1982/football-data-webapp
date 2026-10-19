-- Live definition exported from the database (function ai_prompt_versions_immutable()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_prompt_versions_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception 'Prompt % is immutable: create a new prompt_id instead of editing or deleting it', old.prompt_id
    using errcode = '42501';
end $function$
;
