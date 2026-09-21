-- Baseline for the football-club finance subsystem.
--
-- The objects below were created in the hosted project before they were
-- represented in this repository.  IF NOT EXISTS makes the migration safe to
-- record against that project while retaining a complete bootstrap definition
-- for environments where the finance objects do not yet exist.
--
-- Prerequisites: public.teams(team_id) and public.seasons(season_id).

create table if not exists public.finance_reporting_entities (
  reporting_entity_id bigint generated always as identity,
  team_id bigint not null,
  company_number text not null,
  reporting_entity text not null,
  relationship_type text not null default 'football_club',
  is_preferred boolean not null default false,
  effective_from date,
  effective_to date,
  source_url text,
  created_at timestamptz not null default now(),
  constraint finance_reporting_entities_pkey primary key (reporting_entity_id),
  constraint finance_reporting_entities_team_id_company_number_key unique (team_id, company_number),
  constraint finance_reporting_entities_relationship_type_check check (
    relationship_type = any (array[
      'football_club'::text, 'parent'::text, 'holding_company'::text,
      'stadium'::text, 'subsidiary'::text, 'other'::text
    ])
  ),
  constraint finance_reporting_entities_team_id_fkey
    foreign key (team_id) references public.teams(team_id) on delete restrict
);

create table if not exists public.finance_ingestion_runs (
  ingestion_run_id bigint generated always as identity,
  source text not null default 'companies_house',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  filings_discovered integer not null default 0,
  filings_processed integer not null default 0,
  facts_extracted integer not null default 0,
  facts_mapped integer not null default 0,
  error_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  constraint finance_ingestion_runs_pkey primary key (ingestion_run_id),
  constraint finance_ingestion_runs_status_check check (
    status = any (array['running'::text, 'succeeded'::text, 'partial'::text, 'failed'::text])
  )
);

create table if not exists public.finance_filings (
  filing_id bigint generated always as identity,
  reporting_entity_id bigint not null,
  ingestion_run_id bigint,
  source text not null default 'companies_house',
  filing_reference text,
  document_id text,
  source_url text not null,
  filing_date date not null,
  period_start date not null,
  period_end date not null,
  period_months numeric(6,2) not null,
  is_consolidated boolean,
  document_format text,
  document_sha256 text,
  retrieved_at timestamptz not null default now(),
  extraction_status text not null default 'discovered',
  validation_status text not null default 'unreviewed',
  supersedes_filing_id bigint,
  created_at timestamptz not null default now(),
  retrieval_method text,
  retrieval_notes text,
  raw_fact_count integer not null default 0,
  constraint finance_filings_pkey primary key (filing_id),
  constraint finance_filings_reporting_entity_id_document_id_key
    unique (reporting_entity_id, document_id),
  constraint finance_filings_check check (period_end >= period_start),
  constraint finance_filings_period_months_check check (period_months > 0),
  constraint finance_filings_extraction_status_check check (
    extraction_status = any (array[
      'discovered'::text, 'extracted'::text, 'mapped'::text,
      'validated'::text, 'failed'::text
    ])
  ),
  constraint finance_filings_validation_status_check check (
    validation_status = any (array[
      'unreviewed'::text, 'review_required'::text, 'validated'::text, 'rejected'::text
    ])
  ),
  constraint finance_filings_reporting_entity_id_fkey
    foreign key (reporting_entity_id)
    references public.finance_reporting_entities(reporting_entity_id) on delete restrict,
  constraint finance_filings_ingestion_run_id_fkey
    foreign key (ingestion_run_id)
    references public.finance_ingestion_runs(ingestion_run_id) on delete set null,
  constraint finance_filings_supersedes_filing_id_fkey
    foreign key (supersedes_filing_id)
    references public.finance_filings(filing_id) on delete set null
);

