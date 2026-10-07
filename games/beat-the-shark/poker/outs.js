/* ===========================================================================
   poker/outs.js — outs and draws: which unseen cards make your hand, and
   the chance of getting one.

   An out is an unseen card that, on its own, gives you the hand you are
   drawing to (or better). Counted exactly: every unseen card is added and
   the evaluator says whether the target is made. The chance by the river is
   also exact, over every pair of cards still to come, so it includes
   "runner-runner" (two cards both needed). Taught alongside the rule of 4
   and 2: outs × 4 with two cards to come, outs × 2 with one.

   No DOM. Uses cards.js.
   =========================================================================== */
const DRAWS={
  flush:{name:"Flush draw",goal:"a flush or better",target:{cat:5},w:1.3},
  oesd:{name:"Open-ended straight draw",goal:"a straight or better",target:{cat:4},w:1.2},
  gutshot:{name:"Gutshot straight draw",goal:"a straight or better",target:{cat:4},w:1},
  combo:{name:"Flush and straight draw",goal:"a straight or a flush",target:{cat:4},w:.8},
  set:{name:"Pocket pair to a set",goal:"three of a kind with your pair",target:{cat:3},w:.7},
  boat:{name:"Two pair to a full house",goal:"a full house or better",target:{cat:6},w:.6},
  overs:{name:"Two overcards",goal:"a pair higher than anything on the board",target:{overPair:true},w:.7}
};
/* Does this hand reach the draw's target? */
function meets(target,hole,board,best){
  // overcards: one of your cards pairs, higher than the flop's top card
  if(target.overPair)return hole.some(h=>h.r>target.top&&board.some(b=>b.r===h.r));
  // a set: your pocket pair's rank three (or four) times
  if(target.setOf)return hole.concat(board).filter(c=>c.r===target.setOf).length>=3;
  return best.cat>=target.cat;
}
function unseenCards(known){return pkDeck().filter(c=>!known.some(k=>sameCard(k,c)))}
/* The outs: unseen cards that, added now, make the target. */
function outsFor(hole,board,target){
  return unseenCards(hole.concat(board)).filter(c=>{const b=board.concat([c]);return meets(target,hole,b,bestHand(hole.concat(b)))});
}
/* The exact chance of making the target by the river. */
function chanceByRiver(hole,board,target){
  const un=unseenCards(hole.concat(board));
  if(board.length===4){return outsFor(hole,board,target).length/un.length}
  let hit=0,n=0;
  for(let i=0;i<un.length;i++)for(let j=i+1;j<un.length;j++){
    const b=board.concat([un[i],un[j]]);n++;if(meets(target,hole,b,bestHand(hole.concat(b))))hit++}
  return hit/n;
}
/* The chance from the outs alone (no runner-runner), and the rule of thumb. */
function chanceFromOuts(outs,unseen,toCome){
  if(toCome===1)return outs/unseen;
  return 1-((unseen-outs)*(unseen-outs-1))/(unseen*(unseen-1));
}
function ruleOfThumb(outs,toCome){return Math.min(1,outs*(toCome===2?4:2)/100)}

/* Ranks that would complete a straight, and whether there's a flush draw. */
function straightRanks(cards){const out=[];
  for(let r=2;r<=14;r++){const c={r,s:9};if(!cards.some(x=>x.r===r)&&hasStraight(cards.concat([c]))&&!hasStraight(cards))out.push(r)}return out}
function flushDrawSuit(hole,board){const all=hole.concat(board);
  for(let s=0;s<4;s++){if(all.filter(c=>c.s===s).length===4&&hole.some(c=>c.s===s))return s}return-1}

/* A question: a draw of the asked kind, on the flop (two cards to come) or
   the turn (one), not yet made. */
