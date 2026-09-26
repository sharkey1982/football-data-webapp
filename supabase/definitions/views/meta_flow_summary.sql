-- Live definition exported from the database (view meta_flow_summary).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.meta_flow_summary with (security_invoker=true) as
 SELECT node_key,
    kind,
    obj_name,
    layer,
    purpose,
    refresh_note,
    commentary,
    row_estimate,
    ( SELECT count(*) AS count
           FROM meta_flow_edges e
          WHERE (e.child_key = n.node_key)) AS feeds_from,
    ( SELECT count(*) AS count
           FROM meta_flow_edges e
          WHERE (e.parent_key = n.node_key)) AS feeds_into,
    ( SELECT string_agg(replace(replace(e.parent_key, 'object:'::text, ''::text), 'function:'::text, ''::text), ', '::text ORDER BY e.parent_key) AS string_agg
           FROM meta_flow_edges e
          WHERE (e.child_key = n.node_key)) AS reads_from,
    first_seen,
    last_seen,
    is_present,
    ( SELECT max(h.changed_at) AS max
           FROM meta_flow_history h
          WHERE ((h.node_key = n.node_key) AND (h.change = 'definition changed'::text))) AS last_definition_change,
    ( SELECT count(*) AS count
           FROM meta_flow_history h
          WHERE ((h.node_key = n.node_key) AND (h.change = 'definition changed'::text))) AS definition_changes
   FROM meta_flow_nodes n;
