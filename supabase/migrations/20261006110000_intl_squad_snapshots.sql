-- ============================================================================
-- International squad watch (6 Oct 2026).
--
-- Chris asked for the FPL Minutes Outlook idea on the international side.
-- There's no free source of international line-ups or minutes, so this tracks
-- selection instead: who is in each squad, who drops out and why, and -- from
-- caps going up between snapshots -- who actually played.
--
-- intl.squad_versions          one row per nation each time its squad changes
--                              (players, caps, goals or status): date, the
--                              squad's intro ("named for the matches against
--                              ...") and a signature of the content
-- intl.squad_snapshot_players  the players of each version, current squad and
--                              recent call-ups, with caps, goals and status
--
-- public.intl_snapshot_squads() compares every nation's stored squad
-- (intl.squad_players) with its latest version and saves a new version only
-- when something changed, so the history grows by a few versions per nation
-- per international window rather than one per day. The squads job calls it
-- after each load.
-- ============================================================================

create table intl.squad_versions (
  team text not null references intl.teams(team) on delete cascade,
  version_at date not null,
  signature text not null,                  -- md5 of the squad content
  intro text,
  intro_signature text,                     -- md5 of the intro: changes when a new squad is named
  players int not null,
  primary key (team, version_at)
);

create table intl.squad_snapshot_players (
  team text not null,
  version_at date not null,
  list text not null check (list in ('current', 'recent')),
  player_key text not null,                 -- Wikipedia title, else the name
  player text not null,
  wiki_title text,
  position text,
  number int,
  caps int,
  goals int,
  club text,
  club_slug text,
  status text,
  latest_date date,
  latest_text text,
  primary key (team, version_at, list, player_key),
  foreign key (team, version_at) references intl.squad_versions(team, version_at) on delete cascade
);

alter table intl.squad_versions enable row level security;
alter table intl.squad_snapshot_players enable row level security;
create policy "public read" on intl.squad_versions for select to anon, authenticated using (true);
create policy "public read" on intl.squad_snapshot_players for select to anon, authenticated using (true);
grant select on intl.squad_versions, intl.squad_snapshot_players to anon, authenticated;
grant all on intl.squad_versions, intl.squad_snapshot_players to service_role;

create or replace function public.intl_snapshot_squads(p_date date default current_date)
returns int language plpgsql security definer set search_path = '' as $$
declare v_changed int;
begin
  with cur as (
    select s.team, s.intro, md5(coalesce(s.intro, '')) intro_sig,
           md5(string_agg(p.list || '|' || coalesce(p.wiki_title, p.player) || '|' || coalesce(p.caps, -1) || '|' ||
                          coalesce(p.goals, -1) || '|' || coalesce(p.status, ''), ';'
                          order by p.list, coalesce(p.wiki_title, p.player))) sig,
           count(*) filter (where p.list = 'current') n_players
    from intl.squads s join intl.squad_players p on p.team = s.team
    group by s.team, s.intro
  ),
  latest as (
    select distinct on (team) team, signature from intl.squad_versions order by team, version_at desc
  ),
  changed as (
    select c.* from cur c left join latest l on l.team = c.team
    where l.signature is distinct from c.sig
  ),
  ins as (
    insert into intl.squad_versions (team, version_at, signature, intro, intro_signature, players)
    select team, p_date, sig, intro, intro_sig, n_players from changed
    on conflict (team, version_at) do update
      set signature = excluded.signature, intro = excluded.intro, intro_signature = excluded.intro_signature,
          players = excluded.players
    returning team
  )
  select count(*) into v_changed from ins;

  -- The players of every version saved today (replaced if the job runs twice in a day).
  delete from intl.squad_snapshot_players sp
  where sp.version_at = p_date
    and exists (select 1 from intl.squad_versions v where v.team = sp.team and v.version_at = p_date);
  insert into intl.squad_snapshot_players (team, version_at, list, player_key, player, wiki_title, position, number,
                                           caps, goals, club, club_slug, status, latest_date, latest_text)
  select p.team, p_date, p.list, coalesce(p.wiki_title, p.player), min(p.player), min(p.wiki_title), min(p.position),
         min(p.number), max(p.caps), max(p.goals), min(p.club), min(p.club_slug), min(p.status), max(p.latest_date),
         min(p.latest_text)
  from intl.squad_players p
  join intl.squad_versions v on v.team = p.team and v.version_at = p_date
  group by p.team, p.list, coalesce(p.wiki_title, p.player)
  on conflict do nothing;
  return v_changed;
end $$;

revoke all on function public.intl_snapshot_squads(date) from public, anon, authenticated;
grant execute on function public.intl_snapshot_squads(date) to service_role;

create view public.intl_squad_versions with (security_invoker = true) as
select v.team, t.slug, v.version_at, v.intro, v.intro_signature, v.players
from intl.squad_versions v join intl.teams t on t.team = v.team;

create view public.intl_squad_snapshot_players with (security_invoker = true) as
select p.team, t.slug, p.version_at, p.list, p.player_key, p.player, p.wiki_title, p.position, p.number, p.caps, p.goals,
       p.club, p.club_slug, p.status, p.latest_date, p.latest_text
from intl.squad_snapshot_players p join intl.teams t on t.team = p.team;

grant select on public.intl_squad_versions, public.intl_squad_snapshot_players to anon, authenticated;

-- First snapshot from the squads already stored.
select public.intl_snapshot_squads(current_date);
