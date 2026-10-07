/* ===========================================================================
   games/beat-the-shark/world-cup/test/checks.cjs

   Run:  node games/beat-the-shark/world-cup/test/checks.cjs

     0. LOADING     the scripts load in order; the start screen offers the sports
     1. INTEGRITY   every event renders cleanly; each has a do-nothing choice;
                    decisions show only money
     2. ENGINE      the match model against IP1; shapes only pay with the right players
     3. STABILITY   whole tournaments complete under every policy and level
     4. BALANCE     the design targets hold
     5. SCREENS     whole tournaments through the real screens

   SEASONS=n scales the balance runs (default 150); ONLY=45 runs sections 4 and 5.
   =========================================================================== */
const fs=require('fs'),vm=require('vm'),path=require('path');
const DIR=path.join(__dirname,'..');
let failures=0;
function check(name,ok,detail){console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?`  (${detail})`:''}`);if(!ok)failures++}
const N=+process.env.SEASONS||120;
const on=k=>!process.env.ONLY||process.env.ONLY.includes(String(k));

function makeWorld(){
  const els={},q=[];
  function mk(id){return{id,_h:"",children:[],onclick:null,style:{},dataset:{},className:"",disabled:false,classList:{add(){}},
    set innerHTML(v){this._h=v;this.children=[]},get innerHTML(){return this._h+this.children.map(c=>c.innerHTML).join("")},
    set textContent(v){this._h=String(v)},get textContent(){return this._h},
    appendChild(c){this.children.push(c)},querySelectorAll(){return[]},querySelector(){return null},setAttribute(){}}}
  const doc={getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk("")};
  const ctx=vm.createContext({document:doc,setTimeout:f=>{q.push(f)},clearTimeout:()=>{},Math,JSON,Object,Array,String,Number,Date,Map,Set,console,
    location:{hash:"",pathname:"/"},MC_SIMS:60,SHARK_RUNS:120,SQUAD_RUNS:60,SHARK_PICK_RUNS:30});
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
check("the start screen offers the sports, the World Cup to play",/Pick a game/.test(W.els.app.innerHTML)&&/data-game="world-cup"/.test(W.els.app.innerHTML)&&/id="playThis"/.test(W.els.app.innerHTML));
{const w=makeWorld(),before=w.els.app.innerHTML;w.els.playThis.onclick();const idle=w.els.app.innerHTML===before;
 w.run('pickSport("world-cup")');const still=w.els.app.innerHTML===before;w.els.playThis.onclick();w.drain();
 check("picking a sport does nothing until Let's go, which then starts it",idle&&still&&w.els.app.innerHTML!==before)}
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
/* A choice's worth: squad strength after it, and the money it leaves,
   looking ahead -- a competent manager keeps the projected cash above zero. */
function __val(c){const f=c.fx||{};const snap=JSON.stringify(S);
  apply(f);const str=S.squad.map(player).reduce((s,p)=>s+effRating(p,p.pos),0)/S.squad.length+S.recovery*.15;
  const left=(S.level==="beginner"?5:6)-S.played;const end=S.cash+left*(1.8-S.camp);S=JSON.parse(snap);
  return str-(end<0?50-end:0)}
const __STAGE={"Group stage":0,"Round of 32":1,"Round of 16":2,"Quarter-final":3,"Semi-final":4,"Final":5,"Champions":6};
function __season(level,policy,seed){
  beginSeason(level,seed);
  const valid=ids=>ids.length===7&&ids.some(i=>S.pool[i].pos==="GK");
  if(policy==="best")S.squad=S.sharkSquad.slice();
  else if(policy==="none")S.squad=topRatedSquad();
  else if(policy==="random"){let c;do{c=shuffle([0,1,2,3,4,5,6,7,8,9]).slice(0,7)}while(!valid(c));S.squad=c}
  else{S.squad=S.pool.slice().sort((a,b)=>a.r-b.r).filter((p,i,a)=>true).slice(0,7).map(p=>p.id);if(!valid(S.squad))S.squad[6]=1}
  const spec=sp=>{const c=policy==="none"?(sp.choices.find(x=>x.def)||sp.choices[0]):__pick(sp.choices,policy,__val);apply(c.fx)};
  spec(baseCampSpec());
  let ev=0,sent=0,last=null;
  while(S.alive&&!S.t.champion&&!S.t.exit){
    ensureFive();payCamp();const opp=nextOpponent();
    let shape,starters;
    if(policy==="none"){shape=unlocked("shape")?(S.lastShape||"balanced"):bestShapeFor(autoStarters("balanced"),opp);
      starters=last&&last.every(id=>available().some(p=>p.id===id))&&unlocked("rotation")?last:autoStarters(shape)}
    else if(policy==="random"){shape=unlocked("shape")?pick(Object.keys(SHAPES)):bestShapeFor(autoStarters("balanced"),opp);starters=autoStarters(shape)}
    else if(policy==="worst"){shape=unlocked("shape")?__pick(Object.keys(SHAPES),"worst",k=>{const[m,t]=myRates(assign(autoStarters(k),k),opp);const p=outcomeProbs(m,t);return 3*p.w+p.d}):"balanced";
      starters=autoStarters(shape);if(unlocked("rotation")){const av=available();starters=av.slice().sort((a,b)=>a.cond-b.cond).slice(0,5).map(p=>p.id)}}
    else{starters=autoStarters("balanced");shape=unlocked("shape")?bestShapeFor(starters,opp):bestShapeFor(autoStarters("balanced"),opp);starters=autoStarters(shape)}
    S.lastShape=shape;last=starters;
    starters.forEach(id=>{const p=player(id);if(p.knock)p.hurt=true});
    const m=newMatch(opp,shape,starters);
    playPeriod(m,1,20,.5);
    if(unlocked("half")&&policy!=="none"){const o=__pick(halfOptions(m),policy,x=>winFromHalf(m,x));changeShape(m,o.shape,o.starters)}
    playPeriod(m,21,40,.5);
    if(m.ko&&m.my===m.th){m.et=true;playPeriod(m,41,50,.25);
      if(m.my===m.th){const opts=shootoutOptions(m);const o=policy==="none"||!unlocked("shootout")?opts[0]:__pick(opts,policy,x=>shootoutWin(x,eloOf(opp)));m.pens=shootout(o,eloOf(opp))}}
    const res=m.my>m.th?"w":m.my<m.th?"l":m.pens?(m.pens.won?"w":"l"):"d";
    S.record[res]++;S.played++;afterMatch(m);
    const wasKo=isKnockout();
    playRoundOthers({a:S.me,b:opp,x:m.my,y:m.th,winner:res==="w"?S.me:res==="l"?opp:null,pens:m.pens?(m.pens.won?S.me:opp):null});
    const newRound=!S.t.exit&&!S.t.champion&&(wasKo||S.t.stage==="ko")&&S.t.ko.some(p=>p.includes(S.me));
    prizeMoney(res,newRound||S.t.champion===S.me);
    const cash=cashCheck();
    if(cash==="home"){sent++;const cands=S.squad.map(player).filter(p=>!p.home&&!p.standIn);
      const p=policy==="none"?cands[0]:__pick(cands,policy==="worst"?"best":policy==="best"?"worst":policy,x=>x.r);sendHome(p.id)}
    if(!S.alive||S.t.champion||S.t.exit)break;
    spec(BETWEEN_EVENTS[ev++%BETWEEN_EVENTS.length]());
  }
  const sacked=S.sacked;if(!S.t.champion)finishTournament();
  const reached=S.t.champion===S.me?"Champions":S.t.exit||"Champions";
  return{stage:__STAGE[reached],champ:S.t.champion===S.me&&!sacked,fav:S.t.champion===S.t.groups.flat().reduce((a,b)=>eloOf(b)>eloOf(a)?b:a),sacked,sent,
    pred:S.shark.Champions,predStage:__STAGE[likeliest(S.shark)]};
}`;
const SIM=(()=>{
  const mk=()=>({_h:"",children:[],style:{},dataset:{},set innerHTML(v){this._h=v;this.children=[]},get innerHTML(){return this._h},
    appendChild(c){this.children.push(c)},querySelectorAll(){return[]},querySelector(){return null},setAttribute(){}});
  const els={};
  global.document={getElementById:id=>els[id]||(els[id]=mk()),querySelectorAll:()=>[],createElement:mk};
  global.MC_SIMS=50;global.SHARK_RUNS=60;global.SQUAD_RUNS=40;global.SHARK_PICK_RUNS=20;
  const src=W.srcs.map(f=>fs.readFileSync(path.join(DIR,f),'utf8')).join('\n;\n');
  return(0,eval)(src+`;\n${RUNNER_JS};\n({season:__season,run:c=>eval(c)})`);
})();
const season=(l,p,s)=>SIM.season(l,p,s);

