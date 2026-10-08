/* ===========================================================================
   poker/match.js — "Heads-up: short stacks": a match against the Shark.

   1,000 chips each, the blinds rising every MT_PER_LEVEL hands, so the match
   starts at 20 big blinds and gets shorter. Every hand is the push/fold game
   the Pre-flop trainer teaches: the small blind shoves or folds; facing a
   shove, the big blind calls or folds; all in means the five cards run out.
   The Shark plays the solved strategy (pushfold-data.js; where the
   equilibrium mixes, the Shark takes the better-valued side).

   Your decisions are scored by their value in big blinds against the
   Shark's strategy, exactly as in the Pre-flop trainer; the result is the
   cards. The two are kept apart: each hand records what it paid and what
   your decision was worth on average (shared/training.js outcomes), so the
   report splits skill from luck. "You won the pot. The Shark says it was a
   bad call."

   This is short-stack poker only (no play after the flop): a late-
   tournament heads-up, not deep-stack cash play. The intro says so.

   No DOM.
   =========================================================================== */
const MT_START=1000,MT_PER_LEVEL=5;
const MT_LEVELS=[[25,50],[30,60],[40,80],[50,100],[60,120],[75,150],[100,200],[125,250],[150,300],[200,400],[250,500],[300,600],[400,800],[500,1000]];
function newMatchState(){return{you:MT_START,shark:MT_START,hand:0,youSB:rng()<.5,over:false,winner:null}}
function mtBlinds(M){return MT_LEVELS[Math.min(MT_LEVELS.length-1,Math.floor(M.hand/MT_PER_LEVEL))]}
function mtLevelNo(M){return Math.min(MT_LEVELS.length,Math.floor(M.hand/MT_PER_LEVEL)+1)}
/* Deal a hand: blinds, cards, the five board cards (seen only if all in),
   and the Shark's move when it is in the small blind. */
function mtDeal(M){
  M.hand++;M.youSB=!M.youSB;
  const[sbB,bbB]=mtBlinds(M),E=Math.min(M.you,M.shark),S=E/bbB,d=shuffle(pkDeck());
  const h={no:M.hand,sb:M.youSB?"you":"shark",SB:sbB,BB:bbB,E,S,you:d.slice(0,2),shark:d.slice(2,4),board:d.slice(4,9),
    youName:pfNameOf(d.slice(0,2)),sharkName:pfNameOf(d.slice(2,4)),auto:E<=bbB};
  const V=pfAt(S);h.V=V;
  if(h.auto)return h;                                    // the blinds put the short stack all in
  if(h.sb==="shark")h.sharkMove=V.shove[pfIndex(h.sharkName)]>-.5?"shove":"fold";
  return h;
}
/* Your options in this hand, and what each is worth (big blinds), or null
   when you have nothing to decide. */
function mtYourChoice(h){
  if(h.auto)return null;
  const i=pfIndex(h.youName);
  if(h.sb==="you")return{play:"shove",playV:h.V.shove[i],foldV:-.5};
  if(h.sharkMove==="shove")return{play:"call",playV:h.V.call[i],foldV:-1};
  return null;
}
/* Play the hand out once you've chosen (or with no choice). Returns the
   chips you win (negative: lose), and what happened. */
function mtPlay(M,h,yourMove){
  let net=0,show=false,what;
  if(h.auto){show=true;what="allin"}
  else if(h.sb==="you"){
    if(yourMove==="fold"){net=-Math.min(h.SB,M.you);what="youfold"}
    else{h.sharkMove=h.V.call[pfIndex(h.sharkName)]>-1?"call":"fold";
      if(h.sharkMove==="fold"){net=Math.min(h.BB,M.shark);what="sharkfold"}else{show=true;what="allin"}}
  }else{
    if(h.sharkMove==="fold"){net=Math.min(h.SB,M.shark);what="sharkfold"}
    else if(yourMove==="fold"){net=-Math.min(h.BB,M.you);what="youfold"}
    else{show=true;what="allin"}
  }
  if(show){const a=eval7(h.you.concat(h.board)),b=eval7(h.shark.concat(h.board));net=a>b?h.E:a<b?-h.E:0;h.split=a===b}
  M.you+=net;M.shark-=net;h.net=net;h.what=what;h.show=show;h.yourMove=yourMove;
  if(M.you<=0||M.shark<=0){M.over=true;M.winner=M.you>0?"you":"shark"}
  return h;
}
