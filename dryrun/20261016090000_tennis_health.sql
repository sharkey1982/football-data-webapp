-- ============================================================================
-- Tennis data health (16 Oct 2026).
--
-- 1. tennis.source_anomalies: the 67 completed matches whose set counts and
--    set scores disagree were each checked on 16 Oct. All are errors in
--    tennis-data.co.uk's own rows (validation is right; nothing was lost by
--    the importer), in five kinds:
--      set_count_columns_wrong  23  set scores valid, Wsets/Lsets wrong
--      set_scores_incomplete    17  fewer set scores than sets counted
--      games_contradict_winner  15  set scores say the loser won (incl. a
--                                   block of 9 at Madrid 2004)
--      scores_inconsistent       9  set scores and counts disagree otherwise
--      set_scores_missing        3  no set scores at all
--    The stored values are left exactly as the source has them (the importer
--    would rewrite any hand correction on its next load). tennis_sets_consistent
--    now counts only rows NOT in this list, so a new bad row still warns, and
--    a separate ok-row reports how many reviewed source errors remain.
-- 2. tennis_source_coverage: freshness from the data, not from a job's run
--    log. Days since the latest stored match, per tour, in season
--    (January to November). Warns at 10 days, fails at 17: both tours play
--    every week of the season and the source publishes at least weekly.
-- 3. tennis_refresh_if_stale records real durations (clock_timestamp; it
--    wrote now(), the transaction start, so every run showed 0 seconds), and
--    an index makes its 2-hourly "anything new?" test an index lookup.
-- ============================================================================

create index if not exists matches_imported_at_idx on tennis.matches (imported_at);

create table if not exists tennis.source_anomalies (
  source_key text primary key references tennis.matches (source_key) on delete cascade,
  category text not null check (category in ('set_count_columns_wrong', 'set_scores_incomplete',
    'games_contradict_winner', 'scores_inconsistent', 'set_scores_missing')),
  note text not null,
  reviewed_at timestamptz not null default now()
);
alter table tennis.source_anomalies enable row level security;
revoke all on tennis.source_anomalies from anon, authenticated;
grant select on tennis.source_anomalies to service_role;
comment on table tennis.source_anomalies is
  'Tennis matches whose source row (tennis-data.co.uk) has set counts and set scores that disagree, reviewed by hand. Values are kept as the source has them; check_tennis_integrity only warns on rows not listed here.';