/* ---- 1. integrity ----------------------------------------------------------------- */
if(on(1)){
  const out=SIM.run(`(()=>{const bad=[];for(let k=0;k<40;k++){beginSeason(k%2?"beginner":"intermediate","INT"+k);S.squad=S.sharkSquad.slice();S.lastResult=["w","d","l"][k%3];
    const all=[baseCampSpec()].concat(BETWEEN_EVENTS.map(f=>f()));
    const t=JSON.stringify(all.map(s=>[s.title,s.lede,...s.choices.flatMap(c=>[c.t,c.d,c.out])]));if(/undefined|NaN|\\[object/.test(t))bad.push("INT"+k)}return bad.join(",")})()`);
  check("every event renders cleanly (40 tournaments)",!out,out);
  const noDef=SIM.run(`[baseCampSpec].concat(BETWEEN_EVENTS).map(f=>f()).filter(s=>!s.choices.some(c=>c.def)).map(s=>s.sig).join(",")`);
  check("every event has a do-nothing choice (def)",!noDef,noDef);
  const pts=SIM.run(`(()=>{beginSeason("beginner","TAGS");S.squad=S.sharkSquad.slice();const bad=[];
    for(const f of [baseCampSpec].concat(BETWEEN_EVENTS))for(const c of f().choices){const snap=JSON.stringify(S);const tags=apply(c.fx);S=JSON.parse(snap);
      tags.forEach(([,t])=>{if(!/^(Cash|Camp costs|Win bonus) /.test(t))bad.push(t)})}return bad.join(", ")})()`);
  check("a decision shows only money, never points",!pts,pts);
}

