-- ============================================================================
-- Comparison pages: division names by era, and League Insights cards only
-- from seasons with card data
--
-- 1. get_country_league_summary() (Country Insights): league_name is now the
--    division's name in that season (league_name_for_season), not today's.
--    No visible change for the current data (only England's Premier League
--    is a top flight with era rows, and it has one name), but the rows are
--    per season, so they should carry that season's name.
--
-- 2. get_cross_league_summary() (League Insights):
--    - league_name per season via league_name_for_season(), e.g. "First
--      Division" for E1 before 2004/05, "Conference National" for EC
--      2004/05-2014/15. The page shows today's name with the earlier names
--      and their seasons underneath.
--    - Bug: yellows/reds per game averaged every match, but cards are NOT
--      NULL and stored as 0 when the source has none (England before
--      2000/01, National League 2004/05). Pooled over every season the page
--      showed 2.46 yellows a game for the Premier League against 3.27 over
--      the seasons with card data. A division-season in which no match has
--      a card now returns null for both measures. (home_shots, the marker
--      get_country_league_summary() uses, does not work here: the National
--      League has cards but no shots from 2016/17 to 2025/26.) Seasons with
--      some stat-less rows are rare: 2002/03 Second Division 2 and Third Division 4,
--      2018/19 Championship 1 (of 552 each) still count as 0 cards.
--
-- 3. get_market_efficiency() (Market Efficiency): pooled over every season
--    with odds, so league_name is now the division's name(s) across those
--    seasons, oldest first, joined by " / " (e.g. "First Division /
--    Championship" if the odds ever reach back before 2004/05). The 'Avg'
--    closing odds start in 2019/20, so today every name is unchanged.
--
-- Anchored replacements on the live bodies; each anchor must match the
-- stated number of times. Re-running is a no-op (checked per function).
-- ============================================================================

do $$
declare
  f record;
  a record;
  def text;
  n int;
begin
  for f in
    select * from (values
      ('public.get_country_league_summary()', 'league_name_for_season'),
      ('public.get_cross_league_summary()', 'league_name_for_season'),
      ('public.get_market_efficiency(text, boolean)', 'league_name_for_season')
    ) v(sig, marker)
  loop
    def := pg_get_functiondef(f.sig::regprocedure);
    if position(f.marker in def) > 0 then
      raise notice '% already applied', f.sig;
      continue;
    end if;

    for a in
      select * from (values
        -- get_country_league_summary()
        ('public.get_country_league_summary()',
         $x$select c.country_id, c.name, l.code, l.name, s.label,$x$,
         $x$select c.country_id, c.name, l.code, public.league_name_for_season(l.league_id, s.season_id), s.label,$x$, 1),
        ('public.get_country_league_summary()',
         $x$group by c.country_id, c.name, l.code, l.name, s.label$x$,
         $x$group by c.country_id, c.name, l.code, l.league_id, s.season_id, s.label$x$, 1),
        -- get_cross_league_summary()
        ('public.get_cross_league_summary()',
         $x$select l.code, l.name, s.label,$x$,
         $x$select l.code, public.league_name_for_season(l.league_id, s.season_id), s.label,$x$, 1),
        ('public.get_cross_league_summary()',
         $x$round(avg(m.home_yellow_cards + m.away_yellow_cards)::numeric, 2),$x$,
         $x$-- Cards are stored as 0 where the source has none: a division-season
    -- without a single card has no card data and returns null.
    round((case when max(m.home_yellow_cards + m.away_yellow_cards + m.home_red_cards + m.away_red_cards) > 0
      then avg(m.home_yellow_cards + m.away_yellow_cards) end)::numeric, 2),$x$, 1),
        ('public.get_cross_league_summary()',
         $x$round(avg(m.home_red_cards + m.away_red_cards)::numeric, 3),$x$,
         $x$round((case when max(m.home_yellow_cards + m.away_yellow_cards + m.home_red_cards + m.away_red_cards) > 0
      then avg(m.home_red_cards + m.away_red_cards) end)::numeric, 3),$x$, 1),
        ('public.get_cross_league_summary()',
         $x$group by l.code, l.name, s.label$x$,
         $x$group by l.code, l.league_id, s.season_id, s.label$x$, 1),
        -- get_market_efficiency(text, boolean)
        ('public.get_market_efficiency(text, boolean)',
         $x$select l.code, l.name, o.market,$x$,
         $x$select l.code, l.name, o.market, m.league_id, m.season_id,$x$, 1),
        ('public.get_market_efficiency(text, boolean)',
         $x$select code, name, market, count(*)::bigint,$x$,
         $x$select code,
    -- The division's name(s) over the seasons pooled here, oldest first.
    (select string_agg(e.era_name, ' / ' order by e.first_year)
       from (select public.league_name_for_season(x.league_id, x.season_id) era_name, min(s.start_year) first_year
               from (select distinct t2.league_id, t2.season_id from tagged t2 where t2.code = tagged.code) x
               join public.seasons s on s.season_id = x.season_id
              group by 1) e),
    market, count(*)::bigint,$x$, 1)
      ) v(sig, anchor, repl, expected)
      where v.sig = f.sig
    loop
      n := (length(def) - length(replace(def, a.anchor, ''))) / length(a.anchor);
      if n <> a.expected then
        raise exception '%: anchor matched % times, expected %: %', f.sig, n, a.expected, a.anchor;
      end if;
      def := replace(def, a.anchor, a.repl);
    end loop;
    execute def;
  end loop;
end $$;
