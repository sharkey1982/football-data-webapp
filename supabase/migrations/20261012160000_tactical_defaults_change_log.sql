-- History of pecking-order edits (12 Oct 2026). Chris found Enzo Fernandez
-- ranked 3rd in central midfield at Man City with no record of how: the
-- rank had been saved from the admin page (depth_rank_source 'manual') but
-- team_player_tactical_defaults keeps only the current value. From now on
-- every change to a player's role or rank is logged with who made it and
-- when; migrations and pipelines show as no user.
-- Safe to re-run.

create table if not exists public.team_player_tactical_defaults_log (
  id bigserial primary key,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  season_id bigint not null,
  team_id bigint not null,
  fpl_player_id bigint not null,
  old_role text,
  new_role text,
  old_rank integer,
  new_rank integer,
  old_source text,
  new_source text,
  new_rank_source text
);
create index if not exists team_player_tactical_defaults_log_player on public.team_player_tactical_defaults_log (fpl_player_id, changed_at desc);
alter table public.team_player_tactical_defaults_log enable row level security;
drop policy if exists team_player_tactical_defaults_log_admin_read on public.team_player_tactical_defaults_log;
create policy team_player_tactical_defaults_log_admin_read on public.team_player_tactical_defaults_log for select to authenticated using (public.is_admin());
grant select on public.team_player_tactical_defaults_log to authenticated;
grant all on public.team_player_tactical_defaults_log to service_role;
comment on table public.team_player_tactical_defaults_log is 'Every change to a player''s tactical role or depth rank (pecking order), with the signed-in user if made from the site. Written by trigger.';

create or replace function public.log_tactical_defaults_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT'
     or new.tactical_role is distinct from old.tactical_role
     or new.depth_rank is distinct from old.depth_rank then
    insert into public.team_player_tactical_defaults_log
      (changed_by, season_id, team_id, fpl_player_id, old_role, new_role, old_rank, new_rank, old_source, new_source, new_rank_source)
    values (auth.uid(), new.season_id, new.team_id, new.fpl_player_id,
            case when tg_op = 'UPDATE' then old.tactical_role end, new.tactical_role,
            case when tg_op = 'UPDATE' then old.depth_rank end, new.depth_rank,
            case when tg_op = 'UPDATE' then old.source_name end, new.source_name, new.depth_rank_source);
  end if;
  return new;
end $$;

drop trigger if exists team_player_tactical_defaults_log_trg on public.team_player_tactical_defaults;
create trigger team_player_tactical_defaults_log_trg
  after insert or update on public.team_player_tactical_defaults
  for each row execute function public.log_tactical_defaults_change();
