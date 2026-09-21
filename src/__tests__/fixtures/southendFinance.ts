// ============================================================================
// Southend United's published finance data, copied from the anonymous
// finance_published_periods view (team_id 70, company 00089767), so the tests
// check the page against the real figures the brief specifies. Numeric
// columns are given as STRINGS, as PostgREST can return them, to prove the
// normalisers convert them without turning null into 0.
// ============================================================================
import {
  groupFinanceByTeam,
  normaliseDerived,
  normalisePeriod,
  normaliseProvenance,
  type ClubFinanceData,
  type FinanceMetricDef,
} from '../../lib/financeApi';

const base = {
  team_id: 70, period_months: '12.00', season_id: null, reporting_entity: 'Southend United Football Club Limited',
  company_number: '00089767', is_consolidated: false, currency: 'GBP', unit_scale: 1, validation_status: 'published',
  revenue_matchday: null, revenue_broadcast: null, revenue_commercial: null, revenue_other: null,
  player_amortisation: null, player_impairment: null, profit_on_player_disposals: null,
  profit_after_tax: null, total_assets: null, total_liabilities: null,
};
const row = (end: string, filed: string, v: Record<string, string | null>, extra: Record<string, unknown> = {}) => ({
  ...base, period_start: `${Number(end.slice(0, 4)) - 1}-08-01`, period_end: end, filing_date: filed,
  source_url: `https://find-and-update.company-information.service.gov.uk/company/00089767/filing-history/${end}`,
  is_latest: false, is_comparable: true, ...v, ...extra,
});

export const southendPeriodRows = [
  row('2019-07-31', '2021-08-02', { revenue_total: '7430373', operating_profit: '-2358455', profit_before_tax: '-2558077', cash: '126861', borrowings: null, net_assets: '-16548134', average_employees: '150', staff_costs: '6241036' }),
  row('2020-07-31', '2023-05-31', { revenue_total: '5109759', operating_profit: '-970636', profit_before_tax: '-1097078', cash: '7624', borrowings: null, net_assets: '-17645212', average_employees: '142', staff_costs: '4366707' }),
  row('2021-07-31', '2023-05-31', { revenue_total: '3954593', operating_profit: '-922322', profit_before_tax: '-1003992', cash: '24361', borrowings: null, net_assets: '-18649204', average_employees: '122', staff_costs: '3479935' }),
  row('2022-07-31', '2024-04-19', { revenue_total: '3362888', operating_profit: '-2557627', profit_before_tax: '-2717380', cash: '19387', borrowings: null, net_assets: '-21366584', average_employees: '121', staff_costs: '2975639' }),
  row('2023-07-31', '2024-06-20', { revenue_total: '2926997', operating_profit: '-2457589', profit_before_tax: '-2749457', cash: '87807', borrowings: null, net_assets: '-24116041', average_employees: '98', staff_costs: '2915206' }),
  row('2024-07-31', '2025-04-30', { revenue_total: '2518372', operating_profit: '-2064884', profit_before_tax: '-2649664', cash: '482845', borrowings: null, net_assets: '-5626128', average_employees: '63', staff_costs: '2577936' }, { is_comparable: false }),
  row('2025-07-31', '2026-04-30', { revenue_total: '5101100', operating_profit: '-1344626', profit_before_tax: '-1344800', cash: '760239', borrowings: '47817', net_assets: '-6970928', average_employees: '59', staff_costs: null }, { is_latest: true }),
];

export const southendProvenanceRows = [
  { team_id: 70, period_end: '2025-07-31', metric_key: 'revenue_total', original_xbrl_concept: 'core:TurnoverRevenue', original_value: '5,101,100', original_unit: 'GBP', filing_reference: 'AA 2025', document_id: 'doc-2025', source_url: 'https://example.test/southend-fy2025.xhtml', mapping_version: '1' },
  { team_id: 70, period_end: '2024-07-31', metric_key: 'revenue_total', original_xbrl_concept: 'core:TurnoverRevenue', original_value: '2,518,372', original_unit: 'GBP', filing_reference: 'AA 2024', document_id: 'doc-2024', source_url: 'https://example.test/southend-fy2024.xhtml', mapping_version: '1' },
];

export const southendDerivedRows = [
  { team_id: 70, period_end: '2024-07-31', metric_key: 'staff_cost_ratio', value: '1.0236517877422398', definition: 'Staff costs divided by total revenue.', calculation_version: 1 },
  { team_id: 70, period_end: '2023-07-31', metric_key: 'staff_cost_ratio', value: '0.99597163919197730643', definition: 'Staff costs divided by total revenue.', calculation_version: 1 },
];

export const dictionary: FinanceMetricDef[] = [
  ['revenue_total', 'Revenue', 'Income from the club\u2019s activities.', 'income_statement'],
  ['operating_profit', 'Operating profit', 'Profit or loss from running the club, before interest.', 'income_statement'],
  ['profit_before_tax', 'Profit before tax', 'Profit or loss before corporation tax.', 'income_statement'],
  ['cash', 'Cash', 'Cash at the balance-sheet date.', 'balance_sheet'],
  ['borrowings', 'Borrowings', 'Loans and other borrowings.', 'balance_sheet'],
  ['net_assets', 'Net assets', 'Total assets minus total liabilities.', 'balance_sheet'],
  ['average_employees', 'Average employees', 'Average number of people employed.', 'notes'],
  ['staff_costs', 'Staff costs', 'Wages, salaries and related costs.', 'notes'],
].map(([metric_key, display_name, definition, statement_type]) => ({
  metric_key, display_name, definition, metric_type: 'normalized', statement_type, value_kind: metric_key === 'average_employees' ? 'count' : 'monetary', expected_sign: 'either',
}));

export const southendTeam = { team_id: 70, slug: 'southend', display_name: 'Southend' };

export function southendData(): ClubFinanceData {
  return groupFinanceByTeam(
    [southendTeam],
    southendPeriodRows.map((r) => normalisePeriod(r as Record<string, unknown>)),
    southendProvenanceRows.map((r) => normaliseProvenance(r as Record<string, unknown>)),
    southendDerivedRows.map((r) => normaliseDerived(r as Record<string, unknown>)),
    dictionary
  ).get(70)!;
}
