-- The flow at a glance: what each object is for, what feeds it, what it feeds,
-- and when its definition last changed.
create or replace view public.meta_flow_summary with (security_invoker = true) as
select n.node_key, n.kind, n.obj_name, n.layer, n.purpose, n.refresh_note, n.commentary, n.row_estimate,
  (select count(*) from public.meta_flow_edges e where e.child_key = n.node_key)  as feeds_from,
  (select count(*) from public.meta_flow_edges e where e.parent_key = n.node_key) as feeds_into,
  (select string_agg(replace(replace(e.parent_key,'object:',''),'function:',''), ', ' order by e.parent_key)
     from public.meta_flow_edges e where e.child_key = n.node_key) as reads_from,
  n.first_seen, n.last_seen, n.is_present,
  (select max(h.changed_at) from public.meta_flow_history h where h.node_key = n.node_key and h.change = 'definition changed') as last_definition_change,
  (select count(*) from public.meta_flow_history h where h.node_key = n.node_key and h.change = 'definition changed') as definition_changes
from public.meta_flow_nodes n;
comment on view public.meta_flow_summary is 'The data and calculation flow at a glance: what each object is for, what feeds it, and when it last changed.';
grant select on public.meta_flow_summary to authenticated;
