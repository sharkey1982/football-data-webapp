/* ===========================================================================
   poker/equity.js — equity: each hand's share of the pot if all the cards
   were dealt out (wins, plus half the ties).

   eval7 is a fast seven-card evaluator giving the same score as bestHand
   (cards.js); the checks prove it on random hands. With it:
     - after the flop or turn, equity is exact: every remaining runout;
     - before the flop, exact means 1,712,304 boards, so the game uses a
       seeded sample of 30,000 (about ±0.3%); the checks run the published
       matchups (aces v kings 82%, ace-king suited v queens 46%...).
   Matchups are dealt by type, each with the rule of thumb a player learns.

   No DOM.
   =========================================================================== */
/* Seven cards to a score, same scale as eval5. */
function eval7(cs){
  const rc=new Array(15).fill(0),sc=[0,0,0,0];
  for(const c of cs){rc[c.r]++;sc[c.s]++}
  const sc5=k=>{let x=k[0];for(let i=1;i<5;i++)x=x*16+(k[i]||0);return x};
  const enc=(cat,tb)=>{let x=cat;for(let i=0;i<5;i++)x=x*16+(tb[i]||0);return x};
  const straightHigh=has=>{for(let h=14;h>=5;h--){let ok=true;for(let k=0;k<5;k++){const r=h-k===1?14:h-k;if(!has(r)){ok=false;break}}if(ok)return h}return 0};
  let fs=-1;for(let s=0;s<4;s++)if(sc[s]>=5)fs=s;
  if(fs>=0){const fr=cs.filter(c=>c.s===fs).map(c=>c.r).sort((a,b)=>b-a);
    const sf=straightHigh(r=>fr.includes(r));if(sf)return enc(8,[sf]);}
  const byCount=n=>{const o=[];for(let r=14;r>=2;r--)if(rc[r]===n)o.push(r);return o};
  const q=byCount(4),t=byCount(3),p=byCount(2);
  const highs=(excl,n)=>{const o=[];for(let r=14;r>=2&&o.length<n;r--)if(rc[r]&&!excl.includes(r))o.push(r);return o};
  if(q.length)return enc(7,[q[0],...highs([q[0]],1)]);
  if(t.length&&(t.length>1||p.length))return enc(6,[t[0],t.length>1?Math.max(t[1],p[0]||0):p[0]]);
  if(fs>=0){const fr=cs.filter(c=>c.s===fs).map(c=>c.r).sort((a,b)=>b-a);return enc(5,fr.slice(0,5))}
  const st=straightHigh(r=>rc[r]>0);if(st)return enc(4,[st]);
  if(t.length)return enc(3,[t[0],...highs([t[0]],2)]);
  if(p.length>=2)return enc(2,[p[0],p[1],...highs([p[0],p[1]],1)]);
  if(p.length)return enc(1,[p[0],...highs([p[0]],3)]);
  return enc(0,highs([],5));
}
/* Exact equity of a against b with this board (0, 3, 4 or 5 cards):
   every way the rest of the board can come. Pre-flop: sampled (n deals). */
function equity(a,b,board,n){
  const known=a.concat(b,board),deck=pkDeck().filter(c=>!known.some(k=>sameCard(k,c))),need=5-board.length;
  let w=0,t=0,tot=0;
  const score=bd=>{const x=eval7(a.concat(bd)),y=eval7(b.concat(bd));if(x>y)w++;else if(x===y)t++;tot++};
  if(need<=2){
    if(need===0)score(board);
    else if(need===1)for(const c of deck)score(board.concat([c]));
    else for(let i=0;i<deck.length;i++)for(let j=i+1;j<deck.length;j++)score(board.concat([deck[i],deck[j]]));
  }else{
    const N=n||30000;
    for(let k=0;k<N;k++){const d=deck.slice();for(let i=0;i<need;i++){const j=i+Math.floor(rng()*(d.length-i));[d[i],d[j]]=[d[j],d[i]]}score(board.concat(d.slice(0,need)))}
  }
  return{win:w/tot,tie:t/tot,eq:(w+t/2)/tot,exact:need<=2,n:tot};
}

