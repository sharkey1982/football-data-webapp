/* ===========================================================================
   poker/postflop.js — "Post-flop": call or fold against a range.

   After the flop (or the turn), heads-up. The Shark goes all in for a
   stated bet, so there is no more betting: your call is the last decision.
   Its range is shown, built from the cards that can be dealt (yours and the
   board's taken out):
     VALUE   top pair or better: top pair, an overpair, two pair, a set, a
             straight, a flush (made with at least one of its own cards)
     DRAWS   no pair yet: a flush draw (both its cards of the suit) or an
             open-ended straight draw (using its cards)
     BLUFFS  no pair, no draw
   Weaker pairs are not in it (the Shark checks those). Only hands it would
   have played before the flop count (its pre-flop range, about half). The Shark's type
   sets the mix: honest (value and half its draws), balanced (value, draws,
   bluffs a quarter of the value) or aggressive (bluffs most of the value).

   Your equity against the range is exact: every combo in it, every card to
   come. Calling is right when it beats bet ÷ (pot + 2 × bet), as in Pot
   odds, and is scored by the chips it gives away.

   No DOM.
   =========================================================================== */
const PO_TYPES={
  honest:{name:"Honest",d:"bets its value and some of its draws, never a bluff",draws:.5,bluffs:0},
  balanced:{name:"Balanced",d:"bets value, draws, and a few bluffs",draws:1,bluffs:.25},
  aggressive:{name:"Aggressive",d:"bets value, draws, and plenty of bluffs",draws:1,bluffs:.8}};
const PO_CLASS={value:"Value",draw:"Draws",bluff:"Bluffs"};
/* What a two-card hand is on this board, to the Shark: value, draw, bluff,
   or a weak pair (not in its betting range). */
function poClassify(h,board){
  const all=h.concat(board),cat=catOf(all),top=Math.max(...board.map(c=>c.r));
  if(cat>=2){const best=bestHand(all);if(best.five.some(c=>h.some(x=>sameCard(x,c))))return"value";return"weak"}
  if(cat===1){const pr=h[0].r===h[1].r?h[0].r:h.find(c=>board.some(b=>b.r===c.r));
    if(h[0].r===h[1].r)return h[0].r>top?"value":"weak";
    return pr&&pr.r===top?"value":"weak"}
  const fs=flushDrawSuit(h,board);
  if(fs>=0&&h.every(c=>c.s===fs))return"draw";
  const sr=straightRanks(all);if(sr.length===2&&sr.every(r=>!hasStraight(board.concat([{r,s:9}]))))return"draw";
  return"bluff";
}
/* Before the flop the Shark played the hands its equilibrium shoves at
   PO_PRE_BB big blinds (about half of all hands): no seven-deuce bluffs. */
const PO_PRE_BB=15;
function poPreflop(h){return pfPlays("sb",PO_PRE_BB,pfIndex(pfNameOf(h)))}
/* The Shark's range on this board for a type: combos by class. */
function poRange(hole,board,type){
  const T=PO_TYPES[type],un=unseenCards(hole.concat(board)),by={value:[],draw:[],bluff:[],weak:[]};
  for(let i=0;i<un.length;i++)for(let j=i+1;j<un.length;j++){const h=[un[i],un[j]];if(!poPreflop(h))continue;by[poClassify(h,board)].push(h)}
  const value=by.value,draw=shuffle(by.draw).slice(0,Math.round(by.draw.length*T.draws)),bluff=shuffle(by.bluff).slice(0,Math.round(value.length*T.bluffs));
  return{value,draw,bluff};
}
/* Your equity against each class and the whole range: every combo, every
   runout. */
