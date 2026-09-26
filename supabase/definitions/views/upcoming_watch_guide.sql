-- Live definition exported from the database (view upcoming_watch_guide).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.upcoming_watch_guide with (security_invoker=true) as
 SELECT fb.broadcast_id,
    fb.market,
    fb.status,
    fb.broadcaster,
    fb.channel,
    fb.streaming_service,
    fb.service_product,
    fb.access_type,
    fb.delivery_methods,
    fb.platform_device,
    fb.is_live,
    fb.uk_available,
    fb.is_fast,
    fb.is_free_to_air,
    fb.is_subscription,
    fb.is_ppv,
    fb.watch_url,
    fb.confidence,
    fb.availability_notes,
    fb.source,
    fb.source_url,
    fb.verified_at,
    f.fixture_id,
    f.slug,
    f.kickoff_date,
    f.kickoff_time,
    f.league_id,
    l.code AS league_code,
    l.name AS league_name,
    co.name AS country_name,
    ht.team_id AS home_team_id,
    ht.display_name AS home_team_name,
    at.team_id AS away_team_id,
    at.display_name AS away_team_name,
    f.predicted_home_goals,
    f.predicted_away_goals,
    hc.name AS home_team_country,
    ac.name AS away_team_country,
    l.competition_type,
    l.tier AS league_tier
   FROM (((((((fixture_broadcasts fb
     JOIN fixtures f ON ((f.fixture_id = fb.fixture_id)))
     JOIN leagues l ON ((l.league_id = f.league_id)))
     JOIN countries co ON ((co.country_id = l.country_id)))
     JOIN teams ht ON ((ht.team_id = f.home_team_id)))
     JOIN teams at ON ((at.team_id = f.away_team_id)))
     LEFT JOIN countries hc ON ((hc.country_id = ht.country_id)))
     LEFT JOIN countries ac ON ((ac.country_id = at.country_id)))
  WHERE ((f.kickoff_date >= CURRENT_DATE) AND ((fb.status = 'confirmed_not_televised'::text) OR COALESCE(fb.uk_available, true)))
  ORDER BY f.kickoff_date, f.kickoff_time;