create table if not exists public.finance_raw_facts (
  raw_fact_id bigint generated always as identity,
  filing_id bigint not null,
  xbrl_concept text not null,
  context_ref text,
  period_start date,
  period_end date,
  instant_date date,
  original_value text,
  numeric_value numeric,
  original_unit text,
  currency text,
  unit_scale integer,
  dimensions jsonb not null default '{}'::jsonb,
  source_locator text,
  created_at timestamptz not null default now(),
  constraint finance_raw_facts_pkey primary key (raw_fact_id),
  constraint finance_raw_facts_filing_id_fkey
    foreign key (filing_id) references public.finance_filings(filing_id) on delete cascade
);

create table if not exists public.finance_metric_dictionary (
  metric_key text not null,
  display_name text not null,
  definition text not null,
  metric_type text not null,
  statement_type text,
  value_kind text not null default 'monetary',
  expected_sign text,
  created_at timestamptz not null default now(),
  constraint finance_metric_dictionary_pkey primary key (metric_key),
  constraint finance_metric_dictionary_metric_type_check check (
    metric_type = any (array['statutory'::text, 'normalized'::text, 'derived'::text])
  ),
  constraint finance_metric_dictionary_statement_type_check check (
    statement_type = any (array[
      'income_statement'::text, 'balance_sheet'::text, 'cash_flow'::text,
      'notes'::text, 'other'::text
    ])
  ),
  constraint finance_metric_dictionary_value_kind_check check (
    value_kind = any (array['monetary'::text, 'count'::text, 'ratio'::text, 'text'::text])
  ),
  constraint finance_metric_dictionary_expected_sign_check check (
    expected_sign = any (array['positive'::text, 'negative'::text, 'either'::text])
  )
);

create table if not exists public.finance_metric_mappings (
  mapping_id bigint generated always as identity,
  source text not null default 'companies_house',
  xbrl_concept text not null,
  metric_key text not null,
  mapping_version integer not null default 1,
  context_rules jsonb not null default '{}'::jsonb,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint finance_metric_mappings_pkey primary key (mapping_id),
  constraint finance_metric_mappings_source_xbrl_concept_metric_key_mapp_key
    unique (source, xbrl_concept, metric_key, mapping_version),
  constraint finance_metric_mappings_mapping_version_check check (mapping_version > 0),
  constraint finance_metric_mappings_metric_key_fkey
    foreign key (metric_key) references public.finance_metric_dictionary(metric_key) on delete restrict
);

create table if not exists public.finance_periods (
  financial_id bigint generated always as identity,
  team_id bigint not null,
  filing_id bigint not null,
  season_id bigint,
  period_start date not null,
  period_end date not null,
  period_months numeric(6,2) not null,
  reporting_entity text not null,
  company_number text not null,
  is_consolidated boolean,
  currency text not null default 'GBP',
  unit_scale integer not null default 1,
  season_mapping_method text,
  season_mapping_confidence text,
  is_latest boolean not null default false,
  is_current_version boolean not null default true,
  is_comparable boolean not null default true,
  supersedes_financial_id bigint,
  filing_date date not null,
  source_url text not null,
  validation_status text not null default 'unreviewed',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_periods_pkey primary key (financial_id),
  constraint finance_periods_check check (period_end >= period_start),
  constraint finance_periods_period_months_check check (period_months > 0),
  constraint finance_periods_unit_scale_check check (unit_scale > 0),
  constraint finance_periods_season_mapping_confidence_check check (
    season_mapping_confidence = any (array['high'::text, 'medium'::text, 'low'::text])
  ),
  constraint finance_periods_validation_status_check check (
    validation_status = any (array[
      'unreviewed'::text, 'review_required'::text, 'validated'::text,
      'published'::text, 'rejected'::text
    ])
  ),
  constraint finance_periods_check1 check (
    (validation_status = 'published' and published_at is not null)
    or validation_status <> 'published'
  ),
  constraint finance_periods_team_id_fkey
    foreign key (team_id) references public.teams(team_id) on delete restrict,
  constraint finance_periods_filing_id_fkey
    foreign key (filing_id) references public.finance_filings(filing_id) on delete restrict,
  constraint finance_periods_season_id_fkey
    foreign key (season_id) references public.seasons(season_id) on delete restrict,
  constraint finance_periods_supersedes_financial_id_fkey
    foreign key (supersedes_financial_id)
    references public.finance_periods(financial_id) on delete set null
);

