/* ===========================================================================
   games/beat-the-shark/blackjack/test/checks.cjs

   Run:  node games/beat-the-shark/blackjack/test/checks.cjs

   Correctness first (Chris: "I do not want a visually convincing blackjack
   game that occasionally gives incorrect training advice"):

     0. LOADING     scripts load in order; the picker offers the trainer
     1. CARDS       values, aces, soft and hard totals, the shoe
     2. RULES       every rule of a round, on stacked shoes: blackjacks and
                    the dealer's check, hit, stand, double, split, split
                    aces, no resplitting, dealer play, payouts, pushes,
                    illegal actions, and rule variants
     3. STRATEGY    every cell of the chart against an independent copy of
                    the published basic strategy for these rules; fallbacks
                    when a double or split isn't allowed; the expected-value
                    calculator against the chart for every two-card hand
     4. SIMULATION  perfect basic strategy over many hands: the house edge,
                    blackjack and push rates where they should be; and luck
                    (result minus expected) averaging zero
     5. TRAINING    severity from EV lost, the Shark Score, the verdict and
                    leak rules, chips and score kept apart
     6. SCREENS     whole sessions through the real screens

   HANDS=n scales the simulation (default 150000).
   =========================================================================== */
const fs=require('fs'),vm=require('vm'),path=require('path');
const DIR=path.join(__dirname,'..');
let failures=0;
function check(name,ok,detail){console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?`  (${detail})`:''}`);if(!ok)failures++}
const HANDS=+process.env.HANDS||150000;

function makeWorld(){
  const els={},q=[];
  function mk(id){return{id,_h:"",children:[],onclick:null,style:{},dataset:{},className:"",disabled:false,classList:{add(){}},
    set innerHTML(v){this._h=v;this.children=[]},get innerHTML(){return this._h+this.children.map(c=>c.innerHTML).join("")},
    set textContent(v){this._h=String(v)},get textContent(){return this._h},
    appendChild(c){this.children.push(c)},querySelectorAll(){return[]},querySelector(){return null},setAttribute(){}}}
  const doc={getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk(""),head:{appendChild(){}}};
  const ctx=vm.createContext({document:doc,setTimeout:f=>{q.push(f)},clearTimeout:()=>{},Math,JSON,Object,Array,String,Number,Date,Map,Set,console,
    location:{hash:"",pathname:"/",hostname:"localhost"},localStorage:{getItem:()=>null}});
  const html=fs.readFileSync(path.join(DIR,'index.html'),'utf8');
  const srcs=[...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map(m=>m[1]);
  for(const s of srcs)new vm.Script(fs.readFileSync(path.join(DIR,s),'utf8'),{filename:s}).runInContext(ctx);
  const drain=()=>{let n=0;while(q.length&&n++<50000)q.shift()()};
  return{els,q,drain,run:c=>vm.runInContext(c,ctx),srcs};
}

/* ---- 0. loading ---------------------------------------------------------- */
let W;
try{W=makeWorld();check("scripts load in order, as a browser loads them",true,W.srcs.join(" → "))}
catch(e){check("scripts load in order, as a browser loads them",false,e.message);process.exit(1)}
check("the picker offers the blackjack trainer with the other games",/data-game="blackjack"/.test(W.els.app.innerHTML)&&/data-game="football"/.test(W.els.app.innerHTML));
{const h=fs.readFileSync(path.join(DIR,'index.html'),'utf8'),miss=[];
 for(const m of h.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g))if(!/^https?:/.test(m[1])&&!/\?v=__V__$/.test(m[1]))miss.push(m[1]);
 check("every script and stylesheet is versioned for each deploy (?v=__V__)",!miss.length,miss.join(", "))}

/* The engines, in this process (fast). */
global.document={getElementById:()=>({style:{},set innerHTML(v){},onclick:null}),querySelectorAll:()=>[],createElement:()=>({}),head:{appendChild(){}}};
const SRC=W.srcs.filter(f=>!/ui\.js$/.test(f)).map(f=>fs.readFileSync(path.join(DIR,f),'utf8')).join('\n;\n');
const E=(0,eval)(SRC+`;\n({run:c=>eval(c)})`);
const run=c=>E.run(c);

/* ---- 1. cards ------------------------------------------------------------- */
{
  const r=JSON.parse(run(`(()=>{const C=r=>({r,s:0}),H=a=>handValue(a.map(C));const o={};
    o.values=[1,2,9,10,11,12,13].map(r=>cardValue(C(r)));
    o.AK=H([1,13]);o.AA=H([1,1]);o.AAK=H([1,1,13]);o.A6=H([1,6]);o.A6T=H([1,6,10]);o.A5A=H([1,5,1]);
    o.AAAA=H([1,1,1,1]);o.T6A=H([10,6,1]);o.T6AA=H([10,6,1,1]);o.A9A=H([1,9,1]);o.Q=H([12,13]);
    const sh=newShoe(RULES_V1),cnt={};sh.cards.forEach(c=>cnt[c.r]=(cnt[c.r]||0)+1);o.shoe=sh.size;o.perRank=Object.values(cnt);
    o.counts=shoeCounts(RULES_V1,[C(1),C(10),C(13)]);
    return JSON.stringify(o)})()`));
  check("card values: ace 1 (or 11 in a total), 2–9 face, ten/jack/queen/king 10",JSON.stringify(r.values)==="[1,2,9,10,10,10,10]");
  check("A–K is soft 21; A–A soft 12; A–A–K hard 12",r.AK.total===21&&r.AK.soft&&r.AA.total===12&&r.AA.soft&&r.AAK.total===12&&!r.AAK.soft);
  check("A–6 is soft 17; A–6–10 becomes hard 17",r.A6.total===17&&r.A6.soft&&r.A6T.total===17&&!r.A6T.soft);
  check("A–5–A is soft 17; four aces soft 14; 10–6–A hard 17; 10–6–A–A hard 18; A–9–A soft 21",
    r.A5A.total===17&&r.A5A.soft&&r.AAAA.total===14&&r.AAAA.soft&&r.T6A.total===17&&!r.T6A.soft&&r.T6AA.total===18&&!r.T6AA.soft&&r.A9A.total===21&&r.A9A.soft);
  check("queen–king is hard 20",r.Q.total===20&&!r.Q.soft);
  check("the shoe: six decks, 312 cards, 24 of each rank",r.shoe===312&&r.perRank.length===13&&r.perRank.every(n=>n===24));
  check("cards left by value after seeing A, 10, K: 23 aces, 94 tens",r.counts[1]===23&&r.counts[10]===94&&r.counts[5]===24);
}

/* ---- 2. rules, on stacked shoes ------------------------------------------- */
{
  /* deal order: you, dealer up, you, dealer hole, then draws in order */
  const res=JSON.parse(run(`(()=>{
    const C=r=>({r,s:0}),stack=rs=>({cards:rs.map(C),i:0,size:1e6});
    const play=(rs,acts,rules,bet)=>{const sh=stack(rs),R=newRound(sh,rules||RULES_V1,bet||100);for(const a of acts||[])act(R,sh,a);return R};
    const o={};
    let R=play([1,9,13,7]);o.bj={phase:R.phase,net:R.net,out:R.results[0].outcome};
    R=play([1,1,13,13]);o.bjPush={net:R.net,out:R.results[0].outcome};
    R=play([10,1,10,13]);o.dealerBJ={phase:R.phase,net:R.net,legal:legalActions(R).length};
    R=play([10,10,9,1]);o.dealerBJten={phase:R.phase,net:R.net};
    R=play([10,9,6,1]);o.nineUpAceHole={phase:R.phase};
    R=play([10,10,6,7,13],["hit"]);o.hitBust={net:R.net,dealerCards:R.dealer.length,phase:R.phase,out:R.results[0].outcome};
    R=play([10,10,7,7],["stand"]);o.push={net:R.net,out:R.results[0].outcome};
    R=play([10,1,8,6],["stand"]);o.soft17stand={dealer:R.dealer.length,net:R.net};
    R=play([10,1,8,6,3],["stand"],{...RULES_V1,id:"h17",dealerHitsSoft17:true});o.h17={dealer:R.dealer.length,total:handValue(R.dealer).total,net:R.net};
    R=play([10,10,8,6,5],["stand"]);o.dealerHits16={total:handValue(R.dealer).total,net:R.net};
    R=play([10,6,8,10,9],["stand"]);o.dealerBust={net:R.net,out:R.results[0].outcome};
    R=play([5,10,6,7,10],["double"]);o.double={net:R.net,cards:R.hands[0].cards.length,bet:R.hands[0].bet};
    R=play([10,10,2,7,10],["double"]);o.doubleBust={net:R.net};
    R=play([8,10,8,7,3,10],[]);o.splitLegal=legalActions(R);
    act(R,stack([]),"stand");
    // split 8s: hand 1 gets 3, hand 2 gets 10; dealer 10,7
    R=play([8,10,8,7,3,10],["split"]);o.splitHands=R.hands.map(h=>h.cards.map(c=>c.r));o.splitLegal2=legalActions(R);
    act(R,null,"stand");act(R,null,"stand");o.split={phase:R.phase,net:R.net,res:R.results.map(x=>x.net)};
    // no resplit: 8,8 split, hand 1 gets another 8
    R=play([8,10,8,7,8,2],["split"]);o.noResplit=legalActions(R);
    // split aces: one card each, done; A+K after a split is 21, paid 1 to 1
    R=play([1,10,1,7,13,5],["split"]);o.splitAces={phase:R.phase,cards:R.hands.map(h=>h.cards.length),net:R.net,res:R.results.map(x=>x.outcome+":"+x.net)};
    // no double on three cards; double after split allowed
    R=play([2,10,3,7,4],["hit"]);o.threeCard=legalActions(R);
    R=play([5,10,5,7,6,2],["split"]);o.das=legalActions(R);
    // hit to 21 ends the hand
    R=play([10,10,6,7,5]);act(R,stack([5]),"hit");
    R=play([10,10,6,7,5],["hit"]);o.hitTo21={phase:R.phase,net:R.net,total:handValue(R.hands[0].cards).total};
    // 6:5 variant
    R=play([1,9,13,7],[],{...RULES_V1,id:"65",blackjackPays:1.2});o.sixFive=R.net;
    // illegal
    R=play([10,10,6,7]);try{act(R,stack([]),"split");o.illegal="no error"}catch(e){o.illegal="threw"}
    // all hands bust: the dealer doesn't draw
    R=play([8,10,8,6,10,10],["split"]);act(R,stack([10]),"hit");
    return JSON.stringify(o)})()`));
  check("a player blackjack pays 3 to 2 and ends the round at once",res.bj.phase==="done"&&res.bj.net===150&&res.bj.out==="blackjack");
  check("blackjack against a dealer blackjack is a push",res.bjPush.net===0&&res.bjPush.out==="push");
  check("the dealer checks under an ace: a dealer blackjack ends the round, no decisions, stake lost",res.dealerBJ.phase==="done"&&res.dealerBJ.net===-100&&res.dealerBJ.legal===0);
  check("...and under a ten",res.dealerBJten.phase==="done"&&res.dealerBJten.net===-100);
  check("no check under a 9: play goes on",res.nineUpAceHole.phase==="player");
  check("bust loses the stake; the dealer doesn't draw to a bust hand",res.hitBust.net===-100&&res.hitBust.dealerCards===2&&res.hitBust.out==="bust");
  check("17 v 17 is a push",res.push.net===0&&res.push.out==="push");
  check("the dealer stands on soft 17 (these rules)",res.soft17stand.dealer===2&&res.soft17stand.net===100);
  check("...and hits it under the 'hits soft 17' variant",res.h17.dealer===3&&res.h17.total===20&&res.h17.net===-100);
  check("the dealer hits 16",res.dealerHits16.total===21&&res.dealerHits16.net===-100);
  check("a dealer bust pays even money",res.dealerBust.net===100&&res.dealerBust.out==="win");
  check("double: one card, twice the stake, paid at twice",res.double.cards===3&&res.double.bet===200&&res.double.net===200);
  check("double and bust loses twice the stake",res.doubleBust.net===-200);
  check("a pair can be split, doubled, hit or stood",JSON.stringify(res.splitLegal)==='["hit","stand","double","split"]');
  check("split: two hands, each dealt a second card",JSON.stringify(res.splitHands)==="[[8,3],[8,10]]");
  check("split hands settle separately (11 loses to 17, 18 wins)",res.split.phase==="done"&&JSON.stringify(res.split.res)==="[-100,100]"&&res.split.net===0);
  check("no resplitting: a third 8 can't be split",!res.noResplit.includes("split"));
  check("split aces: one card each, then done",res.splitAces.phase==="done"&&JSON.stringify(res.splitAces.cards)==="[2,2]");
  check("ace–king after splitting aces is 21, not blackjack: paid 1 to 1",res.splitAces.res[0]==="win:100");
  check("no double on three cards",!res.threeCard.includes("double"));
  check("double after split is allowed",res.das.includes("double")&&!res.das.includes("split"));
  check("hitting to 21 ends the hand",res.hitTo21.phase==="done"&&res.hitTo21.total===21);
  check("the 6:5 variant pays a blackjack 1.2 to 1",res.sixFive===120);
  check("an illegal action is refused",res.illegal==="threw");
}

/* ---- 3. strategy ------------------------------------------------------------ */
/* An independent copy of the published basic strategy for 4–8 decks, dealer
   stands on soft 17, double after split, no surrender (Wizard of Odds), as
   it is printed: rows by hand, columns dealer 2–10 then A.
   H hit, S stand, D double else hit, Ds double else stand, P split. */
const PUBLISHED=`
hard 8   H H H H H H H H H H
hard 9   H D D D D H H H H H
hard 10  D D D D D D D D H H
hard 11  D D D D D D D D D H
hard 12  H H S S S H H H H H
hard 13  S S S S S H H H H H
hard 14  S S S S S H H H H H
hard 15  S S S S S H H H H H
hard 16  S S S S S H H H H H
hard 17  S S S S S S S S S S
A,2      H H H D D H H H H H
A,3      H H H D D H H H H H
A,4      H H D D D H H H H H
A,5      H H D D D H H H H H
A,6      H D D D D H H H H H
A,7      S Ds Ds Ds Ds S S H H H
A,8      S S S S S S S S S S
A,9      S S S S S S S S S S
2,2      P P P P P P H H H H
3,3      P P P P P P H H H H
4,4      H H H P P H H H H H
5,5      D D D D D D D D H H
6,6      P P P P P H H H H H
7,7      P P P P P P H H H H
8,8      P P P P P P P P P P
9,9      P P P P P S P P S S
10,10    S S S S S S S S S S
A,A      P P P P P P P P P P`;
{
  const rows=PUBLISHED.trim().split("\n").map(l=>l.trim().split(/\s+/));
  const ups=[2,3,4,5,6,7,8,9,10,1];
  const toCards=lab=>{if(lab==="hard"){return null}return lab.split(",").map(x=>x==="A"?1:+x)};
  const hardHand={8:[2,6],9:[2,7],10:[3,7],11:[4,7],12:[10,2],13:[10,3],14:[10,4],15:[10,5],16:[10,6],17:[10,7]};
  const want={H:"hit",S:"stand",D:"double",Ds:"double",P:"split"};
  const cases=[];
  for(const r of rows){const label=r[0]==="hard"?`hard ${r[1]}`:r[0],cells=r[0]==="hard"?r.slice(2):r.slice(1);
    const cards=r[0]==="hard"?hardHand[+r[1]]:toCards(r[0]);
    cells.forEach((code,i)=>cases.push({label,cards,up:ups[i],code,want:want[code]}))}
  const out=JSON.parse(run(`(()=>{const C=r=>({r,s:0}),cases=${JSON.stringify(cases)},bad=[];
    for(const c of cases){const cards=c.cards.map(C),legal=["hit","stand","double"].concat(isPair(cards,RULES_V1)?["split"]:[]);
      const got=bestAction(cards,C(c.up),RULES_V1,legal);if(got!==c.want)bad.push(c.label+" v "+c.up+": chart "+c.want+", engine "+got)}
    return JSON.stringify({n:cases.length,bad})})()`));
  check(`every cell of the published chart: ${out.n} hands × up-cards`,out.n===280&&!out.bad.length,out.bad.slice(0,4).join("; "));
  // the rest of the hard rows the chart prints as one ("8 or less", "17+")
  const more=JSON.parse(run(`(()=>{const C=r=>({r,s:0}),bad=[],ups=[2,3,4,5,6,7,8,9,10,1];
    for(const u of ups){for(const h of [[2,3],[2,4],[3,4],[2,5]])if(bestAction(h.map(C),C(u),RULES_V1,["hit","stand","double"])!=="hit")bad.push(h+" v "+u);
      for(const h of [[10,8],[10,9],[10,10,1],[9,9,2]])if(bestAction(h.map(C),C(u),RULES_V1,["hit","stand"])!=="stand")bad.push(h+" v "+u)}
    return JSON.stringify(bad)})()`));
  check("hard 5–7 always hit; 18–21 always stand",!more.length,more.slice(0,3).join("; "));
  const fb=JSON.parse(run(`(()=>{const C=r=>({r,s:0}),o={};
    o.h11three=bestAction([C(2),C(4),C(5)],C(6),RULES_V1,["hit","stand"]);          // D, can't double: hit
    o.s18three=bestAction([C(1),C(3),C(4)],C(4),RULES_V1,["hit","stand"]);           // Ds, can't double: stand
    o.s18threeV9=bestAction([C(1),C(3),C(4)],C(9),RULES_V1,["hit","stand"]);         // hit
    o.s17three=bestAction([C(1),C(2),C(4)],C(5),RULES_V1,["hit","stand"]);           // D: hit
    o.p8noSplit=bestAction([C(8),C(8)],C(10),RULES_V1,["hit","stand","double"]);    // hard 16 v 10: hit
    o.p8noSplit6=bestAction([C(8),C(8)],C(6),RULES_V1,["hit","stand","double"]);    // hard 16 v 6: stand
    o.p5=bestAction([C(5),C(5)],C(9),RULES_V1,["hit","stand","double","split"]);   // double, never split 5s
    o.kq=bestAction([C(13),C(12)],C(6),RULES_V1,["hit","stand","double","split"]); // stand: never split tens
    o.aa12=bestAction([C(1),C(1)],C(6),RULES_V1,["hit","stand","double"]);          // unsplittable aces: hit
    o.h12three=bestAction([C(4),C(4),C(4)],C(4),RULES_V1,["hit","stand"]);           // hard 12 v 4: stand
    o.s13x=bestAction([C(1),C(2)],C(5),RULES_V1,["hit","stand","double"]);
    return JSON.stringify(o)})()`));
  check("when you can't double, D becomes hit and Ds becomes stand",fb.h11three==="hit"&&fb.s18three==="stand"&&fb.s18threeV9==="hit"&&fb.s17three==="hit");
  check("a pair you can't split plays as its total (8–8: hit v 10, stand v 6)",fb.p8noSplit==="hit"&&fb.p8noSplit6==="stand");
  check("never split fives (double) or tens (stand); unsplittable aces hit; 4–4–4 v 4 stands; A–2 v 5 doubles",
    fb.p5==="double"&&fb.kq==="stand"&&fb.aa12==="hit"&&fb.h12three==="stand"&&fb.s13x==="double");

  // the expected-value calculator against the chart, every two-card hand
  const ev=JSON.parse(run(`(()=>{const C=r=>({r,s:0}),out=[];let n=0,worst=0;
    for(let a=1;a<=10;a++)for(let b=a;b<=10;b++)for(const u of [2,3,4,5,6,7,8,9,10,1]){
      const cards=[C(a),C(b)];if(handValue(cards).total===21)continue;
      const up=C(u),legal=["hit","stand","double"].concat(isPair(cards,RULES_V1)?["split"]:[]);
      const evs=evaluatePlays(cards,up,cards.concat([up]),RULES_V1,legal),best=bestAction(cards,up,RULES_V1,legal),top=bestByEV(evs);n++;
      const gap=evs[top]-evs[best];if(gap>1e-9){out.push({h:a+","+b+" v "+u,chart:best,ev:top,gap});worst=Math.max(worst,gap)}}
    // known values: 16 v 10 (stand about -0.54, hit about -0.54); 11 v 6 double about +0.67; A-A v 6 split about +0.55
    const k=(c,u,l)=>evaluatePlays(c.map(C),C(u),c.map(C).concat([C(u)]),RULES_V1,l);
    const a=k([10,6],10,["hit","stand"]),b=k([6,5],6,["hit","stand","double"]),c=k([1,1],6,["hit","stand","split"]),d=k([10,10],6,["stand"]);
    return JSON.stringify({n,out,worst,s16:a.stand,h16:a.hit,d11:b.double,spAA:c.split,s20:d.stand})})()`));
  check(`the EV calculator agrees with the chart on all ${ev.n} two-card hands, or within 0.5% of a stake`,ev.worst<.005,
    ev.out.length?`${ev.out.length} close calls, largest ${(ev.worst*100).toFixed(2)}%: ${ev.out.slice(0,3).map(x=>x.h+" "+x.chart+"/"+x.ev).join("; ")}`:"no disagreements");
  check("EV of known spots: 16 v 10 stand −54%, hit −53 to −54%; 11 v 6 double +65 to +70%; 20 v 6 stand +70%",
    Math.abs(ev.s16+.54)<.01&&ev.h16<-.52&&ev.h16>-.545&&ev.d11>.65&&ev.d11<.7&&Math.abs(ev.s20-.70)<.03,
    `stand ${(ev.s16*100).toFixed(1)} hit ${(ev.h16*100).toFixed(1)} double ${(ev.d11*100).toFixed(1)} 20v6 ${(ev.s20*100).toFixed(1)} AA v6 split ${(ev.spAA*100).toFixed(1)}`);
}

/* ---- 4. simulation --------------------------------------------------------- */
{
  const t0=Date.now();
  const r=JSON.parse(run(`(()=>{R.s=hashSeed("SIM");let shoe=newShoe(RULES_V1),net=0,bj=0,push=0,n=${HANDS},wagered=0;
    for(let k=0;k<n;k++){if(needsShuffle(shoe,RULES_V1))shoe=newShoe(RULES_V1);
      const Rd=newRound(shoe,RULES_V1,1);if(Rd.playerBJ)bj++;
      while(Rd.phase==="player"){const h=activeHand(Rd),l=legalActions(Rd);act(Rd,shoe,bestAction(h.cards,Rd.dealer[0],RULES_V1,l))}
      net+=Rd.net;wagered+=Rd.hands.reduce((a,h)=>a+h.bet,0);if(Rd.net===0)push++}
    return JSON.stringify({edge:net/n,bj:bj/n,push:push/n,avgBet:wagered/n})})()`));
  const se=1.15/Math.sqrt(HANDS);
  check(`perfect basic strategy over ${HANDS.toLocaleString()} hands: the house edge is about 0.5% (published, these rules)`,r.edge>-.005-3*se&&r.edge<-.005+3*se,
    `${(r.edge*100).toFixed(2)}% ± ${(se*100).toFixed(2)}`);
  check("blackjacks in about 4.7% of hands; pushes about 8–9%",Math.abs(r.bj-.0475)<.004&&r.push>.075&&r.push<.095,`${(r.bj*100).toFixed(2)}% · ${(r.push*100).toFixed(1)}%`);
  // luck averages zero: result minus expected, for a careless player too
  const l=JSON.parse(run(`(()=>{R.s=hashSeed("LUCK");let shoe=newShoe(RULES_V1);const out={};
    for(const policy of ["best","random"]){let luck=0,sq=0,n=8000,lost=0;
      for(let k=0;k<n;k++){if(needsShuffle(shoe,RULES_V1))shoe=newShoe(RULES_V1);
        const Rd=newRound(shoe,RULES_V1,1);let first=null,loss=0;
        while(Rd.phase==="player"){const h=activeHand(Rd),l=legalActions(Rd),seen=Rd.hands.flatMap(x=>x.cards).concat([Rd.dealer[0]]);
          const evs=evaluatePlays(h.cards,Rd.dealer[0],seen,RULES_V1,l),b=bestAction(h.cards,Rd.dealer[0],RULES_V1,l);
          const a=policy==="best"?b:l[Math.floor(rng()*l.length)];if(first==null)first=evs[b];loss+=Math.max(0,evs[b]-evs[a]);act(Rd,shoe,a)}
        const exp=first==null?Rd.net:first-loss,d=Rd.net-exp;luck+=d;sq+=d*d;lost+=loss}
      out[policy]={mean:luck/n,se:Math.sqrt(sq/n)/Math.sqrt(n),lost:lost/n}}
    return JSON.stringify(out)})()`));
  check("luck (result minus what the decisions were worth) averages zero for good play",Math.abs(l.best.mean)<3.5*l.best.se,`${(l.best.mean*100).toFixed(2)}% ± ${(l.best.se*100).toFixed(2)}`);
  check("...and for random play: its losses are in the decisions, not bad luck",Math.abs(l.random.mean)<3.5*l.random.se&&l.random.lost>.2,
    `${(l.random.mean*100).toFixed(2)}% ± ${(l.random.se*100).toFixed(2)}; decisions gave away ${(l.random.lost*100).toFixed(0)}% of the stake a hand`);
  console.log(`      (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}

