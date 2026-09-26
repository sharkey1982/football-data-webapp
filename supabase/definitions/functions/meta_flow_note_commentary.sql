-- Live definition exported from the database (function meta_flow_note_commentary()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.meta_flow_note_commentary()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.purpose is distinct from old.purpose
     or new.commentary is distinct from old.commentary
     or new.refresh_note is distinct from old.refresh_note
     or new.layer is distinct from old.layer then
    insert into public.meta_flow_history (node_key, change, detail, author)
    values (new.node_key, 'commentary',
            nullif(concat_ws(' · ',
              case when new.layer is distinct from old.layer then 'layer: '||coalesce(new.layer,'—') end,
              case when new.purpose is distinct from old.purpose then 'purpose: '||left(coalesce(new.purpose,'—'),120) end,
              case when new.refresh_note is distinct from old.refresh_note then 'refresh: '||left(coalesce(new.refresh_note,'—'),120) end,
              case when new.commentary is distinct from old.commentary then 'note: '||left(coalesce(new.commentary,'—'),200) end), ''),
            coalesce(auth.jwt()->>'email', current_user));
  end if;
  return new;
end $function$
;
