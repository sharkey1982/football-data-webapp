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
const CLUB_SENS=14,BAL_WEIGHT=1.1;

/* Red cards: chance per match of one for the opposition, for you, and for
   you when the Hot Head is in your XI. */
/* Rare on purpose: a red card is an incident, roughly once a season, not a
   regular coin flip. Randomness that decides a result AFTER you have chosen
   erodes the sense that decisions matter, so it is kept scarce. */
const RED_THEM=.05,RED_US=.025,RED_US_HOTHEAD=.07;

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
const SEASON_SWING=5;

/* How much the set-piece taker's skill and the XI's aerial threat add to
   attacking lean. */
const SP_WEIGHT=.8,AER_WEIGHT=.35;

/* HOW GOOD THE SHARK IS. The Shark predicts a WELL-RUN club with your squad:
   sensible formations, plus the value of sensible decisions, expressed here
   as strength. This is a deliberate difficulty setting, chosen so that a
   competent manager beats the Shark about 6 times in 10 and a careless one
   2-3 times in 10 -- beatable, but earned, and a model worth respecting.
   Measured by test/checks.cjs; re-measure if the decision effects change. */
const SHARK_UPLIFT=3.5;

/* HOME ADVANTAGE, taken from FixtureShark's real Dixon-Coles model (fit run
   92: home_advantage 0.175, so the home side scores exp(0.175) = 1.19x the
   goals). Applied the way that model applies it: the HOME side's expected
   goals are multiplied, and nothing is taken off the away side. The game
   previously used its own symmetric +/-5 strength points, which came out at
   about 1.29x -- stronger than the real thing, and differently shaped. */
const HOME_MULT=1.19;

/* LEVELS: how much of the game you meet at once -- NOT how hard it is. The
   Shark's target is identical at every level, so scores stay comparable and
   the model never changes depending on who is playing.
   unlock = how many full matches must have been played before a lever
   appears. Beginner meets one new idea per full match (progressive
   disclosure: novices learn interacting ideas far better one at a time);
   until then the game uses competent defaults, so nobody is penalised for
   not having every lever yet. */
const LEVELS={
  beginner:{name:"Beginner",
    unlock:{formation:0,rotation:1,setpieces:2,oop:3}},
  intermediate:{name:"Intermediate",
    unlock:{formation:0,rotation:0,setpieces:0,oop:0}},
  guru:{name:"Advanced",
    unlock:{formation:0,rotation:0,setpieces:0,oop:0},guru:true}
};
let LEVEL="beginner";

/* PACING (Chris's playtest: "too fast to follow"). Measured: live commentary
   showed a line every 0.8-1.0s and 3pm results every 1.5s -- two to three
   times reading speed (a 10-word line needs ~2.5s at 250 words a minute),
   with the whole table re-sorting after every result. Base delays below are
   per commentary line / per result at "normal"; the speed setting scales
   them. Beginners start on "slow". Players can change speed, or skip to full
   time, while it runs -- skipping always stops at a half-time decision. */
const PACE={commentaryMs:2200,quickCommentaryMs:1300,speeds:{slow:1.35,normal:1,fast:.45}};
let SPEED=null; // the player's choice this session; null = the level's default
function speedName(){return SPEED||(LEVEL==="beginner"?"slow":"normal")}
function speedFactor(){return PACE.speeds[speedName()]}

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
   without diluting this one. The top tier is fixed: Shark Scout United are
   always the benchmark. */
const TIERS=[
  {str:70,names:[["Shark Scout United","recruit entirely on the Shark's model"]]},
  {str:62,names:[["Billy's Beane United","run on a Moneyball budget"],["Moneyball Athletic","buy what the market undervalues"]]},
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
