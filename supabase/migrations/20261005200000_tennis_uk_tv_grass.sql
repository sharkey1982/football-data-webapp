-- Tennis UK TV, corrected 5 Oct 2026 (Chris: "the TV guide doesn't seem
-- correct"). Checked against Sky's announcement and the UK sports
-- broadcasting contracts list:
--   * ATP and WTA tours (incl. 1000s and both Finals): Sky Sports, shown on
--     the dedicated Sky Sports Tennis channel (to 2028/29) -- name it so.
--   * The LTA's British grass events are on the BBC, not Sky: Queen's Club,
--     Eastbourne and Nottingham (to 2027).
-- Event-specific rows win over the tour-level rows in public.tennis_calendar.

update tennis.broadcasters set channel = 'Sky Sports Tennis', checked_on = '2026-10-05'
where event_slug is null and channel = 'Sky Sports';

insert into tennis.broadcasters (tour, event_slug, levels, channel, free_to_air, from_year, to_year, source_url, checked_on)
select null, s, null, 'BBC', 'BBC Two and iPlayer', 2024, 2027, 'https://en.wikipedia.org/wiki/Sports_broadcasting_contracts_in_the_United_Kingdom', '2026-10-05'
from unnest(array['london-queen-s-club', 'eastbourne', 'nottingham']) s
where not exists (select 1 from tennis.broadcasters b where b.event_slug = s);
