/* ===========================================================================
   blackjack/ev.js — the expected value of each play, in units of the stake.

   Given your hand, the dealer's up-card and the cards you can see, it works
   out what standing, hitting, doubling and splitting are each worth on
   average, playing on perfectly afterwards. Its uses:
     - the cost of a mistake (expected value lost), which sets its severity,
       so severity is measured, never made up;
     - a check on the strategy chart (the two must agree, or differ only
       where two plays are within a fraction of a per cent);
     - "luck": what a hand actually paid against what it was worth.

   The method: the cards left are the full shoe less the cards on the table;
   each draw is taken at those proportions (the "infinite deck" step, which
   for six decks moves an expected value by well under 1%). The dealer has
   already checked for blackjack, so the hole card is drawn knowing it
   isn't one. Splits: one split, no resplitting, double after split, split
   aces take one card -- the V1 rules.
   =========================================================================== */
function probsFrom(counts){let t=0;for(let v=1;v<=10;v++)t+=counts[v];const p=Array(11).fill(0);for(let v=1;v<=10;v++)p[v]=counts[v]/t;return p}
/* A total plus a card (values 1..10; an ace is 1 or 11). */
function addVal(h,v){
  let total=h.total+v,soft=h.soft;
  if(v===1&&!soft&&total+10<=21){total+=10;soft=true}
  if(total>21&&soft){total-=10;soft=false}
  return{total,soft};
}
const EMPTY={total:0,soft:false};
/* The dealer's final total: probabilities of 17, 18, 19, 20, 21 and bust
   (index 0..4, 5 = bust), given the up-card and no dealer blackjack. */
function dealerDist(up,p,rules){
  const memo=new Map(),stands=h=>h.total>17||(h.total===17&&!(h.soft&&rules.dealerHitsSoft17));
  const play=h=>{
    if(h.total>21)return[0,0,0,0,0,1];
    if(stands(h)){const o=[0,0,0,0,0,0];o[h.total-17]=1;return o}
    const k=h.total*2+(h.soft?1:0);if(memo.has(k))return memo.get(k);
    const o=[0,0,0,0,0,0];for(let v=1;v<=10;v++){if(!p[v])continue;const r=play(addVal(h,v));for(let i=0;i<6;i++)o[i]+=p[v]*r[i]}
    memo.set(k,o);return o;
  };
  const start=addVal(EMPTY,up),q=p.slice();
  if(rules.dealerPeeks){if(up===1)q[10]=0;if(up===10)q[1]=0}
  const t=q.reduce((a,b)=>a+b,0),o=[0,0,0,0,0,0];
  for(let v=1;v<=10;v++){if(!q[v])continue;const r=play(addVal(start,v));for(let i=0;i<6;i++)o[i]+=q[v]/t*r[i]}
  return o;
}
function standEV(total,dist){
  if(total>21)return-1;
  let ev=dist[5];for(let d=17;d<=21;d++){const pr=dist[d-17];if(total>d)ev+=pr;else if(total<d)ev-=pr}
  return ev;
}
/* Every play's value for a hand. legal: the actions allowed now. */
function evaluatePlays(cards,up,seen,rules,legal,counts){
  const p=probsFrom(counts||shoeCounts(rules,seen)),dist=dealerDist(cardValue(up),p,rules);
  const memo=new Map();
  const best=h=>h.total>=21?standEV(h.total,dist):Math.max(standEV(h.total,dist),hit(h));
  function hit(h){const k=h.total*2+(h.soft?1:0);if(memo.has(k))return memo.get(k);
    let ev=0;for(let v=1;v<=10;v++){if(!p[v])continue;const n=addVal(h,v);ev+=p[v]*(n.total>21?-1:best(n))}
    memo.set(k,ev);return ev}
  const dbl=h=>{let ev=0;for(let v=1;v<=10;v++){if(!p[v])continue;const n=addVal(h,v);ev+=p[v]*(n.total>21?-1:standEV(n.total,dist))}return 2*ev};
  const h=handValue(cards),out={};
  if(legal.includes("stand"))out.stand=standEV(h.total,dist);
  if(legal.includes("hit"))out.hit=hit(h);
  if(legal.includes("double"))out.double=dbl(h);
  if(legal.includes("split")){
    const cv=cardValue(cards[0]),aces=cv===1;let one=0;
    for(let x=1;x<=10;x++){if(!p[x])continue;const n=addVal(addVal(EMPTY,cv),x);
      let v;if(aces&&rules.splitAcesOneCard)v=standEV(n.total,dist);
      else{v=Math.max(standEV(n.total,dist),n.total>=21?-9:hit(n));if(rules.doubleAfterSplit)v=Math.max(v,dbl(n))}
      one+=p[x]*v}
    out.split=2*one;
  }
  return out;
}
function bestByEV(evs){return Object.keys(evs).reduce((a,b)=>evs[b]>evs[a]?b:a)}

/* The value of a whole round before the deal, from a shoe composition
   (counts by value), playing every hand by its best expected value: what a
   count is really worth. Blackjacks pay 3 to 2; the dealer checks under an
   ace or a ten. Used by the checks to measure the edge at each true count. */
function roundEV(counts,rules){
  const p=probsFrom(counts),C=v=>({r:v,s:0});let ev=0;
  for(let a=1;a<=10;a++)for(let b=a;b<=10;b++){const pab=(a===b?1:2)*p[a]*p[b];if(!pab)continue;
    for(let u=1;u<=10;u++){if(!p[u])continue;const pr=pab*p[u];
      const q=rules.dealerPeeks&&u===1?p[10]:rules.dealerPeeks&&u===10?p[1]:0;
      const bj=(a===1&&b===10);
      if(bj){ev+=pr*(1-q)*rules.blackjackPays;continue}
      const cards=[C(a),C(b)],legal=["hit","stand","double"].concat(a===b?["split"]:[]);
      const best=Math.max(...Object.values(evaluatePlays(cards,C(u),null,rules,legal,counts)));
      ev+=pr*(q*-1+(1-q)*best)}}
  return ev;
}
