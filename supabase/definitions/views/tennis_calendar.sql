-- Live definition exported from the database (view tennis_calendar).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.tennis_calendar with (security_invoker=true) as
 WITH latest AS (
         SELECT editions.tour,
            max(editions.year) AS y
           FROM tennis.editions
          GROUP BY editions.tour
        ), last_ed AS (
         SELECT DISTINCT ON (d.event_id) d.event_id,
            d.start_date,
            d.end_date,
            d.year,
            w.name AS last_winner,
            w.slug AS last_winner_slug
           FROM (tennis.editions d
             LEFT JOIN tennis.players w ON ((w.player_id = d.winner_id)))
          ORDER BY d.event_id, d.year DESC, d.start_date DESC
        ), nxt AS (
         SELECT l.event_id,
            l.start_date,
            l.end_date,
            l.year,
            l.last_winner,
            l.last_winner_slug,
            (l.start_date + (364 * (GREATEST((1)::numeric, ceil((((CURRENT_DATE - l.end_date))::numeric / (364)::numeric))))::integer)) AS next_start
           FROM last_ed l
        )
 SELECT ev.event_id,
    ev.tour,
    ev.slug,
    ev.name,
    ev.city,
    ev.country,
    ev.level,
    ev.level_rank,
    ev.surface,
    n.next_start AS usual_start,
    (n.next_start + (n.end_date - n.start_date)) AS usual_end,
    n.year AS last_year,
    n.last_winner,
    n.last_winner_slug,
    b.channel,
    b.free_to_air
   FROM (((tennis.events ev
     JOIN nxt n USING (event_id))
     JOIN latest lt ON ((lt.tour = ev.tour)))
     LEFT JOIN LATERAL ( SELECT b_1.channel,
            b_1.free_to_air
           FROM tennis.broadcasters b_1
          WHERE (((b_1.tour IS NULL) OR (b_1.tour = ev.tour)) AND ((b_1.event_slug = ev.slug) OR ((b_1.event_slug IS NULL) AND ((b_1.levels IS NULL) OR (ev.level = ANY (b_1.levels))))) AND ((EXTRACT(year FROM n.next_start) >= (b_1.from_year)::numeric) AND (EXTRACT(year FROM n.next_start) <= (COALESCE(b_1.to_year, 9999))::numeric)))
          ORDER BY (b_1.event_slug IS NOT NULL) DESC, b_1.from_year DESC
         LIMIT 1) b ON (true))
  WHERE (ev.last_year >= (lt.y - 1));
