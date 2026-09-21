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

/* THE LEAGUE AS A LESSON. Every club is named for how it makes decisions,
   and its strength follows from that: the more a club uses evidence, the
   better it does. Reading the table teaches the site's premise without a
   word of explanation. Names are nods only -- no real person or company is
   portrayed or given lines.
   Two names per tier, drawn by season, so a new season is a new league
   without diluting this one. The top tier is fixed: Chief Scout United are
   always the benchmark. */
const TIERS=[
  {str:72,names:[["Chief Scout United","recruit entirely on the model"]]},
  {str:60,names:[["Billy's Beane United","run on a Moneyball budget"],["Moneyball Athletic","buy what the market undervalues"]]},
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
