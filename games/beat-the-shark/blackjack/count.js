/* ===========================================================================
   blackjack/count.js — card counting: the Hi-Lo count, the true count, the
   bet that goes with it, and the edge it implies.

   Hi-Lo, the standard count: 2–6 are +1 (small cards gone help you), 7–9 are
   0, tens and aces are −1. The running count is the sum since the shuffle.
   The true count is the running count per deck still to come; you bet on it,
   rounded down. Each point of true count moves the player's edge by about
   half a per cent: off the top these rules give the house about 0.5%, so
   the player has the edge from about +2. The checks measure this with the
   expected-value calculator on real shoe compositions.

   No DOM here; the screens are ui.js and countdrill.js.
   =========================================================================== */
const HILO=[0,-1,1,1,1,1,1,0,0,0,-1]; // by card value, 1 = ace
function hiLo(c){return HILO[cardValue(c)]}
function runningCount(cards){return cards.reduce((a,c)=>a+hiLo(c),0)}
function decksLeft(shoe){return(shoe.size-shoe.i)/52}
/* Decks left as a player judges them from the discard tray: to the nearest
   half deck. */
function decksLeftShown(shoe){return Math.max(.5,Math.round(decksLeft(shoe)*2)/2)}
/* The true count you bet on: running count ÷ decks left, rounded down. */
function trueCountFor(rc,decks){return Math.floor(rc/decks+1e-9)}
/* The bet ramp, in betting units: one unit at a true count of +1 or less,
   then 2, 4, 6 and 8 units from +2 to +5 and above (a 1–8 spread). */
const BET_RAMP=[{from:-Infinity,units:1},{from:2,units:2},{from:3,units:4},{from:4,units:6},{from:5,units:8}];
const BET_UNITS=[1,2,4,6,8];
function rampUnits(tc){let u=1;for(const r of BET_RAMP)if(tc>=r.from)u=r.units;return u}
/* The rule of thumb for the player's edge at a true count (stake share). */
const EDGE_OFF_TOP=-.005,EDGE_PER_COUNT=.005;
function edgeAt(tc){return EDGE_OFF_TOP+EDGE_PER_COUNT*tc}
