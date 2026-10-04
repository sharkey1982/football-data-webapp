-- ============================================================================
-- Reviewed exceptions to the club-ground postcode check.
--
-- Solihull Moors (Damson Park): the first postcodes.io run put its postcode,
-- B91 2PP, 1.9 km from our coordinates. The coordinates are right (52.4389,
-- -1.7572; independently thegreatbritainguide.com/place/damson-park); B91 2PP
-- is a long Damson Parkway postcode whose centroid sits down the road.
-- A ground with a written reason is exempt from the 1.5 km rule; everything
-- else stays checked.
-- ============================================================================

alter table public.club_grounds add column postcode_far_reason text;

update public.club_grounds
set postcode_far_reason = 'B91 2PP covers a long stretch of Damson Parkway; its centroid is 1.9 km from the ground. Coordinates confirmed independently (thegreatbritainguide.com/place/damson-park), 4 Oct 2026.',
    updated_at = now()
where team_id = 124;

create or replace function public.check_club_grounds()
returns table(check_name text, status text, found bigint, detail text)
language sql stable security definer set search_path = '' as $$
  select 'club_grounds_complete', case when n = 0 then 'ok' else 'failed' end, n,
    'Clubs playing in the top five English divisions since 1 July with no row in club_grounds'
  from (select count(distinct t.team_id) n
        from public.matches m
        join public.leagues l on l.league_id = m.league_id and l.code in ('E0', 'E1', 'E2', 'E3', 'EC')
        join public.teams t on t.team_id in (m.home_team_id, m.away_team_id)
        where m.match_date >= make_date(extract(year from now() - interval '6 months')::int, 7, 1)
          and not exists (select 1 from public.club_grounds g where g.team_id = t.team_id)) x
  union all
  select 'club_grounds_postcode_checked', case when n = 0 then 'ok' else 'warning' end, n,
    'Club grounds whose postcode has not been looked up (run the club-grounds-verify workflow)'
  from (select count(*) n from public.club_grounds where postcode_checked_at is null) x
  union all
  select 'club_grounds_near_postcode', case when n = 0 then 'ok' else 'failed' end, n,
    'Club grounds more than 1.5 km from their own postcode, or whose postcode does not exist (reviewed exceptions excluded)'
  from (select count(*) n from public.club_grounds
        where postcode_checked_at is not null and postcode_far_reason is null
          and (postcode_distance_m is null or postcode_distance_m > 1500)) x
$$;

revoke all on function public.check_club_grounds() from public, anon, authenticated;
grant execute on function public.check_club_grounds() to service_role;
