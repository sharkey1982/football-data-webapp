// ============================================================================
// src/pages/StagePage.tsx
//
// One stage of one theme (e.g. /football/discover). Renders entirely
// from the journey config, so all eight stage pages share one component
// -- there's no per-page markup to drift apart, and adding a link to a
// stage is a config edit rather than a code change.
//
// This is the page that holds what the hub boxes used to: the fuller
// explanation, and every destination within that stage with a line on
// why you'd open it.
// ============================================================================

import { Link, useParams } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { THEMES, type StageKey, type ThemeKey } from '../lib/journey';

export default function StagePage({ themeKey }: { themeKey: ThemeKey }) {
  const { stage: stageKey } = useParams<{ stage: string }>();
  const theme = THEMES[themeKey];
  const stage = theme.stages.find((s) => s.key === (stageKey as StageKey));

  useDocumentHead({
    title: stage ? `${stage.title} \u2014 ${theme.title}` : theme.title,
    description: stage?.intro ?? theme.intro,
    path: stage ? `${theme.hubPath}/${stage.key}` : theme.hubPath,
  });

  if (!stage) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Not found</h1>
        <p className="text-ink-700 mt-2">
          No such section.{' '}
          <Link to={theme.hubPath} className="text-pitch-800 underline underline-offset-2">
            Back to {theme.title}
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">{theme.title}</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">{stage.title}</h1>
        <p className="text-ink-700 mt-2 max-w-prose">{stage.intro}</p>
        {stage.note && <p className="text-ink-500 text-sm mt-2 italic max-w-prose">{stage.note}</p>}
      </header>

      <section>
        <ul className="space-y-2">
          {stage.links.map((link) => (
            <li key={link.to + link.label}>
              <Link
                to={link.to}
                className="group block border border-chalk-300 hover:border-pitch-700 rounded-lg bg-white p-4 transition-colors"
              >
                <span className="font-display uppercase tracking-wide text-base text-pitch-800 group-hover:text-pitch-700">
                  {link.label}
                </span>
                {link.blurb && <p className="text-ink-700 text-sm mt-0.5">{link.blurb}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-label="Other sections" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm border-t border-chalk-300 pt-4">
        {theme.stages
          .filter((s) => s.key !== stage.key)
          .map((s) => (
            <Link
              key={s.key}
              to={`${theme.hubPath}/${s.key}`}
              className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2"
            >
              {s.title}
            </Link>
          ))}
      </nav>
    </article>
  );
}
