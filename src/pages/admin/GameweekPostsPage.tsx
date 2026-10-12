// ============================================================================
// src/pages/admin/GameweekPostsPage.tsx
//
// /admin/gameweek -- the social text for each published gameweek preview
// and reflection (written by scripts/fpl_gameweek_report.py), with copy
// buttons. Chris posts from u/FixtureSharkBot himself; nothing is posted
// automatically. Published reports are public, so this page needs no
// write access; it's under /admin because it's a working tool, not content.
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { reportPath, seasonDisplay } from '../../lib/fplGameweekReport';
import { supabase } from '../../lib/supabase';

type PostRow = {
  season_label: string;
  fpl_event_id: number;
  kind: 'preview' | 'reflection';
  version: number;
  frozen: boolean;
  published_at: string | null;
  title: string;
  reddit_md: string | null;
  x_thread: string[] | null;
};

async function loadPosts(): Promise<PostRow[]> {
  const { data, error } = await supabase
    .from('fpl_gameweek_reports_latest' as never)
    .select('season_label,fpl_event_id,kind,version,frozen,published_at,title,reddit_md,x_thread')
    .order('published_at', { ascending: false })
    .limit(8);
  if (error) throw error;
  return (data as PostRow[] | null) ?? [];
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="text-xs font-mono uppercase tracking-widest rounded border border-pitch-700 px-2 py-1 text-pitch-800 hover:bg-pitch-700 hover:text-white"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export default function GameweekPostsPage() {
  useDocumentHead({ title: 'Gameweek posts', description: 'Reddit and X text for each gameweek preview and reflection.', path: '/admin/gameweek' });
  const { data, failed, loading } = useKeyedFetch('posts', loadPosts);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">Gameweek posts</h1>
        <p className="text-sm text-ink-500 mt-1 max-w-prose">Post from u/FixtureSharkBot. Check each subreddit&rsquo;s self-promotion rules first.</p>
      </header>
      {loading ? <p className="text-ink-500">Loading…</p> : null}
      {failed ? <p className="text-ink-700">Couldn&rsquo;t load the posts.</p> : null}
      {data && data.length === 0 ? <p className="text-ink-500">Nothing published yet.</p> : null}
      {(data ?? []).map((r) => {
        const path = reportPath(r.season_label, r.fpl_event_id, r.kind);
        const thread = r.x_thread ?? [];
        return (
          <section key={`${r.season_label}-${r.fpl_event_id}-${r.kind}`} className="rounded-lg border border-chalk-300 bg-white p-4 space-y-3">
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
              GW{r.fpl_event_id} {r.kind} <span className="text-ink-500">{seasonDisplay(r.season_label)} · v{r.version}{r.frozen ? ' · locked' : ''}</span>
            </h2>
            <p className="text-sm"><Link to={path} className="text-pitch-800 underline underline-offset-2">fixtureshark.com{path}</Link></p>
            {r.reddit_md ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-ink-900">Reddit</h3>
                  <CopyButton text={r.reddit_md} label="Copy" />
                </div>
                <textarea readOnly value={r.reddit_md} rows={10} className="w-full font-mono text-xs border border-chalk-300 rounded p-2 bg-chalk-100" />
              </div>
            ) : null}
            {thread.length ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-ink-900">X thread</h3>
                  <CopyButton text={thread.join('\n\n')} label="Copy all" />
                </div>
                <ol className="space-y-2">
                  {thread.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
                      <span className="font-mono text-xs text-ink-500 w-5 shrink-0">{i + 1}.</span>
                      <span className="flex-1">{t} <span className="font-mono text-xs text-ink-500">({t.length})</span></span>
                      <CopyButton text={t} label="Copy" />
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
