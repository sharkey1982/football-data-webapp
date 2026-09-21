// ============================================================================
// src/lib/financeFormat.ts
//
// Pure formatting and labelling for club finance figures. Kept free of React
// and Supabase so the rules that matter most can be tested on their own:
//
//   * NULL means NOT DISCLOSED. It is never shown as zero, never estimated.
//   * ZERO is a real, disclosed value and is shown as £0.
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

/** Full money value: "£5,101,100". Null -> "Not disclosed". Zero -> "£0". */
export function formatMoneyFull(value: number | null): string {
  if (value == null) return NOT_DISCLOSED;
  const sign = value < 0 ? '-' : '';
  return `${sign}£${Math.abs(Math.round(value)).toLocaleString('en-GB')}`;
}

/**
 * Abbreviated money value for cards, charts and narrow tables:
 * £5.1m, £760k, £48k, £900. Null -> "Not disclosed". Zero -> "£0".
 * Sign is kept here; use signedLabel() when the sign should become words.
 */
export function formatMoneyShort(value: number | null): string {
  if (value == null) return NOT_DISCLOSED;
  if (value === 0) return '£0';
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  if (v >= 1_000_000) return `${sign}£${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}m`;
  if (v >= 1_000) return `${sign}£${Math.round(v / 1_000).toLocaleString('en-GB')}k`;
  return `${sign}£${Math.round(v).toLocaleString('en-GB')}`;
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
};

/** Neutral label used when there is no value to take a sign from. */
const NEUTRAL_LABELS: Record<string, string> = {
  operating_profit: 'Operating profit or loss',
  profit_before_tax: 'Profit or loss before tax',
  profit_after_tax: 'Profit or loss after tax',
  net_assets: 'Net assets or liabilities',
  profit_on_player_disposals: 'Profit or loss on player sales',
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
export function signedMoney(metricKey: string, value: number | null, fallback: string, short = true): { label: string; amount: string } {
  const label = signedLabel(metricKey, value, fallback);
  if (value == null) return { label, amount: NOT_DISCLOSED };
  const abs = isSignedMetric(metricKey) ? Math.abs(value) : value;
  return { label, amount: short ? formatMoneyShort(abs) : formatMoneyFull(abs) };
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
