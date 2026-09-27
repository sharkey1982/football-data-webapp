// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://fixtureshark.com/"}
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The module reads its measurement ID at import time, so each test loads a
// fresh copy after stubbing the env.
async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST');
  vi.stubEnv('VITE_SITE_URL', 'https://fixtureshark.com');
  return import('../lib/analytics');
}

beforeEach(() => {
  localStorage.clear();
  delete (window as any).gtag;
  vi.unstubAllEnvs();
});

describe('analytics: admin devices are excluded', () => {
  it('is available on the production host for an ordinary visitor', async () => {
    const a = await load();
    expect(a.analyticsAvailable()).toBe(true);
  });

  it('stops for good once an admin signs in on this browser, even with consent granted', async () => {
    const a = await load();
    localStorage.setItem(a.CONSENT_STORAGE_KEY, 'granted');
    const gtag = vi.fn();
    (window as any).gtag = gtag;

    a.excludeThisDevice();

    expect(localStorage.getItem(a.ADMIN_DEVICE_KEY)).toBe('1');
    expect(gtag).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'denied' });
    expect(a.analyticsAvailable()).toBe(false);
    gtag.mockClear();
    a.trackPageView('/fpl');
    a.trackEvent('affiliate_click', { partner: 'x' });
    expect(gtag).not.toHaveBeenCalled();

    // A later visit (fresh module) stays excluded.
    const again = await load();
    expect(again.analyticsAvailable()).toBe(false);
  });
});
