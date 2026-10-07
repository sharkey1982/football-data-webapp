/* ===========================================================================
   games/beat-the-shark/nations-cup/test/checks.cjs

   Run:  node games/beat-the-shark/nations-cup/test/checks.cjs

     0. LOADING     the scripts load in order; the start screen offers the sports
     1. INTEGRITY   every event renders cleanly; each has a do-nothing choice;
                    decisions show only money
     2. ENGINE      the match model against Elo; surfaces, left-handers, partnerships
     3. STABILITY   whole events complete under every policy and level
     4. BALANCE     the design targets hold
     5. SCREENS     whole events through the real screens

   SEASONS=n scales the balance runs (default 100); ONLY=45 runs sections 4 and 5.
   =========================================================================== */
const fs=require('fs'),vm=require('vm'),path=require('path');
const DIR=path.join(__dirname,'..');
let failures=0;
function check(name,ok,detail){console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?`  (${detail})`:''}`);if(!ok)failures++}
const N=+process.env.SEASONS||100;
const on=k=>!process.env.ONLY||process.env.ONLY.includes(String(k));

function makeWorld(){
  const els={},q=[];
  function mk(id){return{id,_h:"",children:[],onclick:null,style:{},dataset:{},className:"",disabled:false,classList:{add(){}},
    set innerHTML(v){this._h=v;this.children=[]},get innerHTML(){return this._h+this.children.map(c=>c.innerHTML).join("")},
    set textContent(v){this._h=String(v)},get textContent(){return this._h},
    appendChild(c){this.children.push(c)},querySelectorAll(){return[]},querySelector(){return null},setAttribute(){}}}
  const doc={getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk("")};
  const ctx=vm.createContext({document:doc,setTimeout:f=>{q.push(f)},clearTimeout:()=>{},Math,JSON,Object,Array,String,Number,Date,Map,Set,console,
    location:{hash:"",pathname:"/"},SHARK_RUNS:80,SQUAD_RUNS:40,SHARK_PICK_RUNS:20});
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
check("the start screen offers the sports, the Nations Cup to play",/Pick a sport/.test(W.els.app.innerHTML)&&/id="playThis" data-game="nations-cup"/.test(W.els.app.innerHTML));
{const h=fs.readFileSync(path.join(DIR,'index.html'),'utf8'),miss=[];
 for(const m of h.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g))if(!/^https?:/.test(m[1])&&!/\?v=__V__$/.test(m[1]))miss.push(m[1]);
 check("every script and stylesheet is versioned for each deploy (?v=__V__)",!miss.length,miss.join(", "))}

/* ---- the headless runner, in the game's own scope (fast) ------------------------ */
const RUNNER_JS=String.raw`
function __pick(opts,policy,val){
  if(!opts.length)return null;
  if(policy==="random")return opts[Math.floor(rng()*opts.length)];
  let best=opts[0],bv=val(opts[0]);for(const o of opts.slice(1)){const v=val(o);if(policy==="worst"?v<bv:v>bv){bv=v;best=o}}return best;
}
/* A choice's worth: the squad's condition and morale after it, and the money
   it leaves, looking ahead -- a competent captain keeps projected cash above zero. */
function __val(c){const f=c.fx||{};const snap=JSON.stringify(S);
  apply(f);const str=S.squad.map(P).filter(p=>!p.home).reduce((s,p)=>s+p.cond*FATIGUE_ELO,0)/S.squad.length+S.morale*MORALE_ELO*2+S.recovery*2+(S.practice?PRACTICE_ELO*.8:0)+(S.hitting?12:0);
  const left=4-S.round;const end=S.cash+left*(MONEY.prize.w-MONEY.travel-feesNow());S=JSON.parse(snap);
  return str-(end<0?60-40*end:0)}