/* ---- 2. engine ------------------------------------------------------------------------ */
if(on(2)){
  const r=JSON.parse(SIM.run(`(()=>{beginSeason("intermediate","ENGINE");
    // other matches: the model's goals on the Elo gap, five-a-side scaled
    let goals=0,n=0,favW=0;for(let k=0;k<20000;k++){const m=simOther(NATIONS[0].n,NATIONS[30].n,false);goals+=m.x+m.y;n++;if(m.x>m.y)favW++}
    const[la,lb]=lambdas(1850,1850,false,false);
    // shapes: two real attackers up front v a defender pushed up
    S.squad=S.sharkSquad.slice();const opp=NATIONS[15].n;
    const fws=S.squad.map(player).filter(p=>p.pos==="FW").map(p=>p.id),dfs=S.squad.map(player).filter(p=>p.pos==="DF").map(p=>p.id),
      gk=S.squad.map(player).find(p=>p.pos==="GK").id,mf=S.squad.map(player).find(p=>p.pos==="MF").id;
    const att=(ids)=>{const lu=assign(ids,"attack");return myRates(lu,opp)[0]};const bal=ids=>myRates(assign(ids,"balanced"),opp)[0];
    const right=[gk,dfs[0],mf].concat(fws.slice(0,2)),wrong=[gk,dfs[0],mf,fws[0],dfs[1]||dfs[0]];
    return JSON.stringify({goals:goals/n,even:la+lb,favW:favW/n,gainRight:att(right)/bal(right),gainWrong:att(wrong)/bal(wrong),
      defend:myRates(assign(right,"defend"),opp)[1]/myRates(assign(right,"balanced"),opp)[1]})})()`));
  check("an even match averages 3.5–4.5 goals (IP1 tournament rate, five-a-side)",r.even>=3.5&&r.even<=4.5,r.even.toFixed(2));
  check("the favourite (Elo 1st) beats a 31st-ranked side 55–80% of the time",r.favW>=.55&&r.favW<=.8,(r.favW*100).toFixed(0)+"%");
  check("all out attack with two attackers up front adds 15%+ goals",r.gainRight>=1.15,((r.gainRight-1)*100).toFixed(0)+"%");
  check("...with a defender pushed up, much less (under half the gain)",r.gainWrong-1<(r.gainRight-1)/2,((r.gainWrong-1)*100).toFixed(0)+"%");
  check("shutting up shop concedes fewer",r.defend<1,((1-r.defend)*100).toFixed(0)+"% fewer");
}

