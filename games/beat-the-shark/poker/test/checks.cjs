/* ===========================================================================
   games/beat-the-shark/poker/test/checks.cjs

   Run:  node games/beat-the-shark/poker/test/checks.cjs

     0. LOADING     scripts load in order; the picker offers the trainer
     1. EVALUATOR   every one of the 2,598,960 five-card hands, counted by
                    kind against the published totals; the hands people get
                    wrong (ace-low straights, kickers, the board playing...)
     2. SEVEN CARDS a large sample of seven-card hands against the published
                    hold'em frequencies
     3. QUESTIONS   each question shows what it says it shows; every kind of
                    hand and every trap comes up; answers recomputed
     4. SCREENS     both parts through the real screens, right and wrong
     5. OUTS        outs counted exactly for every kind of draw; the chance by
                    the river against the published figures; the questions
                    and the Outs & draws screens
     6. POT ODDS    needed equity and call values; questions; screens
     7. EQUITY      the seven-card evaluator against bestHand; aces v kings
                    and ace-king suited v queens over all 1,712,304 boards
                    against the published figures; flop and turn counted
                    exactly; the matchups clean; the screens
     8. PRE-FLOP    the push/fold equilibrium against HoldemResources'
                    published heads-up table; the values; the questions; the
                    screens for both seats
     9. RANGES      combos by the textbook (16 / 12 / 4 / 6, blockers);
                    every question's count recounted by brute force; equity
                    against the Shark's range against a simulation; screens
    10. MATCH       heads-up v the Shark: chips kept, blinds rise, matches
                    end; the best play wins more than folding or shoving
                    everything; luck averages out; the screens, with "You won
                    the pot. The Shark says it was a bad ..."
    11. POST-FLOP   ranges by class on known hands; no seen card in a range;
                    the types' mixes; equity against the range recomputed;
                    answers follow the value; the screens
    12. BLUFF       river bluff-catching: value beats you, bluffs lose to you;
                    the balanced Shark makes calling break even; answers
                    follow the value; the screens
    13. SIZING      the calling rule; every option's value recounted; the
                    nuts bets biggest; answers vary; the screens
    14. DETECTIVE   the stated strategy (big = strongest + bluffs, small =
                    next + bluffs); counts and call values recounted; the
                    other size changes answers; the screens
   =========================================================================== */
