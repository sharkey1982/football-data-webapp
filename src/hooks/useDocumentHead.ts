// ============================================================================
// src/hooks/useDocumentHead.ts
//
// Sets document.title, <meta name="description">, and a canonical <link>
// for whichever page calls it, restoring the previous values on unmount so
// navigating between two client-side routes never leaves a stale tag from
// the last one behind.
//
// This is a deliberately dependency-free stand-in for react-helmet-async:
// it's what a crawler that executes JS (or a browser tab/bookmark/social
// share of a client-side navigation) sees today. It does NOT solve
// crawlability for a crawler that doesn't execute JS -- that needs the
// prerendering/SSG pass (tracked separately, NEXT phase) to emit these same
// tags server-side into the initial HTML. Apply this hook to a page now and
// it keeps working unmodified once that page is also prerendered.
// ============================================================================

import { useEffect } from 'react';
import { BRAND_NAME, absoluteUrl } from '../lib/siteConfig';

type DocumentHeadOptions = {
  /** Page-specific title. Rendered as "<title> | BRAND_NAME" unless raw is true. */
  title: string;
  /** Skip the " | BRAND_NAME" suffix -- e.g. for a homepage that already includes it. */
  raw?: boolean;
  /** Meta description content. Omit to leave whatever description is already set. */
  description?: string;
  /** App-relative path (e.g. "/fpl/gameweek/5") for the canonical <link>. Omit to leave canonical unmanaged for this route. */
  path?: string;
  /** A schema.org object (e.g. BroadcastEvent) to emit as a <script type="application/ld+json">.
   * Same crawlability caveat as the rest of this hook: real browsers and JS-executing crawlers
   * see it today; a non-JS crawler needs the prerendering pass this file's header already flags. */
  jsonLd?: object;
};

export function useDocumentHead({ title, raw = false, description, path, jsonLd }: DocumentHeadOptions) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = raw ? title : `${title} | ${BRAND_NAME}`;

    let descriptionTag: HTMLMetaElement | null = null;
    let previousDescription: string | null = null;
    if (description) {
      descriptionTag = document.querySelector('meta[name="description"]');
      if (!descriptionTag) {
        descriptionTag = document.createElement('meta');
        descriptionTag.setAttribute('name', 'description');
        document.head.appendChild(descriptionTag);
      }
      previousDescription = descriptionTag.getAttribute('content');
      descriptionTag.setAttribute('content', description);
    }

    let canonicalTag: HTMLLinkElement | null = null;
    let previousCanonical: string | null = null;
    let createdCanonical = false;
    if (path) {
      canonicalTag = document.querySelector('link[rel="canonical"]');
      if (!canonicalTag) {
        canonicalTag = document.createElement('link');
        canonicalTag.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalTag);
        createdCanonical = true;
      }
      previousCanonical = canonicalTag.getAttribute('href');
      canonicalTag.setAttribute('href', absoluteUrl(path));
    }

    let jsonLdTag: HTMLScriptElement | null = null;
    if (jsonLd) {
      jsonLdTag = document.createElement('script');
      jsonLdTag.setAttribute('type', 'application/ld+json');
      jsonLdTag.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(jsonLdTag);
    }

    return () => {
      document.title = previousTitle;
      if (descriptionTag) {
        if (previousDescription === null) {
          descriptionTag.remove();
        } else {
          descriptionTag.setAttribute('content', previousDescription);
        }
      }
      if (canonicalTag) {
        if (createdCanonical || previousCanonical === null) {
          canonicalTag.remove();
        } else {
          canonicalTag.setAttribute('href', previousCanonical);
        }
      }
      // Always created fresh (never reuses an existing tag, unlike
      // description/canonical), so always removed fresh -- no restore case.
      jsonLdTag?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, raw, description, path, JSON.stringify(jsonLd)]);
}
