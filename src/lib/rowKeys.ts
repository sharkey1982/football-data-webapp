// ============================================================================
// src/lib/rowKeys.ts
//
// Keyboard access for a clickable table row or list item (audit 22 Oct 2026,
// S-12): these rows hold links or cells of their own, so they can't become a
// <button> or <a>. tabIndex puts them in the tab order (the global
// :focus-visible ring shows where you are) and Enter or Space does what a
// click does. Keys pressed on a link or button inside the row are left alone.
// ============================================================================

import type { KeyboardEvent } from 'react';

export function rowKeys(onActivate: () => void, enabled = true) {
  if (!enabled) return {};
  return {
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onActivate();
    },
  };
}