const fs=require('fs'),vm=require('vm'),path=require('path');
const DIR=path.join(__dirname,'..');
let failures=0;
function check(name,ok,detail){console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?`  (${detail})`:''}`);if(!ok)failures++}

function makeWorld(search){
  const els={},q=[];
  function mk(id){return{id,_h:"",children:[],onclick:null,style:{},dataset:{},className:"",disabled:false,classList:{add(){}},
    set innerHTML(v){this._h=v;this.children=[]},get innerHTML(){return this._h+this.children.map(c=>c.innerHTML).join("")},
    set textContent(v){this._h=String(v)},get textContent(){return this._h},
    appendChild(c){this.children.push(c)},querySelectorAll(){return[]},querySelector(){return null},setAttribute(){}}}
  const doc={getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk(""),head:{appendChild(){}}};
  const ctx=vm.createContext({document:doc,setTimeout:f=>{q.push(f)},clearTimeout:()=>{},Math,JSON,Object,Array,String,Number,Date,Map,Set,console,URLSearchParams,
    location:{hash:"",pathname:"/",hostname:"localhost",search:search||""},localStorage:{getItem:()=>null}});
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
check("the picker offers the poker trainer under Casino & probability",/data-game="poker"/.test(W.els.app.innerHTML)&&/CASINO/.test(W.els.app.innerHTML));
{const h=fs.readFileSync(path.join(DIR,'index.html'),'utf8'),miss=[];
 for(const m of h.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g))if(!/^https?:/.test(m[1])&&!/\?v=__V__$/.test(m[1]))miss.push(m[1]);
 check("every script and stylesheet is versioned for each deploy (?v=__V__)",!miss.length,miss.join(", "))}

global.document={getElementById:()=>({style:{},set innerHTML(v){}}),querySelectorAll:()=>[],createElement:()=>({}),head:{appendChild(){}}};
const SRC=W.srcs.filter(f=>!/ui\.js$/.test(f)).map(f=>fs.readFileSync(path.join(DIR,f),'utf8')).join('\n;\n');
const E=(0,eval)(SRC+`;\n({run:c=>eval(c)})`);
const run=c=>E.run(c);

/* ---- 1. evaluator ----------------------------------------------------------- */
{
  const t0=Date.now();
  const counts=JSON.parse(run(`(()=>{const d=pkDeck(),n=Array(9).fill(0);let tot=0;
    for(let a=0;a<52;a++)for(let b=a+1;b<52;b++)for(let c=b+1;c<52;c++)for(let e=c+1;e<52;e++)for(let f=e+1;f<52;f++){n[eval5([d[a],d[b],d[c],d[e],d[f]]).cat]++;tot++}
    return JSON.stringify({n,tot})})()`));
  // published totals; straight flush includes the 4 royal flushes
  const want=[1302540,1098240,123552,54912,10200,5108,3744,624,40];
  check(`every five-card hand counted by kind: ${counts.tot.toLocaleString()} hands match the published totals`,counts.tot===2598960&&JSON.stringify(counts.n)===JSON.stringify(want),
    counts.n.map((x,i)=>`${["HC","1P","2P","3K","ST","FL","FH","4K","SF"][i]} ${x}`).join(" ")+` · ${((Date.now()-t0)/1000).toFixed(1)}s`);
  const r=JSON.parse(run(`(()=>{const C=s=>s.split(" ").map(x=>({r:"23456789TJQKA".indexOf(x[0])+2,s:"shdc".indexOf(x[1])}));
    const H=s=>bestHand(C(s)),o={};
    o.wheel=H("As 2d 3c 4h 5s");o.six=H("2d 3c 4h 5s 6d");o.broadway=H("Ts Jd Qc Kh As");
    o.wheelLow=o.wheel.score<o.six.score;o.noWrap=H("Qs Kd Ac 2h 3s").cat;
    o.steelWheel=H("As 2s 3s 4s 5s");o.royal=describeHand(H("Ts Js Qs Ks As"));
    o.flushOverStraight=H("9h Th Jh 2h 3h Qs Kd").cat;
    o.sixFlush=H("Ah Kh 9h 7h 4h 2h Qs").tb.join(",");
    o.threePairs=H("Ks Kd 5c 5h 2s 2d Qc");o.threePairsTxt=describeHand(o.threePairs);
    o.twoTrips=describeHand(H("9s 9d 9c 4h 4s 4d Ac"));
    o.quadsKicker=describeHand(H("7s 7d 7c 7h 2s 3d Kc"));
    o.board=H("2c 3d Ts Js Qs Ks As");o.boardRoyal=describeHand(o.board);
    const B=C("Ks 9d 5c 3h 2s");const A1=bestHand(C("Kh Qd").concat(B)),A2=bestHand(C("Kd Jc").concat(B));
    o.kickerTxt=compareText(A1,A2,"A","B");
    const B2=C("As Ad Kc Kh Qs");o.split=compareText(bestHand(C("2c 3d").concat(B2)),bestHand(C("4h 5h").concat(B2)),"A","B");
    o.cats=compareText(bestHand(C("9h 8h").concat(C("Th Jh 2h 3c 4d"))),bestHand(C("Qs Kd").concat(C("Th Jh 2h 3c 4d"))),"A","B");
    o.pairTxt=compareText(bestHand(C("Kh 2d").concat(C("Ks 9d 5c 3h 7s"))),bestHand(C("Qh Qd").concat(C("Ks 9d 5c 3h 7s"))),"A","B");
    o.fh=compareText(bestHand(C("Th 4d").concat(C("Ts Tc 4c 3h 3s"))),bestHand(C("Td 2d").concat(C("Ts Tc 4c 3h 3s"))),"A","B");
    o.straightTxt=compareText(bestHand(C("6h 7d").concat(C("8s 9d Tc 2h 3s"))),bestHand(C("Jh Qd").concat(C("8s 9d Tc 2h 3s"))),"A","B");
    return JSON.stringify(o)})()`));
  check("A-2-3-4-5 is a straight, five high: below 2-3-4-5-6; A-K-Q-J-10 is ace high",r.wheel.cat===4&&r.wheel.tb[0]===5&&r.wheelLow&&r.broadway.cat===4&&r.broadway.tb[0]===14);
  check("no wrap-around: Q-K-A-2-3 is not a straight",r.noWrap===0);
  check("A-2-3-4-5 of one suit is a straight flush; 10 to ace of one suit is a royal flush",r.steelWheel.cat===8&&r.royal==="Royal flush");
  check("a flush beats a straight when both are there",r.flushOverStraight===5);
  check("six of a suit: the best five make the flush",r.sixFlush==="14,13,9,7,4");
  check("three pairs: the best two pairs plus the best card left",r.threePairs.cat===2&&r.threePairsTxt==="Two pair, kings and fives, queen kicker",r.threePairsTxt);
  check("two sets of three make a full house (nines full of fours)",r.twoTrips==="Full house, nines full of fours");
  check("four of a kind takes the best kicker on offer",r.quadsKicker==="Four of a kind, sevens, king kicker");
  check("the board can be the hand: a royal flush on the board",r.boardRoyal==="Royal flush"&&r.board.five.every(c=>c.r>=10));
  check("explanations: kicker, split, different hands, pairs, full houses, straights",
    r.kickerTxt==="Both have a pair of kings; A's queen kicker beats B's jack."&&/split/.test(r.split)&&r.cats==="A's flush beats B's high card."&&
    r.pairTxt==="A's pair of kings beats B's pair of queens."&&/tens full of fours beats B's tens full of threes/.test(r.fh)&&r.straightTxt==="Both have a straight: B's is queen high, A's ten high.",
    [r.kickerTxt,r.split,r.cats,r.pairTxt,r.fh,r.straightTxt].join(" | "));
}

/* ---- 2. seven cards ----------------------------------------------------------- */
{
  const r=JSON.parse(run(`(()=>{R.s=hashSeed("SEVEN");const n=Array(9).fill(0),N=200000;
    for(let k=0;k<N;k++){const d=pkDeck();for(let i=0;i<7;i++){const j=i+Math.floor(rng()*(52-i));[d[i],d[j]]=[d[j],d[i]]}n[bestHand(d.slice(0,7)).cat]++}
    return JSON.stringify(n.map(x=>x/N))})()`));
  // published seven-card frequencies (133,784,560 hands)
  const want=[.1741,.4383,.2350,.0483,.0462,.0303,.0260,.00168,.000311];
  const bad=want.map((w,i)=>Math.abs(r[i]-w)>Math.max(.004,4*Math.sqrt(w*(1-w)/200000))?i:-1).filter(i=>i>=0);
  check("200,000 seven-card hands: every kind within sampling error of the published hold'em frequencies",!bad.length,
    r.map((x,i)=>`${["HC","1P","2P","3K","ST","FL","FH","4K","SF"][i]} ${(x*100).toFixed(2)}%`).join(" "));
}

/* ---- 3. questions ----------------------------------------------------------- */
{
  const r=JSON.parse(run(`(()=>{R.s=hashSeed("QUIZ");const cats=Array(9).fill(0),traps={},bad=[];let streets={};
    for(let k=0;k<700;k++){const q=nameQuestion(),all=q.hole.concat(q.board),re=bestHand(all);
      if(re.score!==q.best.score)bad.push("best");if(new Set(all.map(pkText)).size!==all.length)bad.push("dup");
      if(q.trap&&!TRAPS[q.trap].test(q.hole,q.board,q.best))bad.push("trap "+q.trap);
      cats[q.best.cat]++;if(q.trap)traps[q.trap]=(traps[q.trap]||0)+1;streets[q.street]=(streets[q.street]||0)+1}
    const who={A:0,B:0,split:0},types={};
    for(let k=0;k<300;k++){const q=whoQuestion(),A=bestHand(q.a.concat(q.board)),B=bestHand(q.b.concat(q.board));
      const ans=A.score>B.score?"A":B.score>A.score?"B":"split";if(ans!==q.answer)bad.push("who");
      const all=q.a.concat(q.b,q.board);if(new Set(all.map(pkText)).size!==9)bad.push("dup9");
      who[q.answer]++;types[q.type]=(types[q.type]||0)+1}
    return JSON.stringify({cats,traps,bad:[...new Set(bad)],who,types,streets})})()`));
  check("every question's hand is what the evaluator says, with no repeated card",!r.bad.length,r.bad.join(","));
  check("Name the hand asks all nine kinds of hand, the rare ones too",r.cats.every(x=>x>=5),r.cats.join(","));
  check("...and every trap comes up",Object.keys(r.traps).length===7,JSON.stringify(r.traps));
  check("...on the flop, turn and river",Object.keys(r.streets).length===3,JSON.stringify(r.streets));
  check("Who wins? has A wins, B wins and split pots, mostly close calls",r.who.A>50&&r.who.B>50&&r.who.split>=15&&r.types.kicker>r.types.category*0.8,JSON.stringify(r.who)+" "+JSON.stringify(r.types));
}

/* ---- 4. screens ------------------------------------------------------------------ */
{
  const fails=[];const seen=new Set();
  for(const part of["name","who"]){
    const w=makeWorld("?mode=hands");w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();
    if(!/THE HANDS, BEST FIRST/.test(w.els.app.innerHTML))fails.push("no intro");
    w.run(`R.s=hashSeed("SCR-${part}")`);
    const cards=w.els.cards;cards.children[part==="name"?0:1].onclick();w.els.pickGo.onclick();
    for(let k=0;k<24;k++){const h=w.els.app.innerHTML;
      if(/undefined|NaN|\[object/.test(h)){fails.push(part+": broken text "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
      if(part==="name"&&/class="answers"/.test(h)){const right=w.run("Q.q.best.cat"),a=k%3?right:(right+1)%9;w.els["c-"+a].onclick();
        const r=w.els.app.innerHTML;seen.add(a===right?"name-right":"name-wrong");
        if(!/class="pc[^"]* in"/.test(r))fails.push("best five not lit");
        if(a!==right&&!/role="alert"/.test(r))fails.push("wrong answer without the band");
        if(a===right&&!/✓ <b>Right/.test(r))fails.push("right answer without the tick");continue}
      if(part==="who"&&/answers three/.test(h)){const right=w.run("Q.q.answer"),a=k%3?right:right==="A"?"B":"A";w.els["w-"+a].onclick();
        const r=w.els.app.innerHTML;seen.add(a===right?"who-right":"who-wrong");
        if(a!==right&&!/role="alert"/.test(r))fails.push("who: wrong without band");if(!/Player A|PLAYER A/.test(r))fails.push("who: players missing");continue}
      if(k>14&&w.els.report&&/id="report"/.test(h)){w.els.report.onclick();seen.add("report-"+part);
        if(!/HAND SCORE/.test(w.els.app.innerHTML))fails.push("report lacks the score");break}
      if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();continue}
      fails.push(part+" stuck: "+h.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,100));break}
  }
  for(const x of["name-right","name-wrong","who-right","who-wrong","report-name","report-who"])if(!seen.has(x))fails.push("never saw "+x);
  check("both parts through the real screens: right ticks, wrong bands, best five lit, reports",!fails.length,fails.slice(0,3).join(" | "));
}

/* ---- 5. outs & draws -------------------------------------------------------------- */
{
  const r=JSON.parse(run(`(()=>{const C=s=>s.split(" ").map(x=>({r:"23456789TJQKA".indexOf(x[0])+2,s:"shdc".indexOf(x[1])}));
    const O=(h,b,t)=>outsFor(C(h),C(b),t).length,o={};
    o.flush=O("Ah Kh","2h 7h 9c",{cat:5});o.oesd=O("8c 9d","Ts Jh 2c",{cat:4});o.gut=O("8c 9d","Js Qh 2c",{cat:4});
    o.combo=O("8h 9h","Th Jc 2h",{cat:4});o.set=O("5c 5d","Kh 9s 2c",{setOf:5});o.boat=O("Kc 9d","Kh 9s 2c",{cat:6});
    o.overs=O("Ac Qd","9h 7s 2c",{overPair:true,top:9});
    o.flushRiver=chanceByRiver(C("Ah Kh"),C("2h 7h 9c"),{cat:5});o.flushTurn=chanceByRiver(C("Ah Kh"),C("2h 7h 9c 3s"),{cat:5});
    o.oesdRiver=chanceByRiver(C("8c 9d"),C("Ts Jh 2c"),{cat:4});o.oesdOuts=chanceFromOuts(8,47,2);
    o.thumb=[ruleOfThumb(9,2),ruleOfThumb(9,1)];
    R.s=hashSeed("OUTSQ");const kinds={},bad=[],outsByKind={};let opts=0;
    for(let k=0;k<160;k++){const q=outsQuestion();if(!q){bad.push("null");continue}kinds[q.kind]=(kinds[q.kind]||0)+1;
      const all=q.hole.concat(q.board);if(new Set(all.map(pkText)).size!==all.length)bad.push("dup");
      if(meets(q.target,q.hole,q.board,bestHand(all)))bad.push("already made: "+q.kind);
      if(outsFor(q.hole,q.board,q.target).length!==q.outs.length)bad.push("outs");
      (outsByKind[q.kind]=outsByKind[q.kind]||new Set()).add(q.outs.length);
      const op=chanceOptions(q);if(op.length!==4||op.filter(x=>x.right).length!==1)bad.push("options");
      const vs=op.map(x=>x.v).sort((a,b)=>a-b);for(let i=1;i<4;i++)if(vs[i]-vs[i-1]<7)bad.push("options too close");opts++}
    o.kinds=kinds;o.bad=[...new Set(bad)];o.outsByKind=Object.fromEntries(Object.entries(outsByKind).map(([k,v])=>[k,[...v].sort((a,b)=>a-b)]));
    return JSON.stringify(o)})()`));
  check("outs counted exactly: flush draw 9, open-ended 8, gutshot 4, flush + open-ended 15, set 2, two pair to a full house 4, two overcards 6",
    r.flush===9&&r.oesd===8&&r.gut===4&&r.combo===15&&r.set===2&&r.boat===4&&r.overs===6,JSON.stringify([r.flush,r.oesd,r.gut,r.combo,r.set,r.boat,r.overs]));
  check("a flush draw: 35.0% by the river from the flop, 19.6% from the turn (the published figures)",Math.abs(r.flushRiver-.3497)<.0005&&Math.abs(r.flushTurn-9/46)<1e-9,
    `${(r.flushRiver*100).toFixed(2)}% · ${(r.flushTurn*100).toFixed(2)}%`);
  check("an open-ended straight draw: about 31.5% from the flop, exact and from the outs",Math.abs(r.oesdRiver-.3145)<.004&&Math.abs(r.oesdOuts-.3145)<.0005,
    `${(r.oesdRiver*100).toFixed(2)}% · ${(r.oesdOuts*100).toFixed(2)}%`);
  check("the rule of 4 and 2: 9 outs is 36% with two cards to come, 18% with one",r.thumb[0]===.36&&r.thumb[1]===.18);
  check("draw questions: every kind comes up, none already made, outs recomputed, four well-spaced answers",
    Object.keys(r.kinds).length===7&&!r.bad.length,JSON.stringify(r.kinds)+" "+r.bad.join(","));
  check("...and each kind has the outs it should",JSON.stringify(r.outsByKind.flush)==="[9]"&&JSON.stringify(r.outsByKind.oesd)==="[8]"&&JSON.stringify(r.outsByKind.gutshot)==="[4]"&&
    JSON.stringify(r.outsByKind.set)==="[2]"&&JSON.stringify(r.outsByKind.boat)==="[4]"&&JSON.stringify(r.outsByKind.overs)==="[6]"&&r.outsByKind.combo.every(n=>n>=12&&n<=15),JSON.stringify(r.outsByKind));
  // screens
  const fails=[];
  {const w=makeWorld("?mode=outs");if(!/data-game="poker"/.test(w.els.app.innerHTML))fails.push("picker lacks outs");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();
   if(!/RULE OF 4 AND 2/.test(w.els.app.innerHTML)||!/id="go"/.test(w.els.app.innerHTML))fails.push("no outs intro");
   w.run('R.s=hashSeed("OUTSCR")');w.els.go.onclick();const seen=new Set();let nq=0;
   for(let k=0;k<20;k++){const h=w.els.app.innerHTML;
     if(/undefined|NaN|\[object/.test(h)){fails.push("broken text");break}
     if(/id="check"/.test(h)){nq++;const right=w.run("O.q.outs.length"),want=nq%2?right:right+1;for(let i=0;i<want;i++)w.els["ov-p"].onclick();w.els.check.onclick();
       const r=w.els.app.innerHTML;seen.add(want===right?"outs-right":"outs-wrong");if(!/class="minis"/.test(r))fails.push("outs not shown");
       if(want!==right&&!/role="alert"/.test(r))fails.push("wrong outs without the band");
       const i=w.run("O.opts.findIndex(o=>o.right)"),pick=nq%3?i:(i+1)%4;w.els["o-"+pick].onclick();const r2=w.els.app.innerHTML;
       seen.add(pick===i?"chance-right":"chance-wrong");if(!/Rule of/.test(r2)||!/Exact/.test(r2))fails.push("chance table missing");continue}
     if(k>7&&/id="report"/.test(h)){w.els.report.onclick();seen.add("report");if(!/OUTS SCORE/.test(w.els.app.innerHTML))fails.push("no report score");break}
     if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();continue}
     fails.push("stuck: "+h.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,80));break}
   for(const x of["outs-right","outs-wrong","chance-right","chance-wrong","report"])if(!seen.has(x))fails.push("never saw "+x)}
  check("Outs & draws through the real screens: outs and chance judged, the outs shown, the three chances, report",!fails.length,fails.slice(0,3).join(" | "));
}

/* ---- 6. pot odds ------------------------------------------------------------------ */
{
  const r=JSON.parse(run(`(()=>{const o={};
    o.need=[neededEquity(600,300),neededEquity(100,100),neededEquity(100,50),neededEquity(1000,250)];
    o.ev=[callValue(.25,600,300),callValue(.35,600,300),callValue(.2,600,300)];
    o.odds=[oddsText(600,300),oddsText(100,100),oddsText(1000,250)];
    R.s=hashSeed("POTQ");let call=0,fold=0,close=0,bad=[];
    for(let k=0;k<120;k++){const q=potQuestion();if(!q){bad.push("null");continue}
      if(q.answer==="call")call++;else fold++;if(q.close)close++;
      if(Math.abs(q.need-q.bet/(q.pot+2*q.bet))>1e-12)bad.push("need");
      if((q.eq>q.need)!==(q.answer==="call"))bad.push("answer");
      if(Math.abs(q.ev-(q.eq*(q.pot+q.bet)-(1-q.eq)*q.bet))>1e-9)bad.push("ev");
      if(q.pot<100||q.bet<10)bad.push("sizes")}
    o.call=call;o.fold=fold;o.close=close;o.bad=[...new Set(bad)];return JSON.stringify(o)})()`));
  check("needed equity = call ÷ (pot + bet + call): pot 600 bet 300 → 25%; pot-sized → 33.3%; half pot → 25%; quarter pot → 16.7%",
    Math.abs(r.need[0]-.25)<1e-12&&Math.abs(r.need[1]-1/3)<1e-12&&Math.abs(r.need[2]-.25)<1e-12&&Math.abs(r.need[3]-1/6)<1e-12);
  check("a call's value: at exactly the needed 25% it is worth 0; at 35% +120 chips (35% of 900 won, 65% of 300 lost); at 20% −60",Math.abs(r.ev[0])<1e-9&&Math.abs(r.ev[1]-120)<1e-9&&Math.abs(r.ev[2]+60)<1e-9,r.ev.map(x=>x.toFixed(1)).join(", "));
  check("odds in words: 3 to 1, 2 to 1, 5 to 1",r.odds.join("|")==="3 to 1|2 to 1|5 to 1",r.odds.join("|"));
  {const h=JSON.parse(run(`(()=>{R.s=hashSeed("HONEST");const bad=[];let flush=0,oneCard=0,dirty=0;
     for(let k=0;k<80;k++){const q=potQuestion();if(!q)continue;const fs=flushDrawSuit(q.hole,q.board);
       if(fs>=0){flush++;const mine=q.hole.filter(c=>c.s===fs);if(mine.length===1){oneCard++;if(mine[0].r!==14)bad.push("one-card flush draw without the ace")}
         if(q.shark.some(c=>c.s===fs))bad.push("the Shark holds the flush suit")}
       if(eval7(q.shark.concat(q.board))<=eval7(q.hole.concat(q.board)))bad.push("the Shark isn't ahead");
       const e=equity(q.hole,q.shark,q.board);if(Math.abs(e.eq-q.eq)>1e-12)bad.push("equity");if(q.eq<q.exact-.015)dirty++}
     for(let k=0;k<200;k++){const d=outsQuestion();const fs=d&&flushDrawSuit(d.hole,d.board);if(fs>=0){const m=d.hole.filter(c=>c.s===fs);if(m.length===1&&m[0].r!==14)bad.push("outs: one-card flush draw without the ace")}}
     return JSON.stringify({bad:[...new Set(bad)],flush,oneCard,dirty})})()`));
   check("honest draws (Chris, 8 Oct): one-card flush draws only with the ace; the Shark's hand face up, ahead now, none of your suit; equity exact against it",
     !h.bad.length&&h.flush>5,`${h.flush} flush draws, ${h.oneCard} one-card (all ace), ${h.dirty} with outs that don't all win ${h.bad.join(",")}`)}
  check("questions: the answer follows the value of calling; calls and folds balanced; some close ones",!r.bad.length&&r.call>35&&r.fold>35&&r.close>=5,
    `${r.call} call, ${r.fold} fold, ${r.close} close ${r.bad.join(",")}`);
  const fails=[];
  {const w=makeWorld("?mode=pot");if(!/data-game="poker"/.test(w.els.app.innerHTML))fails.push("picker lacks pot odds");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();if(!/THE SUM/.test(w.els.app.innerHTML)||!/id="go"/.test(w.els.app.innerHTML))fails.push("no pot intro");
   w.run('R.s=hashSeed("POTSCR")');w.els.go.onclick();const seen=new Set();let nq=0;
   for(let k=0;k<30;k++){const h=w.els.app.innerHTML;
     if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
     if(/id="p-call"/.test(h)){nq++;const right=w.run("PO.q.answer"),a=nq%2?right:(right==="call"?"fold":"call");w.els["p-"+a].onclick();const r2=w.els.app.innerHTML;
       seen.add(a===right?"right":"wrong");if(!/need <b>/.test(r2)||!/A call is worth/.test(r2)||!/against the Shark's hand/.test(r2))fails.push("price table missing");
       if(a!==right&&!/role="alert"/.test(r2))fails.push("wrong without band");continue}
     if(nq>7&&/id="report"/.test(h)){w.els.report.onclick();seen.add("report");if(!/POT ODDS SCORE/.test(w.els.app.innerHTML))fails.push("no report");break}
     if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();continue}
     fails.push("stuck");break}
   for(const x of["right","wrong","report"])if(!seen.has(x))fails.push("never saw "+x);
   const lost=w.run("PO.lost");if(!(lost>0))fails.push("wrong decisions should give chips away")}
  check("Pot odds through the real screens: call/fold judged, the price and your chance, chips given away, report",!fails.length,fails.slice(0,3).join(" | "));
}

