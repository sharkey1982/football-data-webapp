// ============================================================================
// src/components/WatchOptions.tsx
//
// The answer to "can I watch this live in the UK, and how?" for one
// fixture: a headline state, then every viewing route grouped by what it
// costs (free first), each with what it takes to watch. Provenance
// (source, verified date) sits behind a disclosure, not in the main line.
// Shared by the TV Guide and the match page so both say the same thing.
// ============================================================================

import { Link } from 'react-router-dom';
import { resolveCommercialLink, type AffiliatePartner } from '../lib/commercialLinks';
import { trackEvent } from '../lib/analytics';
import {
  fixtureWatchState,
  offerAlsoVia,
  offerName,
  offerRequirement,
  stateHeadline,
  TIER_LABEL,
  verification,
  type WatchOffer,
} from '../lib/watchGuide';

type Props = {
  offers: WatchOffer[] | undefined;
  partners: AffiliatePartner[];
  fixtureId: number;
  page: 'tv_guide' | 'match_page';
};

const headlineClass: Record<string, string> = {
  free: 'text-pitch-800',
  watch: 'text-ink-900',
  not_live: 'text-ink-700',
  unknown: 'text-ink-500',
};

export default function WatchOptions({ offers, partners, fixtureId, page }: Props) {
  const state = fixtureWatchState(offers);
  const tone = state.kind === 'watch' ? (state.best === 'free' || state.best === 'free_compatible_device' ? 'free' : 'watch') : state.kind;
  const provenance = (offers ?? [])
    .map((o) => ({ o, v: verification(o.verifiedAt) }))
    .filter((x) => x.o.source || x.o.sourceUrl);

  return (
    <div>
      <p className={`text-xs font-mono uppercase tracking-widest ${headlineClass[tone]}`}>{stateHeadline(state)}</p>
      {state.kind === 'watch' && (
        <div className="mt-1 space-y-1.5">
          {state.groups.map((g) => (
            <div key={g.tier}>
              {state.groups.length > 1 && <p className="text-[11px] text-ink-500 uppercase tracking-wide">{TIER_LABEL[g.tier]}</p>}
              <ul className="space-y-0.5">
                {g.offers.map((o) => {
                  const also = offerAlsoVia(o);
                  const link = o.watchUrl ? resolveCommercialLink(o.watchUrl, partners) : null;
                  return (
                    <li key={o.broadcastId} className="text-sm leading-snug">
                      <span className="font-medium text-ink-900">{offerName(o)}</span>
                      <span className="text-ink-500"> &middot; {offerRequirement(o)}</span>
                      {also.length > 0 && <span className="text-ink-500"> &middot; also via {also.join(', ')}</span>}
                      {link && (
                        <>
                          {' '}&middot;{' '}
                          <a
                            href={link.url}
                            className="text-pitch-800 underline underline-offset-2"
                            rel={link.isAffiliate ? 'sponsored noopener noreferrer' : 'nofollow noopener noreferrer'}
                            onClick={() => {
                              if (link.isAffiliate) {
                                trackEvent('affiliate_click', {
                                  partner: link.partner?.name ?? '',
                                  category: 'streaming',
                                  fixture_id: fixtureId,
                                  page,
                                  destination: o.watchUrl ?? '',
                                });
                              }
                            }}
                          >
                            Watch
                          </a>
                          {link.isAffiliate && (
                            <Link to="/affiliate-disclosure" className="text-[10px] text-ink-500 ml-1 underline" title="Affiliate link -- see our affiliate disclosure">
                              Ad
                            </Link>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {provenance.length > 0 && (
        <details className="mt-1 text-[11px] text-ink-500">
          <summary className="cursor-pointer select-none">
            {provenance[0].v?.label ?? 'Source'}
            {provenance.some((p) => p.v?.stale) && <span className="text-loss-700"> &middot; may be out of date</span>}
          </summary>
          <ul className="mt-1 space-y-0.5">
            {provenance.map(({ o, v }) => (
              <li key={o.broadcastId}>
                {offerName(o)}: {o.sourceUrl ? (
                  <a href={o.sourceUrl} className="underline" rel="nofollow noopener noreferrer" target="_blank">{o.source ?? 'source'}</a>
                ) : o.source}
                {v && <> &middot; {v.label}</>}
                {o.availabilityNotes && <> &middot; {o.availabilityNotes}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
