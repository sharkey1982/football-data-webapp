/* ===========================================================================
   poker/bluff.js — "Bluff or value?": catch the bluff on the river.

   All five cards are out. You hold a bluff-catcher: a hand that beats the
   Shark's bluffs and loses to its value bets. The Shark bets, its range on
   the table (only hands it would have played before the flop, as Post-flop):
     VALUE    every hand that beats yours (they all bet)
     BLUFFS   hands with no pair that lose to yours (missed draws first)
   Hands that only tie yours are counted as splits. Weaker pairs are not in
   it: with something to show down, the Shark checks.

   How many bluffs depends on the Shark:
     balanced    exactly enough to make your call break even: bluffs are
                 bet ÷ (pot + 2 × bet) of its bets, so bluffs = value ×
                 bet ÷ (pot + bet) (less a little for ties, blBreakEven). A bigger bet means more bluffs, and the
                 price you need goes up just as much.
     honest 0.4 of that, slightly honest 0.7, slightly loose 1.4,
     aggressive twice. The type is hidden until you answer: you read the
     range from its counts.
   (Capped by the bluffs that exist; the counts shown are the real ones.)

   No more cards, no more betting: calling wins pot + bet against a bluff,
   loses the bet against value, and gets half the pot back on a tie. Call
   when the bluffs are more than the price needs.

   No DOM.
   =========================================================================== */
const BL_TYPES={
  honest:{name:"Honest",art:"an honest",d:"bluffs well under half as often as balanced",f:.4},
  tight:{name:"Slightly honest",art:"a slightly honest",d:"bluffs a bit less than balanced",f:.7},
  balanced:{name:"Balanced",art:"a balanced",d:"bluffs exactly enough to make your call break even",f:1},
  loose:{name:"Slightly loose",art:"a slightly loose",d:"bluffs a bit more than balanced",f:1.4},
  aggressive:{name:"Aggressive",art:"an aggressive",d:"bluffs twice as often as balanced",f:2}};
const BL_BETS=[{f:1/3,t:"a third of the pot"},{f:.5,t:"half the pot"},{f:.75,t:"three quarters of the pot"},{f:1,t:"the pot"},{f:1.5,t:"one and a half pots"},{f:2,t:"twice the pot"}];
const BL_HANDS=[{k:"toppair",t:"Top pair",w:1.2},{k:"second",t:"Second pair",w:1},{k:"underpair",t:"A pocket pair below the top card",w:.8}];
function blHandOK(kind,hole,board){
  const all=hole.concat(board),cat=catOf(all),rs=board.map(c=>c.r).sort((a,b)=>b-a);
  if(new Set(rs).size<5)return false;                       // unpaired board
  if(cat!==1||catOf(board)!==0)return false;
  if(kind==="toppair")return hole[0].r!==hole[1].r&&hole.some(c=>c.r===rs[0])&&hole.find(c=>c.r!==rs[0]).r<=10;
  if(kind==="second")return hole[0].r!==hole[1].r&&hole.some(c=>c.r===rs[1])&&!hole.some(c=>c.r>rs[0]);
  if(kind==="underpair")return hole[0].r===hole[1].r&&hole[0].r<rs[0]&&hole[0].r>rs[1];
  return false;
}
/* The Shark's betting range against your hand: value (beats you), ties,
   and the bluffs it would bet for its type and this bet size. */
function blRange(hole,board,type,pot,bet){
  const me=eval7(hole.concat(board)),un=unseenCards(hole.concat(board)),value=[],ties=[],cands=[];
  for(let i=0;i<un.length;i++)for(let j=i+1;j<un.length;j++){const h=[un[i],un[j]];if(!poPreflop(h))continue;
    const s=eval7(h.concat(board));if(s>me)value.push(h);else if(s===me)ties.push(h);else if(catOf(h.concat(board))===0)cands.push(h)}
  /* missed draws first: four to a flush or straight by the turn would be the bluffs a player has */
  const missed=cands.filter(h=>maxSuit(h.concat(board.slice(0,4)))>=4||straightRanks(h.concat(board.slice(0,4))).length>0),rest=cands.filter(h=>!missed.includes(h));
  const want=Math.round(BL_TYPES[type].f*blBreakEven(value.length,ties.length,pot,bet)),pool=shuffle(missed).concat(shuffle(rest));
  return{value,ties,bluff:pool.slice(0,Math.min(want,pool.length)),want,capped:want>pool.length};
}
/* What each part of the range is, for the table. */
function blLabel(h,board,cls){
  if(cls==="bluff"){const t=board.slice(0,4);return maxSuit(h.concat(t))>=4?"Missed flush draw":straightRanks(h.concat(t)).length?"Missed straight draw":"Nothing"}
  const best=bestHand(h.concat(board));return best.cat===1?"A better pair":CATEGORIES[best.cat];
}
function blBreakdown(q){const out=[];for(const k of["value","ties","bluff"]){const m={};for(const h of q.range[k]){const l=k==="ties"?"Same hand":blLabel(h,q.board,k);m[l]=(m[l]||0)+1}
  out.push({k,n:q.range[k].length,parts:Object.entries(m).sort((a,b)=>b[1]-a[1])})}return out}
/* The bluffs that make your call break even: bluffs × (pot + bet) = value ×
   bet − ties × pot ÷ 2 (a tie hands back half the pot). Without ties that
   is value × bet ÷ (pot + bet). */
function blBreakEven(V,T,pot,bet){return Math.max(0,(V*bet-T*pot/2)/(pot+bet))}
/* Calling: +pot+bet v a bluff, −bet v value, +pot/2 on a tie. */
function blCallValue(r,pot,bet){const n=r.value.length+r.bluff.length+r.ties.length;
  return(r.bluff.length*(pot+bet)-r.value.length*bet+r.ties.length*pot/2)/n}
function bluffQuestion(){
  const kind=BL_HANDS[weightedPick(BL_HANDS.map(x=>x.w))],type=pick(Object.keys(BL_TYPES));
  for(let tries=0;tries<6000;tries++){
    const d=shuffle(pkDeck()),hole=d.slice(0,2),board=d.slice(2,7);
    if(!blHandOK(kind.k,hole,board))continue;
    const pot=50*rnd(4,16),b=pick(BL_BETS),bet=Math.round(pot*b.f/10)*10,r=blRange(hole,board,type,pot,bet);
    if(r.value.length<4||r.capped)continue;
    const n=r.value.length+r.bluff.length+r.ties.length,ev=blCallValue(r,pot,bet),need=bet/(pot+2*bet);
    return{hole,board,kind,type,T:BL_TYPES[type],pot,bet,betText:b.t,range:r,n,ev,need,bluffShare:r.bluff.length/n,
      answer:ev>0?"call":"fold",close:Math.abs(ev)<.02*bet};
  }
  return null;
}
