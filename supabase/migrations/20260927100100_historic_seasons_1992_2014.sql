-- ============================================================================
-- Historic seasons 1992/93 to 2013/14
--
-- Rows for the historic results load. season_id is an identity column,
-- so these take 14 (1992/93) to 35 (2013/14) in year order -- season_id is
-- no longer in date order.
-- Everything that ordered or compared seasons by id was moved to
-- start_year first (20260927100000_season_order_by_start_year.sql); do not
-- rely on the ids here being contiguous or chronological.
--
-- Same formats as the existing rows: label = two-digit start + end year
-- ('9293', '9900', '0001'), slug = 'YYYY-YY' ('1999-00'), end_year =
-- start_year + 1. Idempotent: a start_year already present is skipped.
-- No results are loaded here -- only the season rows.
--
-- Rolled-back dry runs of this insert still advanced the identity sequence
-- (sequences are not transactional), so it is reset to the highest id in
-- use first; with nothing above 13 the new rows take 14 to 35. Re-running
-- is harmless: the max is then 35 and every year is skipped.
-- ============================================================================

select setval(pg_get_serial_sequence('public.seasons', 'season_id'), (select max(season_id) from public.seasons));

insert into public.seasons (label, start_year, end_year, slug)
select lpad((y % 100)::text, 2, '0') || lpad(((y + 1) % 100)::text, 2, '0'),
       y,
       y + 1,
       y || '-' || lpad(((y + 1) % 100)::text, 2, '0')
from generate_series(1992, 2013) y
where not exists (select 1 from public.seasons s where s.start_year = y)
order by y;

do $$
begin
  if (select count(*) from public.seasons where start_year between 1992 and 2013) <> 22 then
    raise exception 'Expected 22 historic seasons (1992/93 to 2013/14)';
  end if;
end $$;