insert into tennis.source_anomalies (source_key, category, note) values
  ('ATP|2004|Madrid Masters|1st Round|Canas G.|Vliegen K.', 'games_contradict_winner', 'source Wsets=2 Lsets=1; set scores W {5,7,1} L {7,5,6}'),
  ('ATP|2004|Madrid Masters|1st Round|Costa A.|Labadze I.', 'games_contradict_winner', 'source Wsets=2 Lsets=1; set scores W {6,5,5} L {2,7,7}'),
  ('ATP|2004|Madrid Masters|1st Round|Fish M.|Ancic M.', 'games_contradict_winner', 'source Wsets=2 Lsets=1; set scores W {0,6,4} L {6,4,6}'),
  ('ATP|2004|Madrid Masters|1st Round|Lopez F.|Karlovic I.', 'games_contradict_winner', 'source Wsets=2 Lsets=1; set scores W {6,6,6} L {4,7,7}'),
  ('ATP|2004|Madrid Masters|2nd Round|Koubek S.|Gonzalez F.', 'games_contradict_winner', 'source Wsets=2 Lsets=1; set scores W {6,3,6} L {1,6,7}'),
  ('ATP|2004|Madrid Masters|2nd Round|Pavel A.|Fish M.', 'games_contradict_winner', 'source Wsets=2 Lsets=1; set scores W {6,3,6} L {1,6,7}'),
  ('ATP|2004|Madrid Masters|2nd Round|Safin M.|Lopez F.', 'games_contradict_winner', 'source Wsets=2 Lsets=1; set scores W {7,6,3} L {5,7,6}'),
  ('ATP|2004|Madrid Masters|3rd Round|Ljubicic I.|Henman T.', 'games_contradict_winner', 'source Wsets=2 Lsets=1; set scores W {6,4,2} L {4,6,6}'),
  ('ATP|2004|Madrid Masters|Quarterfinals|Agassi A.|Robredo T.', 'games_contradict_winner', 'source Wsets=2 Lsets=1; set scores W {6,6,2} L {7,3,6}'),
  ('ATP|2010|French Open|1st Round|Ball C.|Petzschner P.', 'games_contradict_winner', 'source Wsets=3 Lsets=2; set scores W {6,7,2,5,7} L {3,6,6,7,9}'),
  ('ATP|2015|AEGON Open|Semifinals|Istomin D.|Baghdatis M.', 'games_contradict_winner', 'source Wsets=0 Lsets=0; set scores W {1} L {2}'),
  ('ATP|2019|Open de Moselle|The Final|Tsonga J.W.|Bedene A.', 'games_contradict_winner', 'source Wsets=0 Lsets=1; set scores W {6,3} L {7,4}'),
  ('ATP|2026|ABN AMRO World Tennis Tournament|1st Round|Bergs Z.|Medjedovic H.', 'games_contradict_winner', 'source Wsets=2 Lsets=0; set scores W {6,6} L {7,7}'),
  ('WTA|2010|Wimbledon|The Final|Williams S.|Zvonareva V.', 'games_contradict_winner', 'source Wsets=2 Lsets=0; set scores W {3} L {6}'),
  ('WTA|2022|WTA Finals|Round Robin|Sabalenka A.|Pegula J.', 'games_contradict_winner', 'source Wsets=2 Lsets=0; set scores W {3,5} L {6,7}'),
  ('ATP|2001|Kroger St. Jude|2nd Round|Lareau S.|Lapentti N.', 'scores_inconsistent', 'source Wsets=1 Lsets=1; set scores W {4,6} L {6,3}'),
  ('ATP|2010|Open Sud de France|The Final|Monfils G.|Ljubicic I.', 'scores_inconsistent', 'source Wsets=2 Lsets=1; set scores W {6,7,6} L {2,5,1}'),
  ('ATP|2013|Portugal Open|The Final|Wawrinka S.|Ferrer D.', 'scores_inconsistent', 'source Wsets=2 Lsets=0; set scores W {6,6,2} L {1,4,0}'),
  ('ATP|2021|BNP Paribas Masters|The Final|Djokovic N.|Medvedev D.', 'scores_inconsistent', 'source Wsets=2 Lsets=1; set scores W {4,4,6,6} L {5,6,3,3}'),
  ('ATP|2021|Citi Open|The Final|Sinner J.|McDonald M.', 'scores_inconsistent', 'source Wsets=2 Lsets=1; set scores W {7,6,7} L {5,4,5}'),
  ('ATP|2024|Western & Southern Financial Group Masters|The Final|Sinner J.|Tiafoe F.', 'scores_inconsistent', 'source Wsets=2 Lsets=0; set scores W {7,6} L {8,2}'),
  ('WTA|2010|Sony Ericsson Championships|The Final|Clijsters K.|Wozniacki C.', 'scores_inconsistent', 'source Wsets=2 Lsets=1; set scores W {6,7,6} L {3,5,3}'),
  ('WTA|2012|BNP Paribas Open|Semifinals|Sharapova M.|Ivanovic A.', 'scores_inconsistent', 'source Wsets=1 Lsets=0; set scores W {6,0} L {4,1}'),
  ('WTA|2015|Bank of the West Classic|The Final|Kerber A.|Pliskova Ka.', 'scores_inconsistent', 'source Wsets=2 Lsets=1; set scores W {6,7,6} L {3,5,4}'),
  ('ATP|2007|French Open|1st Round|Monaco J.|Fognini F.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=2; set scores W {3,2,6,6,6} L {6,6,1,2,4}'),
  ('ATP|2008|China Open|The Final|Roddick A.|Sela D.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {6,6,6} L {4,7,3}'),
  ('ATP|2010|BA-CA Tennis Trophy|The Final|Melzer J.|Haider-Maurer A.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {6,7,6} L {7,6,4}'),
  ('ATP|2010|Hall of Fame Championships|The Final|Fish M.|Rochus O.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {5,6,6} L {7,3,4}'),
  ('ATP|2013|Claro Open Colombia|The Final|Karlovic I.|Falla A.', 'set_count_columns_wrong', 'source Wsets=0 Lsets=0; set scores W {6,7} L {3,6}'),
  ('ATP|2013|Gerry Weber Open|The Final|Federer R.|Youzhny M.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {6,6,6} L {7,3,4}'),
  ('ATP|2014|Hall of Fame Championships|The Final|Hewitt L.|Karlovic I.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {6,6,7} L {3,7,6}'),
  ('ATP|2015|Open de Moselle|The Final|Tsonga J.W.|Simon G.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {7,1,6} L {6,6,2}'),
  ('ATP|2015|Rio Open|Quarterfinals|Nadal R.|Cuevas P.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {4,7,6} L {6,5,0}'),
  ('ATP|2016|Kremlin Cup|The Final|Carreno Busta P.|Fognini F.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {4,6,6} L {6,3,2}'),
  ('ATP|2016|Rio Open|Semifinals|Cuevas P.|Nadal R.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {6,7,6} L {7,6,4}'),
  ('ATP|2016|Swiss Indoors|The Final|Cilic M.|Nishikori K.', 'set_count_columns_wrong', 'source Wsets=1 Lsets=0; set scores W {6,7} L {1,6}'),
  ('ATP|2017|Open de Moselle|The Final|Gojowczyk P.|Paire B.', 'set_count_columns_wrong', 'source Wsets=1 Lsets=0; set scores W {7,6} L {5,2}'),
  ('ATP|2020|Australian Open|The Final|Djokovic N.|Thiem D.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=1; set scores W {6,4,2,6,6} L {4,6,6,3,4}'),
  ('ATP|2022|European Open|The Final|Musetti L.|Alcaraz C.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {6,6,6} L {4,7,4}'),
  ('ATP|2022|Millennium Estoril Open|The Final|Baez S.|Tiafoe F.', 'set_count_columns_wrong', 'source Wsets=1 Lsets=0; set scores W {6,6} L {3,2}'),
  ('ATP|2024|Atlanta Open|The Final|Nishioka Y.|Thompson J.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {4,7,6} L {6,6,2}'),
  ('ATP|2025|Monte Carlo Masters|The Final|Alcaraz C.|Musetti L.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {3,6,6} L {6,1,0}'),
  ('WTA|2007|East West Bank Classic|Semifinals|Ivanovic A.|Jankovic J.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {4,6,7} L {6,3,5}'),
  ('WTA|2010|Andalucia Tennis Experience|The Final|Pennetta F.|Suarez Navarro C.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {6,4,6} L {2,6,3}'),
  ('WTA|2010|Unicef Open|The Final|Henin J.|Petkovic A.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {3,6,6} L {6,3,4}'),
  ('WTA|2024|Mutua Madrid Open|Semifinals|Sabalenka A.|Rybakina E.', 'set_count_columns_wrong', 'source Wsets=1 Lsets=2; set scores W {1,7,7} L {6,5,6}'),
  ('WTA|2025|Hobart International|The Final|Kessler M.|Mertens E.', 'set_count_columns_wrong', 'source Wsets=2 Lsets=0; set scores W {6,3,6} L {4,6,0}'),
  ('ATP|2007|Australian Open|2nd Round|Davydenko N.|Muller G.', 'set_scores_incomplete', 'source Wsets=3 Lsets=0; set scores W {6,6,0} L {4,0,0}'),
  ('ATP|2007|Hall of Fame Championships|Semifinals|Santoro F.|Moodie W.', 'set_scores_incomplete', 'source Wsets=2 Lsets=1; set scores W {7,6} L {6,3}'),
  ('ATP|2007|Thailand Open|Quarterfinals|Berdych T.|Karlovic I.', 'set_scores_incomplete', 'source Wsets=2 Lsets=0; set scores W {7,0} L {5,0}'),
  ('ATP|2008|Sony Ericsson Open|The Final|Davydenko N.|Nadal R.', 'set_scores_incomplete', 'source Wsets=2 Lsets=1; set scores W {6,6} L {4,2}'),
  ('ATP|2010|AEGON Championships|The Final|Querrey S.|Fish M.', 'set_scores_incomplete', 'source Wsets=2 Lsets=0; set scores W {7} L {5}'),
  ('ATP|2014|Rogers Masters|The Final|Tsonga J.W.|Federer R.', 'set_scores_incomplete', 'source Wsets=2 Lsets=1; set scores W {7,7} L {5,6}'),
  ('ATP|2017|Western & Southern Financial Group Masters|The Final|Dimitrov G.|Kyrgios N.', 'set_scores_incomplete', 'source Wsets=2 Lsets=1; set scores W {6,7} L {3,5}'),
  ('ATP|2025|Miami Open|The Final|Mensik J.|Djokovic N.', 'set_scores_incomplete', 'source Wsets=2 Lsets=1; set scores W {7,7} L {6,6}'),
  ('ATP|2025|Tiriac Open|1st Round|Diallo G.|Tseng C.H.', 'set_scores_incomplete', 'source Wsets=2 Lsets=0; set scores W {7} L {6}'),
  ('WTA|2007|East West Bank Classic|1st Round|Azarenka V.|Brianti A.', 'set_scores_incomplete', 'source Wsets=2 Lsets=0; set scores W {6,0} L {3,0}'),
  ('WTA|2008|ASB Classic|1st Round|Rezai A.|Zhang S.', 'set_scores_incomplete', 'source Wsets=2 Lsets=0; set scores W {6,6} L {6,3}'),
  ('WTA|2008|Qatar Total Open|1st Round|Garbin T.|Radwanska U.', 'set_scores_incomplete', 'source Wsets=2 Lsets=0; set scores W {6,0} L {2,0}'),
  ('WTA|2010|Grand Prix de SAR La Princesse Lalla Meryem|The Final|Benesova I.|Halep S.', 'set_scores_incomplete', 'source Wsets=2 Lsets=1; set scores W {6,6} L {4,2}'),
  ('WTA|2013|BNP Paribas Open|Semifinals|Sharapova M.|Kirilenko M.', 'set_scores_incomplete', 'source Wsets=2 Lsets=1; set scores W {6,6} L {4,3}'),
  ('WTA|2015|Coupe Banque Nationale|The Final|Beck A.|Ostapenko J.', 'set_scores_incomplete', 'source Wsets=2 Lsets=1; set scores W {6,6} L {2,2}'),
  ('WTA|2022|BNP Paribas Open|The Final|Swiatek I.|Sakkari M.', 'set_scores_incomplete', 'source Wsets=2 Lsets=0; set scores W {6,6} L {4,6}'),
  ('WTA|2022|Charleston Open|The Final|Bencic B.|Jabeur O.', 'set_scores_incomplete', 'source Wsets=2 Lsets=1; set scores W {6,5} L {1,7}'),
  ('ATP|2009|Catella Swedish Open|The Final|Soderling R.|Monaco J.', 'set_scores_missing', 'source Wsets=2 Lsets=0; set scores W {} L {}'),
  ('WTA|2021|US Open|The Final|Raducanu E.|Fernandez L.A.', 'set_scores_missing', 'source Wsets=2 Lsets=0; set scores W {} L {}'),
  ('WTA|2024|Adelaide International|1st Round|Bogdan A.|Boulter K.', 'set_scores_missing', 'source Wsets=2 Lsets=0; set scores W {} L {}')