/* ---- 3. stability ------------------------------------------------------------------- */
if(on(3)){
  let crashed=0,done=0,err="";
  for(const level of["beginner","intermediate"])for(const policy of["none","best","worst","random"])
    for(let k=0;k<8;k++){try{season(level,policy,`ST-${level}-${policy}-${k}`);done++}catch(e){crashed++;err=e.stack.split("\n").slice(0,2).join(" ")}}
  check(`${done+crashed} tournaments complete without a crash`,!crashed,err);
}

/* ---- 4. balance ----------------------------------------------------------------------- */
function runs(level,policy,n){
  const out=[];for(let k=0;k<n;k++)out.push(season(level,policy,`B-${level}-${policy}-${k}`));
  const mean=f=>out.reduce((a,x)=>a+f(x),0)/out.length;
  return{champ:mean(x=>x.champ),stage:mean(x=>x.stage),fav:mean(x=>x.fav),sacked:mean(x=>x.sacked),sent:mean(x=>x.sent>0),pred:mean(x=>x.pred),predStage:mean(x=>x.predStage)};
}
if(on(4)){
  const t0=Date.now();
  const show=o=>`champions ${(o.champ*100).toFixed(1)}% · avg stage ${o.stage.toFixed(2)} (Shark ${o.predStage.toFixed(2)}, win ${(o.pred*100).toFixed(1)}%) · favourite wins ${(o.fav*100).toFixed(0)}% · sent home ${(o.sent*100).toFixed(0)}% · sacked ${(o.sacked*100).toFixed(1)}%`;
  const best=runs("beginner","best",N),none=runs("beginner","none",N),random=runs("beginner","random",Math.round(N/2)),worst=runs("beginner","worst",Math.round(N/2));
  console.log(`      best    ${show(best)}`);console.log(`      none    ${show(none)}`);console.log(`      random  ${show(random)}`);console.log(`      worst   ${show(worst)}`);
  check("the field's favourite wins the World Cup 35–65% (Beginner field of eight)",(best.fav+none.fav)/2>=.35&&(best.fav+none.fav)/2<=.65,(((best.fav+none.fav)/2)*100).toFixed(0)+"%");
  check("a well-picked, well-managed squad wins it 7–20%",best.champ>=.07&&best.champ<=.2,(best.champ*100).toFixed(1)+"%");
  check("the ten highest-rated, deciding nothing, win it under 2/3 as often",none.champ<best.champ*2/3,(none.champ*100).toFixed(1)+"%");
  check("good management goes further than none (average stage)",best.stage>none.stage,`${best.stage.toFixed(2)} v ${none.stage.toFixed(2)}`);
  check("the worst choices go less far than deciding nothing",worst.stage<none.stage,`${worst.stage.toFixed(2)} v ${none.stage.toFixed(2)}`);
  check("a well-run campaign is almost never sacked (under 2%)",best.sacked<.02,(best.sacked*100).toFixed(1)+"%");
  check("careless money sends players home: random play in 10%+ of tournaments",random.sent>=.1,(random.sent*100).toFixed(0)+"%");
  const full=runs("intermediate","best",Math.round(N/3)),fullNone=runs("intermediate","none",Math.round(N/3));
  console.log(`      48 best ${show(full)}`);console.log(`      48 none ${show(fullNone)}`);
  check("48 nations: good management goes further than none",full.stage>fullNone.stage,`${full.stage.toFixed(2)} v ${fullNone.stage.toFixed(2)}`);
  console.log(`      (${((Date.now()-t0)/1000).toFixed(0)}s)`);
}

