// ============================================================================
// src/pages/email/EmailLandingPage.tsx   (/email)
//
// The sign-up page for FixtureShark email: injury alerts for your FPL team
// (supabase/migrations/20261122060000_fpl_injury_alerts.sql) plus FPL weekly.
// Shows what an alert and a weekly email look like. The page to link to from
// X and elsewhere. Static: prerendered with its body (entry-server HUB_BODIES).
// ============================================================================

import { Link } from 'react-router-dom';
import EmailSignup from '../../components/EmailSignup';
import { useDocumentHead } from '../../hooks/useDocumentHead';

export const EMAIL_LANDING_TITLE = 'FPL injury alerts by email';
export const EMAIL_LANDING_DESCRIPTION =
  'Free FPL injury alerts: an email within 15 minutes when FPL flags a player in your team, plus one email before each deadline.';

const H2 = 'font-display uppercase tracking-wide text-lg text-ink-900';
const P = 'text-ink-700';
const A = 'text-pitch-800 underline underline-offset-2 hover:text-ink-900';

/** A real alert, as sent (Raya, 21 Nov 2026), drawn as an email. */
function SampleAlert() {
  return (
    <figure className="rounded-lg border border-chalk-300 bg-white shadow-sm" data-testid="sample-alert">
      <div className="border-b border-chalk-300 px-4 py-2 text-sm">
        <p className="text-ink-500">From: FixtureShark</p>
        <p className="font-semibold text-ink-900">FPL flag: Raya 75%</p>
      </div>
      <div className="space-y-2 px-4 py-3 text-sm text-ink-900">
        <p className="text-ink-500">FixtureShark injury alert</p>
        <p className="font-semibold text-pitch-800">What FPL changed</p>
        <p className="text-ink-500">FPL has just changed the status of a player you have. Its own words are below.</p>
        <ul className="list-disc pl-5">
          <li>
            <span className="text-pitch-800 underline">Raya (ARS)</span> (GKP, £6.3m, 47.5% owned): now: Shoulder injury - 75% chance of
            playing · in your team
          </li>
        </ul>
      </div>
      <figcaption className="border-t border-chalk-300 px-4 py-2 text-xs text-ink-500">
        FPL added this flag at 19:00 on Saturday 21 November 2026, after Raya came off at Newcastle.
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
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">Injury alerts for your FPL team</h1>
        <p className={P}>
          FPL flags players at all hours: after a match, after a press conference, late on a Friday. We check FPL every 15 minutes and
          email you when one of your players is flagged, so you hear before most managers do. Plus one email before each deadline. Free.
        </p>
      </header>

      <EmailSignup heading="Sign up free" />

      <section className="space-y-3" aria-labelledby="sample-alert-h">
        <h2 id="sample-alert-h" className={H2}>What an alert looks like</h2>
        <p className={P}>
          One short email, in FPL&rsquo;s own words, showing what changed. If several of your players change at once they come in one email,
          and you&rsquo;ll get at most six a day. When a player is cleared you hear that too.
        </p>
        <SampleAlert />
      </section>

      <section className="space-y-3" aria-labelledby="weekly-h">
        <h2 id="weekly-h" className={H2}>The weekly email</h2>
        <p className={P}>Before each deadline, one email with:</p>
        <ul className="list-disc space-y-1 pl-5 text-ink-700">
          {WEEKLY.map(([t, d]) => <li key={t}><b className="text-ink-900">{t}</b>: {d}</li>)}
        </ul>
        <p className={P}>
          It&rsquo;s built from the same numbers as our <Link to="/fpl/gameweek" className={A}>gameweek preview</Link>.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="faq-h">
        <h2 id="faq-h" className={H2}>Questions</h2>
        <dl className="space-y-3 text-ink-700">
          <div>
            <dt className="font-semibold text-ink-900">How do you know my players?</dt>
            <dd>
              From your FPL team ID: the number in your team&rsquo;s web address on the FPL site (fantasy.premierleague.com/entry/1234567/&hellip;).
              We read your squad from the public FPL website when a player is flagged. You can also pick up to 20 players to watch.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-900">Where do the flags come from?</dt>
            <dd>Straight from FPL. We report what FPL says, word for word, and never guess at injuries.</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-900">How do I stop it?</dt>
            <dd>
              Every email has a one-click unsubscribe and a link to turn alerts off. See our <Link to="/privacy" className={A}>privacy notice</Link>.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
