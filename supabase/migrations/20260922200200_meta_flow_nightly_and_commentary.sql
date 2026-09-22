-- 1. Keep the registry current: nightly at 05:45, after the fixture refresh
--    (04:15) and the cup ingest (05:15), so it sees the day's schema.
select cron.schedule('meta-refresh-flow-daily', '45 5 * * *', $$select public.meta_refresh_flow();$$);

-- 2. Admins can write the human columns from the Data Flow page. Nothing else
--    in the registry is writable.
do $$ begin
  create policy meta_nodes_admin_write on public.meta_flow_nodes
    for update using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
grant update (layer, purpose, refresh_note, commentary) on public.meta_flow_nodes to authenticated;

-- 3. Commentary edits go into the history too, so the page shows ONE timeline:
--    what the database did, and what people said about it.
create or replace function public.meta_flow_note_commentary()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
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
end $$;
drop trigger if exists meta_flow_commentary_history on public.meta_flow_nodes;
create trigger meta_flow_commentary_history after update on public.meta_flow_nodes
  for each row execute function public.meta_flow_note_commentary();