/* ---- 5. screens ---------------------------------------------------------------------------- */
function playScreens(level,setup){
  const w=makeWorld();w.run(`pickLevel=${JSON.stringify(level)}`);w.run('pickSport("world-cup")');w.els.playThis.onclick();w.drain();
  if(setup)w.run(setup);
  const seen=new Set();let bad="";
  for(let steps=0;steps<600;steps++){
    const h=w.els.app.innerHTML,hb=w.els.htBox?w.els.htBox.innerHTML:"";
    if(/undefined|NaN|\[object/.test(h+hb)&&!bad)bad=(h+hb).match(/.{0,60}(undefined|NaN|\[object).{0,30}/)[0];
    if(/class="verdict/.test(h)){seen.add("verdict");if(/>SACKED</.test(h))seen.add("sacked");break}
    if(/Pick seven/.test(h))seen.add("squad");if(/PAYING THE BILLS/.test(h))seen.add("bills");if(/Prize money/.test(h))seen.add("prize");
    if(/A player is going home/.test(h))seen.add("home");if(/>HALF TIME</.test(hb))seen.add("half");if(/>PENALTIES</.test(hb))seen.add("pens");
    if(/data-shape=/.test(h))seen.add("shape");
    // the squad: pick the first seven by tapping, then name it
    if(/Pick seven/.test(h)&&w.els.pl){const kids=w.els.pl.children.slice(0,7);if(kids.length===7&&!/7 OF 7/.test(h)){kids.forEach((k,i)=>{const pl=w.els.pl.children[i];pl.onclick()});continue}
      if(w.els.nameSquad.onclick){const f=w.els.nameSquad.onclick;w.els.nameSquad.onclick=null;f();w.drain();continue}}
    const cards=w.els.cards&&w.els.cards.children.length?w.els.cards:null;
    if(cards&&w.els.pickGo&&w.els.pickGo.onclick){const before=h+hb;cards.children[0].onclick();
      if(w.els.app.innerHTML+(w.els.htBox?w.els.htBox.innerHTML:"")!==before&&!bad)bad="a pick acted before the confirm button";
      const go=w.els.pickGo.onclick;w.els.pickGo.onclick=null;cards.children=[];go();w.drain();continue}
    const ch=w.els.ch&&w.els.ch.children.length?w.els.ch:null;
    if(ch&&/<div id="ch">/.test(w.els.app._h)){const b=ch.children[0];w.els.ch.children=[];b.onclick();w.drain();continue}
    const id=["go","ko","toT","same"].find(k=>w.els[k]&&w.els[k].onclick);
    if(!id){bad=bad||"stuck: "+h.replace(/<[^>]+>/g," ").slice(0,140);break}
    const f=w.els[id].onclick;w.els[id].onclick=null;f();w.drain();
  }
  return{seen,bad,header:w.els.hTwo.innerHTML};
}
if(on(5)){
  const fails=[];
  for(const level of["beginner","intermediate"]){
    for(let k=0;k<3;k++){const{seen,bad,header}=playScreens(level,`SEED_SET=1`);
      if(!seen.has("verdict"))fails.push(`${level}: never reached the verdict (${bad})`);else if(bad)fails.push(`${level}: ${bad}`);
      for(const x of["squad","bills","prize","shape"])if(!seen.has(x))fails.push(`${level}: never saw ${x}`);
      if(!/>Cash</.test(header))fails.push(`${level}: header should show cash`);
      console.log(`      ${level}: ${[...seen].join(", ")}`)}
  }
  const red=playScreens("beginner",`S.cash=-0.5`); // in the red after the first match, not so deep it is sacked firstif(!red.seen.has("home"))fails.push("in the red: nobody sent home");
  const deep=playScreens("beginner",`S.cash=-30`);if(!deep.seen.has("sacked"))fails.push("deep in the red: not sacked");
  console.log(`      in the red: ${[...red.seen].join(", ")}`);console.log(`      deep in the red: ${[...deep.seen].join(", ")}`);
  check("whole tournaments through the real screens: squad, bills, shapes, prize money, sent home, sacked",!fails.length,fails.slice(0,4).join(" | "));
}

console.log(failures?`\n${failures} check(s) FAILED`:"\nAll checks passed");
process.exit(failures?1:0);
