/* ===========================================================================
   poker/quiz.js — the hand strength questions: deals chosen to teach.

   Random deals would be mostly a pair or high card. Instead each question
   first picks what it should show (a category, or a trap), then deals until
   the cards fit. Seeded (core.js rng), so a seed replays the same questions.
   No DOM.
   =========================================================================== */
/* How often each category is asked for (Name the hand): rare hands far more
   often than they are dealt, so all nine are practised. */
const ASK_WEIGHTS=[1,1.2,1.3,1,1.3,1.3,1.1,.6,.35];
/* The traps: hands people misread. Asked about two times in five. */
const TRAPS={
  boardPlays:{name:"The board plays",test:(h,b,best)=>b.length===5&&best.five.every(c=>b.some(x=>sameCard(x,c)))},
  wheel:{name:"Ace-to-five straight",test:(h,b,best)=>best.cat===4&&best.tb[0]===5},
  threePairs:{name:"Three pairs: only two count",test:(h,b,best)=>best.cat===2&&pairsIn(h.concat(b))>=3},
  twoTrips:{name:"Two sets of three: a full house",test:(h,b,best)=>best.cat===6&&tripsIn(h.concat(b))>=2},
  flushOverStraight:{name:"Flush and straight together",test:(h,b,best)=>best.cat===5&&hasStraight(h.concat(b))},
  sixSuited:{name:"Six of a suit: the best five",test:(h,b,best)=>best.cat===5&&maxSuit(h.concat(b))>=6},
  playsOneCard:{name:"Only one of your cards plays",test:(h,b,best)=>best.cat>=1&&best.five.filter(c=>h.some(x=>sameCard(x,c))).length===1&&b.length===5}
};
function rankCounts(cs){const n={};cs.forEach(c=>n[c.r]=(n[c.r]||0)+1);return n}
function pairsIn(cs){return Object.values(rankCounts(cs)).filter(v=>v===2).length}
function tripsIn(cs){return Object.values(rankCounts(cs)).filter(v=>v===3).length}
function maxSuit(cs){const n=[0,0,0,0];cs.forEach(c=>n[c.s]++);return Math.max(...n)}
function hasStraight(cs){const r=new Set(cs.map(c=>c.r));if(r.has(14))r.add(1);for(let hi=14;hi>=5;hi--){let ok=true;for(let k=0;k<5;k++)if(!r.has(hi-k)){ok=false;break}if(ok)return true}return false}

function weightedPick(ws){const t=ws.reduce((a,b)=>a+b,0);let x=rng()*t;for(let i=0;i<ws.length;i++){x-=ws[i];if(x<=0)return i}return ws.length-1}
function dealCards(n){const d=shuffle(pkDeck());return d.slice(0,n)}
const STREETS=[{name:"flop",n:3},{name:"turn",n:4},{name:"river",n:5}];

/* Name the hand: your two cards and a board of three to five. */
function nameQuestion(){
  const trap=rng()<.4?pick(Object.keys(TRAPS)):null;
  const target=trap?null:weightedPick(ASK_WEIGHTS);
  for(let tries=0;tries<40000;tries++){
    const st=trap&&["boardPlays","playsOneCard","threePairs"].includes(trap)?STREETS[2]:STREETS[weightedPick([1,1,2])];
    const cs=dealCards(2+st.n),hole=cs.slice(0,2),board=cs.slice(2),best=bestHand(cs);
    if(trap&&!TRAPS[trap].test(hole,board,best))continue;
    if(!trap&&best.cat!==target)continue;
    return{kind:"name",hole,board,street:st.name,best,trap};
  }
  const cs=dealCards(7);return{kind:"name",hole:cs.slice(0,2),board:cs.slice(2),street:"river",best:bestHand(cs),trap:null};
}
/* Who wins: two players, a full board. Mostly close: the same kind of hand,
   decided by a kicker or the second pair; sometimes a split. */
const WHO_KINDS=[{id:"kicker",w:.45},{id:"category",w:.35},{id:"split",w:.12},{id:"any",w:.08}];
function whoQuestion(){
  const kind=WHO_KINDS[weightedPick(WHO_KINDS.map(k=>k.w))].id;
  for(let tries=0;tries<40000;tries++){
    const cs=dealCards(9),a=cs.slice(0,2),b=cs.slice(2,4),board=cs.slice(4);
    const A=bestHand(a.concat(board)),B=bestHand(b.concat(board));
    const ok=kind==="split"?A.score===B.score:kind==="kicker"?A.cat===B.cat&&A.score!==B.score&&A.cat>=1:kind==="category"?A.cat!==B.cat&&Math.min(A.cat,B.cat)>=1:true;
    if(!ok)continue;
    return{kind:"who",a,b,board,A,B,type:kind==="any"?(A.score===B.score?"split":A.cat===B.cat?"kicker":"category"):kind,
      answer:A.score>B.score?"A":B.score>A.score?"B":"split"};
  }
  const cs=dealCards(9),a=cs.slice(0,2),b=cs.slice(2,4),board=cs.slice(4),A=bestHand(a.concat(board)),B=bestHand(b.concat(board));
  return{kind:"who",a,b,board,A,B,type:A.score===B.score?"split":A.cat===B.cat?"kicker":"category",answer:A.score>B.score?"A":B.score>A.score?"B":"split"};
}
