// ============================================================================
// src/components/intl/IntlGenderScope.tsx
//
// Wraps every International route with the side it shows: men's
// (/international/...) or women's (/international/women/...). It switches the
// loaders (intl_* or intlw_* views), the paths and the tournament list before
// the page renders, and puts the men's side back when the last women's page
// unmounts, so anything outside the section (trivia on the landing page)
// still reads the men's data. Routes give it key={gender} so moving between
// the two remounts the page and drops the other side's loaded data.
// ============================================================================

import { useLayoutEffect, type ReactNode } from 'react';
import { setIntlGender } from '../../lib/intlApi';
import type { IntlGender } from '../../lib/intlStats';

let womenMounted = 0;

export default function IntlGenderScope({ gender, children }: { gender: IntlGender; children: ReactNode }) {
  setIntlGender(gender); // before the page renders (render is idempotent)
  useLayoutEffect(() => {
    setIntlGender(gender);
    if (gender !== 'women') return;
    womenMounted += 1;
    return () => {
      womenMounted -= 1;
      // After the commit: moving between two women's pages unmounts one and
      // mounts the next in the same commit, and must not flip to men's between.
      queueMicrotask(() => {
        if (womenMounted === 0) setIntlGender('men');
      });
    };
  }, [gender]);
  return <>{children}</>;
}