on conflict (source_key) do nothing;

do $$
begin
  if (select count(*) from tennis.source_anomalies) <> 67 then
    raise exception 'expected 67 reviewed tennis source anomalies, found %', (select count(*) from tennis.source_anomalies);
  end if;
end $$;

create or replace function public.check_tennis_integrity()
returns table(check_name text, status text, found bigint, detail text)
language sql stable security definer set search_path = '' as $$
  select 'tennis_fresh',
    case when age_days is null then 'warning' when age_days >= 7 then 'failed' when age_days >= 3 then 'warning' else 'ok' end,
    coalesce(age_days, -1)::bigint,
    'Days since the last successful tennis_import run (scripts/tennis_import.py on Chris''s PC: tennis-data.co.uk refuses cloud downloads; warns at 3, fails at 7; -1 = never run)'
  from (select extract(day from now() - max(finished_at))::int age_days
        from public.pipeline_runs where job_name = 'tennis_import' and status = 'success') x
  union all
  -- Freshness from the data itself: a run that loads nothing new still
  -- "succeeds", and a successful run log says nothing about coverage.
  select 'tennis_source_coverage_' || lower(t.tour),
    case when extract(month from current_date) = 12 then 'ok'
         when d.last_match is null or current_date - d.last_match >= 17 then 'failed'
         when current_date - d.last_match >= 10 then 'warning' else 'ok' end,
    coalesce(current_date - d.last_match, -1)::bigint,
    'Days since the latest stored ' || t.tour || ' match (' || coalesce(d.last_match::text, 'none') ||
      '); in season (Jan-Nov) warns at 10, fails at 17'
  from (values ('ATP'), ('WTA')) t(tour)
  left join lateral (select max(m.match_date) last_match from tennis.matches m where m.tour = t.tour) d on true
  union all
  select 'tennis_sets_consistent', case when n = 0 then 'ok' else 'warning' end, n,
    'Completed tennis matches where sets won do not match the set scores, not yet reviewed (reviewed source errors are listed in tennis.source_anomalies)'
  from (select count(*) n from tennis.matches m
        where m.status = 'Completed' and m.w_sets is not null
          and not exists (select 1 from tennis.source_anomalies a where a.source_key = m.source_key)
          and (m.w_sets <= m.l_sets
               or m.w_sets <> (select count(*) from generate_subscripts(m.w_games, 1) i where m.w_games[i] > m.l_games[i])
               or m.l_sets <> (select count(*) from generate_subscripts(m.l_games, 1) i where m.l_games[i] > m.w_games[i]))) x
  union all
  select 'tennis_source_errors_reviewed', 'ok', (select count(*) from tennis.source_anomalies),
    'Matches whose source row is internally inconsistent, reviewed 16 Oct 2026 and kept as published (tennis.source_anomalies)'
  union all
  select 'tennis_matches_mapped', case when n = 0 then 'ok' else 'failed' end, n,
    'Tennis matches missing from public.tennis_matches (unmapped player or tournament)'
  from (select (select count(*) from tennis.matches) - (select count(*) from public.tennis_matches) n) x
