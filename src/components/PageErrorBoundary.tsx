// ============================================================================
// src/components/PageErrorBoundary.tsx
//
// Catches a page that throws while rendering, so the header and menu stay
// and the visitor gets a way out, instead of React unmounting the whole site
// to a blank screen (audit 22 Oct 2026, S-02). Keyed on the path by its
// caller, so navigating elsewhere clears the error.
//
// A failed lazy-chunk load (a tab left open across a deploy, whose old
// hashed files are gone) is the commonest cause, so that case reloads once.
// ============================================================================

import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_FLAG = 'fs-chunk-reload';

/** True for the errors a stale tab gets when a deploy has removed the
 *  page's JavaScript file. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(msg);
}

/** Reload once for a stale chunk; never loop. */
export function reloadOnceForStaleChunk(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

type State = { error: unknown };

/** One short line a visitor can screenshot (28 Oct 2026: the home page failed on
 *  Chris's phone and nothing said why). The page path and a timestamp help match
 *  it to a deploy. */
function errorText(err: unknown): string {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const where = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
  return `${msg.slice(0, 300)} (${where}, ${new Date().toISOString().slice(0, 16)}Z)`;
}

export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Page failed to render', error, info.componentStack);
    if (isChunkLoadError(error)) reloadOnceForStaleChunk();
  }

  render() {
    if (this.state.error == null) return this.props.children;
    return (
      <div role="alert" className="border border-chalk-300 rounded-lg bg-white p-6 space-y-3 max-w-prose">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">This page didn&rsquo;t load</h1>
        <p className="text-ink-700">Something went wrong showing this page. Reloading usually fixes it.</p>
        <details className="text-xs text-ink-500">
          <summary className="cursor-pointer">What went wrong</summary>
          <p className="mt-1 font-mono break-words" data-testid="page-error-detail">{errorText(this.state.error)}</p>
        </details>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded bg-amber-500 hover:bg-amber-400 text-ink-900 font-medium px-4 py-2 min-h-11"
          >
            Reload
          </button>
          <a href="/" className="rounded border border-chalk-300 px-4 py-2 min-h-11 inline-flex items-center text-pitch-800">
            Home page
          </a>
        </div>
      </div>
    );
  }
}
