-- ============================================================================
-- META: the data and calculation flow, derived from the database itself, with
-- room for human commentary and a history of every change.
--
--   meta_flow_nodes    every table / view / function, its layer, and NOTES
--                      (purpose, refresh, commentary) that people write
--   meta_flow_edges    what reads from what (from the catalogue where possible)
--   meta_flow_history  added / definition changed / disappeared / returned,
--                      recorded automatically by fingerprinting definitions
--
-- Structure is re-derived by meta_refresh_flow(); the human columns are never
-- overwritten by it. Admin-only: nothing here is public.
-- ============================================================================
create table if not exists public.meta_flow_nodes (
  node_key        text primary key,
  kind            text not null check (kind in ('table','view','matview','function')),
  obj_name        text not null,
  layer           text,
  purpose         text,
  refresh_note    text,
  commentary      text,
  definition_hash text not null,
  row_estimate    bigint,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  is_present      boolean not null default true
);
comment on table public.meta_flow_nodes is
  'Every table, view and function, re-derived by meta_refresh_flow(). layer/purpose/refresh_note/commentary are written by people and never overwritten.';

create table if not exists public.meta_flow_edges (
  parent_key text not null,
  child_key  text not null,
  source     text not null default 'catalog' check (source in ('catalog','parsed','manual')),
  primary key (parent_key, child_key)
);
comment on table public.meta_flow_edges is 'parent_key feeds child_key. "catalog" edges come from Postgres dependencies; "parsed" from reading function bodies.';

create table if not exists public.meta_flow_history (
  history_id  bigserial primary key,
  node_key    text not null,
  changed_at  timestamptz not null default now(),
  change      text not null check (change in ('added','definition changed','disappeared','returned','commentary')),
  detail      text,
  author      text not null default 'automatic'
);
create index if not exists meta_flow_history_node_idx on public.meta_flow_history (node_key, changed_at desc);
comment on table public.meta_flow_history is 'Version history: each time an object appears, changes definition or disappears, plus commentary people add.';

alter table public.meta_flow_nodes   enable row level security;
alter table public.meta_flow_edges   enable row level security;
alter table public.meta_flow_history enable row level security;
do $$ begin
  create policy meta_nodes_admin_read   on public.meta_flow_nodes   for select using (public.is_admin());
  create policy meta_edges_admin_read   on public.meta_flow_edges   for select using (public.is_admin());
  create policy meta_history_admin_read on public.meta_flow_history for select using (public.is_admin());
exception when duplicate_object then null; end $$;
revoke all on public.meta_flow_nodes, public.meta_flow_edges, public.meta_flow_history from anon;
grant select on public.meta_flow_nodes, public.meta_flow_edges, public.meta_flow_history to authenticated;
