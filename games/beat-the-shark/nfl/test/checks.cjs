/* ===========================================================================
   games/beat-the-shark/nfl/test/checks.cjs

   Run:  node games/beat-the-shark/nfl/test/checks.cjs

   The NFL game's checks, in the football game's pattern:
     0. LOADING     the scripts in index.html load in order and the start screen draws
     1. INTEGRITY   every event renders with no undefined/NaN/[object, in the black and in the red
     2. ENGINE      the match engine against FixtureShark's real NFL numbers
     3. STABILITY   whole seasons complete under every policy and level
     4. BALANCE     the design targets hold
     5. SCREENS     whole seasons played through the real screens, button by button

   Exit code 0 = all passed. Ranges, not exact values: seasons are random.
   SEASONS=n scales the balance runs (default 240 per policy).
   =========================================================================== */
const fs=require('fs'),vm=require('vm'),path=require('path');
const DIR=path.join(__dirname,'..');
let failures=0;
function check(name,ok,detail){console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?`  (${detail})`:''}`);if(!ok)failures++}
const N=+process.env.SEASONS||150;
const on=k=>!process.env.ONLY||process.env.ONLY.includes(String(k)); // ONLY=45 runs sections 4 and 5

/* ---- a minimal DOM: elements persist by id, timers queue ------------------ */
function makeWorld(){
  const els={},q=[];
  function mk(id){return{id,_h:"",children:[],onclick:null,style:{},dataset:{},className:"",disabled:false,classList:{add(){}},
    set innerHTML(v){this._h=v;this.children=[]},get innerHTML(){return this._h+this.children.map(c=>c.innerHTML).join("")},
    set textContent(v){this._h=String(v)},get textContent(){return this._h},
    appendChild(c){this.children.push(c)},querySelectorAll(){return[]},querySelector(){return null},setAttribute(){}}}
  const doc={getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk("")};
  const ctx=vm.createContext({document:doc,setTimeout:f=>{q.push(f)},clearTimeout:()=>{},Math,JSON,Object,Array,String,Number,Date,Map,Set,console,
    location:{hash:"",pathname:"/"},MC_SIMS:50,SHARK_RUNS:120});
  const html=fs.readFileSync(path.join(DIR,'index.html'),'utf8');
  const srcs=[...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"><\/script>/g)].map(m=>m[1]);
  for(const s of srcs)new vm.Script(fs.readFileSync(path.join(DIR,s),'utf8'),{filename:s}).runInContext(ctx);
  const drain=()=>{let n=0;while(q.length&&n++<20000)q.shift()()};
  return{els,q,drain,run:c=>vm.runInContext(c,ctx),srcs};
}

/* ---- 0. loading --------------------------------------------------------- */
let W;
try{W=makeWorld();check("scripts load in order, as a browser loads them",true,W.srcs.join(" → "))}
catch(e){check("scripts load in order, as a browser loads them",false,e.message);process.exit(1)}
check("the start screen offers the sports, the NFL to play",/Pick a sport/.test(W.els.app.innerHTML)&&/id="playThis" data-game="nfl"/.test(W.els.app.innerHTML)&&/data-game="football" href="..\/"/.test(W.els.app.innerHTML));
/* Every local script and stylesheet carries ?v=__V__, which the game
   site's build stamps with the commit, so no browser keeps old files. */
{const miss=[];for(const f of["../index.html","index.html"]){const h=fs.readFileSync(path.join(DIR,f),'utf8');
  for(const m of h.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g))if(!/^https?:/.test(m[1])&&!/\?v=__V__$/.test(m[1]))miss.push(`${f}: ${m[1]}`)}
 check("every game script and stylesheet is versioned for each deploy (?v=__V__)",!miss.length,miss.join(", "))}
check("the shared scripts come first",W.srcs[0]==="../shared/games.js"&&W.srcs[1]==="../shared/core.js");

const RUNNER_JS=String.raw`
function __policyPick(opts,policy,val){
  if(!opts.length)return null;
  if(policy==="random")return opts[Math.floor(rng()*opts.length)];
  let best=opts[0],bv=val(opts[0]);
  for(const o of opts.slice(1)){const v=val(o);if(policy==="worst"?v<bv:v>bv){bv=v;best=o}}
  return best;
};
/* A competent coach keeps a cash buffer: an option that leaves less than
   this in hand is taken only when every option does (as the football
   game's simulator does). */