/* ---- 7. equity -------------------------------------------------------------------- */
{
  const r=JSON.parse(run(`(()=>{R.s=hashSeed("EQ7");let bad=0;for(let k=0;k<100000;k++){const d=shuffle(pkDeck()).slice(0,5+(k%3));if(eval7(d)!==bestHand(d).score)bad++}
    /* every straight flush and four of a kind, which random hands rarely give */
    let rare=0;for(let s=0;s<4;s++)for(let h=5;h<=14;h++){const cs=[];for(let k=0;k<5;k++)cs.push({r:h-k===1?14:h-k,s});cs.push({r:h===14?2:14,s:(s+1)%4},{r:h===9?3:9,s:(s+2)%4});if(eval7(cs)!==bestHand(cs).score)rare++}
    const C=(r,s)=>({r,s}),AK=[C(14,0),C(13,0)],QQ=[C(12,1),C(12,2)];
    const fl=equity(AK,QQ,[C(2,0),C(7,0),C(9,3)]),tu=equity(AK,QQ,[C(2,0),C(7,0),C(9,3),C(3,1)]);
    /* the turn by hand: 44 rivers; AK wins with the 3 aces, 3 kings and 8 diamonds... no: spades, suit 0 */
    return JSON.stringify({bad,rare,fl,tu})})()`));
  check("eval7 gives the same score as bestHand on 100,000 random five-, six- and seven-card hands, and every straight flush",r.bad===0&&r.rare===0,`${r.bad} + ${r.rare} differ`);
  check("after the flop every turn and river is counted (990 boards); after the turn every river (44)",r.fl.exact&&r.fl.n===990&&r.tu.exact&&r.tu.n===44);
  /* the turn by hand: A♠K♠ v Q♥Q♦ on 2♠7♠9♣3♥: the ace-king wins with 2 spades... count it */
  {const outs=r.tu.win*44;check("turn equity counted by hand: ace-king of spades v queens on 2♠ 7♠ 9♣ 3♥ wins on 9 spades + 3 aces + 3 kings = 15 of 44 rivers",Math.abs(outs-15)<1e-9&&r.tu.tie===0,`${outs.toFixed(2)} of 44`)}
  /* Exact pre-flop, every board, in the vm (optimised code): published 81.06% / 0.38% and 46.02% / 0.39%. */
  const w=makeWorld("?mode=equity");
  const ex=JSON.parse(w.run(`(()=>{const C=(r,s)=>({r,s});
    function all(a,b){const known=a.concat(b),d=pkDeck().filter(c=>!known.some(k=>sameCard(k,c)));let wn=0,t=0,n=0;const L=d.length;
      for(let i=0;i<L;i++)for(let j=i+1;j<L;j++)for(let k=j+1;k<L;k++)for(let l=k+1;l<L;l++)for(let m=l+1;m<L;m++){const bd=[d[i],d[j],d[k],d[l],d[m]];
        const x=eval7(a.concat(bd)),y=eval7(b.concat(bd));if(x>y)wn++;else if(x===y)t++;n++}return{n,win:wn/n,tie:t/n,eq:(wn+t/2)/n}}
    const aa=all([C(14,0),C(14,1)],[C(13,2),C(13,3)]),ak=all([C(14,0),C(13,0)],[C(12,1),C(12,2)]);
    R.s=hashSeed("EQS");const sa=equity([C(14,0),C(14,1)],[C(13,2),C(13,3)],[]),sk=equity([C(14,0),C(13,0)],[C(12,1),C(12,2)],[]);
    return JSON.stringify({aa,ak,sa,sk})})()`));
  check("aces v kings (no shared suit), all 1,712,304 boards: wins 81.06%, splits 0.38% (published)",ex.aa.n===1712304&&Math.abs(ex.aa.win-.8106)<.0002&&Math.abs(ex.aa.tie-.0038)<.0002,`${(ex.aa.win*100).toFixed(2)}% / ${(ex.aa.tie*100).toFixed(2)}%`);
  check("ace-king suited v queens, all boards: wins 46.02%, splits 0.39% (published)",Math.abs(ex.ak.win-.4602)<.0002&&Math.abs(ex.ak.tie-.0039)<.0002,`${(ex.ak.win*100).toFixed(2)}% / ${(ex.ak.tie*100).toFixed(2)}%`);
  check("the game's 30,000-deal sample is within a point of the exact figure",Math.abs(ex.sa.eq-ex.aa.eq)<.01&&Math.abs(ex.sk.eq-ex.ak.eq)<.01&&!ex.sa.exact&&ex.sa.n===30000,
    `${(ex.sa.eq*100).toFixed(1)} v ${(ex.aa.eq*100).toFixed(1)}; ${(ex.sk.eq*100).toFixed(1)} v ${(ex.ak.eq*100).toFixed(1)}`);
  const q=JSON.parse(run(`(()=>{R.s=hashSeed("EQQ");const seen={},bad=[],eqs={};
    for(let k=0;k<70;k++){const q=equityQuestion();seen[q.type]=(seen[q.type]||0)+1;(eqs[q.type]=eqs[q.type]||[]).push(q.eq);
      const all=q.a.concat(q.b,q.board);if(new Set(all.map(pkText)).size!==all.length)bad.push("dup card");
      const want={"pre-flop":0,flop:3,turn:4}[q.street];if(q.board.length!==want)bad.push("street");
      if(Math.abs(q.eq-(q.win+q.tie/2))>1e-12)bad.push("eq sum");
      if(q.type==="drawVsPair"||q.type==="madeVsDraw"){const dr=catOf(q.a.concat(q.board))===0?q.a:q.b,pr=dr===q.a?q.b:q.a;
        if(catOf(pr.concat(q.board))!==1||catOf(dr.concat(q.board))!==0)bad.push(q.type+" hands");
        if(q.type==="drawVsPair"&&flushDrawSuit(dr,q.board)<0)bad.push("no flush draw");
        if(q.type==="madeVsDraw"&&straightRanks(dr.concat(q.board)).length!==2)bad.push("no open-ended draw")}}
    const mean=t=>{const e=eqs[t].map(x=>Math.max(x,1-x));return e.reduce((a,b)=>a+b,0)/e.length};
    return JSON.stringify({seen,bad:[...new Set(bad)],fav:Object.fromEntries(Object.keys(eqs).map(t=>[t,mean(t)]))})})()`));
  check("questions: every matchup comes up; no card twice; the board fits the street; drawing hands only draw, pair hands only pair",
    Object.keys(q.seen).length===7&&!q.bad.length,JSON.stringify(q.seen)+" "+q.bad.join(","));
  const fv=q.fav,inR=(t,lo,hi)=>fv[t]>=lo&&fv[t]<=hi;
  check("each matchup's favourite wins about what its rule of thumb says (pair v overs 52–58%, pair v pair 78–84%, kicker 65–77%, overs v unders 58–68%, pair v one over 65–74%, flush draw v pair 58–67%, top pair v open-ended 78–86%)",
    inR("pairOvers",.52,.58)&&inR("pairPair",.78,.84)&&inR("dominated",.65,.77)&&inR("oversUnders",.58,.68)&&inR("pairOneOver",.65,.74)&&inR("drawVsPair",.58,.67)&&inR("madeVsDraw",.78,.86),
    Object.entries(fv).map(([k,v])=>`${k} ${(v*100).toFixed(0)}`).join(", "));
  check("bands: within 5 points Close, 5–10 Some way off, over 10 Well off",run(`[eqBand(0).id,eqBand(-5).id,eqBand(5.1).id,eqBand(-10).id,eqBand(10.5).id,eqBand(60).id].join()`)==="close,close,off,off,far,far");
  const fails=[];
  {const w=makeWorld("?mode=equity");if(!/data-game="poker"/.test(w.els.app.innerHTML))fails.push("picker lacks equity");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();if(!/RULES OF THUMB/.test(w.els.app.innerHTML)||!/id="go"/.test(w.els.app.innerHTML))fails.push("no equity intro");
   w.run('R.s=hashSeed("EQSCR")');w.els.go.onclick();const seen=new Set();let nq=0;
   for(let k=0;k<30;k++){const h=w.els.app.innerHTML;
     if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
     if(/id="lock"/.test(h)){nq++;const truth=w.run("EQ.q.eq*100");
       /* alternately aim close and far: step the stepper as a player would */
       const target=nq%2?truth:(truth>50?truth-25:truth+25),steps=Math.round((target-50)/5);
       for(let i=0;i<Math.abs(steps);i++)w.els[steps>0?"eq-p":"eq-m"].onclick();
       if(w.els["eq-v"].textContent!==w.run("EQ.guess")+"%")fails.push("stepper shows the wrong value");
       w.els.lock.onclick();const r2=w.els.app.innerHTML,band=w.run("EQ.rec.band");seen.add(band);
       if(!/Your equity/.test(r2)||!/win \/ split/.test(r2))fails.push("answer table missing");
       if(band!=="close"&&!/role="alert"/.test(r2))fails.push("miss without band");
       if(band==="far"&&!/sev-major/.test(r2))fails.push("far miss should be major");continue}
     if(nq>7&&/id="report"/.test(h)){w.els.report.onclick();seen.add("report");if(!/EQUITY SCORE/.test(w.els.app.innerHTML)||!/AVERAGE MISS/.test(w.els.app.innerHTML))fails.push("no report");break}
     if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();continue}
     fails.push("stuck");break}
   for(const x of["close","far","report"])if(!seen.has(x))fails.push("never saw "+x)}
  check("Equity through the real screens: the stepper, Lock in, close and far judged, the exact share and the rule of thumb, report",!fails.length,fails.slice(0,3).join(" | "));
}