/* ---- 5. training framework ---------------------------------------------------- */
{
  const r=JSON.parse(run(`(()=>{const o={};
    o.sev=[[true,0],[false,0],[false,.019],[false,.02],[false,.099],[false,.1],[false,.5]].map(([op,l])=>severityOf(op,l).id);
    const T=newTrainingSession("test");
    for(let i=0;i<20;i++)recordDecision(T,{group:i<10?"A":"B",chosen:i<17?"x":"y",best:"x",evChosen:i<17?0:-.1,evBest:0,stake:100});
    recordOutcome(T,{net:500,expected:-200});
    const S=summarise(T,8);o.score=S.score;o.lost=S.evLost;o.luck=S.luck;o.leak=S.leak&&S.leak.group;o.v=verdictOf(S);
    const T2=newTrainingSession("test");for(let i=0;i<19;i++)recordDecision(T2,{group:"A",chosen:"x",best:"x",stake:1});o.v19=verdictOf(summarise(T2));
    const T3=newTrainingSession("test");for(let i=0;i<7;i++)recordDecision(T3,{group:"A",chosen:"y",best:"x",stake:1});o.leak7=summarise(T3,8).leak;
    const T4=newTrainingSession("test");for(let i=0;i<30;i++)recordDecision(T4,{group:"A",chosen:"x",best:"x",stake:1});recordOutcome(T4,{net:-900,expected:-50});
    o.v4=verdictOf(summarise(T4));
    return JSON.stringify(o)})()`));
  check("severity comes from EV lost: optimal; under 2% small; 2–10% mistake; over 10% major; a wrong play is never 'optimal'",
    JSON.stringify(r.sev)==='["optimal","small","small","mistake","mistake","major","major"]',r.sev.join(","));
  check("Shark Score = share of optimal decisions (17 of 20 = 85)",r.score===85);
  check("expected chips given away = EV lost × stake (3 × 10% × 100 = 30)",Math.abs(r.lost-30)<1e-9);
  check("luck = result − expected (+500 − (−200) = +700); leak named with 8+ decisions and under 85%",r.luck===700&&r.leak==="B");
  check("a poor-decisions session can be lucky: 'Poor decisions & lucky'",r.v&&r.v.label==="Poor decisions & lucky");
  check("an excellent session can lose chips: 'Skilled & unlucky'",r.v4&&r.v4.label==="Skilled & unlucky");
  check("no verdict under 20 decisions; no leak under 8 of a kind",r.v19===null&&r.leak7===null);
}

