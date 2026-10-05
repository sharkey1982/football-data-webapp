-- The calendar's next date: count whole years from the last edition's END
-- date, not its start, so an event still in its usual fortnight (Shanghai in
-- early October) stays this year instead of jumping to next (5 Oct 2026).
create or replace view public.tennis_calendar with (security_invoker = true) as
with latest as (select tour, max(year) y from tennis.editions group by tour),
last_ed as (
  select distinct on (d.event_id) d.event_id, d.start_date, d.end_date, d.year,
    w.name last_winner, w.slug last_winner_slug
  from tennis.editions d left join tennis.players w on w.player_id = d.winner_id
  order by d.event_id, d.year desc, d.start_date desc
), nxt as (
  select l.*, (l.start_date + 364 * greatest(1, ceil((current_date - l.end_date)::numeric / 364))::int) next_start
  from last_ed l
)
select ev.event_id, ev.tour, ev.slug, ev.name, ev.city, ev.country, ev.level, ev.level_rank, ev.surface,
  n.next_start usual_start, n.next_start + (n.end_date - n.start_date) usual_end,
  n.year last_year, n.last_winner, n.last_winner_slug,
  b.channel, b.free_to_air
from tennis.events ev
join nxt n using (event_id)
join latest lt on lt.tour = ev.tour
left join lateral (
  select b.channel, b.free_to_air from tennis.broadcasters b
  where (b.tour is null or b.tour = ev.tour)
    and (b.event_slug = ev.slug or (b.event_slug is null and (b.levels is null or ev.level = any(b.levels))))
    and extract(year from n.next_start) between b.from_year and coalesce(b.to_year, 9999)
  order by (b.event_slug is not null) desc, b.from_year desc
  limit 1
) b on true
where ev.last_year >= lt.y - 1;