const __BUFFER=6;
function __season(level,policy,seed){
  beginSeason(level,seed);
  /* ...and looks ahead: the cash the season would end on at an average
     gate if nothing else changed must stay above zero. */
  const val=x=>{const f=x.fx||{},v=evalChoice(x),after=S.cash+(f.cash||0),left=S.games-S.wk;
    const end=after+left*(12.7+S.gateBonus+(f.gate||0)-S.payroll-(f.payroll||0));
    return v-(after<__BUFFER?1000+(__BUFFER-after):0)-(end<0?500-end:0)};
  const pickSpec=spec=>{const ok=spec.choices;
    const c=policy==="none"?(ok.find(x=>x.def)||ok[0]):__policyPick(ok,policy,val);
    apply(c.fx);if(c.after)c.after();return c};
  let trades=0;
  for(cursor=0;cursor<PLAN.length&&S.alive;cursor++){
    const b=PLAN[cursor];
    if(b==="end")break;
    if(b==="presser")pickSpec(presserSpec());
    else if(b==="event")pickSpec(drawEvent(COACH_EVENTS));
    else if(b==="bid")pickSpec(bidSpec());
    else if(b==="sponsor")pickSpec(sponsorSpec());
    else if(b==="medical")pickSpec(medicalSpec());
    else if(b==="freeagent")pickSpec(freeAgentSpec());
    else if(b==="deadline")pickSpec(deadlineSpec());
    else if(b==="game"){
      payWeek();
      const opp=oppOf(S.wk),[h]=myFixture(S.wk),home=h===CLUB;
      {const p=injuryReport();if(p&&!unlocked("report"))p.benched=true}
      if(unlocked("report")){const p=injuryReport();if(p){
        const w=reportWins(p,opp,home),opts=[{id:"play",v:w.play},{id:"rest",v:w.rest}];
        const c=policy==="none"?opts[0]:__policyPick(opts,policy,o=>o.v);
        if(c.id==="play"){p.hurt=true;p.playedHurt=true}else p.benched=true}}
      S.plan=policy==="none"||!unlocked("plan")?"balanced":policy==="random"?pick(Object.keys(PLANS))
        :__policyPick(Object.keys(PLANS),policy,k=>preview(opp,home,k,Math.round(MC*.8)).win);
      const g=startMyGame();
      playOut(g,{
        half:g=>!unlocked("half")||policy==="none"?"steady":__policyPick(halfWins(g),policy,o=>o.win).id,
        fourth:g=>policy==="none"?traditionalFourth(g):__policyPick(fourthWins(g),policy,o=>o.win).id,
        two:g=>policy==="none"?"xp":__policyPick(twoWins(g),policy,o=>o.win).id});
      const m=margin(g,g.mine);
      finishMyGame(g);gateReceipts(m>0?"w":m<0?"l":"t");endWeek(playOthers(S.wk));
      const cash=cashCheck();
      if(cash==="trade"){trades++;
        const side=policy==="none"?"def":__policyPick(["off","def"],policy,sd=>{const snap=JSON.stringify(S);forcedTrade(sd);const v=myStrength();S=JSON.parse(snap);return v});
        forcedTrade(side)}
    }
  }
  if(!S.alive)while(S.wk<S.games){const[h,a]=myFixture(S.wk),gg=playOut(newGame(h,a,{neutral:S.neutral}));record(S.table,h,a,gg.hs,gg.as);endWeek(playOthers(S.wk))}
  const pos=posOf(CLUB);
  return{pos,pred:sharkPlace(),predAvg:S.shark.pos[CLUB],title:pos===1&&!S.fired,fired:S.fired,trades,cash:S.cash,fav:standings(S.table)[0].n===TEAMS[0].n};
};
`;
/* ---- the headless season runner -------------------------------------------
   The game's own code, evaluated once in THIS context (about twice as fast
   as a vm context, which matters for thousands of simulated seasons), with
   the runner appended so it shares the game's scope. */
const SIM=(()=>{
  const mk=()=>({_h:"",children:[],style:{},dataset:{},set innerHTML(v){this._h=v;this.children=[]},get innerHTML(){return this._h},
    appendChild(c){this.children.push(c)},querySelectorAll(){return[]},querySelector(){return null},setAttribute(){}});
  const els={};
  global.document={getElementById:id=>els[id]||(els[id]=mk()),querySelectorAll:()=>[],createElement:mk};
  global.MC_SIMS=50;global.SHARK_RUNS=120;
  const src=W.srcs.map(f=>fs.readFileSync(path.join(DIR,f),'utf8')).join('\n;\n');
  return(0,eval)(src+`;\n${RUNNER_JS};\n({season:__season,run:c=>eval(c)})`);
})();
const season=(l,p,s)=>SIM.season(l,p,s);

/* ---- 1. integrity --------------------------------------------------------- */
if(on(1)){
  const bad=[];
  for(let k=0;k<80;k++){const role=k;
    const out=SIM.run(`(()=>{beginSeason("intermediate","INT${k}");S.cash=${k%3===0?-5:30};const all=[];
      for(const f of COACH_EVENTS.concat(MONEY_EVENTS))all.push(f());all.push(presserSpec(),deadlineSpec());
      return JSON.stringify(all.map(s=>[s.title,s.lede,s.body||"",...s.choices.flatMap(c=>[c.t,c.d,c.out])]))})()`);
    if(/undefined|NaN|\[object/.test(out))bad.push(`INT${k} ${role}`);
  }
  check("every event renders cleanly (80 seasons, in the black and in the red)",!bad.length,bad.slice(0,3).join(", "));
  const noDef=SIM.run(`COACH_EVENTS.concat(MONEY_EVENTS).map(f=>f()).concat([presserSpec(),deadlineSpec()]).filter(s=>!s.choices.some(c=>c.def)).map(s=>s.sig).join(",")`);
  check("every event has a do-nothing choice (def)",!noDef,noDef);
}

/* ---- 2. the engine against the real numbers ----------------------------------- */
if(on(2)){
  const r=JSON.parse(SIM.run(`(()=>{beginSeason("intermediate","ENGINE");const T=TEAMS.map(t=>t.n);
    let pts=0,n=0,sq=0,sum=0,home=0;const m={};
    for(let k=0;k<20000;k++){const g=playOut(newGame(T[1+k%4],T[1+(k+2)%4],{neutral:true}));const d=g.hs-g.as;pts+=g.hs+g.as;n+=2;
      m[Math.abs(d)]=(m[Math.abs(d)]||0)+1}
    for(let k=0;k<20000;k++){const g=playOut(newGame(T[2],T[2],{neutral:true}));const d=g.hs-g.as;sum+=d;sq+=d*d}
    for(let k=0;k<30000;k++){const g=playOut(newGame(T[2],T[2],{}));home+=g.hs-g.as}
    return JSON.stringify({pts:pts/n,sd:Math.sqrt(sq/20000-(sum/20000)**2),home:home/30000,m,real:NFL_DATA})})()`));
  check("about 22 points a team a game, as the NFL",r.pts>=19&&r.pts<=25,r.pts.toFixed(1));
  check("margin spread matches the site's margin curve (sd 13.26)",Math.abs(r.sd-r.real.marginSd)<1.5,`${r.sd.toFixed(2)} v ${r.real.marginSd}`);
  check("home edge matches the Elo model (45 Elo = 1.8 points)",Math.abs(r.home-r.real.homePoints)<.5,`${r.home.toFixed(2)} v ${r.real.homePoints}`);
  const top=Object.entries(r.m).filter(([k])=>k!=="0").sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>+x[0]).sort();
  check("3 and 7 are the two commonest margins (the key numbers)",top[0]===3&&top[1]===7,`top two: ${top.join(", ")}`);
}

/* ---- 3. stability ---------------------------------------------------------------- */
if(on(3)){
  let crashed=0,done=0,err="";
  for(const level of["beginner","intermediate","guru"])for(const policy of["none","best","worst","random"])
    for(let k=0;k<8;k++){try{season(level,policy,`ST-${level}-${policy}-${k}`);done++}catch(e){crashed++;err=e.stack.split("\n").slice(0,2).join(" ")}}
  check(`${done+crashed} seasons complete without a crash`,!crashed,err);
}

/* ---- 4. balance ---------------------------------------------------------------------- *
   One aim, as in the football game: win the division. Money is not scored,
   but going into the red costs players and, deep in it, the job. */
function runs(level,policy,n){
  const out=[];for(let k=0;k<n;k++)out.push(season(level,policy,`B-${level}-${policy}-${k}`));
  const mean=f=>out.reduce((a,x)=>a+f(x),0)/out.length;
  return{title:mean(x=>x.title),pos:mean(x=>x.pos),pred:mean(x=>x.predAvg),fav:mean(x=>x.fav),
    fired:mean(x=>x.fired),traded:mean(x=>x.trades>0),above:mean(x=>x.pos<x.pred)};
}
if(on(4)){
  const t0=Date.now();
  const best=runs("intermediate","best",N),none=runs("intermediate","none",N),
    worst=runs("intermediate","worst",Math.round(N/2)),random=runs("intermediate","random",Math.round(N/2));
  const show=o=>`title ${(o.title*100).toFixed(1)}% · avg finish ${o.pos.toFixed(2)} (Shark ${o.pred.toFixed(2)}) · above the prediction ${(o.above*100).toFixed(0)}% · forced trade ${(o.traded*100).toFixed(0)}% · fired ${(o.fired*100).toFixed(1)}%`;
  console.log(`      best    ${show(best)}`);console.log(`      none    ${show(none)}`);
  console.log(`      random  ${show(random)}`);console.log(`      worst   ${show(worst)}`);
  const fav=(best.fav+none.fav)/2;
  check("favourite (the Stingrays) wins the division 55–80%",fav>=.55&&fav<=.80,(fav*100).toFixed(0)+"%");
  check("a well-played coach wins the division 7–20% (aim 10–15%)",best.title>=.07&&best.title<=.20,(best.title*100).toFixed(1)+"%");
  check("deciding nothing rarely wins it (under half the well-played rate)",none.title<best.title/2,(none.title*100).toFixed(1)+"%");
  check("good calls finish half a place higher than no calls, or more",none.pos-best.pos>=.5,(none.pos-best.pos).toFixed(2));
  check("the worst calls finish lowest",worst.pos>none.pos&&worst.pos>random.pos,worst.pos.toFixed(2));
  check("a well-played coach is almost never fired (under 2%)",best.fired<.02,(best.fired*100).toFixed(1)+"%");
  check("careless money costs players: random play forces a trade in 10%+ of seasons",random.traded>=.10,(random.traded*100).toFixed(0)+"%");
  const beg=runs("beginner","best",Math.round(N/2)),begNone=runs("beginner","none",Math.round(N/2));
  console.log(`      beginner best ${show(beg)}`);console.log(`      beginner none ${show(begNone)}`);
  check("Beginner: good calls finish higher than no calls",begNone.pos>beg.pos,`${beg.pos.toFixed(2)} v ${begNone.pos.toFixed(2)}`);
  console.log(`      (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}

