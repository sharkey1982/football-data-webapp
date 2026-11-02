-- Live definition exported from the database (view meta_catalogue_gaps).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.meta_catalogue_gaps with (security_invoker=true) as
 WITH last_change AS (
         SELECT meta_flow_history.node_key,
            max(meta_flow_history.changed_at) AS changed_at
           FROM meta_flow_history
          WHERE (meta_flow_history.change = ANY (ARRAY['added'::text, 'definition changed'::text, 'returned'::text]))
          GROUP BY meta_flow_history.node_key
        )
 SELECT n.node_key,
    n.kind,
    n.layer,
    n.status,
        CASE
            WHEN (COALESCE(n.purpose, ''::text) = ''::text) THEN 'undocumented'::text
            ELSE 'definition changed since review'::text
        END AS gap,
    lc.changed_at AS definition_changed_at,
    n.purpose_reviewed_at
   FROM (meta_flow_nodes n
     LEFT JOIN last_change lc USING (node_key))
  WHERE (n.is_present AND (COALESCE(n.layer, ''::text) <> 'scratch'::text) AND ((COALESCE(n.purpose, ''::text) = ''::text) OR ((lc.changed_at IS NOT NULL) AND ((n.purpose_reviewed_at IS NULL) OR (lc.changed_at > n.purpose_reviewed_at)))));
