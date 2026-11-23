-- Live definition exported from the database (view fpl_insider_signals).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_insider_signals with (security_invoker=true) as
 WITH acc AS (
         SELECT fpl_insider_accounts.entry_id,
            fpl_insider_accounts.entry_name,
            fpl_insider_accounts.person_name,
            fpl_insider_accounts.fpl_player_id,
            fpl_insider_accounts.team_id,
            fpl_insider_accounts.role,
            fpl_insider_accounts.source_url,
            fpl_insider_accounts.status,
            fpl_insider_accounts.notes,
            fpl_insider_accounts.transfers_fetched_at,
            fpl_insider_accounts.added_at,
            fpl_insider_accounts.reviewed_at
           FROM fpl_insider_accounts
          WHERE (fpl_insider_accounts.status = 'approved'::text)
        ), mates AS (
         SELECT a_1.entry_id,
            p.fpl_player_id,
            p.web_name,
            (p.fpl_player_id = a_1.fpl_player_id) AS is_self
           FROM (acc a_1
             JOIN fpl_players p ON (((p.season_id = 13) AND (p.canonical_team_id = a_1.team_id))))
        ), xi AS (
         SELECT g_1.entry_id,
            g_1.gw,
            ((x.value ->> 'element'::text))::integer AS pid,
            ((x.value ->> 'position'::text))::integer AS pos,
            COALESCE(((x.value ->> 'is_captain'::text))::boolean, false) AS cap
           FROM fpl_insider_gw g_1,
            LATERAL jsonb_array_elements(g_1.picks) x(value)
          WHERE (g_1.http_status = 200)
        ), moves AS (
         SELECT t.entry_id,
            t.gw,
            t.element_out AS pid,
            'sold'::text AS move,
            t.transfer_time AS at_time
           FROM fpl_insider_transfers t
        UNION ALL
         SELECT t.entry_id,
            t.gw,
            t.element_in,
            'bought'::text,
            t.transfer_time
           FROM fpl_insider_transfers t
        UNION ALL
         SELECT c.entry_id,
            c.gw,
            c.pid,
            'benched'::text,
            NULL::timestamp with time zone
           FROM (xi c
             JOIN xi p ON (((p.entry_id = c.entry_id) AND (p.gw = (c.gw - 1)) AND (p.pid = c.pid))))
          WHERE ((c.pos > 11) AND (p.pos <= 11))
        UNION ALL
         SELECT c.entry_id,
            c.gw,
            c.pid,
            'captained'::text,
            NULL::timestamp with time zone
           FROM xi c
          WHERE c.cap
        ), res AS (
         SELECT fpl_player_gameweeks.fpl_player_id,
            fpl_player_gameweeks.fpl_event_id AS gw,
            sum(fpl_player_gameweeks.minutes) AS minutes,
            sum(COALESCE((((fpl_player_gameweeks.source_payload -> 'stats'::text) ->> 'starts'::text))::integer, 0)) AS starts
           FROM fpl_player_gameweeks
          WHERE (fpl_player_gameweeks.season_id = 13)
          GROUP BY fpl_player_gameweeks.fpl_player_id, fpl_player_gameweeks.fpl_event_id
        )
 SELECT m.entry_id,
    a.person_name,
    a.team_id,
    m.gw,
    m.move,
        CASE
            WHEN mt.is_self THEN (m.move || '_self'::text)
            ELSE (m.move || '_teammate'::text)
        END AS kind,
    m.pid AS subject_fpl_player_id,
    mt.web_name AS subject,
    m.at_time,
        CASE
            WHEN (m.move = ANY (ARRAY['sold'::text, 'benched'::text])) THEN 'not_start'::text
            ELSE 'start'::text
        END AS predicts,
    ((g.status_snapshot -> (m.pid)::text) ->> 'status'::text) AS fpl_status_then,
    gw.finished AS gw_finished,
    r.starts,
    r.minutes,
        CASE
            WHEN (NOT COALESCE(gw.finished, false)) THEN NULL::boolean
            WHEN (m.move = ANY (ARRAY['sold'::text, 'benched'::text])) THEN (COALESCE(r.starts, (0)::bigint) = 0)
            ELSE (COALESCE(r.starts, (0)::bigint) > 0)
        END AS came_true
   FROM (((((moves m
     JOIN acc a ON ((a.entry_id = m.entry_id)))
     JOIN mates mt ON (((mt.entry_id = m.entry_id) AND (mt.fpl_player_id = m.pid))))
     LEFT JOIN fpl_insider_gw g ON (((g.entry_id = m.entry_id) AND (g.gw = m.gw))))
     LEFT JOIN fpl_gameweeks gw ON (((gw.season_id = 13) AND (gw.fpl_event_id = m.gw))))
     LEFT JOIN res r ON (((r.fpl_player_id = m.pid) AND (r.gw = m.gw))))
  WHERE (NOT ((m.move = 'captained'::text) AND (NOT mt.is_self)));
