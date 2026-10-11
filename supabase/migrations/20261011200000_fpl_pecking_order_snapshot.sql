-- Frozen copy of every club's pecking order (11 Oct 2026), for the
-- registered deep-backup backtest (scripts/backtest_depth_deep_backup.py).
-- The live pecking order changes as line-ups come in (screenshots, admin
-- edits), so scoring later gameweeks against it would let those line-ups
-- leak into the inputs. GW7 and GW8 are scored against this copy, taken
-- after the GW6 screenshot updates and before the GW7 deadline.
-- Safe to re-run.

create table if not exists public.fpl_pecking_order_snapshots (
  label text not null,
  season_id bigint not null,
  team_id bigint not null,
  fpl_player_id bigint not null,
  tactical_role text,
  depth_rank integer,
  taken_at timestamptz not null default now(),
  primary key (label, team_id, fpl_player_id)
);
alter table public.fpl_pecking_order_snapshots enable row level security;
drop policy if exists fpl_pecking_order_snapshots_admin_read on public.fpl_pecking_order_snapshots;
create policy fpl_pecking_order_snapshots_admin_read on public.fpl_pecking_order_snapshots for select to authenticated using (public.is_admin());
grant select on public.fpl_pecking_order_snapshots to authenticated;
grant all on public.fpl_pecking_order_snapshots to service_role;
comment on table public.fpl_pecking_order_snapshots is 'Frozen copies of team_player_tactical_defaults (role and rank) for backtests scored on later gameweeks. Label names the experiment.';

insert into public.fpl_pecking_order_snapshots (label, season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select 'depth_deep_backup_gw7', d.season_id, d.team_id, d.fpl_player_id, d.tactical_role, d.depth_rank
  from public.team_player_tactical_defaults d
 where d.season_id = public.fpl_current_season_id()
on conflict do nothing;