create table if not exists public.finance_metric_values (
  metric_value_id bigint generated always as identity,
  financial_id bigint not null,
  metric_key text not null,
  value numeric,
  currency text,
  unit_scale integer,
  raw_fact_id bigint,
  original_xbrl_concept text,
  original_value text,
  original_unit text,
  filing_reference text,
  document_id text,
  source_url text,
  mapping_version integer,
  validation_status text not null default 'unreviewed',
  validation_notes text,
  created_at timestamptz not null default now(),
  constraint finance_metric_values_pkey primary key (metric_value_id),
  constraint finance_metric_values_financial_id_metric_key_key unique (financial_id, metric_key),
  constraint finance_metric_values_unit_scale_check check (unit_scale is null or unit_scale > 0),
  constraint finance_metric_values_validation_status_check check (
    validation_status = any (array[
      'unreviewed'::text, 'review_required'::text, 'validated'::text,
      'published'::text, 'rejected'::text
    ])
  ),
  constraint finance_metric_values_financial_id_fkey
    foreign key (financial_id) references public.finance_periods(financial_id) on delete cascade,
  constraint finance_metric_values_metric_key_fkey
    foreign key (metric_key) references public.finance_metric_dictionary(metric_key) on delete restrict,
  constraint finance_metric_values_raw_fact_id_fkey
    foreign key (raw_fact_id) references public.finance_raw_facts(raw_fact_id) on delete set null
);

create index if not exists finance_reporting_entities_team_idx
  on public.finance_reporting_entities (team_id);
create index if not exists finance_filings_entity_period_idx
  on public.finance_filings (reporting_entity_id, period_end desc);
create index if not exists finance_raw_facts_filing_idx
  on public.finance_raw_facts (filing_id);
create index if not exists finance_raw_facts_concept_idx
  on public.finance_raw_facts (xbrl_concept);
create index if not exists finance_metric_mappings_concept_idx
  on public.finance_metric_mappings (source, xbrl_concept) where is_active;
create index if not exists finance_periods_team_period_idx
  on public.finance_periods (team_id, period_end desc);
create unique index if not exists finance_periods_current_version_uniq
  on public.finance_periods (team_id, period_end) where is_current_version;
create index if not exists finance_periods_published_idx
  on public.finance_periods (team_id, period_end desc)
  where validation_status = 'published' and is_current_version;
create index if not exists finance_metric_values_financial_idx
  on public.finance_metric_values (financial_id);
create index if not exists finance_metric_values_metric_idx
  on public.finance_metric_values (metric_key);

-- The metric dictionary is reference data, not club filing data.  Upsert it
-- so a fresh environment has the same public vocabulary as production.
insert into public.finance_metric_dictionary
  (metric_key, display_name, definition, metric_type, statement_type, value_kind, expected_sign)
