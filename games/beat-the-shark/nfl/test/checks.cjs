/* ===========================================================================
   games/beat-the-shark/nfl/test/checks.cjs

   Run:  node games/beat-the-shark/nfl/test/checks.cjs

   The NFL game's checks, in the football game's pattern:
     0. LOADING     the scripts in index.html load in order and the start screen draws
     1. INTEGRITY   every event, in both roles, renders with no undefined/NaN/[object
     2. ENGINE      the match engine against FixtureShark's real NFL numbers
     3. STABILITY   whole seasons complete under every policy, level and role
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
  const srcs=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]);
  for(const s of srcs)new vm.Script(fs.readFileSync(path.join(DIR,s),'utf8'),{filename:s}).runInContext(ctx);
  const drain=()=>{let n=0;while(q.length&&n++<20000)q.shift()()};
  return{els,q,drain,run:c=>vm.runInContext(c,ctx),srcs};
}

/* ---- 0. loading --------------------------------------------------------- */
let W;
try{W=makeWorld();check("scripts load in order, as a browser loads them",true,W.srcs.join(" → "))}
catch(e){check("scripts load in order, as a browser loads them",false,e.message);process.exit(1)}
check("the start screen offers the sports, the NFL to play",/Pick a sport/.test(W.els.app.innerHTML)&&/id="playThis" data-game="nfl"/.test(W.els.app.innerHTML)&&/data-game="football" href="..\/"/.test(W.els.app.innerHTML));
check("the shared scripts come first",W.srcs[0]==="../shared/games.js"&&W.srcs[1]==="../shared/core.js");

