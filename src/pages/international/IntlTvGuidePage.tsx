// ============================================================================
// src/pages/international/IntlTvGuidePage.tsx
//
// /international/tv-guide (and /international/women/tv-guide) -- the shared
// WatchGuideView, as Football's, the NFL's and tennis's TV Guides (keep
// layouts consistent). This page maps the coming fixtures into the guide's
// shape with the viewing routes from the published UK rights
// (src/lib/intlWatch.ts) and model IP1's pick.
//
// Fixtures: only what the fixture feed holds (men's Nations League as of Oct
// 2026; no women's feed yet), so the intro says what's covered.
// ============================================================================

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import WatchGuideView from '../../components/WatchGuideView';
import { GenderSwitch } from '../../components/intl/IntlBits';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { INTL_HUB_PATH, INTL_TV_PATH, loadIntlUpcoming } from '../../lib/intlApi';
import { INTL_GENDER } from '../../lib/intlStats';
import { INTL_RULES_CHECKED, INTL_TV_SOURCES, intlGuideItem } from '../../lib/intlWatch';

export default function IntlTvGuidePage() {
  const women = INTL_GENDER === 'women';
  const { data, failed } = useKeyedFetch(`upcoming-${INTL_GENDER}`, loadIntlUpcoming);
  const fixtures = useMemo(() => (data ? data.fixtures.map((f) => intlGuideItem(f, (t) => data.confederation[t] ?? null)) : null), [data]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/international" className="hover:underline">International</Link>
          {women && (
            <>
              {' '}&middot; <Link to={INTL_HUB_PATH} className="hover:underline">Women</Link>
            </>
          )}
        </p>
        <GenderSwitch />
      </div>
      <WatchGuideView
        fixtures={failed ? [] : fixtures}
        error={failed ? 'Failed to load the TV guide' : null}
        title={women ? 'Women’s internationals on TV' : 'Internationals on TV'}
        teamPicker={false}
        intro={
          <>
            {women
              ? 'Coming women’s internationals and how to watch them live in the UK; times are UK time. ITV shows every Lionesses game free, the BBC shows Scotland, Wales and Northern Ireland, and the BBC and ITV share the 2027 Women’s World Cup. '
              : 'Coming internationals and how to watch them live in the UK; times are UK time. ITV shows every England game free, the BBC shows Scotland, Wales and Northern Ireland (home and away), and Prime Video shows the Republic of Ireland and selected other UEFA games pay-per-view. '}
            {`Fixtures listed: ${women ? 'none yet — there is no women’s fixture feed, so games appear once they are in the results' : 'the Nations League (from fixturedownload.com); friendlies and other competitions are added as a feed for them is found'}. `}
            {`Rights last checked ${INTL_RULES_CHECKED}: `}
            {INTL_TV_SOURCES.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ', '}
                <a href={s.url} className="underline" rel="nofollow noopener noreferrer" target="_blank">{s.label.split(':')[0]}</a>
              </span>
            ))}
            .
          </>
        }
        emptyText={women ? 'No women’s fixtures listed yet.' : 'No internationals listed in the coming weeks.'}
        head={{
          title: women ? 'Women’s internationals on TV — UK Watch Guide' : 'Internationals on TV — UK Watch Guide',
          description: women
            ? 'Coming women’s internationals in UK time, with how to watch them live in the UK: ITV for the Lionesses, the BBC for Scotland, Wales and Northern Ireland.'
            : 'Coming internationals in UK time, with how to watch them live in the UK: ITV for England, the BBC for Scotland, Wales and Northern Ireland, Prime Video for the rest.',
          path: INTL_TV_PATH,
        }}
      />
    </div>
  );
}
