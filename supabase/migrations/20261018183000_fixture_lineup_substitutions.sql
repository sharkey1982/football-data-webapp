-- Substitutions from Chris's BBC screenshots (18 Oct 2026): "seeing who gets
-- subbed for who can build up useful context as well as the starting XI and
-- formation". Who went off, who came on, and the minute, per fixture.
--
-- fixture_lineup_sub_coverage says whether a side's whole list was visible in
-- the screenshots. Only when complete does "no row" mean "not substituted";
-- otherwise the rows are just the subs that could be seen.
--
-- First rows: the GW7 Saturday subs visible in the screenshots (13), each
-- checked against FPL minutes (the player going off played about the minute
-- shown, the one coming on the rest). Safe to re-run.

create table if not exists public.fixture_lineup_substitutions (
  fixture_id bigint not null references public.fixtures(fixture_id) on delete cascade,
  team_id bigint not null references public.teams(team_id),
  player_off_fpl_id bigint not null,
  player_on_fpl_id bigint not null,
  minute int not null check (minute between 1 and 130),
  name_off text,
  name_on text,
  source_name text not null,
  captured_at timestamptz not null default now(),
  primary key (fixture_id, team_id, player_on_fpl_id, source_name)
);
create index if not exists fixture_lineup_substitutions_off_idx on public.fixture_lineup_substitutions (player_off_fpl_id);

create table if not exists public.fixture_lineup_sub_coverage (
  fixture_id bigint not null references public.fixtures(fixture_id) on delete cascade,
  team_id bigint not null references public.teams(team_id),
  source_name text not null,
  complete boolean not null,
  primary key (fixture_id, team_id, source_name)
);

do $$
declare t text;
begin
  foreach t in array array['fixture_lineup_substitutions', 'fixture_lineup_sub_coverage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_write', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

comment on table public.fixture_lineup_substitutions is 'Substitutions per fixture: who went off, who came on, minute. source bbc_screenshot = read by hand from screenshots an admin supplied. A player coming on can later be replaced too (he then appears as player_off).';
comment on table public.fixture_lineup_sub_coverage is 'Whether a side''s full substitution list was seen for a source. complete=false: the substitution rows are only those visible.';

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
select v.* , 'bbc_screenshot'
  from (values
    (62, 15, 579, 357, 46, 'Araujo', 'Frimpong'),
    (62, 15, 357, 369, 52, 'Frimpong', 'Ngumoha'),
    (62, 15, 368, 375, 32, 'Szoboszlai', 'Nyoni'),
    (62, 23, 86, 620, 77, 'Lewis-Potter', 'Diouf'),
    (62, 23, 85, 90, 71, 'van den Berg', 'Hickey'),
    (64, 20, 28, 560, 75, 'Martinez', 'Penders'),
    (64, 20, 148, 152, 92, 'Hato', 'Palestra'),
    (64, 20, 159, 161, 92, 'Caicedo', 'Lavia'),
    (65, 8, 585, 240, 46, 'Herrington', 'Iroegbunam'),
    (65, 8, 638, 282, 68, 'Norton-Cuffy', 'Giles'),
    (67, 18, 387, 391, 61, 'O''Reilly', 'Gvardiol'),
    (67, 31, 306, 313, 91, 'Greaves', 'Clarke'),
    (68, 10, 611, 34, 77, 'Wan-Bissaka', 'Pau Torres')
  ) as v(fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on)
on conflict do nothing;

-- Saturday's screenshots show only the top of each list.
insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
select l.fixture_id, l.team_id, 'bbc_screenshot', false
  from (select distinct fixture_id, team_id from public.fixture_lineup_positions where fixture_id in (62, 64, 65, 67, 68)) l
on conflict do nothing;
