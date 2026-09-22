-- The Model XI page failed for visitors with "permission denied for table
-- fpl_gameweeks". get_model_xi_history runs with the CALLER's rights and
-- reads that table, which had neither a grant nor a policy -- deny-all for
-- anon -- while every other table it touches (fixtures, fpl_players,
-- fpl_player_projections, fpl_player_gameweeks) is public.
--
-- I tested the function as the owner, which is exactly the blind spot the
-- public-read audit exists for. Note the audit wouldn't have listed this
-- table either: it looks for a GRANT without a policy, and here both were
-- missing.
--
-- The content is FPL's own published schedule -- gameweek names, deadlines,
-- finished flags -- so public read is right.
grant select on public.fpl_gameweeks to anon, authenticated;
do $$ begin
  create policy fpl_gameweeks_public_read on public.fpl_gameweeks for select using (true);
exception when duplicate_object then null; end $$;
