/* ===========================================================================
   config.js — every number that decides how the game plays.

   Loaded FIRST. Change these to rebalance the game, then run
     node games/beat-the-shark/test/checks.cjs
   and the balance checks will say whether the design still holds.
   =========================================================================== */

/* How hard delayed consequences land (multiplier), and how far an
   immediate effect can stray from its stated estimate (+/-). Tuned so
   that thinking ahead beats greedy play roughly 3:1. */
const DELAY_AMP=2.4,NOISE=.26;

/* How steeply Your Team's results respond to a strength gap (lower =
   steeper), and how much the XI's attacking/defensive lean counts. Both
   raised after playtesting found decisions were not moving results enough. */
const CLUB_SENS=16,BAL_WEIGHT=1.1;

/* Red cards: chance per match of one for the opposition, for you, and for
   you when the Hot Head is in your XI. */
const RED_THEM=.11,RED_US=.05,RED_US_HOTHEAD=.14;

/* The wear the Shark's prediction assumes: season-long average squad fatigue
   and player condition for a side that simply plays its fixtures, measured
   from the engine. If the fatigue or condition rules change, re-measure these
   rather than tuning them to make a check pass. */
const SEASON_WEAR={fatigue:35,condition:76};

/* Every club, yours included, gets a hidden season-long swing of up to this
   many strength points either way: the seasons where a side over- or
   under-performs for reasons nobody controls. Symmetric, so it biases no
   one -- but the Shark's prediction cannot see it, which is the point: it is
   what makes a season genuinely uncertain rather than a rerun. */
const SEASON_SWING=10;

/* The main FixtureShark site. Links from the game always use this ABSOLUTE
   address, because the game is reachable two ways -- proxied at
   /play/beat-the-shark/ on the main domain, and directly on its own Netlify
   site -- and a relative link like "/team-strength" would only work in the
   first. If the site moves to a custom domain, change it here (and the
   canonical/og:url tags in index.html). */
const SITE="https://footballdatashark.netlify.app";

/* THE LEAGUE AS A LESSON. Every club is named for how it makes decisions,
   and its strength follows from that: the more a club uses evidence, the
   better it does. Reading the table teaches the site's premise without a
   word of explanation. Names are nods only -- no real person or company is
   portrayed or given lines.
   Two names per tier, drawn by season, so a new season is a new league
   without diluting this one. The top tier is fixed: Chief Scout United are
   always the benchmark. */
const TIERS=[
  {str:76,names:[["Chief Scout United","recruit entirely on the model"]]},
  {str:64,names:[["Billy's Beane United","run on a Moneyball budget"],["Moneyball Athletic","buy what the market undervalues"]]},
  {str:52,names:[["Star Lizard","a syndicate that prices every match"],["Expected Goals Wanderers","trust the xG, eventually"]]},
  {str:44,names:[["Gut Feeling Town","sign whoever looked good on Saturday"],["Old School Rovers","do it the way it has always been done"]]},
  {str:35,names:[["No Stats FC","have never opened a spreadsheet"],["Whim FC","decide everything on the day"]]}
];

/* FORMATIONS. Each trades attack for defence in strength points. This is
   what lets a formation change, a goal bonus or a striker pushed up front
   pull the two in opposite directions -- which a single strength number
   could never express. */
const FORMATIONS={
  "4-4-2":{att:0,def:0,d:"Balanced"},
  "4-3-3":{att:8,def:-7,d:"Front three, thin in midfield"},
  "3-5-2":{att:4,def:-3,d:"Wing-backs, crowded middle"},
  "4-5-1":{att:-5,def:7,d:"Compact, one up top"},
  "5-3-2":{att:-8,def:10,d:"Five at the back"}
};
