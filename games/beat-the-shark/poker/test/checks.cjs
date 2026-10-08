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
check("the picker offers the poker trainer under Casino & probability",/data-game="poker-hands"/.test(W.els.app.innerHTML)&&/CASINO/.test(W.els.app.innerHTML));
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
    const w=makeWorld();w.run('pickSport("poker-hands")');w.els.playThis.onclick();w.drain();
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
  {const w=makeWorld("?mode=outs");if(!/data-game="poker-outs"/.test(w.els.app.innerHTML))fails.push("picker lacks outs");
   w.run('pickSport("poker-outs")');w.els.playThis.onclick();w.drain();
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
  check("questions: the answer follows the value of calling; calls and folds balanced; some close ones",!r.bad.length&&r.call>35&&r.fold>35&&r.close>=5,
    `${r.call} call, ${r.fold} fold, ${r.close} close ${r.bad.join(",")}`);
  const fails=[];
  {const w=makeWorld("?mode=pot");if(!/data-game="poker-pot"/.test(w.els.app.innerHTML))fails.push("picker lacks pot odds");
   w.run('pickSport("poker-pot")');w.els.playThis.onclick();w.drain();if(!/THE SUM/.test(w.els.app.innerHTML)||!/id="go"/.test(w.els.app.innerHTML))fails.push("no pot intro");
   w.run('R.s=hashSeed("POTSCR")');w.els.go.onclick();const seen=new Set();let nq=0;
   for(let k=0;k<30;k++){const h=w.els.app.innerHTML;
     if(/undefined|NaN|\[object/.test(h)){fails.push("broken text: "+h.match(/.{0,40}(undefined|NaN|\[object).{0,20}/)[0]);break}
     if(/id="p-call"/.test(h)){nq++;const right=w.run("PO.q.answer"),a=nq%2?right:(right==="call"?"fold":"call");w.els["p-"+a].onclick();const r2=w.els.app.innerHTML;
       seen.add(a===right?"right":"wrong");if(!/need <b>/.test(r2)||!/A call is worth/.test(r2))fails.push("price table missing");
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
  {const w=makeWorld("?mode=equity");if(!/data-game="poker-equity"/.test(w.els.app.innerHTML))fails.push("picker lacks equity");
   w.run('pickSport("poker-equity")');w.els.playThis.onclick();w.drain();if(!/RULES OF THUMB/.test(w.els.app.innerHTML)||!/id="go"/.test(w.els.app.innerHTML))fails.push("no equity intro");
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

console.log(failures?`\n${failures} check(s) FAILED`:"\nAll checks passed");
process.exit(failures?1:0);
