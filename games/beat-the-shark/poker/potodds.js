/* ===========================================================================
   poker/potodds.js — pot odds: is the price right to call with a draw?

   The situation: you have a draw (outs.js), the Shark has a better hand now,
   and bets. Calling costs the bet; it wins the pot plus the bet if your hand
   comes in. So:
     needed equity = call ÷ (pot + bet + call)
     your equity   = the chance your draw comes in (exact, outs.js)
     value of a call = equity × (pot + bet) − (1 − equity) × call
   Call when your equity beats what the price needs. On the flop the Shark is
   all in, so you see both cards for one price; on the turn there is one card
   to come. The Shark's hand is assumed good enough that your outs are clean
   (you win if you hit, lose if you miss): the plain pot-odds lesson.
   Implied odds (more money when you hit) come later.

   No DOM.
   =========================================================================== */
const BET_FRACTIONS=[{f:.25,t:"a quarter of the pot"},{f:1/3,t:"a third of the pot"},{f:.5,t:"half the pot"},{f:2/3,t:"two thirds of the pot"},
  {f:.75,t:"three quarters of the pot"},{f:1,t:"the pot"},{f:1.5,t:"one and a half times the pot"},{f:2,t:"twice the pot"}];
function neededEquity(pot,bet){return bet/(pot+2*bet)}
function callValue(eq,pot,bet){return eq*(pot+bet)-(1-eq)*bet}
/* A pot-odds question: a draw, a pot and a bet; the answer balanced between
   call and fold, and some close calls. */
function potQuestion(){
  const want=rng()<.5?"call":"fold";
  for(let tries=0;tries<200;tries++){
    const d=outsQuestion();if(!d)continue;
    const pot=50*rnd(2,20);
    const fits=BET_FRACTIONS.filter(b=>{const bet=Math.round(pot*b.f/10)*10;if(bet<10)return false;
      const ev=callValue(d.exact,pot,bet);return want==="call"?ev>0:ev<0});
    if(!fits.length)continue;
    const b=pick(fits),bet=Math.round(pot*b.f/10)*10,need=neededEquity(pot,bet),ev=callValue(d.exact,pot,bet);
    return{...d,pot,bet,betText:b.t,need,eq:d.exact,ev,answer:ev>0?"call":"fold",close:Math.abs(d.exact-need)<.03};
  }
  return null;
}
/* "2.5 to 1": the pot (with the bet) against the price of calling. */
function oddsText(pot,bet){const x=(pot+bet)/bet;return`${(Math.round(x*10)/10).toString().replace(/\.0$/,"")} to 1`}
