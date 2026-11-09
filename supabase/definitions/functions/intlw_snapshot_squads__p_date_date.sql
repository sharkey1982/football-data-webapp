-- Live definition exported from the database (function intlw_snapshot_squads(p_date date)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.intlw_snapshot_squads(p_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_changed int;
begin
  with cur as (
    select s.team, s.intro, md5(coalesce(s.intro, '')) intro_sig,
           md5(string_agg(p.list || '|' || coalesce(p.wiki_title, p.player) || '|' || coalesce(p.caps, -1) || '|' ||
                          coalesce(p.goals, -1) || '|' || coalesce(p.status, ''), ';'
                          order by p.list, coalesce(p.wiki_title, p.player))) sig,
           count(*) filter (where p.list = 'current') n_players
    from intlw.squads s join intlw.squad_players p on p.team = s.team
    group by s.team, s.intro
  ),
  latest as (
    select distinct on (team) team, signature from intlw.squad_versions order by team, version_at desc
  ),
  changed as (
    select c.* from cur c left join latest l on l.team = c.team
    where l.signature is distinct from c.sig
  ),
  ins as (
    insert into intlw.squad_versions (team, version_at, signature, intro, intro_signature, players)
    select team, p_date, sig, intro, intro_sig, n_players from changed
    on conflict (team, version_at) do update
      set signature = excluded.signature, intro = excluded.intro, intro_signature = excluded.intro_signature,
          players = excluded.players
    returning team
  )
  select count(*) into v_changed from ins;

  -- The players of every version saved today (replaced if the job runs twice in a day).
  delete from intlw.squad_snapshot_players sp
  where sp.version_at = p_date
    and exists (select 1 from intlw.squad_versions v where v.team = sp.team and v.version_at = p_date);
  insert into intlw.squad_snapshot_players (team, version_at, list, player_key, player, wiki_title, position, number,
                                           caps, goals, club, club_slug, status, latest_date, latest_text)
  select p.team, p_date, p.list, coalesce(p.wiki_title, p.player), min(p.player), min(p.wiki_title), min(p.position),
         min(p.number), max(p.caps), max(p.goals), min(p.club), min(p.club_slug), min(p.status), max(p.latest_date),
         min(p.latest_text)
  from intlw.squad_players p
  join intlw.squad_versions v on v.team = p.team and v.version_at = p_date
  group by p.team, p.list, coalesce(p.wiki_title, p.player)
  on conflict do nothing;
  return v_changed;
end $function$
;
