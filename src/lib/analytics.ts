// ============================================================================
// src/lib/analytics.ts
//
// GA4, loaded only when it should be and only after consent.
//
// Three guards, each closing a different hole:
//
// 1. Measurement ID must be configured. No ID, no analytics -- so a fork
//    or a local clone can never report into this property.
// 2. Hostname must match the production SITE_URL host. This excludes
//    localhost AND Netlify deploy previews / branch deploys without
//    needing a separate env var, because previews serve the same
//    production build with the same env.
// 3. Consent. UK PECR requires opt-IN for non-essential cookies, so
//    Consent Mode v2 defaults everything to 'denied' and gtag.js isn't
//    even loaded until the visitor accepts. Deny-by-default in the
//    config alone wouldn't be enough -- the script would still be
//    fetched, which is the thing people object to.
//
// send_page_view is false on purpose. GA4's automatic SPA tracking and a
// manual router-driven page_view will BOTH fire on a history change and
// double-count; exactly one path has to own it, and the manual one is
// the only one that also covers the prerendered initial load correctly.
// ============================================================================

import { SITE_URL } from './siteConfig';

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
export const CONSENT_STORAGE_KEY = 'fds-analytics-consent';

type ConsentChoice = 'granted' | 'denied';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function productionHost(): string | null {
  try {
    return new URL(SITE_URL).hostname;
  } catch {
    return null;
  }
}

/** Whether analytics may run here at all -- independent of consent. */
export function analyticsAvailable(): boolean {
  if (!MEASUREMENT_ID) return false;
  if (typeof window === 'undefined') return false;
  const host = productionHost();
  return host != null && window.location.hostname === host;
}

export function getStoredConsent(): ConsentChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    // Private mode / storage disabled -- treat as undecided rather than
    // assuming consent.
    return null;
  }
}

function storeConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // Non-fatal: the banner will simply ask again next visit, which is
    // the safe direction to fail in.
  }
}

let scriptLoaded = false;

function ensureGtag(): void {
  if (scriptLoaded || !analyticsAvailable()) return;
  scriptLoaded = true;

  window.dataLayer = window.dataLayer || [];
  // MUST push the `arguments` object, not a rest-parameter array.
  // gtag.js reads dataLayer entries expecting Arguments; a real Array
  // isn't processed the same way, so commands get silently ignored --
  // no error, no events, which looks identical to a broken install.
  // This mirrors Google's canonical snippet exactly.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  } as (...args: unknown[]) => void;

  // Consent defaults MUST be set before config, so the very first hit
  // already carries the right state.
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(s);

  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    // Google Signals isn't needed here and widens the data-sharing
    // footprint (cross-device, ads personalisation).
    allow_google_signals: false,
  });
}

/** Called by the banner, and on load when consent was previously given. */
export function grantConsent(): void {
  storeConsent('granted');
  if (!analyticsAvailable()) return;
  ensureGtag();
  window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
}

export function denyConsent(): void {
  storeConsent('denied');
  // Deliberately does NOT load gtag.js. Nothing to update, because
  // nothing was loaded.
}

/** Re-applies a previously granted choice on a later visit. */
export function initAnalytics(): void {
  if (!analyticsAvailable()) return;
  if (getStoredConsent() === 'granted') grantConsent();
}

function canSend(): boolean {
  return analyticsAvailable() && getStoredConsent() === 'granted' && typeof window.gtag === 'function';
}

/** Manual page_view -- the single owner of pageview tracking. */
export function trackPageView(path: string): void {
  if (!canSend()) return;
  window.gtag!('event', 'page_view', {
    page_path: path,
    page_location: `${SITE_URL}${path}`,
    page_title: document.title,
  });
}

/** Custom events. Params must never carry PII -- no emails, no free-text
 * search input (which can contain names), no user identifiers. */
export function trackEvent(name: string, params: Record<string, string | number | boolean> = {}): void {
  if (!canSend()) return;
  window.gtag!('event', name, params);
}
