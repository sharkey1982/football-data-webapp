// ============================================================================
// src/components/GameCard.tsx
//
// A door into one of the Beat the Shark games. The games are NOT part of
// this React app: they are their own Netlify site, proxied in at
// /play/beat-the-shark/. So this is a plain <a>, never a router <Link> --
// a Link would look for a /play route inside the app, find none, and show
// "not found". Keep the trailing slash: without it the game's scripts
// resolve to the wrong folder (the game corrects this itself, but linking
// to the right address saves a redirect).
// ============================================================================

export interface BeatTheSharkGame {
  href: string;
  title: string;
  blurb: string;
  kicker: string;
}

export const BEAT_THE_SHARK = {
  football: {
    href: '/play/beat-the-shark/',
    title: 'Beat the Shark',
    blurb: 'Pick the team, manage the money, and win the league.',
    kicker: 'Play · five minutes',
  },
  nfl: {
    href: '/play/beat-the-shark/nfl/',
    title: 'Beat the Shark: NFL',
    blurb: 'Call the game plans and the fourth downs, keep the money out of the red, and win the division.',
    kicker: 'Play · ten minutes',
  },
} satisfies Record<string, BeatTheSharkGame>;

export function GameCard({ game }: { game: BeatTheSharkGame }) {
  return (
    <a
      href={game.href}
      className="group block border-2 border-amber-500/60 hover:border-amber-400 rounded-lg bg-pitch-900 hover:bg-pitch-800 p-4 sm:p-6 transition-all hover:shadow-[0_0_30px_rgba(227,180,85,0.25)]"
    >
      <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">{game.kicker}</p>
      <h2 className="font-display uppercase tracking-wide text-2xl sm:text-3xl text-chalk-100 group-hover:text-amber-400 transition-colors mt-1">
        {game.title}
      </h2>
      <p className="text-chalk-300 mt-2 max-w-prose">{game.blurb}</p>
    </a>
  );
}