values
  ('average_employees', 'Average employees', 'Average number of employees during the reporting period.', 'normalized', 'notes', 'count', 'positive'),
  ('borrowings', 'Borrowings', 'Interest-bearing borrowings disclosed at the reporting date; definition excludes derived net debt.', 'normalized', 'balance_sheet', 'monetary', 'positive'),
  ('cash', 'Cash', 'Cash and cash equivalents at the reporting date.', 'normalized', 'balance_sheet', 'monetary', 'positive'),
  ('net_assets', 'Net assets', 'Net assets/equity at the reporting date.', 'normalized', 'balance_sheet', 'monetary', 'either'),
  ('operating_profit', 'Operating profit', 'Operating profit or loss reported for the period.', 'normalized', 'income_statement', 'monetary', 'either'),
  ('player_amortisation', 'Player amortisation', 'Amortisation of player registrations/intangible player assets.', 'normalized', 'notes', 'monetary', 'positive'),
  ('player_impairment', 'Player impairment', 'Impairment of player registrations/intangible player assets.', 'normalized', 'notes', 'monetary', 'positive'),
  ('profit_after_tax', 'Profit after tax', 'Profit or loss after taxation for the financial period.', 'normalized', 'income_statement', 'monetary', 'either'),
  ('profit_before_tax', 'Profit before tax', 'Profit or loss before taxation.', 'normalized', 'income_statement', 'monetary', 'either'),
  ('profit_on_player_disposals', 'Profit on player disposals', 'Profit recognised on disposal of player registrations.', 'normalized', 'notes', 'monetary', 'either'),
  ('revenue_broadcast', 'Broadcast revenue', 'Revenue attributable to broadcasting/media rights where separately disclosed.', 'normalized', 'notes', 'monetary', 'positive'),
  ('revenue_commercial', 'Commercial revenue', 'Revenue attributable to commercial activities where separately disclosed.', 'normalized', 'notes', 'monetary', 'positive'),
  ('revenue_matchday', 'Matchday revenue', 'Revenue attributable to matchday activities where separately disclosed.', 'normalized', 'notes', 'monetary', 'positive'),
  ('revenue_other', 'Other revenue', 'Other revenue not included in the principal disclosed categories.', 'normalized', 'notes', 'monetary', 'positive'),
  ('revenue_total', 'Revenue', 'Total revenue/turnover reported for the period.', 'normalized', 'income_statement', 'monetary', 'positive'),
  ('staff_costs', 'Staff costs', 'Total staff/employee costs reported for the period.', 'normalized', 'notes', 'monetary', 'positive'),
  ('total_assets', 'Total assets', 'Total assets at the reporting date.', 'normalized', 'balance_sheet', 'monetary', 'positive'),
  ('total_liabilities', 'Total liabilities', 'Total liabilities at the reporting date.', 'normalized', 'balance_sheet', 'monetary', 'positive')
on conflict (metric_key) do update set
  display_name = excluded.display_name,
  definition = excluded.definition,
  metric_type = excluded.metric_type,
  statement_type = excluded.statement_type,
  value_kind = excluded.value_kind,
  expected_sign = excluded.expected_sign;

alter table public.finance_reporting_entities enable row level security;
alter table public.finance_ingestion_runs enable row level security;
alter table public.finance_filings enable row level security;
alter table public.finance_raw_facts enable row level security;
alter table public.finance_metric_dictionary enable row level security;
alter table public.finance_metric_mappings enable row level security;
alter table public.finance_periods enable row level security;
alter table public.finance_metric_values enable row level security;

drop policy if exists finance_metric_dictionary_public_read on public.finance_metric_dictionary;
create policy finance_metric_dictionary_public_read
  on public.finance_metric_dictionary for select to anon, authenticated using (true);

drop policy if exists finance_periods_public_read on public.finance_periods;
create policy finance_periods_public_read
  on public.finance_periods for select to anon, authenticated
  using (validation_status = 'published' and is_current_version);

drop policy if exists finance_metric_values_public_read on public.finance_metric_values;
create policy finance_metric_values_public_read
  on public.finance_metric_values for select to anon, authenticated
  using (
    validation_status = 'published'
    and exists (
      select 1
      from public.finance_periods p
      where p.financial_id = finance_metric_values.financial_id
        and p.validation_status = 'published'
        and p.is_current_version
    )
  );

create or replace view public.finance_derived_metrics
with (security_invoker = true) as
select
  p.team_id,
  p.period_end,
  'staff_cost_ratio'::text as metric_key,
  case when rev.value is null or rev.value = 0 then null
       else staff.value / rev.value end as value,
  'Staff costs divided by total revenue.'::text as definition,
  1 as calculation_version
from public.finance_periods p
join public.finance_metric_values staff
  on staff.financial_id = p.financial_id and staff.metric_key = 'staff_costs'
join public.finance_metric_values rev
  on rev.financial_id = p.financial_id and rev.metric_key = 'revenue_total';

