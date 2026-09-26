-- ============================================================================
-- CATALOGUE: meta_flow_nodes becomes the maintained description of every
-- table, view and function -- what it is, whether it's current, whether the
-- public site reads it, and whether an AI assistant may use it.
--
--   status               current / superseded / experimental / unused
--   is_public            the public site reads it (directly or via a view/RPC)
--   ai_relevant          fit to back a read-only AI tool (no writers, logs,
--                        admin, superseded versions)
--   purpose_reviewed_at  when purpose/refresh_note/status were last reviewed;
--                        stamped automatically when any of them changes
--
-- meta_catalogue_gaps lists live, non-scratch objects that are undocumented or
-- whose definition changed after their entry was last reviewed. The daily
-- integrity run reports it as a WARNING (never fails the workflow).
-- Why: an AI answer (and a human one) was wrong on 2026-09-26 because a stale
-- description said the FPL data didn't exist. Descriptions must go stale
-- visibly, not silently.
-- ============================================================================

alter table public.meta_flow_nodes
  add column if not exists status text,
  add column if not exists is_public boolean,
  add column if not exists ai_relevant boolean,
  add column if not exists purpose_reviewed_at timestamptz;

do $$ begin
  alter table public.meta_flow_nodes add constraint meta_flow_nodes_status_check
    check (status in ('current', 'superseded', 'experimental', 'unused'));
exception when duplicate_object then null; end $$;

comment on column public.meta_flow_nodes.status is 'current / superseded / experimental / unused. Written by people; never overwritten by meta_refresh_flow().';
comment on column public.meta_flow_nodes.is_public is 'True if a public page reads this, directly or through a view/RPC.';
comment on column public.meta_flow_nodes.ai_relevant is 'True if this may back a read-only AI Lab tool. False for writers, logs, admin, internals and superseded versions.';
comment on column public.meta_flow_nodes.purpose_reviewed_at is 'When purpose/refresh_note/status were last reviewed. Stamped automatically on change; set it to now() to mark an unchanged entry as re-reviewed.';

grant update (status, is_public, ai_relevant, purpose_reviewed_at) on public.meta_flow_nodes to authenticated;

-- Stamp the review time whenever the description changes, unless the caller
-- set it explicitly in the same statement.
create or replace function public.meta_flow_stamp_review()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if (new.purpose is distinct from old.purpose
      or new.refresh_note is distinct from old.refresh_note
      or new.status is distinct from old.status)
     and new.purpose_reviewed_at is not distinct from old.purpose_reviewed_at then
    new.purpose_reviewed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists meta_flow_stamp_review on public.meta_flow_nodes;
create trigger meta_flow_stamp_review before update on public.meta_flow_nodes
  for each row execute function public.meta_flow_stamp_review();

create or replace view public.meta_catalogue_gaps with (security_invoker = true) as
with last_change as (
  select node_key, max(changed_at) as changed_at
  from public.meta_flow_history
  where change in ('added', 'definition changed', 'returned')
  group by node_key
)
select n.node_key, n.kind, n.layer, n.status,
       case when coalesce(n.purpose, '') = '' then 'undocumented'
            else 'definition changed since review' end as gap,
       lc.changed_at as definition_changed_at,
       n.purpose_reviewed_at
from public.meta_flow_nodes n
left join last_change lc using (node_key)
where n.is_present
  and coalesce(n.layer, '') <> 'scratch'
  and (coalesce(n.purpose, '') = ''
       or (lc.changed_at is not null
           and (n.purpose_reviewed_at is null or lc.changed_at > n.purpose_reviewed_at)));
comment on view public.meta_catalogue_gaps is
  'Live, non-scratch objects that are undocumented or changed since their catalogue entry was reviewed. Admin-only (RLS on meta_flow_nodes).';
revoke all on public.meta_catalogue_gaps from anon;
grant select on public.meta_catalogue_gaps to authenticated, service_role;

-- Add the catalogue check to the daily integrity run (warning only). Edited by
-- anchored replacement on the live body so nothing else in it can change.
do $$
declare
  d      text := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  anchor text := $a$where not has_table_privilege('anon', ('public.' || q.v)::regclass, 'SELECT')) x;$a$;
  added  text := $b$where not has_table_privilege('anon', ('public.' || q.v)::regclass, 'SELECT')) x
  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,
  -- reviewed since its definition last changed. Warning, not failure.
  select 'catalogue_current', case when n = 0 then 'ok' else 'warning' end, n,
    'Objects undocumented or changed since their catalogue entry was reviewed (see meta_catalogue_gaps): ' || coalesce(names, '')
  from (select count(*) n, string_agg(node_key, ', ' order by node_key) filter (where rn <= 10) names
        from (select node_key, row_number() over (order by node_key) rn from public.meta_catalogue_gaps) g) x;$b$;
begin
  if position('catalogue_current' in d) > 0 then
    return; -- already applied
  end if;
  if (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'check_model_integrity anchor did not match exactly once';
  end if;
  execute replace(d, anchor, added);
end $$;