/* ---- 6. screens --------------------------------------------------------------- */
{
  const fails=[];const seen=new Set();let lastHTML="";
  for(let s=0;s<4;s++){
    const w=makeWorld();w.run('pickSport("blackjack")');w.els.playThis.onclick();w.drain();
    if(!/Did you win\?/.test(w.els.app.innerHTML))fails.push("no intro");
    w.els.go.onclick();if(!/YOUR STAKE/.test(w.els.app.innerHTML))fails.push("no stake screen");
    w.run(`R.s=hashSeed("SCREENS${s}")`);
    for(let k=0;k<60;k++){
      const h=w.els.app.innerHTML;lastHTML=h;
      if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,50}(undefined|NaN|\[object).{0,30}/)[0]);break}
      if(/class="acts"/.test(h)){seen.add("actions");
        // play the chart's move half the time, a random legal one otherwise
        const legal=JSON.parse(w.run(`JSON.stringify(affordable(G.R))`)),best=w.run(`bestAction(activeHand(G.R).cards,G.R.dealer[0],G.rules,affordable(G.R))`);
        const a=k%2?best:legal[k%legal.length];w.els["a-"+a].onclick();continue}
      if(/>RESULT</.test(h)){seen.add("result");if(/DECISIONS/.test(h))seen.add("decisions");
        if(/but played it correctly/.test(h))seen.add("lost-right");if(/but made the wrong decision/.test(h))seen.add("won-wrong")}
      if(/✗/.test(h))seen.add("mistake-feedback");if(/✓/.test(h))seen.add("optimal-feedback");
      if(k===40&&w.els.report&&w.els.report.onclick){w.els.report.onclick();const r=w.els.app.innerHTML;seen.add("report");
        if(!/SHARK SCORE/.test(r)||!/CHIPS/.test(r)||!/was luck/.test(r))fails.push("report missing the two measures");
        if(/undefined|NaN/.test(r))fails.push("report broken text");
        w.els.more.onclick();continue}
      if(w.els.refill&&/Out of Shark Chips/.test(h)){w.els.refill.onclick();continue}
      if(w.els.deal&&w.els.deal.onclick){const f=w.els.deal.onclick;w.els.deal.onclick=null;f();continue}
      fails.push("stuck: "+h.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,120));break;
    }
    const hdr=w.els.hScore.innerHTML+w.els.hTwo.innerHTML;if(!/SHARK SCORE/.test(hdr)||!/Shark Chips/.test(hdr))fails.push("header should show the score and the chips separately");
    // chips and score independent: the score never reads the balance
    const indep=w.run(`(()=>{const a=sharkScore(G.T);G.chips+=999999;const b=sharkScore(G.T);G.chips-=999999;return a===b})()`);if(!indep)fails.push("score moved with chips");
    // stake buttons, out of chips
    w.run(`G.chips=50;G.R=null;renderTable()`);if(!/Out of Shark Chips/.test(w.els.app.innerHTML))fails.push("no top-up when out of chips");
    w.els.refill.onclick();if(!/YOUR STAKE/.test(w.els.app.innerHTML)||w.run("G.chips")!==10000)fails.push("top-up failed");
  }
  console.log(`      seen: ${[...seen].join(", ")}`);
  for(const x of["actions","result","decisions","mistake-feedback","optimal-feedback","report"])if(!seen.has(x))fails.push("never saw "+x);
  check("whole sessions through the real screens: stake, deal, actions, decision feedback, result v decisions, report, top-up",!fails.length,fails.slice(0,3).join(" | "));
  // fictional chips said plainly
  const html=fs.readFileSync(path.join(DIR,'index.html'),'utf8');
  check("the page says the chips are fictional and worth nothing",/fictional/.test(html)&&/can't be cashed/.test(html)&&/no purchases/.test(html));
}

console.log(failures?`\n${failures} check(s) FAILED`:"\nAll checks passed");
process.exit(failures?1:0);
