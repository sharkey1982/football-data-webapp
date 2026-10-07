// ============================================================================
// src/pages/international/IntlWomenHub.tsx
//
// /international/women -- the women's side of the International section. The
// men's side has a hub and a Discover stage; the women's lists its pages here
// directly (same five pages, women's data: intlw_* views, scripts/intl_import.py
// --women). Wrapped in IntlGenderScope gender="women" by the route.
// ============================================================================

import { Link } from 'react-router-dom';
import { GenderSwitch } from '../../components/intl/IntlBits';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { INTL_CLUBS_PATH, INTL_FIXTURES_PATH, INTL_HISTORY_PATH, INTL_TEAMS_PATH, INTL_TOURNAMENTS_PATH, INTL_TV_PATH } from '../../lib/intlApi';
import { DATA_NOTE } from '../../lib/intlStats';

const INTRO =
  'Every women’s international since 1956: results and fixtures with the favourite on the day, every nation’s record and rating, and every Women’s World Cup, Olympic tournament, Euro, Copa América, WAFCON, Asian Cup and Nations League.';

export default function IntlWomenHub() {
  useDocumentHead({
    title: 'Women’s international football — results since 1956, nations and tournaments',
    description: INTRO,
    path: '/international/women',
  });
  const links = [
    { label: 'Fixtures & Results', to: INTL_FIXTURES_PATH, blurb: 'Every women’s international day by day: the upsets, and each coming game’s chances and likeliest score; filter to one nation.' },
    { label: 'TV Guide', to: INTL_TV_PATH, blurb: 'Coming women’s internationals and how to watch them live in the UK.' },
    { label: 'Your Team', to: INTL_TEAMS_PATH, blurb: 'Any nation’s current squad, record, rating, tournament history and head-to-heads.' },
    { label: 'Tournaments', to: INTL_TOURNAMENTS_PATH, blurb: 'Every Women’s World Cup, Olympics, Euro, Copa América, WAFCON, Asian Cup, CONCACAF W Championship and Nations League: brackets, groups and the race for titles.' },
    { label: 'Club Call-ups', to: INTL_CLUBS_PATH, blurb: 'Which clubs and leagues supply the most internationals, and how many of each squad play abroad.' },
    { label: 'Through Time', to: INTL_HISTORY_PATH, blurb: 'The world’s top ten year by year since 1956, every world number one, and the biggest tournament upsets.' },
  ];
  return (
    <article className="space-y-6" data-testid="intl-women-hub">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
            <Link to="/international" className="hover:underline">International</Link> &middot; Women
          </p>
          <GenderSwitch />
        </div>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">Women’s internationals</h1>
        <p className="text-ink-700 max-w-prose">{INTRO}</p>
      </header>

      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="group block border border-chalk-300 hover:border-pitch-700 rounded-lg bg-white p-4 transition-colors">
              <span className="font-display uppercase tracking-wide text-base text-pitch-800 group-hover:text-pitch-700">{link.label}</span>
              <p className="text-ink-700 text-sm mt-0.5">{link.blurb}</p>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-ink-500 max-w-prose">{DATA_NOTE}</p>
    </article>
  );
}
