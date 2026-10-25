// ============================================================================
// src/lib/fplIdStore.ts
//
// The visitor's FPL ID, remembered in this browser (localStorage) and shared
// by the FPL home page, Rate My Team and FPL Live. Storage can be blocked
// (private windows, strict settings): every call fails quietly and the pages
// still work from the ID in the URL.
// ============================================================================

const STORAGE_KEY = 'fixtureshark.fplId';

export function readStoredFplId(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY) ?? '';
    return /^\d{1,9}$/.test(v) ? v : '';
  } catch {
    return '';
  }
}

export function storeFplId(id: string): void {
  try {
    if (/^\d{1,9}$/.test(id)) localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable: the URL still carries the id */
  }
}

export function forgetFplId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to forget */
  }
}