/* ---- 8. pre-flop: heads-up push/fold ---------------------------------------------- */
{
  /* HoldemResources, heads-up Nash push/fold, no ante (holdemresources.net/hune):
     the largest stack (bb) each hand is shoved / called with; 20 = "20+". */
  const PUB_SHOVE={"72o":1.6,"32o":1.4,"K2o":11.6,"Q2o":7.0,"J2o":4.6,"T2o":2.9,"92o":2.2,"82o":1.8,"63o":1.7,"T5o":4.1,"J5o":6.0,"K2s":19.3,"Q2s":12.7,"22":20,"A2o":20,"54s":20};
  const PUB_CALL={"A2o":15.8,"K2o":8.1,"Q2o":5.6,"22":15.0,"K9o":17.1,"Q9o":11.7,"J9o":9.5,"T9o":8.4};
  const r=JSON.parse(run(`(()=>{const o={},I=n=>PF_HANDS.indexOf(n);
    o.n=PF_HANDS.length;o.combos=PF_HANDS.reduce((a,n)=>a+pfCombos(n),0);o.stacks=Object.keys(PF_EV).map(Number).sort((a,b)=>a-b);
    o.shove=${JSON.stringify(Object.keys(PUB_SHOVE))}.map(n=>Math.min(20,PF_SHOVE_TO[I(n)]));
    o.call=${JSON.stringify(Object.keys(PUB_CALL))}.map(n=>Math.min(20,PF_CALL_TO[I(n)]));
    o.aa=o.stacks.every(S=>pfPlays("sb",S,I("AA"))&&pfPlays("bb",S,I("AA")));
    o.shares=o.stacks.map(S=>[PF_EV[S].shoveShare,PF_EV[S].callShare]);
    o.grid=new Set();for(let r=0;r<13;r++)for(let c=0;c<13;c++)o.grid.add(pfGridName(r,c));o.grid=[...o.grid].filter(n=>I(n)>=0).length;
    o.names=[pfNameOf([{r:14,s:0},{r:13,s:0}]),pfNameOf([{r:7,s:1},{r:2,s:3}]),pfNameOf([{r:9,s:1},{r:9,s:3}]),pfNameOf([{r:2,s:1},{r:7,s:3}])];
    o.cons=0;o.tot=0;for(const S of o.stacks)for(let i=0;i<169;i++){o.tot++;if((S<=PF_SHOVE_TO[i])===pfPlays("sb",S,i))o.cons++}
    R.s=hashSeed("PFQ");const bad=[],seen={};
    for(let k=0;k<300;k++){const role=k%2?"bb":"sb",q=pfQuestion(role);seen[role+":"+q.answer]=(seen[role+":"+q.answer]||0)+1;if(q.close)seen.close=(seen.close||0)+1;
      if(pfNameOf(q.cards)!==q.name)bad.push("cards "+q.name);if((q.gain>0)!==(q.answer!=="fold"))bad.push("answer");
      if(q.S<2||q.S>20)bad.push("stack");if(Math.abs(q.foldV-(role==="sb"?-.5:-1))>1e-12)bad.push("fold value")}
    o.bad=[...new Set(bad)];o.seen=seen;return JSON.stringify(o)})()`));
  check("pre-flop data: the 169 hands make all 1,326 combos; the 13×13 grid names each once; stacks 1.5–20 in halves; hands named from cards",
    r.n===169&&r.combos===1326&&r.grid===169&&r.stacks.length===38&&r.stacks[0]===1.5&&r.names.join()==="AKs,72o,99,72o",r.names.join());
  const dS=Object.keys(PUB_SHOVE).map((n,k)=>[n,r.shove[k]-PUB_SHOVE[n]]),dC=Object.keys(PUB_CALL).map((n,k)=>[n,r.call[k]-PUB_CALL[n]]);
  const worst=dS.concat(dC).reduce((a,b)=>Math.abs(b[1])>Math.abs(a[1])?b:a);
  check("the equilibrium matches HoldemResources' published heads-up table: 24 thresholds, each within 0.35 bb (K2o shoved to 11.6, K9o called to 17.1...)",
    Math.abs(worst[1])<=.35,dS.concat(dC).map(([n,d])=>`${n} ${d>=0?"+":""}${d.toFixed(1)}`).join(" "));
  check("aces are shoved and called at every stack; the deeper the stacks, the fewer hands shoved and called",
    r.aa&&r.shares[1][0]>r.shares[37][0]&&r.shares[1][1]>r.shares[37][1]&&r.shares[1][0]>.9&&r.shares[37][0]<.7,
    `shove ${(r.shares[1][0]*100).toFixed(0)}% at 2 bb → ${(r.shares[37][0]*100).toFixed(0)}% at 20; call ${(r.shares[1][1]*100).toFixed(0)}% → ${(r.shares[37][1]*100).toFixed(0)}%`);
  check("the chart's thresholds agree with the values at the game's stacks (99%+ of hand-stack pairs; the rest are the equilibrium's small gaps)",r.cons/r.tot>=.99,`${r.cons} of ${r.tot}`);
  check("questions: the answer follows the value; both seats get both answers; some close ones; the cards are the hand named",
    !r.bad.length&&r.seen["sb:shove"]>20&&r.seen["sb:fold"]>20&&r.seen["bb:call"]>20&&r.seen["bb:fold"]>20&&r.seen.close>=3,JSON.stringify(r.seen)+" "+r.bad.join(","));
  const fails=[];
  {const w=makeWorld("?mode=preflop");if(!/data-game="poker"/.test(w.els.app.innerHTML))fails.push("picker lacks pre-flop");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();if(!/Shove or fold\?/.test(w.els.app.innerHTML))fails.push("no pre-flop intro");
   w.run('R.s=hashSeed("PFSCR")');w.run('newPreflop("sb");nextPreflop()');const seen=new Set();let nq=0;
   for(let k=0;k<40;k++){const h=w.els.app.innerHTML;
     if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
     if(/id="pf-play"/.test(h)){nq++;const right=w.run("PF.q.answer"),role=w.run("PF.q.role"),play=role==="sb"?"shove":"call",close=w.run("PF.q.close");
       const a=nq%3?right:(right==="fold"?play:"fold");w.els[a==="fold"?"pf-fold":"pf-play"].onclick();const r2=w.els.app.innerHTML;
       seen.add(role+(a===right?"-right":"-wrong"));
       if((r2.match(/<span class="(in)?( me)?">/g)||[]).length!==169)fails.push("grid not 169 cells");
       if((r2.match(/ me">/g)||[]).length!==1)fails.push("your hand not marked once");
       if(!/Folding<\/td>/.test(r2)||!/better by/.test(r2))fails.push("values missing");
       if(a!==right&&!close&&!/role="alert"/.test(r2))fails.push("wrong without band");
       if(nq===8){w.els.switch.onclick();continue}
       continue}
     if(nq>12&&/id="report"/.test(h)){w.els.report.onclick();seen.add("report");if(!/PRE-FLOP SCORE/.test(w.els.app.innerHTML)||!/GIVEN AWAY/.test(w.els.app.innerHTML))fails.push("no report");break}
     if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();continue}
     fails.push("stuck");break}
   for(const x of["sb-right","sb-wrong","bb-right","bb-wrong","report"])if(!seen.has(x))fails.push("never saw "+x);
   if(!(w.run("PF.lost")>0))fails.push("wrong answers should give big blinds away")}
  check("Pre-flop through the real screens: both seats, shove/call/fold judged in big blinds, the chart line and the 13×13 range with your hand, report",!fails.length,fails.slice(0,3).join(" | "));
}

/* ---- 9. ranges -------------------------------------------------------------------- */
{
  const r=JSON.parse(run(`(()=>{const C=(r,s)=>({r,s}),cnt=(seen,t)=>rgCombos(seen,t).length,o={};
    const AK=(a,b)=>(a.r===14&&b.r===13)||(a.r===13&&b.r===14),S=(a,b)=>a.s===b.s,mine=[C(14,0),C(13,2)];
    o.fresh=[cnt([],AK),cnt([],(a,b)=>AK(a,b)&&S(a,b)),cnt([],(a,b)=>AK(a,b)&&!S(a,b)),cnt([],(a,b)=>a.r===13&&b.r===13)];
    o.block=[cnt(mine,AK),cnt(mine,(a,b)=>AK(a,b)&&S(a,b)),cnt(mine,(a,b)=>AK(a,b)&&!S(a,b)),cnt(mine,(a,b)=>a.r===13&&b.r===13),cnt(mine,(a,b)=>a.r===14&&b.r===14)];
    const flop=[C(13,0),C(7,2),C(2,3)],mono=[C(13,1),C(7,1),C(2,1)];
    o.sets=cnt(flop,(a,b)=>a.r===b.r&&[13,7,2].includes(a.r));o.flush=cnt(mono,(a,b)=>a.s===1&&b.s===1);
    R.s=hashSeed("RGQ");const bad=[],kinds={};
    for(let k=0;k<200;k++){const q=comboQuestion();kinds[q.t.kind]=(kinds[q.t.kind]||0)+1;const seen=q.hole.concat(q.board);let n=0;
      const d=pkDeck();for(let i=0;i<52;i++)for(let j=i+1;j<52;j++){if(seen.some(c=>sameCard(c,d[i])||sameCard(c,d[j])))continue;if(q.t.test(d[i],d[j]))n++}
      if(n!==q.answer)bad.push(q.t.kind+" count");
      if(/undefined|NaN/.test(q.t.sum+q.t.ask))bad.push("text");if(q.fresh<q.answer)bad.push("fresh")}
    o.kinds=kinds;o.bad=[...new Set(bad)];return JSON.stringify(o)})()`));
  check("combos by the textbook: ace-king 16 ways (4 suited, 12 offsuit), kings 6; holding A♠ K♥: ace-king 9 (2 suited, 7 offsuit), kings 3, aces 3; sets on K-7-2 9; a flush on a one-suit flop 45",
    r.fresh.join()==="16,4,12,6"&&r.block.join()==="9,2,7,3,3"&&r.sets===9&&r.flush===45,`${r.fresh} | ${r.block} | ${r.sets} ${r.flush}`);
  check("combo questions: every kind comes up; every count recounted over all 1,326 two-card hands",Object.keys(r.kinds).length===7&&!r.bad.length,JSON.stringify(r.kinds)+" "+r.bad.join(","));
  /* Equity against the shoving range, from the solved values, against a simulation: deal the
     Shark random hands, keep those its equilibrium shoves, run the board out. */
  const sim=JSON.parse(run(`(()=>{R.s=hashSeed("RGSIM");const out=[];
    for(const [name,S] of [["Q9o",10],["22",8],["A5s",15],["K7o",5]]){const i=pfIndex(name),me=pfDeal(name);let w=0,n=0;
      while(n<6000){const d=shuffle(unseenCards(me)),sh=d.slice(0,2);if(!pfPlays("sb",S,pfIndex(pfNameOf(sh))))continue;
        const bd=d.slice(2,7),x=eval7(me.concat(bd)),y=eval7(sh.concat(bd));w+=x>y?1:x===y?.5:0;n++}
      out.push([name,S,w/n,rgRangeEquity(S,i)])}return JSON.stringify(out)})()`));
  check("equity against the Shark's shoving range (from the solved values) agrees with a simulation within 2.5 points",
    sim.every(([,,a,b])=>Math.abs(a-b)<.025),sim.map(([n,S,a,b])=>`${n}@${S}: ${(b*100).toFixed(1)} v sim ${(a*100).toFixed(1)}`).join(", "));
  check("what calling a shove needs: (S − 1) ÷ 2S, so 45% at 10 big blinds, 37.5% at 4",Math.abs(run("rgNeeded(10)")-.45)<1e-12&&Math.abs(run("rgNeeded(4)")-.375)<1e-12);
  const fails=[];
  {const w=makeWorld("?mode=ranges");if(!/data-game="poker"/.test(w.els.app.innerHTML))fails.push("picker lacks ranges");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();if(!/COUNTING COMBOS/.test(w.els.app.innerHTML))fails.push("no ranges intro");
   w.run('R.s=hashSeed("RGSCR")');w.run('newRanges("combos");nextRanges()');const seen=new Set();let nq=0;
   for(let k=0;k<40;k++){const h=w.els.app.innerHTML;
     if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
     if(/id="lock"/.test(h)){nq++;const part=w.run("RG.part"),step=part==="combos"?1:5,start=w.run("RG.v");
       const truth=part==="combos"?w.run("RG.q.answer"):w.run("RG.q.eq*100"),target=nq%2?truth:truth+(part==="combos"?3:20),steps=Math.round((Math.min(part==="combos"?60:100,target)-start)/step);
       for(let i=0;i<Math.abs(steps);i++)w.els[steps>0?"rg-p":"rg-m"].onclick();
       w.els.lock.onclick();const r2=w.els.app.innerHTML,ok=w.run("RG.rec.optimal");seen.add(part+(ok?"-right":"-wrong"));
       if(part==="range"&&(!/Calling needs/.test(r2)||(r2.match(/ me">/g)||[]).length!==1))fails.push("range answer incomplete");
       if(part==="combos"&&!/Here: /.test(r2))fails.push("no sum");
       if(!ok&&!/role="alert"/.test(r2))fails.push("wrong without band");
       if(nq===8)w.els.switch.onclick();continue}
     if(nq>12&&/id="report"/.test(h)){w.els.report.onclick();seen.add("report");if(!/RANGE SCORE/.test(w.els.app.innerHTML))fails.push("no report");break}
     if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();continue}
     fails.push("stuck");break}
   for(const x of["combos-right","combos-wrong","range-right","range-wrong","report"])if(!seen.has(x))fails.push("never saw "+x)}
  check("Ranges through the real screens: combos counted with the sum, equity against a range with the grid and what calling needs, report",!fails.length,fails.slice(0,3).join(" | "));
}

/* ---- 10. heads-up match ------------------------------------------------------------- */
{
  const r=JSON.parse(run(`(()=>{const o={};
    const a=pfAt(10),b=PF_EV[10],c=pfAt(10.25),d=PF_EV[10.5];
    o.interp=a.shove.every((v,i)=>v===b.shove[i])&&c.call.every((v,i)=>Math.abs(v-(b.call[i]+d.call[i])/2)<1e-9);
    function sim(policy,seed){R.s=hashSeed(seed);const M=newMatchState();let exp=0,res=0,bad=0,levels=new Set(),sharkOK=true;
      while(!M.over&&M.hand<400){const h=mtDeal(M),c=mtYourChoice(h);levels.add(h.BB);let mv=null;
        if(h.sb==="shark"&&!h.auto&&(h.sharkMove==="shove")!==(pfAt(h.S).shove[pfIndex(h.sharkName)]>-.5))sharkOK=false;
        if(c){const best=c.playV>c.foldV?c.play:"fold";mv=policy==="best"?best:policy==="fold"?"fold":policy==="play"?c.play:(rng()<.5?c.play:"fold");exp+=(mv==="fold"?c.foldV:c.playV)*h.BB}
        const y0=M.you;mtPlay(M,h,mv);if(M.you+M.shark!==2*MT_START)bad++;if(c)res+=M.you-y0}
      return{won:M.winner==="you",hands:M.hand,over:M.over,bad,levels:levels.size,sharkOK,luck:res-exp}}
    const P={};for(const pol of["best","fold","play","random"]){let w=0,h=0,bad=0,over=0,lv=0,sk=true,luck=[];
      for(let k=0;k<300;k++){const x=sim(pol,pol+k);w+=x.won;h+=x.hands;bad+=x.bad;over+=x.over;lv=Math.max(lv,x.levels);sk=sk&&x.sharkOK;luck.push(x.luck)}
      const m=luck.reduce((a,b)=>a+b,0)/luck.length,sd=Math.sqrt(luck.reduce((a,b)=>a+(b-m)**2,0)/luck.length);
      P[pol]={win:w/300,hands:h/300,bad,over,lv,sk,luckMean:m,luckSE:sd/Math.sqrt(300)}}
    o.P=P;return JSON.stringify(o)})()`));
  const P=r.P;
  check("match values at any stack: exact at each half big blind, a straight line between",r.interp);
  check("matches: chips always add up to 2,000; every match ends; the blinds rise; the Shark plays its strategy",
    Object.values(P).every(p=>p.bad===0&&p.over===300&&p.sk)&&P.best.lv>=4,Object.entries(P).map(([k,p])=>`${k}: ${p.hands.toFixed(0)} hands, ${p.lv} levels`).join("; "));
  check("the Shark's best play wins more matches than folding everything, shoving everything or guessing; folding everything nearly always loses",
    P.best.win>P.play.win&&P.best.win>P.random.win&&P.best.win>P.fold.win&&P.fold.win<.1&&P.best.win>=.42,
    Object.entries(P).map(([k,p])=>`${k} ${(p.win*100).toFixed(0)}%`).join(", "));
  check("luck averages out: over 300 matches the cards' gift (result − expected) is within 3 standard errors of zero",
    Math.abs(P.best.luckMean)<3*P.best.luckSE+1,`${P.best.luckMean.toFixed(1)} ± ${P.best.luckSE.toFixed(1)} chips a match`);
  const fails=[];let msg=false;
  {const w=makeWorld("?mode=match");if(!/data-game="poker"/.test(w.els.app.innerHTML))fails.push("picker lacks the match");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();if(!/Start playing/.test(w.els.app.innerHTML))fails.push("no match intro");
   for(let game=0;game<6&&!(msg&&game>=2);game++){
     w.run(`R.s=hashSeed("MTSCR${game}")`);w.run(game===0?'newMatchGame();nextMatchHand()':'nextGame()');let n=0,ended=false;
     for(let k=0;k<1200;k++){const h=w.els.app.innerHTML;
       if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
       if(/id="mt-play"/.test(h)){n++;const best=w.run("(()=>{const c=mtYourChoice(MT.h);return c.playV>c.foldV?c.play:'fold'})()");
         const play=w.run("mtYourChoice(MT.h).play"),mv=n%3===0?(best==="fold"?play:"fold"):best;w.els[mv==="fold"?"mt-fold":"mt-play"].onclick();
         const r2=w.els.app.innerHTML;if(!/On average, against the hands/.test(r2))fails.push("no decision verdict");
         if(/You won the pot\. The Shark says it was a bad/.test(r2))msg=true;continue}
       if(/class="mission">(You win the game|The Shark wins the game)/.test(h)){ended=true;
         if(game===1){w.els.report.onclick();const rp=w.els.app.innerHTML;if(!/SHARK SCORE/.test(rp)||!/was luck/.test(rp)||!/Games: you \d+, the Shark \d+/.test(rp))fails.push("session report incomplete")}
         break}
       if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();continue}
       fails.push("stuck: "+h.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,80));break}
     if(!ended)fails.push("match "+game+" did not end")}
   if(!msg)fails.push("never said 'You won the pot. The Shark says it was a bad ...'");
   const chk=w.run("MT.M.you+MT.M.shark");if(chk!==2000)fails.push("chips "+chk);
   const g=w.run("MT.games.length"),d=w.run("MT.T.decisions.length");if(g<2)fails.push("games not counted");if(d<5)fails.push("decisions not kept across games")}
  check("the match through the real screens: hands, the Shark's verdict on each decision, 'You won the pot. The Shark says it was a bad ...', games counted, the session report with skill and luck apart",!fails.length,fails.slice(0,3).join(" | "));
}

/* ---- 11. post-flop ---------------------------------------------------------------- */
{
  const r=JSON.parse(run(`(()=>{const C=(r,s)=>({r,s}),o={};
    const b1=[C(13,0),C(7,2),C(2,3)],b2=[C(13,0),C(7,0),C(2,2)],b3=[C(13,0),C(7,2),C(4,3)];
    o.cls=[poClassify([C(14,1),C(13,2)],b1),poClassify([C(7,0),C(7,1)],b1),poClassify([C(12,0),C(12,1)],b1),poClassify([C(14,0),C(14,1)],b1),
      poClassify([C(9,0),C(8,0)],b2),poClassify([C(6,1),C(5,1)],b3),poClassify([C(12,1),C(11,2)],b1),poClassify([C(7,0),C(3,1)],b1)];
    R.s=hashSeed("POQ");const bad=[],seen={},types={},kinds={};
    for(let k=0;k<24;k++){const q=postflopQuestion();types[q.type]=(types[q.type]||0)+1;kinds[q.kind.k]=1;seen[q.answer]=(seen[q.answer]||0)+1;if(q.close)seen.close=(seen.close||0)+1;
      const vis=q.hole.concat(q.board),all=[...q.range.value,...q.range.draw,...q.range.bluff];
      if(all.some(h=>h.some(c=>vis.some(v=>sameCard(v,c)))))bad.push("seen card in range");
      if(all.some(h=>!poPreflop(h)))bad.push("outside the pre-flop range");
      for(const k2 of["value","draw","bluff"])if(q.range[k2].some(h=>poClassify(h,q.board)!==k2))bad.push("class "+k2);
      if(q.type==="honest"&&q.range.bluff.length)bad.push("honest bluffs");
      if(q.type!=="honest"&&Math.abs(q.range.bluff.length-Math.round(q.range.value.length*PO_TYPES[q.type].bluffs))>0)bad.push("bluff count");
      if(!poYourHandOK(q.kind.k,q.hole,q.board))bad.push("your hand");
      if(k<3){let s=0;for(const h of all)s+=equity(q.hole,h,q.board).eq;if(Math.abs(s/all.length-q.eq.all)>1e-9)bad.push("equity")}
      if(Math.abs(q.ev-(q.eq.all*(q.pot+q.bet)-(1-q.eq.all)*q.bet))>1e-6||(q.ev>0)!==(q.answer==="call"))bad.push("answer")}
    o.bad=[...new Set(bad)];o.seen=seen;o.types=types;o.kinds=Object.keys(kinds).length;return JSON.stringify(o)})()`));
  check("the range's classes: ace-king on K-7-2 is value (top pair), sevens a set, queens a weak pair (out), aces value, nine-eight of the suit a flush draw, six-five a straight draw, queen-jack a bluff, seven-three a weak pair",
    r.cls.join()==="value,value,weak,value,draw,draw,bluff,weak",r.cls.join());
  check("post-flop questions: no visible card in the range; only pre-flop hands; every combo in its class; honest never bluffs, the others bluff their share; equity recomputed; the answer follows the value",
    !r.bad.length&&r.seen.call>=4&&r.seen.fold>=4&&Object.keys(r.types).length===3,JSON.stringify(r.seen)+" "+JSON.stringify(r.types)+" "+r.bad.join(","));
  const fails=[];
  {const w=makeWorld("?mode=postflop");if(!/data-game="poker"/.test(w.els.app.innerHTML))fails.push("picker lacks post-flop");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();if(!/THE SHARK'S RANGE/.test(w.els.app.innerHTML))fails.push("no post-flop intro");
   w.run('R.s=hashSeed("POSCR")');w.els.go.onclick();w.drain();const seen=new Set();let nq=0;
   for(let k=0;k<30;k++){const h=w.els.app.innerHTML;
     if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
     if(/id="po-call"/.test(h)){nq++;if(!/Value<\/b> · \d+ way/.test(h))fails.push("range not shown");
       const right=w.run("PO2.q.answer"),a=nq%2?right:(right==="call"?"fold":"call");w.els["po-"+a].onclick();const r2=w.els.app.innerHTML;
       seen.add(a===right?"right":"wrong");if(!/against the whole range/.test(r2)||!/you \d+%/.test(r2))fails.push("equity by part missing");
       if(a!==right&&!w.run("PO2.q.close")&&!/role="alert"/.test(r2))fails.push("wrong without band");continue}
     if(nq>7&&/id="report"/.test(h)){w.els.report.onclick();seen.add("report");if(!/POST-FLOP SCORE/.test(w.els.app.innerHTML))fails.push("no report");break}
     if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();w.drain();continue}
     fails.push("stuck");break}
   for(const x of["right","wrong","report"])if(!seen.has(x))fails.push("never saw "+x)}
  check("Post-flop through the real screens: the range by part, call/fold judged, equity against each part and the whole, report",!fails.length,fails.slice(0,3).join(" | "));
}

/* ---- 12. bluff or value ------------------------------------------------------------ */
{
  const r=JSON.parse(run(`(()=>{R.s=hashSeed("BLQ");const bad=[],types={},ans={};const bal=[];
    for(let k=0;k<40;k++){const q=bluffQuestion();types[q.type]=(types[q.type]||0)+1;ans[q.close?"close":q.answer]=(ans[q.close?"close":q.answer]||0)+1;
      const me=eval7(q.hole.concat(q.board)),vis=q.hole.concat(q.board),all=[...q.range.value,...q.range.ties,...q.range.bluff];
      if(all.some(h=>h.some(c=>vis.some(v=>sameCard(v,c)))))bad.push("seen card");
      if(all.some(h=>!poPreflop(h)))bad.push("pre-flop");
      if(q.range.value.some(h=>eval7(h.concat(q.board))<=me))bad.push("value doesn't beat you");
      if(q.range.bluff.some(h=>eval7(h.concat(q.board))>=me||catOf(h.concat(q.board))!==0))bad.push("bluff isn't a bluff");
      if(q.range.ties.some(h=>eval7(h.concat(q.board))!==me))bad.push("tie");
      const n=all.length,ev=(q.range.bluff.length*(q.pot+q.bet)-q.range.value.length*q.bet+q.range.ties.length*q.pot/2)/n;
      if(Math.abs(ev-q.ev)>1e-9||((q.ev>0)!==(q.answer==="call")))bad.push("answer");
      if(Math.abs(q.need-q.bet/(q.pot+2*q.bet))>1e-12)bad.push("need");
      if(Math.abs(q.range.bluff.length-q.range.want)>0)bad.push("bluff count");
      if(q.type==="balanced")bal.push(q.ev/q.bet)}
    return JSON.stringify({bad:[...new Set(bad)],types,ans,bal})})()`));
  check("bluff-or-value questions: value always beats your hand, bluffs never pair and always lose to it, ties tie; no visible card; only pre-flop hands; each type bluffs its share; the answer follows the value",
    !r.bad.length&&Object.keys(r.types).length===5&&(r.ans.call||0)>=5&&(r.ans.fold||0)>=5,JSON.stringify(r.types)+" "+JSON.stringify(r.ans)+" "+r.bad.join(","));
  check("a balanced Shark makes calling break even: within 1.5% of the call (rounding to whole combos)",r.bal.length>=3&&r.bal.every(x=>Math.abs(x)<.015),r.bal.map(x=>(x*100).toFixed(1)+"%").join(", "));
  const fails=[];
  {const w=makeWorld("?mode=bluff");if(!/data-game="poker"/.test(w.els.app.innerHTML))fails.push("picker lacks bluff");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();if(!/Catch the bluff/.test(w.els.app.innerHTML))fails.push("no intro");
   w.run('R.s=hashSeed("BLSCR")');w.els.go.onclick();w.drain();const seen=new Set();let nq=0;
   for(let k=0;k<30;k++){const h=w.els.app.innerHTML;
     if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
     if(/id="bl-call"/.test(h)){nq++;if(!/Bluffs<\/b> · \d+ way/.test(h))fails.push("range not shown");if(/BETTING RANGE · /.test(h))fails.push("type shown before the answer");
       const right=w.run("BL.q.answer"),a=nq%2?right:(right==="call"?"fold":"call");w.els["bl-"+a].onclick();const r2=w.els.app.innerHTML;
       seen.add(a===right?"right":"wrong");if(!/need <b>|need \d/.test(r2)||!/This was <b>/.test(r2))fails.push("feedback missing");
       if(a!==right&&!w.run("BL.q.close")&&!/role="alert"/.test(r2))fails.push("wrong without band");continue}
     if(nq>7&&/id="report"/.test(h)){w.els.report.onclick();seen.add("report");if(!/BLUFF SCORE/.test(w.els.app.innerHTML))fails.push("no report");break}
     if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();w.drain();continue}
     fails.push("stuck");break}
   for(const x of["right","wrong","report"])if(!seen.has(x))fails.push("never saw "+x)}
  check("Bluff or value through the real screens: the range counted, the type hidden until you answer, the bluffs v the price, report",!fails.length,fails.slice(0,3).join(" | "));
}

/* ---- 13. bet sizing ---------------------------------------------------------------- */
{
  const r=JSON.parse(run(`(()=>{const o={};o.calls=[szCalls(300,"balanced",600,300),szCalls(300,"balanced",600,600),szCalls(300,"tight",600,600),szCalls(300,"sticky",600,200)];
    R.s=hashSeed("SZQ");const bad=[],best={},nuts=[];
    for(let k=0;k<40;k++){const q=sizingQuestion();best[q.best.id]=(best[q.best.id]||0)+1;
      const n=q.range.length,vis=q.hole.concat(q.board),me=eval7(vis);
      if(q.range.some(x=>x.h.some(c=>vis.some(v=>sameCard(v,c)))||!poPreflop(x.h)))bad.push("range");
      if(q.range.some(x=>x.res!==(x.s>me?-1:x.s<me?1:0)))bad.push("result");
      for(const v of q.vals){let tot=0;
        if(!v.f){for(const x of q.range)tot+=x.res>0?q.pot:x.res===0?q.pot/2:0}
        else{const c=Math.min(n,Math.round(n*Math.min(1,PO_TYPES&&SZ_TYPES[q.type].f*q.pot/(q.pot+v.bet))));
          q.range.forEach((x,i)=>{tot+=i<c?(x.res>0?q.pot+v.bet:x.res===0?q.pot/2:-v.bet):q.pot})}
        if(Math.abs(tot/n-v.value)>1e-9)bad.push("value "+v.id)}
      if(q.vals.some(v=>v.value>q.best.value))bad.push("best");
      if(q.beats===1)nuts.push(q.best.id)}
    o.bad=[...new Set(bad)];o.best=best;o.nuts=nuts;return JSON.stringify(o)})()`));
  check("the calling rule: balanced calls 2/3 of 300 hands facing a half-pot bet and 1/2 facing a pot bet; tight 70% of that; sticky more",
    r.calls.join()==="200,150,105,293",r.calls.join());
  check("sizing questions: the range never holds a visible card; every option's value recounted; the best is the highest; at least four different best answers, checks among them",
    !r.bad.length&&Object.keys(r.best).length>=4&&r.best.check>=1,JSON.stringify(r.best)+" "+r.bad.join(","));
  const fails=[];
  {const w=makeWorld("?mode=sizing");if(!/data-game="poker"/.test(w.els.app.innerHTML))fails.push("picker lacks sizing");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();if(!/THE SHARK'S RULE/.test(w.els.app.innerHTML))fails.push("no intro");
   w.run('R.s=hashSeed("SZSCR")');w.els.go.onclick();w.drain();const seen=new Set();let nq=0;
   for(let k=0;k<30;k++){const h=w.els.app.innerHTML;
     if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
     if(/id="sz-check"/.test(h)){nq++;const best=w.run("SZ.q.best.id"),a=nq%2?best:(best==="check"?"big":"check");w.els["sz-"+a].onclick();const r2=w.els.app.innerHTML;
       seen.add(w.run("SZ.rec.optimal")?"right":"wrong");if(!/← you/.test(r2)||(r2.match(/<tr/g)||[]).length<7)fails.push("options table missing");continue}
     if(nq>7&&/id="report"/.test(h)){w.els.report.onclick();seen.add("report");if(!/SIZING SCORE/.test(w.els.app.innerHTML))fails.push("no report");break}
     if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();w.drain();continue}
     fails.push("stuck");break}
   for(const x of["right","wrong","report"])if(!seen.has(x))fails.push("never saw "+x)}
  check("Bet sizing through the real screens: six options, every one's value shown, report",!fails.length,fails.slice(0,3).join(" | "));
  {const nb=JSON.parse(run(`(()=>{const nuts=Array.from({length:300},()=>({res:1})),half=Array.from({length:300},(_,i)=>({res:i<150?-1:1}));
     return JSON.stringify(Object.keys(SZ_TYPES).map(t=>[szValues(nuts,t,600).reduce((a,b)=>b.value>a.value?b:a).id,szValues(half,t,600).reduce((a,b)=>b.value>a.value?b:a).id]))})()`));
   check("a hand that beats the whole range bets biggest against every type; one that loses to the top half of the range checks",nb.every(([a,b])=>a==="big"&&b==="check"),JSON.stringify(nb))}
}

/* ---- 14. range detective ------------------------------------------------------------ */
{
  const r=JSON.parse(run(`(()=>{R.s=hashSeed("DTQ");const bad=[],seen={},flips={n:0};
    for(let k=0;k<36;k++){const q=detectiveQuestion();seen[q.style+"/"+q.size]=1;const S=q.S,b=q.board,me=eval7(q.hole.concat(b)),st=q.ST;
      const all=S.big.concat(S.small),vis=q.hole.concat(b);
      if(all.some(x=>x.h.some(c=>vis.some(v=>sameCard(v,c)))||!poPreflop(x.h)))bad.push("range");
      if(new Set(all.map(x=>x.h.map(pkText).sort().join(""))).size!==all.length)bad.push("a hand in both sizes");
      const bigV=S.big.length-S.bigBluffs,smV=S.small.length-S.smallBluffs;
      if(bigV!==Math.round(S.n*DT_BIG)||smV!==Math.round(S.n*DT_SMALL))bad.push("value shares");
      if(S.bigBluffs>Math.round(bigV*st.big)||S.smallBluffs>Math.round(smV*st.small))bad.push("bluff counts");
      if(Math.min(...S.big.slice(0,bigV).map(x=>x.s))<Math.max(...S.small.slice(0,smV).map(x=>x.s)))bad.push("big value weaker than small");
      if([...S.big.slice(bigV),...S.small.slice(smV)].some(x=>catOf(x.h.concat(b))!==0))bad.push("bluff with a pair");
      const m={strong:0,pair:0,missed:0,nothing:0};for(const x of q.part)m[dtGroup(x.h,b)]++;
      if(JSON.stringify(m)!==JSON.stringify(q.counts)||!q.likely.every(l=>q.counts[l]===Math.max(...Object.values(m))))bad.push("counts");
      let v=0;for(const x of q.part)v+=x.s>me?-q.bet:x.s<me?q.pot+q.bet:q.pot/2;if(Math.abs(v/q.part.length-q.ev)>1e-9||(q.ev>0)!==(q.answer==="call"))bad.push("call value");
      if(q.answer!==q.otherAnswer)flips.n++}
    return JSON.stringify({bad:[...new Set(bad)],seen:Object.keys(seen).length,flips:flips.n})})()`));
  check("range detective: big bets are its strongest 15% plus bluffs, small the next 25% plus bluffs, no hand in both, bluffs never pair, each style's bluff count; counts and call values recounted",
    !r.bad.length&&r.seen>=5,r.seen+" style/size pairs "+r.bad.join(","));
  check("the size changes the answer: the same hand calls one size and folds the other in a good share of deals",r.flips>=8,`${r.flips} of 36`);
  const fails=[];
  {const w=makeWorld("?mode=detective");if(!/data-game="poker"/.test(w.els.app.innerHTML))fails.push("picker lacks detective");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();if(!/Read the bet/.test(w.els.app.innerHTML))fails.push("no intro");
   w.run('R.s=hashSeed("DTSCR")');w.els.go.onclick();w.drain();const seen=new Set();let nq=0;
   for(let k=0;k<40;k++){const h=w.els.app.innerHTML;
     if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
     if(/id="dt-strong"/.test(h)){nq++;const l=w.run("DT.q.likely[0]"),a=nq%2?l:(l==="nothing"?"strong":"nothing");w.els["dt-"+a].onclick();seen.add(a===l?"read-right":"read-wrong");
       if(!/ways? · \d+%/.test(w.els.app.innerHTML))fails.push("counts missing");continue}
     if(/id="dt-call"/.test(h)){const right=w.run("DT.q.answer"),a=nq%3?right:(right==="call"?"fold":"call");w.els["dt-"+a].onclick();const r2=w.els.app.innerHTML;
       seen.add(a===right?"call-right":"call-wrong");if(!/Had it bet/.test(r2))fails.push("no other-size contrast");continue}
     if(nq>5&&/id="report"/.test(h)){w.els.report.onclick();seen.add("report");if(!/DETECTIVE SCORE/.test(w.els.app.innerHTML))fails.push("no report");break}
     if(/id="next"/.test(h)){const f=w.els.next.onclick;w.els.next.onclick=null;f();w.drain();continue}
     fails.push("stuck");break}
   for(const x of["read-right","read-wrong","call-right","report"])if(!seen.has(x))fails.push("never saw "+x)}
  check("Range detective through the real screens: the stated strategy, read the bet with counts, call or fold, the other size, report",!fails.length,fails.slice(0,3).join(" | "));
}

/* ---- 15. the poker path ------------------------------------------------------------ */
{
  const fails=[];
  {const w=makeWorld();const h=w.els.app.innerHTML;
   if((h.match(/data-game="poker"/g)||[]).length!==1||/data-game="poker-/.test(h))fails.push("the picker should offer Poker once");
   w.run('pickSport("poker")');w.els.playThis.onclick();w.drain();const p=w.els.app.innerHTML;
   const modes=[...p.matchAll(/href="\?mode=([a-z]+)#play"/g)].map(m=>m[1]);
   if(modes.join()!=="hands,outs,pot,equity,preflop,ranges,postflop,bluff,sizing,detective,match")fails.push("path order: "+modes.join());
   if(!/· next/.test(p)||(p.match(/· next/g)||[]).length!==1)fails.push("one 'next'");
   for(const m of modes){if(!w.run(`typeof ${{hands:"renderIntro",outs:"renderOutsIntro",pot:"renderPotIntro",equity:"renderEquityIntro",preflop:"renderPreflopIntro",ranges:"renderRangesIntro",postflop:"renderPostflopIntro",bluff:"renderBluffIntro",sizing:"renderSizingIntro",detective:"renderDetectiveIntro",match:"renderMatchIntro"}[m]}`)==="function")fails.push("no intro for "+m)}}
  /* ticks: with storage, reaching a report marks the trainer done and moves 'next' on */
  {const w=makeWorld("?mode=outs");
   w.run(`(()=>{const m={};localStorage={getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)}};})()`);
   w.run('pkMarkDone("hands");pkMarkDone("outs");pkMarkDone("outs")');const d=w.run("JSON.stringify([...pkDoneSet()])");
   if(d!=='["hands","outs"]')fails.push("ticks "+d);
   w.run("renderPath()");const p=w.els.app.innerHTML;if((p.match(/pathno done/g)||[]).length!==2||!/Pot odds · next/.test(p))fails.push("ticked path wrong");
   if(!/2<span class="sub">OF 11 DONE/.test(w.els.hScore.innerHTML))fails.push("header count")}
  {const w=makeWorld("?mode=pot");if(!/All the poker trainers/.test(w.els.foot.innerHTML))fails.push("no way back to the path")}
  /* the report card: a real report records best and last; small reports only tick */
  {const w=makeWorld("?mode=pot");w.run(`(()=>{const m={};localStorage={getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]}};})()`);
   w.run('pkRecord("pot",{score:70,decisions:12});pkRecord("pot",{score:90,decisions:10});pkRecord("pot",{score:60,decisions:12});pkRecord("outs",{score:40,decisions:3});pkRecord("equity",{score:55,decisions:8})');
   const sc=JSON.parse(w.run("JSON.stringify(pkScores())"));
   if(!sc.pot||sc.pot.best!==90||sc.pot.last!==60||sc.outs||!w.run('pkDoneSet().has("outs")'))fails.push("scores "+JSON.stringify(sc));
   w.run("renderPath()");const p=w.els.app.innerHTML;
   if(!/YOUR REPORT CARD/.test(p)||!/AVERAGE BEST<\/div><div class="big">73/.test(p)||!/Work on: Equity/.test(p)||!/last 60/.test(p))fails.push("report card wrong: "+p.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,160));
   if(/function pkCardHTML\(c/.test(w.run("String(pkCardHTML)"))===false)fails.push("card renderer overwritten");
   w.run("pkClear();renderPath()");if(/YOUR REPORT CARD/.test(w.els.app.innerHTML)||/pathno done/.test(w.els.app.innerHTML))fails.push("clear")}
  check("the poker path: Poker once on the picker; every trainer in order with its intro; one 'next'; ticks kept and counted; each trainer links back; the report card (best and last, average, what to work on, clear)",!fails.length,fails.slice(0,3).join(" | "));
}

console.log(failures?`\n${failures} check(s) FAILED`:"\nAll checks passed");
process.exit(failures?1:0);