function outsQuestion(){
  const kinds=Object.keys(DRAWS),kind=kinds[weightedPick(kinds.map(k=>DRAWS[k].w))],D=DRAWS[kind];
  for(let tries=0;tries<60000;tries++){
    const street=rng()<.65?3:4,cs=dealCards(2+street),hole=cs.slice(0,2),board=cs.slice(2),all=hole.concat(board),best=bestHand(all);
    const target=kind==="overs"?{overPair:true,top:Math.max(...board.map(c=>c.r))}:kind==="set"?{setOf:hole[0].r}:D.target;
    if(meets(target,hole,board,best))continue;
    // a straight draw must use your cards: the board plus the card alone mustn't make it
    const fs=flushDrawSuit(hole,board),sr=straightRanks(all),holeHelps=sr.length>0&&sr.every(r=>!hasStraight(board.concat([{r,s:9}])));
    let ok=false;
    // straight and flush draws from a pair or less, so no full-house outs muddle the count
    if(kind==="flush")ok=fs>=0&&sr.length===0&&best.cat<=1;
    else if(kind==="oesd")ok=fs<0&&sr.length===2&&holeHelps&&best.cat<=1;
    else if(kind==="gutshot")ok=fs<0&&sr.length===1&&holeHelps&&best.cat<=1;
    else if(kind==="combo")ok=fs>=0&&sr.length>=1&&holeHelps&&best.cat<=1;
    else if(kind==="set")ok=hole[0].r===hole[1].r&&best.cat===1&&maxSuit(all)<4&&sr.length===0;
    else if(kind==="boat")ok=best.cat===2&&hole[0].r!==hole[1].r&&hole.every(h=>board.some(b=>b.r===h.r))&&maxSuit(all)<4&&sr.length===0&&new Set(board.map(c=>c.r)).size===board.length;
    else if(kind==="overs"){const top=Math.max(...board.map(c=>c.r));ok=best.cat===0&&hole.every(h=>h.r>top)&&hole[0].r!==hole[1].r&&maxSuit(all)<4&&sr.length===0}
    if(!ok)continue;
    const outs=outsFor(hole,board,target),unseen=47-(street-3);
    return{kind,draw:D,target,hole,board,street:street===3?"flop":"turn",toCome:street===3?2:1,outs,unseen,
      exact:chanceByRiver(hole,board,target),fromOuts:chanceFromOuts(outs.length,unseen,street===3?2:1),thumb:ruleOfThumb(outs.length,street===3?2:1)};
  }
  return null;
}
/* Four answers for "what's the chance?": the exact one and three that are
   clearly different (at least 7 points apart). */
function chanceOptions(q){
  const right=Math.round(q.exact*100),opts=[right];
  const cands=[Math.round(q.outs.length*(q.toCome===2?2:4)),Math.round(right/2),Math.round(right*1.7),right+12,right-12,right+25,Math.round(q.outs.length)];
  for(const c of cands){if(c>0&&c<100&&opts.every(o=>Math.abs(o-c)>=7))opts.push(c);if(opts.length===4)break}
  while(opts.length<4){const c=Math.min(98,Math.max(1,right+(opts.length*15)*(opts.length%2?1:-1)));if(opts.every(o=>Math.abs(o-c)>=7))opts.push(c);else opts.push(Math.min(98,opts[opts.length-1]+9))}
  return shuffle(opts).map(v=>({v,right:v===right}));
}

/* Why a draw has the outs it has: the counting idea, one line. */
const DRAW_WHY={
  flush:"Thirteen cards of each suit, four already seen: nine outs.",
  oesd:"Four in a row with both ends open: four cards at each end, eight outs.",
  gutshot:"Only the one rank fills the gap: four outs.",
  combo:"The nine flush cards, plus the straight cards that aren't of your suit (they'd be counted twice).",
  set:"Two cards of your rank are left in the deck: two outs.",
  boat:"Two of each of your paired ranks are left: four outs.",
  overs:"Three of each of your two ranks are left: six outs (a pair may still lose)."};
