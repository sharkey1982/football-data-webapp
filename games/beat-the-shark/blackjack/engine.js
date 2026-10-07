/* ===========================================================================
   blackjack/engine.js — cards, the shoe, hands and a round of blackjack:
   deal, the dealer's check for blackjack, hit, stand, double, split, the
   dealer's play and settlement.

   Pure game logic: no DOM, no strategy, no scoring. The round reports what
   HAPPENED; whether a decision was good is the strategy engine's business
   (strategy.js, ev.js), and scoring is shared/training.js.

   Cards are {r:1..13, s:0..3}: 1 = ace, 11-13 = jack, queen, king.
   =========================================================================== */

/* ---- cards ----------------------------------------------------------------- */
const RANK_NAME=["","A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS=["♠","♥","♦","♣"];
function cardValue(c){return c.r>=10?10:c.r}          // ace counts 1 here
function cardText(c){return RANK_NAME[c.r]+SUITS[c.s]}
/* A hand's total, counting one ace as 11 when that doesn't bust it. soft is
   true when an ace is being counted as 11. */
function handValue(cards){
  let t=0,aces=0;for(const c of cards){t+=cardValue(c);if(c.r===1)aces++}
  const soft=aces>0&&t+10<=21;return{total:soft?t+10:t,soft};
}
function isPair(cards,rules){return cards.length===2&&(rules.splitAnyTens?cardValue(cards[0])===cardValue(cards[1]):cards[0].r===cards[1].r)}

/* ---- the shoe ---------------------------------------------------------------- */
function newShoe(rules){
  const cards=[];for(let d=0;d<rules.decks;d++)for(let s=0;s<4;s++)for(let r=1;r<=13;r++)cards.push({r,s});
  return{cards:shuffle(cards),i:0,size:cards.length};
}
function draw(shoe){return shoe.cards[shoe.i++]}
function needsShuffle(shoe,rules){return shoe.i>=shoe.size*rules.penetration}
/* Cards still in the shoe by value (index 1 = aces, 10 = tens), plus the
   cards already seen this round: what the expected-value calculator knows. */
function shoeCounts(rules,seen){
  const n=Array(11).fill(0);for(let v=1;v<=9;v++)n[v]=4*rules.decks;n[10]=16*rules.decks;
  for(const c of seen)n[cardValue(c)]--;return n;
}

/* ---- a round ------------------------------------------------------------------- *
   phase: "player" (decisions to make) | "done" (settled).
   hands: [{cards, bet, doubled, split, splitAces, done, bust}] -- one, or
   two after a split. dealer: [upcard, hole, ...]. */
function newRound(shoe,rules,bet){
  const p=[draw(shoe)],d=[draw(shoe)];p.push(draw(shoe));d.push(draw(shoe));
  const R={rules,bet,dealer:d,hands:[{cards:p,bet,doubled:false,split:false,splitAces:false,done:false,bust:false}],
    active:0,phase:"player",dealerBJ:false,playerBJ:false,holeShown:false,results:null,net:0};
  R.playerBJ=handValue(p).total===21;
  const up=cardValue(d[0]);
  R.dealerBJ=handValue(d).total===21;
  /* The dealer checks under an ace or a ten. A dealer blackjack ends the
     round at once (your blackjack pushes); so does yours. */
  if((rules.dealerPeeks&&(up===1||up===10)&&R.dealerBJ)||R.playerBJ){R.hands[0].done=true;finishRound(R,shoe);return R}
  if(!rules.dealerPeeks&&R.dealerBJ){/* no peek: play on; settled at the end */}
  return R;
}
function activeHand(R){return R.phase==="player"?R.hands[R.active]:null}
/* What the player may do now. */
function legalActions(R){
  const h=activeHand(R);if(!h)return[];
  const a=["hit","stand"],two=h.cards.length===2,r=R.rules;
  if(two&&!h.splitAces&&(r.doubleAnyTwo||[9,10,11].includes(handValue(h.cards).total))&&(!h.split||r.doubleAfterSplit))a.push("double");
  if(two&&!h.split&&isPair(h.cards,r)&&R.hands.length<r.maxHands)a.push("split");
  return a;
}
/* Take an action on the active hand. Returns what happened, for the screen. */
function act(R,shoe,action){
  if(!legalActions(R).includes(action))throw new Error(`illegal action ${action}`);
  const h=activeHand(R),ev={action,hand:R.active};
  if(action==="hit"){h.cards.push(draw(shoe));const v=handValue(h.cards);
    if(v.total>21){h.bust=true;h.done=true}else if(v.total===21)h.done=true;}   // 21: nothing left to decide
  else if(action==="stand")h.done=true;
  else if(action==="double"){h.bet*=2;h.doubled=true;h.cards.push(draw(shoe));h.bust=handValue(h.cards).total>21;h.done=true}
  else if(action==="split"){
    const aces=h.cards[0].r===1,second=h.cards.pop();
    const h2={cards:[second],bet:R.bet,doubled:false,split:true,splitAces:aces,done:false,bust:false};
    h.split=true;h.splitAces=aces;R.hands.splice(R.active+1,0,h2);
    for(const x of[h,h2]){x.cards.push(draw(shoe));if(aces&&R.rules.splitAcesOneCard)x.done=true;else if(handValue(x.cards).total===21)x.done=true}
  }
  advance(R,shoe);return ev;
}
function advance(R,shoe){
  while(R.active<R.hands.length&&R.hands[R.active].done)R.active++;
  if(R.active>=R.hands.length)finishRound(R,shoe);
}
/* The dealer's play: draw to 17, standing on soft 17 unless the rules say hit. */
function dealerPlays(cards,rules,shoe){
  for(;;){const v=handValue(cards);if(v.total>17||(v.total===17&&!(v.soft&&rules.dealerHitsSoft17)))break;cards.push(draw(shoe))}
}
function finishRound(R,shoe){
  R.phase="done";R.holeShown=true;
  const live=R.hands.some(h=>!h.bust);
  if(live&&!R.dealerBJ&&!R.playerBJ)dealerPlays(R.dealer,R.rules,shoe);
  const dv=handValue(R.dealer),dBust=dv.total>21;
  R.results=R.hands.map(h=>{
    const v=handValue(h.cards);let net,outcome;
    if(R.playerBJ&&!R.dealerBJ){net=h.bet*R.rules.blackjackPays;outcome="blackjack"}
    else if(R.playerBJ&&R.dealerBJ){net=0;outcome="push"}
    else if(R.dealerBJ){net=-h.bet;outcome="dealer blackjack"}
    else if(h.bust){net=-h.bet;outcome="bust"}
    else if(dBust){net=h.bet;outcome="win"}
    else if(v.total>dv.total){net=h.bet;outcome="win"}
    else if(v.total<dv.total){net=-h.bet;outcome="lose"}
    else{net=0;outcome="push"}
    return{net,outcome,total:v.total};
  });
  R.net=R.results.reduce((a,x)=>a+x.net,0);
}
