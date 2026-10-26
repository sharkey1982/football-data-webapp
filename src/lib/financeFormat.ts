// ============================================================================
// src/lib/financeFormat.ts
//
// Pure formatting and labelling for club finance figures. Kept free of React
// and Supabase so the rules that matter most can be tested on their own:
//
//   * NULL means NOT DISCLOSED. It is never shown as zero, never estimated.
//   * ZERO is a real, disclosed value and is shown as £0 (€0 for a club
//     filing in euros -- figures keep their filed currency, never converted).
//   * A NEGATIVE value is labelled in words ("Operating loss", "Net
//     liabilities") and shown unsigned, rather than as an unexplained minus.
//   * Values are stored in whole units multiplied by unit_scale (1 for the
//     current data), so formatting always applies the scale first.
// ============================================================================

export const NOT_DISCLOSED = 'Not disclosed';

/** Apply the published unit scale. Null stays null -- never becomes 0. */
export function scaled(value: number | null | undefined, unitScale: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value * (unitScale ?? 1);
}

/**
 * Symbol for a period's reporting currency. Figures are shown in the currency
 * they were filed in and NEVER converted: a club reporting in euros is shown
 * in euros. Unknown currencies fall back to their ISO code ("CHF 5.1m").
 */
const SYMBOLS: Record<string, string> = { GBP: '£', EUR: '€', USD: '$' };
export function currencySymbol(currency: string | null | undefined): string {
  const c = (currency ?? 'GBP').toUpperCase();
  return SYMBOLS[c] ?? `${c} `;
}

/** Plain-English currency name for notes: "pounds", "euros". */
export function currencyName(currency: string | null | undefined): string {
  const c = (currency ?? 'GBP').toUpperCase();
  return ({ GBP: 'pounds', EUR: 'euros', USD: 'US dollars' } as Record<string, string>)[c] ?? c;
}

/** Full money value: "£5,101,100". Null -> "Not disclosed". Zero -> "£0". */
export function formatMoneyFull(value: number | null, currency?: string | null): string {
  if (value == null) return NOT_DISCLOSED;
  const sign = value < 0 ? '-' : '';
  return `${sign}${currencySymbol(currency)}${Math.abs(Math.round(value)).toLocaleString('en-GB')}`;
}

/**
 * Abbreviated money value for cards, charts and narrow tables:
 * £1.23bn, £5.1m, £760k, £48k, £900. Null -> "Not disclosed". Zero -> "£0".
 * Sign is kept here; use signedLabel() when the sign should become words.
 */
export function formatMoneyShort(value: number | null, currency?: string | null): string {
  if (value == null) return NOT_DISCLOSED;
  const s = currencySymbol(currency);
  if (value === 0) return `${s}0`;
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  if (v >= 1_000_000_000) return `${sign}${s}${(v / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}bn`;
  if (v >= 1_000_000) return `${sign}${s}${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}m`;
  if (v >= 1_000) return `${sign}${s}${Math.round(v / 1_000).toLocaleString('en-GB')}k`;
  return `${sign}${s}${Math.round(v).toLocaleString('en-GB')}`;
}

/**
 * Who published the filing, from its source URL, so pages never claim every
 * club files at Companies House (Manchester United file with the SEC; Real
 * Madrid publish audited annual reports).
 */
export function sourceName(url: string | null | undefined): string {
  const u = (url ?? '').toLowerCase();
  if (u.includes('company-information.service.gov.uk') || u.includes('companieshouse.gov.uk')) return 'Companies House';
  if (u.includes('sec.gov')) return 'the US SEC (EDGAR)';
  return 'the club’s audited annual report';
}

/** "Company number" for a UK registration, otherwise "Registration number". */
export function registrationLabel(url: string | null | undefined): string {
  return sourceName(url) === 'Companies House' ? 'Company number' : 'Registration number';
}

type ComparabilityInput = { period_end: string; period_months: number | null; is_consolidated: boolean | null; is_comparable: boolean };

/**
 * Why a period is flagged not comparable, as far as the published data can
 * show it: an accounting period that isn't 12 months, or a switch between
 * company-only and whole-group accounts. Anything else is a restatement,
 * reclassification or one-off break recorded with the filing.
 */
export function comparabilityReason(p: ComparabilityInput, prev: ComparabilityInput | null): string {
  const reasons: string[] = [];
  const m = p.period_months == null ? null : Math.round(p.period_months);
  if (m != null && m !== 12) reasons.push(`a ${m}-month accounting period`);
  if (prev && prev.is_consolidated != null && p.is_consolidated != null && prev.is_consolidated !== p.is_consolidated) {
    reasons.push(p.is_consolidated ? 'the accounts start covering the whole group' : 'the accounts cover the company only, not the group');
  }
  return reasons.length ? reasons.join('; ') : 'restated or reclassified in later accounts, or a one-off break in the figures';
}