const __STAGE={"First round":0,"Quarter-final":1,"Semi-final":2,"Final":3,"Champions":4};
function __season(level,policy,seed,nation){
  beginSeason(level,nation,seed);
  if(policy==="best")S.squad=S.sharkSquad.slice();
  else if(policy==="none")S.squad=topRatedSquad();
  else{const ms=S.pool.filter(p=>p.g==="m").map(p=>p.id),ws=S.pool.filter(p=>p.g==="w").map(p=>p.id);
    if(policy==="random")S.squad=shuffle(ms).slice(0,3).concat(shuffle(ws).slice(0,3));
    else{const lo=a=>a.slice().sort((x,y)=>avgRating(P(x))-avgRating(P(y))).slice(0,3);S.squad=lo(ms).concat(lo(ws))}}
  S.squad.sort((a,b)=>a-b);
  const spec=sp=>{const c=policy==="none"?(sp.choices.find(x=>x.def)||sp.choices[0]):__pick(sp.choices,policy,__val);apply(c.fx)};
  spec(campSpec());
  let ev=0,sent=0;
  while(S.alive&&!S.champion&&!S.exit){
    ensureTwo();payTie();
    const t=newTie();
    let lu;
    if(policy==="best")lu=bestLineup(t.olu,t.s);
    else if(policy==="none")lu=S.lastLineup&&validLineup(S.lastLineup)?S.lastLineup:defaultLineup();
    else lu=__pick(lineups(),policy,x=>tieChance(x,t.olu,t.s));
    S.lastLineup=lu;startTie(t,lu);
    while(t.i<EVENTS.length){
      if(tieOver(t)&&t.dead==null){
        const c=!unlocked("deadRubber")||policy==="none"?"play":policy==="best"?(S.round<3?"concede":"play"):policy==="random"?pick(["play","concede"]):(S.round<3?"play":"concede");
        t.dead=c;if(c==="concede"){concedeRest(t);break}playDead(t)}
      if(t.i===2&&!tieOver(t)&&unlocked("afterSingles")&&policy!=="none"){const o=__pick(afterSinglesOptions(t),policy,x=>x.win);useOption(t,o)}
      const r=nextRubber(t);
      while(!r.done){if(r.sa===1&&r.sb===1&&r.ev[1]==="D"&&unlocked("setBreak")&&policy!=="none")r.bonus=__pick(setBreakOptions(t),policy,x=>x.win).bonus;playSet(r)}
      endRubber(t);
    }
    const won=t.a>t.b;S.lastResult=won?"w":"l";afterTie(t);playRoundOthers(won,[t.a,t.b]);prizeMoney(won,S.champion===S.me);
    const cash=cashCheck();
    if(cash==="home"&&!S.exit&&!S.champion){sent++;const cands=S.squad.map(P).filter(p=>!p.home&&!p.standIn);
      const p=policy==="none"?cands[cands.length-1]:__pick(cands,policy==="worst"?"best":policy==="best"?"worst":policy,x=>avgRating(x)-x.fee*400);sendHome(p.id)}
    if(!S.alive||S.champion||S.exit)break;
    const e=nextEvent(ev);if(e){ev=e.next;spec(e.spec)}
  }
  const sacked=S.sacked;if(!S.champion)finishTournament();
  const reached=S.champion===S.me?"Champions":S.exit||"Champions";
  const top=seedList().find(n=>S.field.includes(n));
  return{stage:__STAGE[reached],champ:S.champion===S.me&&!sacked,fav:S.champion===top,sacked,sent,
    pred:S.shark.Champions,predStage:STAGES.reduce((s,k,i)=>s+i*(S.shark[k]||0),0)};
}`;
const SIM=(()=>{
  const mk=()=>({_h:"",children:[],style:{},dataset:{},set innerHTML(v){this._h=v;this.children=[]},get innerHTML(){return this._h},
    appendChild(c){this.children.push(c)},querySelectorAll(){return[]},querySelector(){return null},setAttribute(){}});
  const els={};
  global.document={getElementById:id=>els[id]||(els[id]=mk()),querySelectorAll:()=>[],createElement:mk};
  global.SHARK_RUNS=+process.env.SHARK_RUNS||100;global.SQUAD_RUNS=40;global.SHARK_PICK_RUNS=+process.env.PICK_RUNS||30;
  const src=W.srcs.map(f=>fs.readFileSync(path.join(DIR,f),'utf8')).join('\n;\n');
  return(0,eval)(src+`;\n${RUNNER_JS};\n({season:__season,run:c=>eval(c)})`);
})();
const season=(l,p,s,n)=>SIM.season(l,p,s,n);
const SEEDS=SIM.run(`seedList()`);

/* ---- 1. integrity ----------------------------------------------------------------- */
if(on(1)){
  const out=SIM.run(`(()=>{const bad=[];for(let k=0;k<24;k++){beginSeason("beginner",seedList()[k],"INT"+k);S.squad=S.sharkSquad.slice();S.lastResult=k%2?"w":"l";
    S.pool[S.squad[0]].out=1;
    const all=[campSpec()].concat(BETWEEN_EVENTS.map(e=>e.f()));
    const t=JSON.stringify(all.map(s=>[s.title,s.lede,...s.choices.flatMap(c=>[c.t,c.d,c.out])]))+JSON.stringify(S.pool.map(p=>[p.nm,p.tag]));
    if(/undefined|NaN|\\[object/.test(t))bad.push("INT"+k)}return bad.join(",")})()`);
  check("every event and every player renders cleanly (24 nations)",!out,out);
  const noDef=SIM.run(`[campSpec].concat(BETWEEN_EVENTS.map(e=>e.f)).map(f=>f()).filter(s=>!s.choices.some(c=>c.def)).map(s=>s.sig).join(",")`);
  check("every event has a do-nothing choice (def)",!noDef,noDef);
  const pts=SIM.run(`(()=>{beginSeason("beginner",seedList()[5],"TAGS");S.squad=S.sharkSquad.slice();const bad=[];
    for(const f of [campSpec].concat(BETWEEN_EVENTS.map(e=>e.f)))for(const c of f().choices){const snap=JSON.stringify(S);const tags=apply(c.fx);S=JSON.parse(snap);
      tags.forEach(([,t])=>{if(!/^(Cash |.+'s fee )/.test(t))bad.push(t)})}return bad.join(", ")})()`);
  check("a decision shows only money, never points",!pts,pts);
  const pool=JSON.parse(SIM.run(`(()=>{beginSeason("beginner",seedList()[3],"POOL");
    return JSON.stringify({m:S.pool.filter(p=>p.g==="m").length,w:S.pool.filter(p=>p.g==="w").length,lefties:S.pool.filter(p=>p.hand==="L").length,
      partners:S.pool.filter(p=>p.partners.length).length,names:new Set(S.pool.map(p=>p.nm)).size})})()`));
  check("the pool: six men, six women, two left-handers, partnerships, twelve different names",pool.m===6&&pool.w===6&&pool.lefties===2&&pool.partners>=3&&pool.names===12,JSON.stringify(pool));
}

/* ---- 2. engine ------------------------------------------------------------------------ */
if(on(2)){
  const r=JSON.parse(SIM.run(`(()=>{beginSeason("intermediate",seedList()[4],"ENGINE");
    const elo=d=>1/(1+Math.pow(10,-d/400));
    const fit={};for(const ev of EVENTS)fit[ev]=[100,200].map(d=>rubberProb(ev,d)-elo(d));
    // the played model matches the exact chance
    let w=0,n=6000;for(let k=0;k<n;k++){const r=newRubber("MS",[0],[0],"hard");r.bonus=0;
      r.mine=[S.pool[0].id];r.theirs=[S.oppTeams[Object.keys(S.oppTeams)[0]].m[0]];while(!r.done)playSet(r);if(r.sa>r.sb)w++}
    const r0=newRubber("MS",[S.pool[0].id],[S.oppTeams[Object.keys(S.oppTeams)[0]].m[0]],"hard");
    const exact=rubberProb("MS",rubberD("MS",r0.mine,r0.theirs,"hard"));
    // surfaces: the clay specialist
    const clay=S.pool[4],grassGap=clay.surf.clay-clay.surf.grass;
    // left-handers: the star singles player against a left-hander, and not
    const star=S.pool[0],opp={...P(S.oppTeams[Object.keys(S.oppTeams)[0]].m[0])};
    const vR=single(star,{...opp,hand:"R"},"hard"),vL=single(star,{...opp,hand:"L"},"hard");
    // partnerships: two who have played together v the same pair without it
    const a=S.pool[1],b=S.pool[3],c0=compat(a,b);a.partners=[];b.partners=[];const c1=compat(a,b);
    return JSON.stringify({fit,sim:w/n,exact,grassGap,lefty:vR-vL,history:c0-c1})})()`));
  const worst=Math.max(...Object.values(r.fit).flat().map(Math.abs));
  check("every rubber follows Elo within 4 points (100 and 200 Elo gaps)",worst<=.04,Object.entries(r.fit).map(([k,v])=>`${k} ${v.map(x=>(x*100).toFixed(1)).join("/")}`).join(" · "));
  check("set-by-set play matches the exact chance",Math.abs(r.sim-r.exact)<.025,`${(r.sim*100).toFixed(1)}% v ${(r.exact*100).toFixed(1)}%`);
  check("the clay-court specialist is 120+ Elo better on clay than on grass",r.grassGap>=120,r.grassGap);
  check("the star singles player loses 50+ Elo against a left-hander",r.lefty>=50,r.lefty);
  check("a partnership from before is worth something",r.history>0,r.history);
  const dbl=JSON.parse(SIM.run(`(()=>{let wins=0,n=0;for(let k=0;k<20;k++){beginSeason("beginner",seedList()[k%12],"DBL"+k);
    const ms=S.pool.filter(p=>p.g==="m"),bySingles=ms.slice().sort((a,b)=>sr(b,"hard")-sr(a,"hard")).slice(0,2).map(p=>p.id);
    const opp=Object.keys(S.oppTeams)[0],th=S.oppTeams[opp].m;
    let best=-1e9;for(const x of ms)for(const y of ms)if(x.id<y.id)best=Math.max(best,pairR([x.id,y.id],th,"hard"));
    n++;if(best>pairR(bySingles,th,"hard")+20)wins++}return JSON.stringify({share:wins/n})})()`));
  check("the two best singles players are rarely the best doubles pair (a compromise to make)",dbl.share>=.7,`${(dbl.share*100).toFixed(0)}% of pools`);
}

/* ---- 3. stability ------------------------------------------------------------------- */
if(on(3)){
  let crashed=0,done=0,err="";
  for(const level of["beginner","intermediate"])for(const policy of["none","best","worst","random"])
    for(let k=0;k<6;k++){try{season(level,policy,`ST-${level}-${policy}-${k}`,SEEDS[(k*5)%SEEDS.length]);done++}catch(e){crashed++;err=e.stack.split("\n").slice(0,2).join(" ")}}
  check(`${done+crashed} events complete without a crash`,!crashed,err);
}

/* ---- 4. balance ----------------------------------------------------------------------- */
function runs(level,policy,nation,n){
  const out=[];for(let k=0;k<n;k++)out.push(season(level,policy,`B-${policy}-${k}`,nation));
  const mean=f=>out.reduce((a,x)=>a+f(x),0)/out.length;
  return{champ:mean(x=>x.champ),stage:mean(x=>x.stage),fav:mean(x=>x.fav),sacked:mean(x=>x.sacked),sent:mean(x=>x.sent>0),pred:mean(x=>x.pred),predStage:mean(x=>x.predStage)};
}
if(on(4)){
  const t0=Date.now();
  const show=o=>`champions ${(o.champ*100).toFixed(1)}% · avg stage ${o.stage.toFixed(2)} (Shark ${o.predStage.toFixed(2)}, win ${(o.pred*100).toFixed(1)}%) · top seed wins ${(o.fav*100).toFixed(0)}% · sent home ${(o.sent*100).toFixed(0)}% · sacked ${(o.sacked*100).toFixed(1)}%`;
  const top=SEEDS[0],mid=SEEDS[7],low=SEEDS[13];
  const T={best:runs("beginner","best",top,Math.round(N/2)),none:runs("beginner","none",top,Math.round(N/2))};
  const M={best:runs("beginner","best",mid,N),none:runs("beginner","none",mid,N),random:runs("beginner","random",mid,Math.round(N/2)),worst:runs("beginner","worst",mid,Math.round(N/2))};
  const L={best:runs("beginner","best",low,Math.round(N/2))};T.random=runs("beginner","random",top,Math.round(N/2));
  console.log(`      ${top} (seed 1)`);for(const k in T)console.log(`        ${k.padEnd(7)} ${show(T[k])}`);
  console.log(`      ${mid} (8th)`);for(const k in M)console.log(`        ${k.padEnd(7)} ${show(M[k])}`);
  console.log(`      ${low} (14th)`);for(const k in L)console.log(`        ${k.padEnd(7)} ${show(L[k])}`);
  check("the strongest nation, well captained, wins it 30–60%",T.best.champ>=.3&&T.best.champ<=.6,(T.best.champ*100).toFixed(1)+"%");
  check("a mid-ranked nation (8th), well captained, wins it 5–20%",M.best.champ>=.05&&M.best.champ<=.2,(M.best.champ*100).toFixed(1)+"%");
  check("...the six highest-rated, deciding nothing, win it under 2/3 as often",M.none.champ<M.best.champ*2/3,(M.none.champ*100).toFixed(1)+"%");
  check("a weaker nation (14th): FixtureShark gives it a chance, but a small one (0.5–10%)",L.best.pred>=.005&&L.best.pred<=.1,(L.best.pred*100).toFixed(1)+"%");
  check("good captaincy goes further than none (average stage, 8th seed)",M.best.stage>M.none.stage+.15,`${M.best.stage.toFixed(2)} v ${M.none.stage.toFixed(2)}`);
  check("the worst choices go less far than deciding nothing",M.worst.stage<M.none.stage,`${M.worst.stage.toFixed(2)} v ${M.none.stage.toFixed(2)}`);
  check("a well-run event is almost never sacked (under 2%)",M.best.sacked<.02&&T.best.sacked<.02,`${(M.best.sacked*100).toFixed(1)}%`);
  check("careless money sends players home: random play as the top seed in 10%+ of events",T.random.sent>=.1,(T.random.sent*100).toFixed(0)+"%");
  console.log(`      (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}

/* ---- 5. screens ---------------------------------------------------------------------------- */
function playScreens(level,setup,nationIdx){
  const w=makeWorld();w.run(`pickLevel=${JSON.stringify(level)}`);w.els.playThis.onclick();w.drain();
  let bad="";const seen=new Set();
  // the nation list: pick-then-confirm
  {const cards=w.els.cards;if(!cards||!cards.children.length)return{seen,bad:"no nation list",header:""};
   const before=w.els.app.innerHTML;cards.children[nationIdx||0].onclick();if(w.els.app.innerHTML!==before)bad="a nation pick acted before the confirm button";
   const go=w.els.pickGo.onclick;w.els.pickGo.onclick=null;go();w.drain();seen.add("nation")}
  if(setup)w.run(setup);
  for(let steps=0;steps<800;steps++){
    const h=w.els.app.innerHTML,hb=w.els.htBox?w.els.htBox.innerHTML:"";
    if(/undefined|NaN|\[object/.test(h+hb)&&!bad)bad=(h+hb).match(/.{0,60}(undefined|NaN|\[object).{0,30}/)[0];
    if(/class="verdict/.test(h)){seen.add("verdict");if(/>SACKED</.test(h))seen.add("sacked");break}
    if(/Pick three men and three women/.test(h))seen.add("squad");if(/PAYING THE BILLS/.test(h))seen.add("bills");if(/Prize money/.test(h))seen.add("prize");
    if(/A player is going home/.test(h))seen.add("home");if(/>AFTER THE SINGLES</.test(hb))seen.add("singles");if(/>ONE SET ALL</.test(hb))seen.add("setbreak");
    if(/>DEAD RUBBERS</.test(hb))seen.add("dead");if(/Win the tie/.test(h))seen.add("lineup");if(/YOUR ROUTE/.test(h))seen.add("route");
    if(/Pick three men/.test(h)&&w.els.plm){const n=(/MEN (\d) OF 3 · WOMEN (\d)/.exec(h)||[]).slice(1).map(Number);
      if(n[0]<3){w.els.plm.children[n[0]].onclick();continue}if(n[1]<3){w.els.plw.children[n[1]].onclick();continue}
      if(w.els.nameSquad.onclick){const f=w.els.nameSquad.onclick;w.els.nameSquad.onclick=null;f();w.drain();continue}}
    // the line-up: swap singles and mixed for the men once, through the role buttons
    if(/Win the tie/.test(h)&&w.els.rom&&w.els.rom.children.length&&!seen.has("swapped")){seen.add("swapped");
      const row=w.els.rom.children[1],b=row&&row.children[0];if(b&&b.onclick){b.onclick();continue}}
    const cards=w.els.cards&&w.els.cards.children.length?w.els.cards:null;
    if(cards&&w.els.pickGo&&w.els.pickGo.onclick){const before=w.els.app.innerHTML+(w.els.htBox?w.els.htBox.innerHTML:"");cards.children[cards.children.length-1].onclick();
      if(w.els.app.innerHTML+(w.els.htBox?w.els.htBox.innerHTML:"")!==before&&!bad)bad="a pick acted before the confirm button";
      const go=w.els.pickGo.onclick;w.els.pickGo.onclick=null;cards.children=[];go();w.drain();continue}
    const id=["go","ko","toT","same"].find(k=>w.els[k]&&w.els[k].onclick);
    if(!id){bad=bad||"stuck: "+h.replace(/<[^>]+>/g," ").replace(/\s+/g," ").slice(0,160);break}
    const f=w.els[id].onclick;w.els[id].onclick=null;f();w.drain();
  }
  return{seen,bad,header:w.els.hTwo.innerHTML};
}
if(on(5)){
  const fails=[];const all=new Set();
  for(const level of["beginner","intermediate"]){
    for(let k=0;k<4;k++){const{seen,bad,header}=playScreens(level,"",k*2);
      seen.forEach(x=>all.add(x));
      if(!seen.has("verdict"))fails.push(`${level}: never reached the verdict (${bad})`);else if(bad)fails.push(`${level}: ${bad}`);
      for(const x of["nation","route","squad","bills","prize","lineup"])if(!seen.has(x))fails.push(`${level}: never saw ${x}`);
      if(!/>Cash</.test(header))fails.push(`${level}: header should show cash`);
      console.log(`      ${level}: ${[...seen].join(", ")}`)}
  }
  for(const x of["singles","setbreak"])if(!all.has(x))fails.push(`never saw ${x} in any event`);
  // in the red and through the first tie (the opponents weakened), so the federation calls
  const red=playScreens("intermediate",`S.cash=-1;S.oppP.forEach(p=>SURFS.forEach(s=>p.surf[s]-=500))`,0);if(!red.seen.has("home"))fails.push("in the red: nobody sent home");
  const deep=playScreens("beginner",`S.cash=-6`,0);if(!deep.seen.has("sacked"))fails.push("deep in the red: not sacked");
  console.log(`      in the red: ${[...red.seen].join(", ")}`);console.log(`      deep in the red: ${[...deep.seen].join(", ")}`);
  check("whole events through the real screens: nation, squad, bills, line-up, after the singles, one set all, prize money, sent home, sacked",!fails.length,fails.slice(0,4).join(" | "));
}

console.log(failures?`\n${failures} check(s) FAILED`:"\nAll checks passed");
process.exit(failures?1:0);
