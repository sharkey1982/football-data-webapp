// ============================================================================
// src/pages/email/EmailLandingPage.tsx   (/email)
//
// The sign-up page for FixtureShark email: FPL weekly plus late injury news
// 6 hours before each deadline (supabase/migrations/20261122080000_late_injury_news.sql).
// Shows what the weekly email and a late-news email look like. The page to link to from
// X and elsewhere. Static: prerendered with its body (entry-server HUB_BODIES).
// ============================================================================

import { Link } from 'react-router-dom';
import EmailSignup from '../../components/EmailSignup';
import { useDocumentHead } from '../../hooks/useDocumentHead';

export const EMAIL_LANDING_TITLE = 'FPL email: your team before every deadline';
export const EMAIL_LANDING_DESCRIPTION =
  'A free FPL email before each deadline about your own team, plus late injury news 6 hours before the deadline if FPL flags one of your players.';

const H2 = 'font-display uppercase tracking-wide text-lg text-ink-900';
const P = 'text-ink-700';
const A = 'text-pitch-800 underline underline-offset-2 hover:text-ink-900';

/** Late injury news, drawn as an email (Raya's real flag, 21 Nov 2026). */
function SampleAlert() {
  return (
    <figure className="rounded-lg border border-chalk-300 bg-white shadow-sm" data-testid="sample-alert">
      <div className="border-b border-chalk-300 px-4 py-2 text-sm">
        <p className="text-ink-500">From: FixtureShark</p>
        <p className="font-semibold text-ink-900">GW12 late news: Raya 75%</p>
      </div>
      <div className="space-y-2 px-4 py-3 text-sm text-ink-900">
        <p className="text-ink-500">FixtureShark late injury news</p>
        <p className="font-semibold text-pitch-800">What FPL changed since your weekly email</p>
        <p className="text-ink-500">FPL&rsquo;s own words. The GW12 deadline is Fri 27 Nov, 18:30 (UK time).</p>
        <ul className="list-disc pl-5">
          <li>
            <span className="text-pitch-800 underline">Raya (ARS)</span> (GKP, £6.3m, 47.5% owned): now: Shoulder injury - 75% chance of
            playing · in your team
          </li>
        </ul>
      </div>
      <figcaption className="border-t border-chalk-300 px-4 py-2 text-xs text-ink-500">
        An example built from a real flag: FPL added it at 19:00 on Saturday 21 November 2026, after Raya came off at Newcastle.
      </figcaption>
    </figure>
  );
}

const WEEKLY = [
  ['Your team', 'flagged players, price moves and the best captain in your own squad'],
  ['Captain', 'our pick for the gameweek and the chance each option tops the scoring'],
  ['Who to think about changing', 'players whose fixtures or minutes have turned'],
  ['Minutes risks', 'starters we think may not start or may not last 60'],
  ['Your watchlist', 'price, fitness, start chance and fixtures for players you’re eyeing'],
  ['Price moves', 'who is likely to rise or fall tonight'],
];

export default function EmailLandingPage() {
  useDocumentHead({ title: EMAIL_LANDING_TITLE, description: EMAIL_LANDING_DESCRIPTION });
  return (
    <div className="max-w-3xl space-y-8" data-testid="email-landing">
      <header className="space-y-2">
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">Your FPL team, before every deadline</h1>
        <p className={P}>
          One email before each deadline about your own team: who&rsquo;s flagged, who to captain, who to think about changing and whose price
          is moving. Then, 6 hours before the deadline, a short update if FPL has changed any of your players since. Free.
        </p>
      </header>

      <EmailSignup heading="Sign up free" />

      <section className="space-y-3" aria-labelledby="sample-alert-h">
        <h2 id="weekly-h" className={H2}>The weekly email</h2>
        <p className={P}>Before each deadline, one email with:</p>
        <ul className="list-disc space-y-1 pl-5 text-ink-700">
          {WEEKLY.map(([t, d]) => <li key={t}><b className="text-ink-900">{t}</b>: {d}</li>)}
        </ul>
        <p className={P}>
          It&rsquo;s built from the same numbers as our <Link to="/fpl/gameweek" className={A}>gameweek preview</Link>.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="sample-alert-h">
        <h2 id="sample-alert-h" className={H2}>Late injury news</h2>
        <p className={P}>
          Six hours before the deadline, one short email if FPL has changed a player in your team or on your watchlist since the weekly
          email, in FPL&rsquo;s own words. If nothing has changed, you get nothing. When a player is cleared you hear that too.
        </p>
        <SampleAlert />
      </section>

      <section className="space-y-3" aria-labelledby="faq-h">
        <h2 id="faq-h" className={H2}>Questions</h2>
        <dl className="space-y-3 text-ink-700">
          <div>
            <dt className="font-semibold text-ink-900">How do you know my players?</dt>
            <dd>
              From your FPL team ID: the number in your team&rsquo;s web address on the FPL site (fantasy.premierleague.com/entry/1234567/&hellip;).
              We read your squad from the public FPL website when each email is made. You can also pick up to 20 players to watch.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-900">Where do the flags come from?</dt>
            <dd>Straight from FPL. We report what FPL says, word for word, and never guess at injuries.</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-900">How do I stop it?</dt>
            <dd>
              Every email has a one-click unsubscribe and a link to turn the late news off. See our <Link to="/privacy" className={A}>privacy notice</Link>.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
