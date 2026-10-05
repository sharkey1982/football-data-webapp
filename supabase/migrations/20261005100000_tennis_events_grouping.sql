-- ============================================================================
-- Tennis events: better grouping of editions (follows 20261005090000).
--
-- The first grouping (same city, start within 35 days) split 59 tournaments
-- across two or more events: one-off date moves (Indian Wells and Rome in
-- 2020-21, Doha, Montpellier) and city moves (Cincinnati in New York in 2020,
-- Brasil Open, Grand Prix Hassan II, Citi Open). Editions now also join an
-- event with the same tournament name: in the same city at any time of year,
-- or in another city within 60 days. Then rebuilds events and summaries.
-- ============================================================================

create or replace function tennis.rebuild_events() returns void language plpgsql as $$
declare e record; ev bigint; g text; doy int;
begin
  delete from tennis.editions where true;
  delete from tennis.events where true;
  for e in
    select m.tour, m.year, m.tournament_id, t.name,
      mode() within group (order by m.location) location,
      min(m.match_date) start_date, max(m.match_date) end_date,
      min(tennis.level_rank(tennis.level_of(m.tour, m.series, t.name))) level_rank,
      mode() within group (order by case when m.surface = 'Greenset' then 'Hard' else m.surface end) surface,
      count(*) matches
    from tennis.matches m join tennis.tournaments t using (tournament_id)
    group by m.tour, m.year, m.tournament_id, t.name
    order by min(m.match_date), t.name
  loop
    g := case
      when e.level_rank = 2 then 'finals'
      when e.level_rank = 1 then 'slam:' || e.name
      else 'city:' || coalesce((select v.city from tennis.venues v where v.location = e.location), e.location) end;
    doy := extract(doy from e.start_date)::int;
    -- Join an existing event (one edition per year) that is: the same Slam or
    -- Tour Finals; or in the same city with the same tournament name (any week:
    -- Indian Wells and Rome moved in 2020-21) or within 35 days; or has the same
    -- tournament name within 60 days in another city (Cincinnati played in New
    -- York in 2020; Brasil Open, Lalla Meryem, Citi Open moved city).
    select ev2.event_id into ev from tennis.events ev2
    where ev2.tour = e.tour
      and not exists (select 1 from tennis.editions x where x.event_id = ev2.event_id and x.year = e.year)
      and case when g not like 'city:%' then ev2.grp = g
          else (ev2.grp = g and exists (
                  select 1 from tennis.editions x where x.event_id = ev2.event_id
                    and (x.tournament_id = e.tournament_id
                         or least(abs(extract(doy from x.start_date)::int - doy), 365 - abs(extract(doy from x.start_date)::int - doy)) <= 35)))
            or exists (
                  select 1 from tennis.editions x where x.event_id = ev2.event_id and x.tournament_id = e.tournament_id
                    and least(abs(extract(doy from x.start_date)::int - doy), 365 - abs(extract(doy from x.start_date)::int - doy)) <= 60)
          end
    order by (ev2.grp = g) desc,
      exists (select 1 from tennis.editions x where x.event_id = ev2.event_id and x.tournament_id = e.tournament_id) desc,
      ev2.last_year desc nulls last, ev2.event_id
    limit 1;
    if ev is null then
      insert into tennis.events (tour, grp) values (e.tour, g) returning event_id into ev;
    end if;
    insert into tennis.editions (tournament_id, year, event_id, tour, name, location, start_date, end_date, level_rank, surface, matches)
    values (e.tournament_id, e.year, ev, e.tour, e.name, e.location, e.start_date, e.end_date, e.level_rank, e.surface, e.matches);
    update tennis.events set last_year = e.year where event_id = ev;
    ev := null;
  end loop;

  update tennis.editions d set
    level = (select l from (values (1,'Grand Slam'),(2,'Finals'),(3,'1000'),(4,'Premier'),(5,'500'),(6,'250')) v(r,l) where v.r = d.level_rank),
    winner_id = f.winner_id, runner_up_id = f.loser_id, final_key = f.source_key
  from (select distinct on (tournament_id, year) tournament_id, year, winner_id, loser_id, source_key
        from tennis.matches where round = 'The Final' and tennis.result_of(status, w_games) <> 'Not played'
        order by tournament_id, year, match_date desc) f
  where f.tournament_id = d.tournament_id and f.year = d.year;
  update tennis.editions d set level = (select l from (values (1,'Grand Slam'),(2,'Finals'),(3,'1000'),(4,'Premier'),(5,'500'),(6,'250')) v(r,l) where v.r = d.level_rank)
  where level is null;

  update tennis.events ev set
    name = case when ev.grp = 'finals' then ev.tour || ' Finals' else l.name end, city = coalesce(v.city, l.location), country = v.country, level = l.level, level_rank = l.level_rank,
    surface = l.surface, first_year = s.y0, last_year = s.y1, editions = s.n
  from (select distinct on (event_id) * from tennis.editions order by event_id, year desc, start_date desc) l
  join (select event_id, min(year) y0, max(year) y1, count(*) n from tennis.editions group by event_id) s using (event_id)
  left join tennis.venues v on v.location = l.location
  where l.event_id = ev.event_id;

  -- Slugs: fixed for the Slams and Tour Finals (they move city), else the city; -2, -3 by first year on clashes.
  update tennis.events ev set slug = x.slug from (
    select event_id, case when n = 1 then base else base || '-' || n end slug from (
      select event_id, base, row_number() over (partition by tour, base order by first_year, event_id) n from (
        select event_id, tour, first_year,
          case when grp = 'finals' then lower(tour) || '-finals'
               when grp like 'slam:%' then tennis.slugify_city(substr(grp, 6))
               else tennis.slugify_city(city) end base
        from tennis.events) b) c) x
  where x.event_id = ev.event_id;
end $$;


select public.tennis_refresh();
