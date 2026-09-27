-- ============================================================================
-- LEAGUE SEASON FORMATS: describe the post-split groups by size and games.
--
-- The first design (20260927170000) found groups from who met whom after the
-- split and spotted play-off ties with a common-opponent test. Checked
-- against the official tables it failed where play-off ties are numerous
-- (Finland 2024: Gnistan's ties against championship-group clubs pulled it
-- into that group; Denmark 2017/18 and 2018/19: two-leg ties between the two
-- qualification groups look like group games). It is replaced by two
-- explicit arrays, one entry per group in table order:
--   group_sizes  clubs per group, taken in regular-season order
--                (Denmark 2016/17-2019/20: {6,8}, the two parallel
--                qualification groups of four form one block)
--   group_games  post-split games each club plays in that group
-- league_standings places each club in the block its regular-season rank
-- gives, then moves it to the block most of its group-phase opponents are
-- in (so a tie-break at the cut that the view resolves differently from the
-- league cannot put a club in the wrong group). A club's post-split games
-- beyond its group's group_games, and any post-split game between clubs of
-- different groups, are play-off ties and are left out of the table.
-- knockout_ties and merge_lower_groups are no longer needed.
-- ============================================================================

alter table public.league_season_formats
  drop constraint league_season_formats_split_fields,
  add column group_sizes smallint[],
  add column group_games smallint[];

with l(code, league_id) as (select code, league_id from public.leagues),
s(start_year, season_id) as (select start_year, season_id from public.seasons),
v(code, y0, y1, group_sizes, group_games) as (values
  ('AUT', 2018, 2025, '{6,6}'::smallint[],   '{10,10}'::smallint[]),
  ('B1',  2023, 2025, '{6,6,4}',  '{10,10,6}'),
  ('DNK', 2016, 2019, '{6,8}',    '{10,6}'),
  ('DNK', 2020, 2025, '{6,6}',    '{10,10}'),
  ('FIN', 2019, 2024, '{6,6}',    '{5,5}'),
  ('FIN', 2025, 2025, '{6,6}',    '{10,5}'),
  ('FIN', 2026, 2026, '{6,6}',    '{5,5}'),
  ('G1',  2019, 2023, '{6,8}',    '{10,7}'),
  ('G1',  2024, 2025, '{4,4,6}',  '{6,6,10}'),
  ('POL', 2016, 2019, '{8,8}',    '{7,7}'),
  ('ROU', 2016, 2019, '{6,8}',    '{10,14}'),
  ('ROU', 2020, 2025, '{6,10}',   '{10,9}'),
  ('SC0', 2016, 2025, '{6,6}',    '{5,5}'),
  ('SWZ', 2023, 2025, '{6,6}',    '{5,5}')
)
update public.league_season_formats f
set group_sizes = v.group_sizes, group_games = v.group_games
from v join l using (code) join s on s.start_year between v.y0 and v.y1
where f.league_id = l.league_id and f.season_id = s.season_id and f.format = 'split';

do $$
begin
  if exists (select 1 from public.league_season_formats where format = 'split' and (group_sizes is null or group_games is null)) then
    raise exception 'split row without group_sizes / group_games';
  end if;
  if exists (select 1 from public.league_season_formats where format = 'split'
             and (cardinality(group_sizes) <> cardinality(group_games)
                  or not (halved_groups is null or halved_groups <@ (select array_agg(i::smallint) from generate_series(1, cardinality(group_sizes)) i)))) then
    raise exception 'group arrays inconsistent';
  end if;
end $$;

alter table public.league_season_formats
  drop column knockout_ties,
  drop column merge_lower_groups,
  add constraint league_season_formats_split_fields check (
    case when format = 'split'
      then regular_meetings is not null and group_sizes is not null and group_games is not null
           and cardinality(group_sizes) = cardinality(group_games)
      else regular_meetings is null and halved_groups is null and group_sizes is null and group_games is null
    end);

comment on column public.league_season_formats.regular_meetings is 'Times each pair of clubs meets before the split (2 = double round robin, 3 = 33 rounds of 12 clubs); later meetings are post-split games.';
comment on column public.league_season_formats.group_sizes is 'Clubs per post-split group in table order, taken from the regular-season order (e.g. {6,6}).';
comment on column public.league_season_formats.group_games is 'Post-split games per club in each group; a club''s later post-split games are play-off ties and are left out of the table.';
comment on column public.league_season_formats.halved_groups is 'Groups (1 = top) that carry half their regular-season points into the post-split phase.';
comment on column public.league_season_formats.halving_rounding is 'up or down: how halved points are rounded; ties are broken on the unrounded total.';
comment on column public.league_season_formats.curtailed_on_ppg is 'Overrides the automatic curtailed test (fewer games than a double round robin): true ranks the season on points per game.';