$$;
revoke all on function public.check_tennis_integrity() from public, anon, authenticated;
grant execute on function public.check_tennis_integrity() to service_role;

create or replace function public.tennis_refresh_if_stale(p_force boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare run bigint; result text; last_ok timestamptz;
begin
  select max(started_at) into last_ok from public.pipeline_runs where job_name = 'tennis_refresh' and status = 'success';
  if not p_force and coalesce((select max(imported_at) from tennis.matches) <= last_ok, false) then
    return 'up to date';
  end if;
  insert into public.pipeline_runs (job_name, status, started_at) values ('tennis_refresh', 'running', clock_timestamp()) returning run_id into run;
  begin
    result := public.tennis_refresh();
    update public.pipeline_runs set status = 'success', summary = result, finished_at = clock_timestamp() where run_id = run;
  exception when others then
    update public.pipeline_runs set status = 'failed', error_message = left(sqlerrm, 4000), finished_at = clock_timestamp() where run_id = run;
    result := 'failed: ' || sqlerrm;
  end;
  return result;
end $$;
revoke all on function public.tennis_refresh_if_stale(boolean) from public, anon, authenticated;
grant execute on function public.tennis_refresh_if_stale(boolean) to service_role;

-- Regression test: a new inconsistent row must still warn, a reviewed one must not.
do $$
declare k text; n0 bigint; n1 bigint;
begin
  select found into n0 from public.check_tennis_integrity() where check_name = 'tennis_sets_consistent';
  if n0 <> 0 then raise exception 'tennis_sets_consistent should be 0 after review, is %', n0; end if;
  begin
    select source_key into k from tennis.source_anomalies limit 1;
    delete from tennis.source_anomalies where source_key = k;
    select found into n1 from public.check_tennis_integrity() where check_name = 'tennis_sets_consistent';
    if n1 <> 1 then raise exception 'an unreviewed inconsistent row should warn (got %)', n1; end if;
    raise exception using errcode = 'P0001', message = 'rollback-test';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback-test' then raise; end if;
  end;
end $$;