/**
 * An "as filed" value for display. Printed values ("(16,228)", "26,548 +
 * 43,924") pass through untouched; bare machine numbers such as
 * "148570.000000000000" lose their trailing zeros and gain grouping
 * ("148,570"). The value itself is never rounded or rescaled.
 */
export function tidyOriginal(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  const m = /^(-?)(\d+)(?:\.(\d*?)0*)?$/.exec(t);
  if (!m) return t;
  const int = Number(m[2]).toLocaleString('en-GB');
  return `${m[1]}${int}${m[3] ? `.${m[3]}` : ''}`;
}

/** "12 months to 31 May 2025" / "13 months to 30 June 2025". */
export function periodPhrase(periodEnd: string, months: number | null): string {
  const m = months == null ? 12 : Math.round(months);
  return m === 12 ? `Year to ${longDate(periodEnd)}` : `${m} months to ${longDate(periodEnd)}`;
}

export function formatCount(value: number | null): string {
  if (value == null) return NOT_DISCLOSED;
  return Math.round(value).toLocaleString('en-GB');
}

/** A ratio stored as a fraction (the derived staff-cost ratio: 1.0237 means
 *  staff costs were 102.4% of revenue). Always a fraction -- never guessed
 *  from the size of the number, which would break on any ratio above 1. */
export function formatRatio(fraction: number | null, dp = 0): string {
  if (fraction == null) return NOT_DISCLOSED;
  return `${(fraction * 100).toFixed(dp)}%`;
}

/**
 * Context-aware labels for metrics whose sign changes their meaning. A
 * negative operating profit IS an operating loss; negative net assets ARE
 * net liabilities. Readers should never have to interpret a minus sign.
 */
const SIGNED_LABELS: Record<string, { positive: string; negative: string }> = {
  operating_profit: { positive: 'Operating profit', negative: 'Operating loss' },
  profit_before_tax: { positive: 'Profit before tax', negative: 'Loss before tax' },
  profit_after_tax: { positive: 'Profit after tax', negative: 'Loss after tax' },
  net_assets: { positive: 'Net assets', negative: 'Net liabilities' },
  profit_on_player_disposals: { positive: 'Profit on player sales', negative: 'Loss on player sales' },
  // Stored as a charge, so a negative figure is a net REVERSAL of earlier
  // impairments -- good news, never shown as a loss.
  player_impairment: { positive: 'Player impairment', negative: 'Player impairment reversed' },
};

/** Whether a negative value is bad news (shown in red). Not for impairment,
 *  where a negative figure is a reversal. */
export function negativeIsAdverse(metricKey: string): boolean {
  return metricKey !== 'player_impairment';
}

/** Neutral label used when there is no value to take a sign from. */
const NEUTRAL_LABELS: Record<string, string> = {
  operating_profit: 'Operating profit or loss',
  profit_before_tax: 'Profit or loss before tax',
  profit_after_tax: 'Profit or loss after tax',
  net_assets: 'Net assets or liabilities',
  profit_on_player_disposals: 'Profit or loss on player sales',
  player_impairment: 'Player impairment (negative = reversed)',
};

export function signedLabel(metricKey: string, value: number | null, fallback: string): string {
  const s = SIGNED_LABELS[metricKey];
  if (!s) return fallback;
  if (value == null) return NEUTRAL_LABELS[metricKey] ?? fallback;
  return value < 0 ? s.negative : s.positive;
}

export function neutralLabel(metricKey: string, fallback: string): string {
  return NEUTRAL_LABELS[metricKey] ?? fallback;
}

export function isSignedMetric(metricKey: string): boolean {
  return metricKey in SIGNED_LABELS;
}

/** A signed money figure as words plus an unsigned amount: "Operating loss £1.34m". */
export function signedMoney(metricKey: string, value: number | null, fallback: string, short = true, currency?: string | null): { label: string; amount: string } {
  const label = signedLabel(metricKey, value, fallback);
  if (value == null) return { label, amount: NOT_DISCLOSED };
  const abs = isSignedMetric(metricKey) ? Math.abs(value) : value;
  return { label, amount: short ? formatMoneyShort(abs, currency) : formatMoneyFull(abs, currency) };
}

/** "FY2025" from a period end date. Financial years are named by the year they end in. */
export function fyLabel(periodEnd: string): string {
  return `FY${periodEnd.slice(0, 4)}`;
}

/** "31 July 2025". Parsed as a plain date, so no timezone can shift the day. */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d} ${months[m - 1]} ${y}`;
}

/** Football season a July/June year-end mostly covers: FY ending July 2025 -> "2024/25". */
export function seasonLabel(periodEnd: string): string {
  const [y, m] = periodEnd.slice(0, 7).split('-').map(Number);
  const end = m >= 6 ? y : y - 1;
  return `${end - 1}/${String(end).slice(2)}`;
}