/* Matchups by type, with the rule of thumb for each. */
const MATCHUPS={
  pairOvers:{name:"A pair against two higher cards",thumb:"About a coin flip: the pair wins about 55%."},
  pairPair:{name:"A higher pair against a lower pair",thumb:"The higher pair wins about 80%."},
  dominated:{name:"The same high card, a better kicker",thumb:"The better kicker wins about 70–75%."},
  oversUnders:{name:"Two higher cards against two lower",thumb:"The higher cards win about 60–65%."},
  pairOneOver:{name:"A pair against one higher and one lower card",thumb:"The pair wins about 70%."},
  drawVsPair:{name:"A flush draw against top pair, on the flop",thumb:"With two cards to come, a flush draw is about 35–40%."},
  madeVsDraw:{name:"Top pair against a straight draw, on the turn",thumb:"With one card to come, an open-ended draw is about 17%."}
};
/* A pre-flop matchup of a type: you hold a (the first hand). Which side of
   the matchup you are on is random. */
function preflopMatchup(type){
  for(let tries=0;tries<5000;tries++){
    const d=shuffle(pkDeck()),a=d.slice(0,2),b=d.slice(2,4);
    const pa=a[0].r===a[1].r,pb=b[0].r===b[1].r,hiA=Math.max(a[0].r,a[1].r),loA=Math.min(a[0].r,a[1].r),hiB=Math.max(b[0].r,b[1].r),loB=Math.min(b[0].r,b[1].r);
    let ok=false;
    if(type==="pairOvers")ok=pa&&!pb&&loB>a[0].r||pb&&!pa&&loA>b[0].r;
    else if(type==="pairPair")ok=pa&&pb&&a[0].r!==b[0].r;
    else if(type==="dominated")ok=!pa&&!pb&&hiA===hiB&&loA!==loB&&hiA>=10;
    else if(type==="oversUnders")ok=!pa&&!pb&&(loA>hiB||loB>hiA);
    else if(type==="pairOneOver")ok=pa&&!pb&&hiB>a[0].r&&loB<a[0].r&&loB!==a[0].r||pb&&!pa&&hiA>b[0].r&&loA<b[0].r;
    if(ok)return{type,a,b,board:[]};
  }
  return null;
}
/* After the flop or turn, kept clean so the rule of thumb is the lesson:
   the drawing hand (dr) has only its draw (no pair, no card above the
   board's top card); the pair hand (pr) has only top pair (no draw of its
   own, none of the draw's suit). */
const catOf=cs=>Math.floor(eval7(cs)/1048576);
function postflopMatchup(type){
  for(let tries=0;tries<40000;tries++){
    const d=shuffle(pkDeck()),dr=d.slice(0,2),pr=d.slice(2,4),board=d.slice(4,type==="drawVsPair"?7:8);
    const top=Math.max(...board.map(c=>c.r)),D=dr.concat(board),P=pr.concat(board);
    if(new Set(board.map(c=>c.r)).size<board.length)continue;            // no paired board
    if(!pr.some(c=>c.r===top)||catOf(P)!==1||straightRanks(P).length||maxSuit(P)>=4)continue;
    if(catOf(D)!==0||dr.some(c=>c.r>top))continue;
    if(straightRanks(board).length)continue;                               // the board alone is no draw
    if(type==="drawVsPair"){const fs=flushDrawSuit(dr,board);
      if(fs<0||!dr.every(c=>c.s===fs)||pr.some(c=>c.s===fs)||straightRanks(D).length)continue}
    if(type==="madeVsDraw"){
      if(straightRanks(D).length!==2||maxSuit(D)>=4||maxSuit(board)>=3)continue}
    return rng()<.5?{type,a:dr,b:pr,board}:{type,a:pr,b:dr,board};
  }
  return null;
}
function equityQuestion(){
  const types=Object.keys(MATCHUPS),type=types[weightedPick([1.2,1,1,1,1,.9,.8])];
  const m=type==="drawVsPair"||type==="madeVsDraw"?postflopMatchup(type):preflopMatchup(type);
  if(!m)return equityQuestion();
  const e=sandbox(()=>equity(m.a,m.b,m.board),"EQ|"+m.a.concat(m.b,m.board).map(pkText).join(""));
  return{...m,match:MATCHUPS[type],...e,street:m.board.length===0?"pre-flop":m.board.length===3?"flop":"turn"};
}
/* How close an estimate is, in percentage points. */
const EQ_BANDS=[{max:5,id:"close",name:"Close"},{max:10,id:"off",name:"Some way off"},{max:101,id:"far",name:"Well off"}];
function eqBand(err){return EQ_BANDS.find(b=>Math.abs(err)<=b.max)}