create or replace view public.finance_published_periods
with (security_invoker = true) as
select
  p.team_id,
  p.period_start,
  p.period_end,
  p.period_months,
  p.season_id,
  p.reporting_entity,
  p.company_number,
  p.is_consolidated,
  p.currency,
  p.unit_scale,
  max(v.value) filter (where v.metric_key = 'revenue_total') as revenue_total,
  max(v.value) filter (where v.metric_key = 'revenue_matchday') as revenue_matchday,
  max(v.value) filter (where v.metric_key = 'revenue_broadcast') as revenue_broadcast,
  max(v.value) filter (where v.metric_key = 'revenue_commercial') as revenue_commercial,
  max(v.value) filter (where v.metric_key = 'revenue_other') as revenue_other,
  max(v.value) filter (where v.metric_key = 'staff_costs') as staff_costs,
  max(v.value) filter (where v.metric_key = 'player_amortisation') as player_amortisation,
  max(v.value) filter (where v.metric_key = 'player_impairment') as player_impairment,
  max(v.value) filter (where v.metric_key = 'profit_on_player_disposals') as profit_on_player_disposals,
  max(v.value) filter (where v.metric_key = 'operating_profit') as operating_profit,
  max(v.value) filter (where v.metric_key = 'profit_before_tax') as profit_before_tax,
  max(v.value) filter (where v.metric_key = 'profit_after_tax') as profit_after_tax,
  max(v.value) filter (where v.metric_key = 'cash') as cash,
  max(v.value) filter (where v.metric_key = 'borrowings') as borrowings,
  max(v.value) filter (where v.metric_key = 'total_assets') as total_assets,
  max(v.value) filter (where v.metric_key = 'total_liabilities') as total_liabilities,
  max(v.value) filter (where v.metric_key = 'net_assets') as net_assets,
  max(v.value) filter (where v.metric_key = 'average_employees') as average_employees,
  p.is_latest,
  p.is_comparable,
  p.filing_date,
  p.source_url,
  p.validation_status
from public.finance_periods p
left join public.finance_metric_values v on v.financial_id = p.financial_id
group by p.financial_id;

create or replace view public.finance_published_provenance
with (security_invoker = true) as
select
  p.team_id,
  p.period_end,
  v.metric_key,
  v.original_xbrl_concept,
  v.original_value,
  v.original_unit,
  v.filing_reference,
  v.document_id,
  v.source_url,
  v.mapping_version
from public.finance_metric_values v
join public.finance_periods p on p.financial_id = v.financial_id;

-- Remove Supabase's broad default table privileges and publish only the
-- reviewed projections.  TRUNCATE and write privileges must never be held by
-- browser roles; RLS does not protect TRUNCATE.
revoke all on table
  public.finance_reporting_entities,
  public.finance_ingestion_runs,
  public.finance_filings,
  public.finance_raw_facts,
  public.finance_metric_dictionary,
  public.finance_metric_mappings,
  public.finance_periods,
  public.finance_metric_values,
  public.finance_derived_metrics,
  public.finance_published_periods,
  public.finance_published_provenance
from anon, authenticated;

grant select on table
  public.finance_metric_dictionary,
  public.finance_metric_values,
  public.finance_periods,
  public.finance_derived_metrics,
  public.finance_published_periods,
  public.finance_published_provenance
to anon, authenticated;

grant all on table
  public.finance_reporting_entities,
  public.finance_ingestion_runs,
  public.finance_filings,
  public.finance_raw_facts,
  public.finance_metric_dictionary,
  public.finance_metric_mappings,
  public.finance_periods,
  public.finance_metric_values
to service_role;

grant select on table
  public.finance_derived_metrics,
  public.finance_published_periods,
  public.finance_published_provenance
to service_role;

grant usage, select, update on sequence
  public.finance_reporting_entities_reporting_entity_id_seq,
  public.finance_ingestion_runs_ingestion_run_id_seq,
  public.finance_filings_filing_id_seq,
  public.finance_raw_facts_raw_fact_id_seq,
  public.finance_metric_mappings_mapping_id_seq,
  public.finance_periods_financial_id_seq,
  public.finance_metric_values_metric_value_id_seq
to service_role;