/* ---- 5. screens: whole seasons through the real UI -------------------------------- */
function playScreens(level,setup){
  const w=makeWorld();
  w.run(`pickLevel=${JSON.stringify(level)}`);
  w.els.playThis.onclick();w.drain();
  if(setup)w.run(setup);
  let seen=new Set(),bad="";
  const clickables=["go","ko","toT","same"];
  for(let steps=0;steps<500;steps++){
    const h=w.els.app.innerHTML;
    if(/undefined|NaN|\[object/.test(h)&&!bad)bad=h.match(/.{0,60}(undefined|NaN|\[object).{0,30}/)[0];
    if(/class="verdict/.test(h)){seen.add("verdict");if(/>FIRED</.test(h))seen.add("fired");break}
    const hb=w.els.htBox?w.els.htBox.innerHTML:"";
    if(/>FOURTH DOWN</.test(hb))seen.add("fourth");if(/>HALF TIME</.test(hb))seen.add("half");if(/THE CONVERSION/.test(hb))seen.add("twopt");
    if(/THE INJURY REPORT/.test(h))seen.add("report");if(/YOUR GAME PLAN/.test(h))seen.add("plan");
    if(/BEFORE THE FINAL GAME/.test(h))seen.add("deadline");if(/PAYING THE BILLS/.test(h))seen.add("bills");
    if(/Gate receipts/.test(h))seen.add("gate");if(/A player must be traded/.test(h))seen.add("trade");
    const dc=w.els.dc&&w.els.dc.children.length?w.els.dc:null,ch=w.els.ch&&w.els.ch.children.length?w.els.ch:null;
    if(dc&&/>FOURTH DOWN<|>HALF TIME<|THE CONVERSION/.test(hb)){const b=dc.children[0];w.els.dc.children=[];b.onclick();w.drain();continue}
    if(ch&&/<div id="ch">/.test(w.els.app._h)){const b=ch.children[0];w.els.ch.children=[];b.onclick();w.drain();continue}
    const id=clickables.find(k=>w.els[k]&&w.els[k].onclick);
    if(!id){bad=bad||"stuck: "+h.replace(/<[^>]+>/g," ").slice(0,140);break}
    const f=w.els[id].onclick;w.els[id].onclick=null;f();w.drain();
  }
  return{seen,bad,header:w.els.hTwo.innerHTML};
}
if(on(5)){
  const fails=[];
  for(const level of["beginner","intermediate","guru"]){
    const{seen,bad,header}=playScreens(level);
    if(!seen.has("verdict"))fails.push(`${level}: never reached the verdict (${bad})`);else if(bad)fails.push(`${level}: ${bad}`);
    for(const k of["plan","half","fourth","deadline","bills","gate"])if(!seen.has(k))fails.push(`${level}: never saw ${k}`);
    if(!/>Cash</.test(header)||/Shark|Score/.test(header))fails.push(`${level}: header should show cash, not a score`);
    console.log(`      ${level}: ${[...seen].join(", ")}`);
  }
  // In the red after a game: the owner forces a trade, and you choose who goes.
  const red=playScreens("beginner","S.cash=-12");
  if(!red.seen.has("trade"))fails.push("in the red: no forced trade");
  // Deep in the red: fired, and the season ends.
  const deep=playScreens("beginner","S.cash=-40");
  if(!deep.seen.has("fired"))fails.push("deep in the red: not fired");
  console.log(`      in the red: ${[...red.seen].join(", ")}`);console.log(`      deep in the red: ${[...deep.seen].join(", ")}`);
  check("every level plays to the verdict through the real screens, with bills, gate, forced trades and firing",!fails.length,fails.slice(0,4).join(" | "));
}

console.log(failures?`\n${failures} check(s) FAILED`:"\nAll checks passed");
process.exit(failures?1:0);