function poEquity(hole,board,range){
  const out={},tot={w:0,n:0};
  for(const k of["value","draw","bluff"]){let s=0;for(const h of range[k]){s+=equity(hole,h,board).eq}
    out[k]=range[k].length?s/range[k].length:null;tot.w+=s;tot.n+=range[k].length}
  out.all=tot.w/tot.n;return out;
}
/* A line for each part of the range: what the combos are. */
function poLabel(h,board,cls){
  if(cls==="value"){const cat=catOf(h.concat(board));if(cat>=2)return CATEGORIES[cat];return h[0].r===h[1].r?"Overpair":"Top pair"}
  if(cls==="draw"){const fs=flushDrawSuit(h,board);return fs>=0&&h.every(c=>c.s===fs)?"Flush draw":"Straight draw"}
  return"Nothing (a bluff)";
}
function poBreakdown(q){const out=[];for(const k of["value","draw","bluff"]){const m={};for(const h of q.range[k]){const l=poLabel(h,q.board,k);m[l]=(m[l]||0)+1}
  out.push({k,n:q.range[k].length,parts:Object.entries(m).sort((a,b)=>b[1]-a[1])})}return out}
/* Your hand: the kinds that face this decision. */
const PO_HANDS=[{k:"toppairweak",t:"Top pair, weak kicker",w:1.2},{k:"midpair",t:"Middle pair",w:1},{k:"overpair",t:"An overpair",w:.6},
  {k:"acehigh",t:"Ace high",w:.6},{k:"flushdraw",t:"A flush draw",w:.9},{k:"oesd",t:"A straight draw (eight outs)",w:.7}];
function poYourHandOK(kind,hole,board){
  const all=hole.concat(board),cat=catOf(all),sorted=board.map(c=>c.r).sort((a,b)=>b-a),top=sorted[0],mid=sorted[1];
  if(new Set(board.map(c=>c.r)).size<board.length)return false;               // no paired boards
  if(maxSuit(board)>=3)return false;                                            // no flush already possible
  if(straightRanks(board).length||hasStraight(board))return false;
  const hp=hole[0].r===hole[1].r;
  if(kind==="toppairweak")return cat===1&&!hp&&hole.some(c=>c.r===top)&&hole.find(c=>c.r!==top).r<=9&&maxSuit(all)<4&&!straightRanks(all).length;
  if(kind==="midpair")return cat===1&&!hp&&hole.some(c=>c.r===mid)&&!hole.some(c=>c.r>top)&&maxSuit(all)<4&&!straightRanks(all).length;
  if(kind==="overpair")return cat===1&&hp&&hole[0].r>top&&hole[0].r<=12&&maxSuit(all)<4;
  if(kind==="acehigh")return cat===0&&hole.some(c=>c.r===14)&&maxSuit(all)<4&&!straightRanks(all).length;
  if(kind==="flushdraw"){const fs=flushDrawSuit(hole,board);return cat===0&&fs>=0&&hole.every(c=>c.s===fs)&&!straightRanks(all).length}
  if(kind==="oesd")return cat===0&&straightRanks(all).length===2&&maxSuit(all)<4;
  return false;
}
const PO_BETS=[{f:.5,t:"half the pot"},{f:2/3,t:"two thirds of the pot"},{f:1,t:"the pot"},{f:1.5,t:"one and a half times the pot"}];
function postflopQuestion(){
  const kind=PO_HANDS[weightedPick(PO_HANDS.map(x=>x.w))],type=pick(Object.keys(PO_TYPES)),street=rng()<.5?3:4;
  for(let tries=0;tries<4000;tries++){
    const d=shuffle(pkDeck()),hole=d.slice(0,2),board=d.slice(2,2+street);
    if(!poYourHandOK(kind.k,hole,board))continue;
    const range=poRange(hole,board,type);if(range.value.length<6)return postflopQuestion();
    const eq=poEquity(hole,board,range),pot=50*rnd(4,16);
    /* the bet: aim for close calls half the time */
    const opts=PO_BETS.map(b=>{const bet=Math.round(pot*b.f/10)*10,need=bet/(pot+2*bet);return{...b,bet,need,ev:eq.all*(pot+bet)-(1-eq.all)*bet,gap:Math.abs(eq.all-need)}});
    const b=rng()<.5?opts.reduce((a,x)=>x.gap<a.gap?x:a):pick(opts);
    return{hole,board,street:street===3?"flop":"turn",kind,type,T:PO_TYPES[type],range,eq,pot,bet:b.bet,betText:b.t,need:b.need,ev:b.ev,
      answer:b.ev>0?"call":"fold",close:Math.abs(eq.all-b.need)<.02,n:range.value.length+range.draw.length+range.bluff.length};
  }
  return null;
}
