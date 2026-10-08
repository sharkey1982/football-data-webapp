/* ===========================================================================
   poker/preflop.js — "Pre-flop": heads-up push/fold.

   Short-stacked heads-up with no antes, each hand comes down to one
   decision: in the small blind, shove all in or fold; in the big blind,
   facing the Shark's shove, call or fold. That game is solved: the Nash
   equilibrium (scripts/poker_pushfold.cjs -> pushfold-data.js), where
   neither side can do better by changing its strategy. The Shark plays it.

   Every answer is judged by its value in big blinds against the Shark's
   equilibrium range, so a wrong answer costs what it costs: folding a hand
   that shoves for +0.02 is a small slip, folding aces a disaster. Within
   CLOSE big blinds either answer counts as right.

   No DOM.
   =========================================================================== */
const PF_RANKS=[14,13,12,11,10,9,8,7,6,5,4,3,2];
const PF_CLOSE=.05;
const PF_FOLD={sb:-.5,bb:-1};
/* The 13x13 grid: pairs on the diagonal, suited above it, offsuit below. */
function pfGridName(row,col){const a=PF_RANKS[row],b=PF_RANKS[col],R="..23456789TJQKA";
  return row===col?R[a]+R[a]:row<col?R[a]+R[b]+"s":R[b]+R[a]+"o"}
function pfIndex(name){return PF_HANDS.indexOf(name)}
function pfNameOf(cards){const R="..23456789TJQKA",[x,y]=cards[0].r>=cards[1].r?cards:[cards[1],cards[0]];
  return x.r===y.r?R[x.r]+R[y.r]:R[x.r]+R[y.r]+(x.s===y.s?"s":"o")}
function pfCombos(name){return name.length===2?6:name[2]==="s"?4:12}
/* The value of playing (shove / call) and of folding, at a stack. */
function pfValues(role,S,i){const playV=role==="sb"?PF_EV[S].shove[i]:PF_EV[S].call[i];return{playV,foldV:PF_FOLD[role],gain:playV-PF_FOLD[role]}}
function pfPlays(role,S,i){return pfValues(role,S,i).gain>0}
/* Deal a hand of this kind with random suits. */
function pfDeal(name){
  const R={A:14,K:13,Q:12,J:11,T:10},rk=c=>R[c]||+c,a=rk(name[0]),b=rk(name[1]);
  if(name.length===2){const s=shuffle([0,1,2,3]);return[{r:a,s:s[0]},{r:a,s:s[1]}]}
  if(name[2]==="s"){const s=pick([0,1,2,3]);return[{r:a,s},{r:b,s}]}
  const s=shuffle([0,1,2,3]);return[{r:a,s:s[0]},{r:b,s:s[1]}];
}
const PF_STACK_W=S=>S<4?.5:S<=15?1.2:.8;
/* A question for a role (sb / bb). Most are near the edge of the range,
   where the lesson is; some are dealt at random, as cards come. */
function pfQuestion(role){
  const stacks=Object.keys(PF_EV).map(Number),S=stacks[weightedPick(stacks.map(PF_STACK_W))];
  const gains=PF_HANDS.map((_,i)=>pfValues(role,S,i).gain);
  let i;const x=rng();
  if(x<.55){const near=PF_HANDS.map((_,k)=>k).filter(k=>Math.abs(gains[k])<.45);i=pick(near.length?near:PF_HANDS.map((_,k)=>k))}
  else if(x<.8){const mid=PF_HANDS.map((_,k)=>k).filter(k=>Math.abs(gains[k])>=.45&&Math.abs(gains[k])<1.5);i=pick(mid.length?mid:PF_HANDS.map((_,k)=>k))}
  else i=weightedPick(PF_HANDS.map(pfCombos));
  const name=PF_HANDS[i],v=pfValues(role,S,i),play=role==="sb"?"shove":"call";
  return{role,S,i,name,cards:pfDeal(name),...v,answer:v.gain>0?play:"fold",play,close:Math.abs(v.gain)<PF_CLOSE,
    to:role==="sb"?PF_SHOVE_TO[i]:PF_CALL_TO[i],share:role==="sb"?PF_EV[S].shoveShare:PF_EV[S].callShare};
}
/* "up to 11.6 big blinds" / "at every stack, 25 big blinds and beyond" */
function pfToText(to){return to>=25?"at every stack, 25 big blinds and beyond":`up to ${to} big blinds`}
function pfStackGroup(S){return S<=7?"short (2–7)":S<=13?"middling (8–13)":"deeper (14–20)"}
