/* ===========================================================================
   poker/detective.js — "Range detective": read the Shark's hand from the
   size of its bet.

   The river. The Shark's range is its pre-flop hands that can still be
   dealt, and its betting is stated (a balanced, polarised strategy):
     BIG BET (the pot)      its strongest DT_BIG of hands, plus bluffs
     SMALL BET (a third)    the next DT_SMALL of hands (medium strength),
                            plus bluffs
     CHECK                  the rest
   How many bluffs with each size is its style (DT_STYLES), stated on the
   table: bluffs big, bluffs small, or balanced (half as many bluffs as
   value with the pot, a quarter with a third: break-even for a hand that
   only beats the bluffs).
   Bluffs are hands with no pair, missed draws first.

   Two questions per hand:
     1. Which is the Shark most likely to hold? (two pair or better / one
        pair / a missed draw / nothing): counted, combo by combo, in the
        part of the range that bets this size.
     2. Call or fold? Exact: each hand in that part beats yours, ties or
        loses. The feedback also says what calling would have been worth
        had it bet the other size: the same hand, a different answer.

   No DOM.
   =========================================================================== */
const DT_BIG=.15,DT_SMALL=.25;
const DT_SIZES={big:{f:1,t:"the pot"},small:{f:1/3,t:"a third of the pot"}};
/* How this Shark bluffs, stated on the table: bluffs per value hand with
   each size. Balanced is half (pot) and a quarter (third), the break-even
   ratios for a hand that only beats the bluffs. */
const DT_STYLES={
  bigbluff:{name:"Bluffs big",d:"Its big bets are often bluffs; its small bets never are.",big:.8,small:0},
  smallbluff:{name:"Bluffs small",d:"Its big bets are almost never bluffs; its small bets often are.",big:.1,small:.6},
  balanced:{name:"Balanced",d:"It bluffs exactly enough with each size: one bluff for every two big value bets, one for every four small ones.",big:.5,small:.25}};
const DT_GROUPS=[{id:"strong",t:"Two pair or better"},{id:"pair",t:"One pair"},{id:"missed",t:"A missed draw"},{id:"nothing",t:"Nothing"}];
const DT_HANDS=[{k:"toppair",t:"Top pair",w:1.2},{k:"second",t:"Second pair",w:1},{k:"twopair",t:"Two pair",w:.8},{k:"overpair",t:"An overpair",w:.6}];
function dtHandOK(kind,hole,board){
  const all=hole.concat(board),cat=catOf(all),rs=board.map(c=>c.r).sort((a,b)=>b-a);
  if(new Set(rs).size<5)return false;
  if(kind==="toppair")return cat===1&&hole[0].r!==hole[1].r&&hole.some(c=>c.r===rs[0]);
  if(kind==="second")return cat===1&&hole[0].r!==hole[1].r&&hole.some(c=>c.r===rs[1])&&!hole.some(c=>c.r>rs[0]);
  if(kind==="twopair")return cat===2&&hole.every(c=>board.some(b=>b.r===c.r));
  if(kind==="overpair")return cat===1&&hole[0].r===hole[1].r&&hole[0].r>rs[0];
  return false;
}
const dtMissed=(h,board)=>{const t=board.slice(0,4);return maxSuit(h.concat(t))>=4||straightRanks(h.concat(t)).length>0};
function dtGroup(h,board){const c=catOf(h.concat(board));return c>=2?"strong":c===1?"pair":dtMissed(h,board)?"missed":"nothing"}
/* The Shark's river strategy: which hands bet big, bet small, check. */
function dtStrategy(hole,board,style){
  const un=unseenCards(hole.concat(board)),all=[];
  for(let i=0;i<un.length;i++)for(let j=i+1;j<un.length;j++){const h=[un[i],un[j]];if(poPreflop(h))all.push({h,s:eval7(h.concat(board))})}
  all.sort((a,b)=>b.s-a.s);
  const n=all.length,nb=Math.round(n*DT_BIG),ns=Math.round(n*DT_SMALL);
  const bigV=all.slice(0,nb),smallV=all.slice(nb,nb+ns),rest=all.slice(nb+ns);
  const noPair=rest.filter(x=>catOf(x.h.concat(board))===0),cands=shuffle(noPair.filter(x=>dtMissed(x.h,board))).concat(shuffle(noPair.filter(x=>!dtMissed(x.h,board))));
  const st=DT_STYLES[style],bb=Math.round(bigV.length*st.big),sb=Math.round(smallV.length*st.small);
  const bigB=cands.slice(0,bb),smallB=cands.slice(bb,bb+sb);
  return{n,big:bigV.concat(bigB),small:smallV.concat(smallB),bigBluffs:bigB.length,smallBluffs:smallB.length};
}
function dtCallValue(part,me,pot,bet){let v=0;for(const x of part)v+=x.s>me?-bet:x.s<me?pot+bet:pot/2;return v/part.length}
function dtCounts(part,board){const m={strong:0,pair:0,missed:0,nothing:0};for(const x of part)m[dtGroup(x.h,board)]++;return m}
function detectiveQuestion(){
  const kind=DT_HANDS[weightedPick(DT_HANDS.map(x=>x.w))],size=rng()<.5?"big":"small",style=pick(Object.keys(DT_STYLES));
  for(let tries=0;tries<6000;tries++){
    const d=shuffle(pkDeck()),hole=d.slice(0,2),board=d.slice(2,7);
    if(!dtHandOK(kind.k,hole,board))continue;
    const S=dtStrategy(hole,board,style);if(S.n<60||S[size].length<8)continue;
    const pot=50*rnd(4,16),me=eval7(hole.concat(board)),bet=Math.round(pot*DT_SIZES[size].f/10)*10;
    const other=size==="big"?"small":"big",obet=Math.round(pot*DT_SIZES[other].f/10)*10;
    const part=S[size],counts=dtCounts(part,board),top=Math.max(...Object.values(counts));
    const ev=dtCallValue(part,me,pot,bet),evOther=dtCallValue(S[other],me,pot,obet);
    return{hole,board,kind,size,other,style,ST:DT_STYLES[style],S,pot,bet,obet,part,counts,likely:Object.keys(counts).filter(k=>counts[k]===top),
      ev,evOther,answer:ev>0?"call":"fold",otherAnswer:evOther>0?"call":"fold",close:Math.abs(ev)<.02*bet,
      need:bet/(pot+2*bet),beatShare:part.filter(x=>x.s<me).length/part.length};
  }
  return null;
}