const RUNNER_JS=String.raw`
function __policyPick(opts,policy,val){
  if(!opts.length)return null;
  if(policy==="random")return opts[Math.floor(rng()*opts.length)];
  let best=opts[0],bv=val(opts[0]);
  for(const o of opts.slice(1)){const v=val(o);if(policy==="worst"?v<bv:v>bv){bv=v;best=o}}
  return best;
};
function __season(level,role,policy,seed){
  beginSeason(level,role,seed);
  const pickSpec=spec=>{const ok=spec.choices.filter(affordable);
    const c=policy==="none"?(ok.find(x=>x.def)||ok[0]):__policyPick(ok,policy,x=>evalChoice(x));
    apply(c.fx);if(c.after)c.after();return c};
  const texts=[];
  for(cursor=0;cursor<PLAN.length;cursor++){
    const b=PLAN[cursor];
    if(b==="end")break;
    if(b==="presser")texts.push(pickSpec(presserSpec()));
    else if(b==="event")texts.push(pickSpec(drawEvent(COACH_EVENTS)));
    else if(b==="gm")texts.push(pickSpec(drawEvent(GM_EVENTS)));
    else if(b==="deadline")texts.push(pickSpec(deadlineSpec()));
    else if(b==="game"){
      const opp=oppOf(S.wk),[h]=myFixture(S.wk),home=h===CLUB;
      {const p=injuryReport();if(p&&!unlocked("report"))p.benched=true}
      if(role==="coach"){
        if(unlocked("report")){const p=injuryReport();if(p){
          const w=reportWins(p,opp,home),opts=[{id:"play",v:w.play},{id:"rest",v:w.rest}];
          const c=policy==="none"?opts[0]:__policyPick(opts,policy,o=>o.v);
          if(c.id==="play"){p.hurt=true;p.playedHurt=true}else p.benched=true}}
        S.plan=policy==="none"||!unlocked("plan")?"balanced":policy==="random"?pick(Object.keys(PLANS))
          :__policyPick(Object.keys(PLANS),policy,k=>preview(opp,home,k,Math.round(MC*.8)).win);
      }
      const g=startMyGame();
      const coach=role==="coach";
      const pol=coach?{
        half:g=>!unlocked("half")||policy==="none"?"steady":__policyPick(halfWins(g),policy,o=>o.win).id,
        fourth:g=>policy==="none"?traditionalFourth(g):__policyPick(fourthWins(g),policy,o=>o.win).id,
        two:g=>policy==="none"?"xp":__policyPick(twoWins(g),policy,o=>o.win).id
      }:{half:g=>bestHalf(g),fourth:g=>fourthWins(g).reduce((a,b)=>b.win>a.win?b:a).id,two:g=>"xp"};
      playOut(g,pol);
      finishMyGame(g);endWeek(playOthers(S.wk));
    }
  }
  const won=myWins(),pos=posOf(CLUB),exp=S.shark.wins[CLUB];
  return{won,exp,pos,score:score(),fav:standings(S.table)[0].n===TEAMS[0].n,texts:texts.length};
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
const season=(l,r,p,s)=>SIM.season(l,r,p,s);

/* ---- 1. integrity --------------------------------------------------------- */
if(on(1)){
  const bad=[];
  for(let k=0;k<40;k++)for(const role of["coach","gm"]){
    const out=SIM.run(`(()=>{beginSeason("intermediate","${role}","INT${k}");const all=[];
      for(const f of COACH_EVENTS.concat(GM_EVENTS))all.push(f());all.push(presserSpec(),deadlineSpec());
      return JSON.stringify(all.map(s=>[s.title,s.lede,s.body||"",...s.choices.flatMap(c=>[c.t,c.d,c.out])]))})()`);
    if(/undefined|NaN|\[object/.test(out))bad.push(`INT${k} ${role}`);
  }
  check("every event renders cleanly in both roles (80 seasons)",!bad.length,bad.slice(0,3).join(", "));
  const noDef=SIM.run(`COACH_EVENTS.concat(GM_EVENTS).map(f=>f()).concat([presserSpec(),deadlineSpec()]).filter(s=>!s.choices.some(c=>c.def)).map(s=>s.sig).join(",")`);
  check("every event has a do-nothing choice (def)",!noDef,noDef);
}

/* ---- 2. the engine against the real numbers ----------------------------------- */
if(on(2)){
  const r=JSON.parse(SIM.run(`(()=>{beginSeason("intermediate","coach","ENGINE");const T=TEAMS.map(t=>t.n);
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
  for(const level of["beginner","intermediate","guru"])for(const role of["coach","gm"])for(const policy of["none","best","worst","random"])
    for(let k=0;k<4;k++){try{season(level,role,policy,`ST-${level}-${role}-${policy}-${k}`);done++}catch(e){crashed++;err=e.stack.split("\n").slice(0,2).join(" ")}}
  check(`${done+crashed} seasons complete without a crash`,!crashed,err);
}

/* ---- 4. balance ---------------------------------------------------------------------- */
function runs(level,role,policy,n){
  const out=[];for(let k=0;k<n;k++)out.push(season(level,role,policy,`B-${level}-${role}-${policy}-${k}`));
  const mean=f=>out.reduce((a,x)=>a+f(x),0)/out.length;
  return{beat:mean(x=>x.won>x.exp),title:mean(x=>x.pos===1),score:mean(x=>x.score),fav:mean(x=>x.fav),wins:mean(x=>x.won),exp:mean(x=>x.exp)};
}
if(on(4)){
  const t0=Date.now();
  const best=runs("intermediate","coach","best",N),none=runs("intermediate","coach","none",N),
    worst=runs("intermediate","coach","worst",Math.round(N/2)),random=runs("intermediate","coach","random",Math.round(N/2));
  const show=o=>`beats Shark ${(o.beat*100).toFixed(0)}% · title ${(o.title*100).toFixed(1)}% · score ${o.score.toFixed(1)} · wins ${o.wins.toFixed(2)} v ${o.exp.toFixed(2)}`;
  console.log(`      best    ${show(best)}`);console.log(`      none    ${show(none)}`);
  console.log(`      random  ${show(random)}`);console.log(`      worst   ${show(worst)}`);
  const fav=(best.fav+none.fav)/2;
  check("favourite (the Stingrays) wins the division 55–80%",fav>=.55&&fav<=.80,(fav*100).toFixed(0)+"%");
  check("a well-played coach beats the Shark about 6 in 10 (48–72%)",best.beat>=.48&&best.beat<=.72,(best.beat*100).toFixed(0)+"%");
  check("a well-played coach wins the division 7–20%",best.title>=.07&&best.title<=.20,(best.title*100).toFixed(1)+"%");
  check("deciding nothing beats the Shark less than 1 in 3",none.beat<.33,(none.beat*100).toFixed(0)+"%");
  check("good calls beat no calls by 15+ score points",best.score-none.score>=15,(best.score-none.score).toFixed(1));
  check("the worst calls score lowest",worst.score<none.score&&worst.score<random.score,`${worst.score.toFixed(1)}`);
  const gm=runs("intermediate","gm","best",Math.round(N/2)),gmNone=runs("intermediate","gm","none",Math.round(N/2));
  console.log(`      gm best ${show(gm)}`);console.log(`      gm none ${show(gmNone)}`);
  check("the GM's decisions matter (best beats none)",gm.score>gmNone.score,`${gm.score.toFixed(1)} v ${gmNone.score.toFixed(1)}`);
  check("the head coach is the more influential role",best.score-none.score>gm.score-gmNone.score,
    `${(best.score-none.score).toFixed(1)} v ${(gm.score-gmNone.score).toFixed(1)}`);
  const beg=runs("beginner","coach","best",Math.round(N/2));
  console.log(`      beginner best ${show(beg)}`);
  check("Beginner: a well-played coach beats the Shark 45–75%",beg.beat>=.45&&beg.beat<=.75,(beg.beat*100).toFixed(0)+"%");
  console.log(`      (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}

/* ---- 5. screens: whole seasons through the real UI -------------------------------- */
if(on(5)){
  const fails=[];
  for(const level of["beginner","intermediate","guru"])for(const role of["coach","gm"]){
    const w=makeWorld();
    w.run(`pickLevel=${JSON.stringify(level)};pickRole=${JSON.stringify(role)}`);
    w.els.playThis.onclick();w.drain();
    let steps=0,seen=new Set(),bad="";
    const clickables=["go","ko","toT","again"];
    for(;steps<400;steps++){
      const h=w.els.app.innerHTML;
      if(/undefined|NaN|\[object/.test(h)&&!bad)bad=h.match(/.{0,60}(undefined|NaN|\[object).{0,30}/)[0];
      if(/THE VERDICT/.test(h)){seen.add("verdict");break}
      const hb=w.els.htBox?w.els.htBox.innerHTML:"";
      if(/>FOURTH DOWN</.test(hb))seen.add("fourth");if(/>HALF TIME</.test(hb))seen.add("half");if(/THE CONVERSION/.test(hb))seen.add("twopt");
      if(/THE INJURY REPORT/.test(h))seen.add("report");if(/YOUR GAME PLAN/.test(h))seen.add("plan");
      if(/BEFORE THE FINAL GAME/.test(h))seen.add("deadline");
      // a pending decision inside the game, or a card of choices
      const dc=w.els.dc&&w.els.dc.children.length?w.els.dc:null,ch=w.els.ch&&w.els.ch.children.length?w.els.ch:null;
      if(dc&&/>FOURTH DOWN<|>HALF TIME<|THE CONVERSION/.test(hb)){const b=dc.children[0];w.els.dc.children=[];b.onclick();w.drain();continue}
      if(ch&&/<div id="ch">/.test(w.els.app._h)){const b=ch.children.find(x=>!x.disabled);w.els.ch.children=[];b.onclick();w.drain();continue}
      const id=clickables.find(k=>w.els[k]&&w.els[k].onclick);
      if(!id){bad=bad||"stuck: "+h.replace(/<[^>]+>/g," ").slice(0,140);break}
      const f=w.els[id].onclick;w.els[id].onclick=null;f();w.drain();
    }
    if(!seen.has("verdict"))fails.push(`${level}/${role}: never reached the verdict (${bad})`);
    else if(bad)fails.push(`${level}/${role}: ${bad}`);
    if(role==="coach"&&!seen.has("plan"))fails.push(`${level}/coach: no game plan choice`);
    if(role==="coach"&&!seen.has("half"))fails.push(`${level}/coach: no half-time call`);
    if(role==="coach"&&!seen.has("fourth"))fails.push(`${level}/coach: no fourth-down call`);
    if(role==="gm"&&(seen.has("fourth")||seen.has("half")||seen.has("plan")))fails.push(`${level}/gm: shown a coach's decision`);
    if(!seen.has("deadline"))fails.push(`${level}/${role}: no trade deadline`);
    console.log(`      ${level}/${role}: ${[...seen].join(", ")}`);
  }
  check("every level and role plays to the verdict through the real screens",!fails.length,fails.slice(0,3).join(" | "));
}

console.log(failures?`\n${failures} check(s) FAILED`:"\nAll checks passed");
process.exit(failures?1:0);
