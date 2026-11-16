-- Live definition exported from the database (function ai_tool_get_club_accounts(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_get_club_accounts(args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t jsonb; tid bigint; yrs int := least(coalesce((args->>'years')::int, 1), 10);
begin
  if not args ? 'team' then return jsonb_build_object('error', 'team is required'); end if;
  t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if;
  tid := (t->>'team_id')::bigint;
  return jsonb_build_object('tool', 'get_club_accounts',
    'source', jsonb_build_array('finance_published_periods', 'finance_published_provenance'), 'as_of', now(), 'kind', 'observed',
    'note', 'Published statutory accounts from Companies House filings, most recent first. Values are in the stated currency; multiply by unit_scale (e.g. 1 = units). NULL = not disclosed, not zero. Financial years do not align with football seasons.',
    'club', t->>'team',
    'rows', coalesce((select jsonb_agg(r) from (
      select v.period_start, v.period_end, v.period_months, v.reporting_entity, v.company_number, v.is_consolidated,
             v.currency, v.unit_scale, v.revenue_total, v.revenue_matchday, v.revenue_broadcast, v.revenue_commercial,
             v.revenue_other, v.staff_costs, v.player_amortisation, v.operating_profit, v.profit_before_tax,
             v.profit_after_tax, v.cash, v.borrowings, v.net_assets, v.average_employees, v.filing_date, v.source_url,
             case when coalesce((args->>'include_sources')::boolean, false) then
               (select jsonb_agg(jsonb_build_object('metric', pv.metric_key, 'xbrl_concept', pv.original_xbrl_concept,
                        'value_in_filing', pv.original_value, 'filing_reference', pv.filing_reference, 'source_url', pv.source_url))
                  from finance_published_provenance pv where pv.team_id = v.team_id and pv.period_end = v.period_end) end sources
        from finance_published_periods v
        join finance_periods fp on fp.team_id = v.team_id and fp.period_end = v.period_end
                               and fp.is_current_version and fp.validation_status = 'published'
       where v.team_id = tid and v.validation_status = 'published'
       order by v.period_end desc limit yrs) r), '[]'::jsonb));
end $function$
;
