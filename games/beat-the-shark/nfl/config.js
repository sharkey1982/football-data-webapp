/* ===========================================================================
   nfl/config.js — every number that decides how the NFL game plays.

   Change these to rebalance the game, then run
     node games/beat-the-shark/nfl/test/checks.cjs
   and the balance checks say whether the design still holds.
   =========================================================================== */

/* THE DIVISION AS A LESSON, as in the football game: every team is named for
   how it makes decisions, and its strength follows from that. Two names per
   tier, drawn by season. The top tier is fixed: the Stingrays are always the
   final boss. Names are nods only; no real person or team is portrayed.
   style = what their offence leans on; weak = what their defence can't stop. */
const TIERS=[
  {str:74,names:[["Shark Scout Stingrays","every call straight from the model","balanced","pass"]]},
  {str:62,names:[["Fourth Down Bots","go for it on every fourth down","pass","run"],["Moneyball Mustangs","pay for what the market undervalues","balanced","run"]]},
  {str:53,names:[["Air Raid Academy","throw it on every down","pass","run"],["Spread Sheet Spartans","trust the numbers, eventually","pass","pass"]]},
  {str:45,names:[["Establish The Run Rangers","run it until it works","run","pass"],["Old School Outlaws","do it the way it has always been done","run","run"]]},
  {str:36,names:[["Punt Formation Pilgrims","punt on fourth and inches","run","pass"],["Gut Feeling Gators","call whatever felt right last week","balanced","run"]]}
];

/* Your Team: a mid-table roster. The Shark predicts it about 3rd. */
const MY_BASE=54;

/* GAME PLANS: the share of run plays. Running is safer (fewer turnovers,
   fewer big plays); passing is riskier and more explosive. */
const PLANS={
  run:{name:"Run-led",run:.78},
  balanced:{name:"Balanced",run:.5},
  pass:{name:"Pass-led",run:.22}
};

/* A defence's weak side gives up this many rating points on those plays;
   its strong side gains a third as many. Raised (with the plans' spread)
   after the first balance run found the game plan barely moved results. */
const WEAK_SIDE=16;

/* THE DRIVE. Each drive ends in a touchdown, field goal, punt or turnover.
   Base rates at an even match-up are the NFL's (about 22 points a team a
   game); TD_K etc. are how steeply they move with the rating gap (edge). */
const DRIVE={td:.205,fg:.155,to:.115,TD_K:.0135,FG_K:.006,TO_K:.012,
  passTd:.1,   // extra TD rate per unit of pass share above a balanced mix
  passTo:.4,   // extra turnover rate likewise
  xp:.94};     // extra points made

/* Possessions a team gets in each half (each team draws one of these). */
const DRIVES_PER_HALF=[5,6];

/* Field position after a drive ends, as rating points on the NEXT drive:
   a punt pins them back; a turnover or a failed fourth down hands them a
   short field. */
const FIELD={punt:-3,to:4,fourthFail:10,missedFg:5};

/* HOME EDGE. The real model's home advantage is 45 Elo points, 1.8 points
   of margin (NFL_DATA.homePoints, from data.js). HOME_E is the rating edge
   that produces that margin in this engine; the checks measure it. */
const HOME_E=6.0;

/* Every team gets a hidden season-long swing of up to this many rating
   points either way: the seasons nobody can predict. The Shark can't see it. */
const SEASON_SWING=4;

/* HOW GOOD THE SHARK IS. It predicts a WELL-RUN Your Team: the right game
   plan, the right fourth-down calls, sensible half-time calls, expressed as
   rating points. It only sets the prediction shown to the player (where
   Your Team should finish); nothing is scored against it. */
const SHARK_UPLIFT=1;

/* Morale (-10..+10) adds this many rating points per point to both sides
   of the ball. */
const MORALE_W=.35;

/* FOURTH DOWNS: conversion chance by yards to go (1-5), before the edge. */
const FOURTH_CONVERT=[0,.70,.59,.53,.48,.44];
/* Field goal chance by kick distance (yards), before the kicker. */
function fgChance(dist,kick){const base=dist<=40?.92:dist<=45?.86:dist<=50?.76:dist<=55?.62:dist<=60?.42:.22;
  return clamp(base+(kick-60)*.004,.05,.97)}

/* LEVELS: how much of the game you meet at once, not how hard it is.
   unlock = full games played before a lever appears. */
const LEVELS={
  beginner:{name:"Beginner",games:5,neutral:true,unlock:{plan:0,half:1,fourth:2,report:3,twopt:99}},
  intermediate:{name:"Intermediate",games:10,neutral:false,unlock:{plan:0,half:0,fourth:0,report:0,twopt:99}},
  guru:{name:"Advanced",games:10,neutral:false,unlock:{plan:0,half:0,fourth:0,report:0,twopt:0},guru:true}
};

/* Fourth-down calls per game, once unlocked. */
const FOURTHS_PER_GAME={beginner:1,intermediate:2,guru:2};

/* MONEY ($m), as in the football game: not scored, but it has to be
   managed. Every game the payroll goes out with one chance card; the gate
   comes in on the result. In the red after a game, the owner forces a
   trade (you choose: your best player on offence or on defence). Deep in
   the red, he fires you. The NFL has no points deductions, so the firing
   is the second sanction. */
const MONEY={start:30,payroll:15,gate:{w:17,t:12,l:9},firedBelow:-25,tradeFee:.8};
const BILL_CARDS=[
  {t:"The team plane needed a new engine",v:-3},{t:"A jersey sales bonus",v:3},
  {t:"The stadium's video board failed",v:-4},{t:"A playoff-ticket waiting list fee",v:4},
  {t:"League fine for a sideline outburst",v:-2},{t:"Concession sales up",v:2},
  {t:"New turf for the practice field",v:-3},{t:"A local radio deal",v:3}];

/* The main site. Links from the game always use this absolute address
   (the game is reachable both proxied and on its own Netlify site). */
const SITE="https://fixtureshark.com";
