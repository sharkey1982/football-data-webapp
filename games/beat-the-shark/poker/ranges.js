/* ===========================================================================
   poker/ranges.js — "Ranges": think in all the hands the Shark could hold,
   not the one you fear.

   Two parts:
     COMBOS   how many ways can the Shark hold this? Pocket pairs come 6
              ways, suited hands 4, offsuit 12; every card you can see
              (yours, the board's) removes some: blockers. Counted exactly
              by listing every pair of unseen cards.
     V RANGE  the Shark shoves (its push/fold equilibrium range at this
              stack, pre-flop.js): your equity against the whole range, and
              what calling needs. Equity against the range comes straight
              from the solved values: calling is worth eq×2S − S on
              average, so eq = (value + S) ÷ 2S.

   No DOM.
   =========================================================================== */
const RG_R="..23456789TJQKA",RG_WORD={14:"ace",13:"king",12:"queen",11:"jack",10:"ten",9:"nine",8:"eight",7:"seven",6:"six",5:"five",4:"four",3:"three",2:"two"};
const rgPl=r=>r===6?"sixes":RG_WORD[r]+"s";
/* Every two-card hand the Shark could hold, given the cards you can see. */
function rgCombos(seen,test){const un=unseenCards(seen),out=[];
  for(let i=0;i<un.length;i++)for(let j=i+1;j<un.length;j++)if(test(un[i],un[j]))out.push([un[i],un[j]]);return out}
const rgLeft=(seen,r)=>4-seen.filter(c=>c.r===r).length;
/* The kinds of combo question. Each: what it asks, the test, and the sum. */
function rgTarget(kind,hole,board){
  const seen=hole.concat(board),ranks=[...new Set(seen.map(c=>c.r))];
  const near=()=>rng()<.6?pick(ranks):rnd(2,14);   // often a rank you can see: the blocker lesson
  if(kind==="pair"){const x=near(),n=rgLeft(seen,x);
    return{kind,ask:`pocket ${rgPl(x)}`,short:RG_R[x]+RG_R[x],test:(a,b)=>a.r===x&&b.r===x,
      sum:`${n} ${rgPl(x)} unseen: ${n} × ${Math.max(0,n-1)} ÷ 2`,base:"A pocket pair: 6 ways (4 cards, choose 2)"}}
  let x=near(),y=near();while(y===x)y=rnd(2,14);if(y>x)[x,y]=[y,x];
  const nx=rgLeft(seen,x),ny=rgLeft(seen,y),bothSuits=[0,1,2,3].filter(s=>!seen.some(c=>c.s===s&&(c.r===x||c.r===y))).length;
  const nm=RG_R[x]+RG_R[y];
  if(kind==="suited")return{kind,ask:`${nm} suited (${RG_WORD[x]}-${RG_WORD[y]} of one suit)`,short:nm+"s",test:(a,b)=>a.s===b.s&&((a.r===x&&b.r===y)||(a.r===y&&b.r===x)),
    sum:`suits where both the ${RG_WORD[x]} and the ${RG_WORD[y]} are unseen: ${bothSuits}`,base:"Suited: 4 ways (one per suit)"};
  if(kind==="offsuit")return{kind,ask:`${nm} offsuit (${RG_WORD[x]}-${RG_WORD[y]}, two suits)`,short:nm+"o",test:(a,b)=>a.s!==b.s&&((a.r===x&&b.r===y)||(a.r===y&&b.r===x)),
    sum:`${nx} × ${ny} ${RG_WORD[x]}-${RG_WORD[y]} pairs, less ${bothSuits} suited`,base:"Offsuit: 12 ways (4 × 4, less the 4 suited)"};
  return{kind:"any",ask:`${RG_WORD[x]}-${RG_WORD[y]}, any suits`,short:nm,test:(a,b)=>(a.r===x&&b.r===y)||(a.r===y&&b.r===x),
    sum:`${nx} ${rgPl(x)} × ${ny} ${rgPl(y)}`,base:"Two different ranks: 16 ways (4 × 4)"};
}
function rgBoardTarget(kind,hole,board){
  const seen=hole.concat(board);
  if(kind==="set"){const rs=[...new Set(board.map(c=>c.r))];
    return{kind,ask:"a set (a pocket pair matching a card on the board)",short:"sets",test:(a,b)=>a.r===b.r&&rs.includes(a.r),
      sum:rs.map(r=>{const n=rgLeft(seen,r);return`${rgPl(r)} ${n*(n-1)/2}`}).join(" + "),base:"Each board rank leaves at most 3 cards: 3 ways each"}}
  if(kind==="toppair"){const top=Math.max(...board.map(c=>c.r));let k=pick([14,13,12,11].filter(r=>r!==top));
    const nt=rgLeft(seen,top),nk=rgLeft(seen,k);
    return{kind,ask:`top pair with a ${RG_WORD[k]} kicker (${RG_R[top]}${RG_R[k]})`,short:RG_R[top]+RG_R[k],test:(a,b)=>(a.r===top&&b.r===k)||(a.r===k&&b.r===top),
      sum:`${nt} ${rgPl(top)} left × ${nk} ${rgPl(k)} left`,base:"Top pair: the board took one of its cards, so 3 × 4 = 12 at most"}}
  const fs=[0,1,2,3].find(s=>board.filter(c=>c.s===s).length>=3),n=13-seen.filter(c=>c.s===fs).length;
  return{kind:"flush",ask:`a flush (two ${PK_SUIT_WORD[fs]})`,short:"flushes",test:(a,b)=>a.s===fs&&b.s===fs,
    sum:`${n} ${PK_SUIT_WORD[fs]} unseen: ${n} × ${n-1} ÷ 2`,base:"Three of a suit on the board: 10 left, 45 ways, less the ones you hold"};
}
const RG_KINDS=[{k:"pair",w:1.2},{k:"suited",w:.9},{k:"offsuit",w:.9},{k:"any",w:.8},{k:"set",w:.9},{k:"toppair",w:.8},{k:"flush",w:.5}];
function comboQuestion(){
  const kind=RG_KINDS[weightedPick(RG_KINDS.map(x=>x.w))].k,onBoard=["set","toppair","flush"].includes(kind);
  for(let tries=0;tries<500;tries++){
    const d=shuffle(pkDeck()),hole=d.slice(0,2),board=onBoard?d.slice(2,5):[];
    if(kind==="flush"&&maxSuit(board)<3)continue;
    if(kind==="set"&&new Set(board.map(c=>c.r)).size<3)continue;
    const t=onBoard?rgBoardTarget(kind,hole,board):rgTarget(kind,hole,board);
    const combos=rgCombos(hole.concat(board),t.test);
    /* the count without your two cards (the board's still out): the blocker lesson */
    const fresh=rgCombos(onBoard?board:[],t.test).length;
    return{part:"combos",hole,board,t,combos,answer:combos.length,fresh};
  }
  return null;
}
/* Your equity against the Shark's shoving range at S big blinds, and what
   calling needs: put in S − 1 more to win 2S, having lost the 1 already. */
function rgRangeEquity(S,i){return(PF_EV[S].call[i]+S)/(2*S)}
function rgNeeded(S){return(S-1)/(2*S)}
function rangeQuestion(){
  const stacks=Object.keys(PF_EV).map(Number).filter(S=>S>=3&&S%1===0),S=pick(stacks);
  const i=rng()<.5?weightedPick(PF_HANDS.map(pfCombos)):pick(PF_HANDS.map((_,k)=>k).filter(k=>Math.abs(rgRangeEquity(S,k)-.5)<.12));
  const name=PF_HANDS[i],eq=rgRangeEquity(S,i);
  return{part:"range",S,i,name,cards:pfDeal(name),eq,need:rgNeeded(S),share:PF_EV[S].shoveShare,call:eq>rgNeeded(S)};
}
