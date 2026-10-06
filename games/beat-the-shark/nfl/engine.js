/* ===========================================================================
   nfl/engine.js — the division, the roster, the drive-by-drive match engine,
   fourth downs, half time, the Shark's prediction and the score.

   No DOM in this file: the browser game (ui.js) and the headless checks
   (test/checks.cjs) drive exactly the same code.
   =========================================================================== */

const CLUB="Your Team";
let S=null,TEAMS=[],SEED="";
let CTX=null; // whose numbers the engine is using: the real season, or a Shark simulation

/* ---- people (all invented) ----------------------------------------------- */
const FIRST=["Marcus","Tre","DeShawn","Cody","Jalen","Brock","Isaiah","Caleb","Darius","Hunter","Malik","Tyler","Josh","Andre",
  "Colby","Dante","Garrett","Kendall","Reggie","Wyatt","Xavier","Zeke","Bryce","Corey","Devin","Jamal","Lamar","Nolan","Quentin","Shane"];
const LAST=["Holloway","Brickhouse","Okafor","Pruitt","Vance","Marlowe","Dupree","Kowalski","Fairbanks","Stroud","Mabry","Langley",
  "Ridley","Castellano","Whitfield","Pettaway","Gaines","Ashford","Bellamy","Crowder","Delancey","Ellerbe","Fontenot","Garrow",
  "Hairston","Iverson","Jeffcoat","Kimbrough","Lassiter","Merriweather"];

/* The roster: fifteen players whose ratings make the four units. off = the
   rating relative to the team's base. */
const POSITIONS=[
  ["QB","Quarterback",0],["QB2","Backup quarterback",-15],["RB","Running back",0],["RB2","Backup running back",-10],
  ["WR1","Wide receiver",2],["WR2","Wide receiver",-3],["TE","Tight end",-2],["OL","Offensive line",0],
  ["EDGE","Pass rusher",0],["DT","Defensive tackle",0],["LB","Linebacker",0],["CB1","Cornerback",2],["CB2","Cornerback",-3],
  ["S","Safety",0],["K","Kicker",6]];
const POS_SHORT={QB:"QB",QB2:"QB",RB:"RB",RB2:"RB",WR1:"WR",WR2:"WR",TE:"TE",OL:"OL",EDGE:"DE",DT:"DT",LB:"LB",CB1:"CB",CB2:"CB",S:"S",K:"K"};
const BACKUP={QB:"QB2",RB:"RB2"};
const REPLACEMENT=40; // a practice-squad player stepping in
const KEY_STARTERS=["QB","RB","WR1","EDGE","CB1","OL"];

function makeRoster(){
  /* A seeded profile, so every season's roster has a shape to play to: two
     strong positions and two weak ones. */
  const shaped=shuffle(["QB","RB","WR1","OL","EDGE","DT","LB","CB1","S"]);
  const plus=shaped.slice(0,2),minus=shaped.slice(2,4),used=new Set();
  return POSITIONS.map(([pos,label,off],i)=>{
    let nm;do{nm=pick(FIRST)+" "+pick(LAST)}while(used.has(nm));used.add(nm);
    const r=MY_BASE+off+(plus.includes(pos)?11:0)-(minus.includes(pos)?11:0)+rnd(-2,2);
    return{id:i,pos,label,nm:pos==="OL"?"The offensive line":nm,r,out:0,hurt:false};
  });
}

/* ---- the division --------------------------------------------------------- */
function pickRivals(){
  TEAMS=TIERS.map((t,i)=>{const[n,d,style,weak]=i===0?t.names[0]:t.names[hashSeed(SEED+"t"+i)%t.names.length];
    return{n,d,str:t.str,style,weak}});
}
function rival(n){return TEAMS.find(t=>t.n===n)}
function teamNames(){return[CLUB].concat(TEAMS.map(t=>t.n))}
function planOf(n){if(n===CLUB)return S.plan||"balanced";const st=rival(n).style;return st==="run"?"run":st==="pass"?"pass":"balanced"}
function styleWord(st){return st==="run"?"Run-first":st==="pass"?"Pass-first":"Balanced"}
function weakWord(w){return w==="run"?"Weak against the run":"Weak against the pass"}

/* ---- ratings ---------------------------------------------------------------- */
function player(pos){return S.roster.find(p=>p.pos===pos)}
/* The rating that actually plays at a position this week: the starter, a
   hurt starter at 85%, his backup, or a replacement. */
function ratingAt(pos){
  const p=player(pos);
  if(p&&!p.out&&!p.benched)return p.hurt?p.r*.85:p.r;
  const b=BACKUP[pos]&&player(BACKUP[pos]);
  if(b&&!b.out)return b.r;
  return REPLACEMENT;
}
function myUnits(){
  const g=ratingAt,c=CTX||{};
  const m=S.morale*MORALE_W,o=S.off+m+(S.next.off||0)+(c.uplift||0)+(c.swing?c.swing[CLUB]||0:0);
  const d=S.def+m+(S.next.def||0)+(c.uplift||0)+(c.swing?c.swing[CLUB]||0:0);
  return{
    passO:.5*g("QB")+.3*(g("WR1")+g("WR2")+g("TE"))/3+.2*g("OL")+o-(S.next.passPen||0),
    runO:.45*g("RB")+.4*g("OL")+.15*g("TE")+o,
    passD:.6*(g("CB1")+g("CB2")+g("S"))/3+.4*g("EDGE")+d,
    runD:.4*g("DT")+.4*g("LB")+.2*g("EDGE")+d,
    kick:g("K")};
}
function rivalUnits(n){
  const t=rival(n),c=CTX||{},s=t.str+(c.swing?c.swing[n]||0:0);
  const tilt=t.style==="run"?5:t.style==="pass"?-5:0;
  return{runO:s+tilt,passO:s-tilt,
    runD:s+(t.weak==="run"?-WEAK_SIDE:WEAK_SIDE/3),passD:s+(t.weak==="pass"?-WEAK_SIDE:WEAK_SIDE/3),kick:60};
}
function unitsOf(n){return n===CLUB?myUnits():rivalUnits(n)}
/* One number for a team's overall strength, for the events' look-ahead. */
function overall(u){return(u.passO+u.runO+u.passD+u.runD)/4}
function myStrength(){return overall(myUnits())}

/* How much better an offence is than a defence, mixed by the share of runs. */
function edgeOf(off,def,run){return run*(off.runO-def.runD)+(1-run)*(off.passO-def.passD)}

/* ---- the drive ---------------------------------------------------------- */
function driveProbs(e,run){
  const pass=.5-run; // above zero = more passing than a balanced mix
  let td=DRIVE.td*Math.exp(DRIVE.TD_K*e)*(1+DRIVE.passTd*pass);
  let fg=DRIVE.fg*Math.exp(DRIVE.FG_K*e);
  let to=DRIVE.to*Math.exp(-DRIVE.TO_K*e)*(1+DRIVE.passTo*pass);
  const sum=td+fg+to;if(sum>.88){td*=.88/sum;fg*=.88/sum;to*=.88/sum}
  return{td,fg,to,punt:1-td-fg-to};
}

/* ---- a game ------------------------------------------------------------------
   One state machine for every game: your live games (step by step, with
   decisions) and every simulated one. nextDrive() returns what happened, or
   a decision it is waiting for ('half', 'fourth', 'twopt'). */
function newGame(h,a,o={}){
  const g={h,a,hs:0,as:0,hu:o.hu||unitsOf(h),au:o.au||unitsOf(a),
    run:{h:PLANS[o.hPlan||planOf(h)].run,a:PLANS[o.aPlan||planOf(a)].run},
    homeE:o.neutral?0:HOME_E,half:1,sched:[],i:0,bonus:{h:0,a:0},over:false,ot:false,
    mine:h===CLUB?"h":a===CLUB?"a":null,fourths:o.fourths||0,twopt:!!o.twopt,pend:null,
    firstRecv:rng()<.5?"h":"a",calls:[]};
  buildHalf(g,1,0);
  return g;
}
function buildHalf(g,half,extra){
  const n=Math.max(3,pick(DRIVES_PER_HALF)+(extra||0)),start=half===1?g.firstRecv:(g.firstRecv==="h"?"a":"h");
  const other=s=>s==="h"?"a":"h";g.sched=[];g.i=0;g.half=half;
  for(let k=0;k<n*2;k++)g.sched.push({side:k%2===0?start:other(start)});
  /* Fourth-down calls land on your drives: half of them in each half. */
  if(g.mine&&g.fourths){
    const want=half===1?Math.ceil(g.fourths/2):Math.floor(g.fourths/2);
    const mineIdx=g.sched.map((d,k)=>d.side===g.mine?k:-1).filter(k=>k>=0&&k<g.sched.length-1);
    shuffle(mineIdx).slice(0,want).forEach(k=>g.sched[k].fourth=makeFourth());
  }
}
function makeFourth(){return{togo:rnd(1,5),yl:rnd(28,58)}} // yl = yards from their goal line
function clockOf(g,k){
  if(g.ot)return"OT";
  const T=g.sched.length,mins=30*(k+.5)/T,q=(g.half-1)*2+(mins<15?1:2),left=15-(mins%15);
  const mm=Math.floor(left),ss=Math.floor((left-mm)*60);
  return`Q${q} ${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}
function sideTeam(g,s){return s==="h"?g.h:g.a}
function offDef(g,s){return s==="h"?[g.hu,g.au]:[g.au,g.hu]}
function driveEdge(g,s){
  const[o,d]=offDef(g,s);
  return edgeOf(o,d,g.run[s])+(s==="h"?g.homeE/2:-g.homeE/2)+g.bonus[s];
}
function addPts(g,s,p){if(s==="h")g.hs+=p;else g.as+=p}
function margin(g,s){return s==="h"?g.hs-g.as:g.as-g.hs}
/* Overtime: sudden death, up to two drives each; still level is a tie. */
function startOT(g){g.ot=true;g.half=3;g.sched=[];g.i=0;const f=rng()<.5?"h":"a",o=f==="h"?"a":"h";
  for(let k=0;k<4;k++)g.sched.push({side:k%2===0?f:o})}

function nextDrive(g){
  if(g.pend)return{type:g.pend.type};
  if(g.over)return{type:"end"};
  if(g.ot&&g.hs!==g.as){g.over=true;return{type:"end"}}
  if(g.i>=g.sched.length){
    if(g.half===1){g.pend={type:"half"};return{type:"half"}}
    if(!g.ot&&g.hs===g.as){startOT(g);return{type:"ot",clock:"OT"}}
    g.over=true;return{type:"end"};
  }
  const d=g.sched[g.i],s=d.side,clock=g.live?clockOf(g,g.i):"";
  if(d.fourth&&!d.done){g.pend={type:"fourth",sit:d.fourth,side:s,clock};return{type:"fourth",sit:d.fourth,clock}}
  g.i++;
  const e=driveEdge(g,s);g.bonus[s]=0;
  const p=driveProbs(e,g.run[s]),x=rng(),other=s==="h"?"a":"h";
  /* Late and within a field goal (or level): play for the kick. Most of the
     NFL's famous margins of three are made here, and in overtime. */
  if(g.half>=2&&g.i>g.sched.length-2&&margin(g,s)<=0&&margin(g,s)>=-3||g.ot){const m=p.td*.35;p.td-=m;p.fg+=m}
  let ev;
  if(x<p.td){ev={type:"td",side:s,clock};
    addPts(g,s,6);
    // the two-point call: your touchdown late, leaving you a point behind
    if(g.twopt&&s===g.mine&&!g.ot&&g.half===2&&g.i>=g.sched.length-3&&margin(g,s)===-1){
      g.pend={type:"twopt",side:s,clock};ev.pending=true;return ev}
    ev.xp=rng()<DRIVE.xp;if(ev.xp)addPts(g,s,1);
  }
  else if(x<p.td+p.fg){ev={type:"fg",side:s,clock};addPts(g,s,3)}
  else if(x<p.td+p.fg+p.to){ev={type:"to",side:s,clock};g.bonus[other]+=FIELD.to}
  else{ev={type:"punt",side:s,clock};g.bonus[other]+=FIELD.punt}
  if(g.ot&&g.hs!==g.as){g.over=true;ev.endsIt=true}
  return ev;
}
/* After half time: the choice changes your run share and the number of
   possessions (hurry up = more, run the clock = fewer, for both sides). */
const HALF_CALLS={
  open:{t:"Open it up",d:"Throw more, hurry up: more possessions for both sides",run:-.14,drives:1},
  steady:{t:"Stay the course",d:"Same plan",run:0,drives:0},
  clock:{t:"Run the clock",d:"Run more, take time off: fewer possessions",run:.16,drives:-1}};
function startSecondHalf(g,call){
  const c=HALF_CALLS[call||"steady"];
  if(g.mine)g.run[g.mine]=clamp(g.run[g.mine]+c.run,.2,.8);
  g.pend=null;buildHalf(g,2,c.drives);
  if(g.mine)g.calls.push({kind:"half",call:call||"steady"});
}
/* FOURTH DOWN. Go for it, kick, or punt. */
function fourthOptions(g){
  const sit=g.pend.sit,dist=sit.yl+17,o=[];
  o.push({id:"go",t:`Go for it`,d:`${pct(convertChance(g))} to convert`});
  if(dist<=63)o.push({id:"fg",t:`Kick the field goal`,d:`${dist} yards · ${pct(fgChance(dist,(g.mine==="h"?g.hu:g.au).kick))} to make`});
  o.push({id:"punt",t:"Punt",d:"Pin them back"});
  return o;
}
function convertChance(g){const s=g.pend.side,e=driveEdge(g,s);return clamp(FOURTH_CONVERT[g.pend.sit.togo]+e*.004,.15,.9)}
/* The call a traditional coach makes: kick it if in range, otherwise punt. */
function traditionalFourth(g){return g.pend.sit.yl+17<=55?"fg":"punt"}
function resolveFourth(g,id){
  const{sit,side:s,clock}=g.pend,other=s==="h"?"a":"h",u=s==="h"?g.hu:g.au;
  const d=g.sched[g.i];d.done=true;g.pend=null;g.i++;
  const e=driveEdge(g,s);g.bonus[s]=0;
  g.calls.push({kind:"fourth",call:id,sit});
  if(id==="go"){
    const conv=rng()<clamp(FOURTH_CONVERT[sit.togo]+e*.004,.15,.9);
    if(!conv){g.bonus[other]+=FIELD.fourthFail;return{type:"stopped",side:s,clock,sit}}
    const tdP=clamp(.3+(60-sit.yl)*.006+e*.004,.1,.75),y=rng();
    if(y<tdP){addPts(g,s,6);const xp=rng()<DRIVE.xp;if(xp)addPts(g,s,1);return{type:"td",side:s,clock,xp,converted:true}}
    if(y<tdP+.32){addPts(g,s,3);return{type:"fg",side:s,clock,converted:true}}
    g.bonus[other]+=FIELD.punt;return{type:"punt",side:s,clock,converted:true};
  }
  if(id==="fg"){
    if(rng()<fgChance(sit.yl+17,u.kick)){addPts(g,s,3);return{type:"fg",side:s,clock,dist:sit.yl+17}}
    g.bonus[other]+=FIELD.missedFg;return{type:"fgmiss",side:s,clock,dist:sit.yl+17};
  }
  g.bonus[other]+=FIELD.punt*(sit.yl>=45?1:.5);return{type:"punt",side:s,clock};
}
/* THE TWO-POINT CALL: a point behind after your late touchdown. */
function resolveTwo(g,id){
  const s=g.pend.side;g.pend=null;g.calls.push({kind:"twopt",call:id});
  if(id==="go"){const ok=rng()<.48;if(ok)addPts(g,s,2);return{type:"two",side:s,ok}}
  const ok=rng()<DRIVE.xp;if(ok)addPts(g,s,1);return{type:"xp",side:s,ok};
}
/* Play a game to the end with the default calls (or a policy's). */
function playOut(g,policy){
  for(let guard=0;guard<200;guard++){
    const ev=nextDrive(g);
    if(!ev||ev.type==="end")return g;
    if(ev.type==="half")startSecondHalf(g,policy&&policy.half?policy.half(g):"steady");
    else if(ev.type==="fourth")resolveFourth(g,policy&&policy.fourth?policy.fourth(g):traditionalFourth(g));
    else if(ev.type==="twopt"||ev.pending)resolveTwo(g,policy&&policy.two?policy.two(g):"xp");
  }
  return g;
}
/* A copy for looking ahead. Units are never changed after kick-off, so they
   are shared; everything that moves is copied. */
function cloneGame(g){
  return{...g,live:false,run:{...g.run},bonus:{...g.bonus},calls:g.calls.slice(),pend:g.pend&&{...g.pend},
    sched:g.sched.map(d=>d.fourth?{...d,fourth:{...d.fourth}}:{...d})};
}
/* Your chance of winning from here, for each option: the game is played
   out many times from this exact moment. Sandboxed, so looking never
   changes what happens. Ties count half. */
/* Look-ahead sample sizes (the checks lower them for speed). */
const MC=typeof MC_SIMS==="number"?MC_SIMS:300;
function winFrom(g,apply,n=MC,salt=""){
  return sandbox(()=>{let w=0;
    for(let k=0;k<n;k++){const c=cloneGame(g);apply(c);playOut(c);const m=margin(c,g.mine);w+=m>0?1:m===0?.5:0}
    return w/n},SEED+"|"+S.wk+"|"+g.i+"|"+g.half); // the same random futures for every option, so only the option differs
}
function fourthWins(g){return fourthOptions(g).map(o=>({...o,win:winFrom(g,c=>resolveFourth(c,o.id),MC,o.id)}))}
function halfWins(g){return Object.keys(HALF_CALLS).map(id=>({id,...HALF_CALLS[id],win:winFrom(g,c=>startSecondHalf(c,id),MC,id)}))}
function twoWins(g){return[{id:"xp",t:"Kick the extra point",d:"Tie it"},{id:"go",t:"Go for two",d:"Win it"}]
  .map(o=>({...o,win:winFrom(g,c=>resolveTwo(c,o.id),MC,o.id)}))}

/* ---- before a game: the line ----------------------------------------------------
   Win chance, expected margin, the spread and how it might finish, from
   playing the game out many times with the plan chosen. */
function preview(opp,home,plan,n=Math.round(MC*5/3)){
  return sandbox(()=>{
    let w=0,t=0,sum=0;const bands={big:0,close:0,closeL:0,bigL:0};
    const mu=myUnits(),tu=rivalUnits(opp);
    for(let k=0;k<n;k++){
      const g=home?newGame(CLUB,opp,{neutral:S.neutral,hPlan:plan,hu:mu,au:tu}):newGame(opp,CLUB,{neutral:S.neutral,aPlan:plan,hu:tu,au:mu});
      playOut(g);const m=margin(g,g.mine);sum+=m;if(m>0)w++;else if(m===0)t++;
      if(m>=8)bands.big++;else if(m>0)bands.close++;else if(m>-8)bands.closeL++;else bands.bigL++;
    }
    for(const k in bands)bands[k]/=n;
    const mean=sum/n;return{win:(w+t/2)/n,mean,spread:Math.round(mean*2)/2,bands};
  },SEED+"|pre|"+S.wk); // the same random games for every plan, so only the plan differs
}
function bestPlan(opp,home){
  let best="balanced",bw=-1;for(const p of Object.keys(PLANS)){const v=preview(opp,home,p,Math.round(MC*.8)).win;if(v>bw){bw=v;best=p}}
  return best;
}
/* A quick plan choice for simulations: the plan with the best average edge. */
function quickPlan(opp){
  const me=myUnits(),them=rivalUnits(opp);let best="balanced",bv=-1e9;
  for(const[k,p]of Object.entries(PLANS)){const v=edgeOf(me,them,p.run);if(v>bv){bv=v;best=k}}
  return best;
}

/* ---- the season ---------------------------------------------------------------- */
function roundRobin(names){
  const t=names.slice(),n=t.length,rounds=[];
  for(let r=0;r<n-1;r++){const pairs=[];
    for(let i=0;i<n/2;i++){const a=t[i],b=t[n-1-i];pairs.push((r+i)%2?[a,b]:[b,a])}
    rounds.push(pairs);t.splice(1,0,t.pop());
  }
  return rounds;
}
function buildFixtures(){
  let rounds=roundRobin(teamNames());
  /* The final boss last, as in the football game. */
  const boss=TEAMS[0].n,bi=rounds.findIndex(r=>r.some(p=>p.includes(CLUB)&&p.includes(boss)));
  rounds.push(rounds.splice(bi,1)[0]);
  /* Your Team alternates home and away. */
  rounds=rounds.map((r,i)=>r.map(p=>{if(!p.includes(CLUB))return p;const home=i%2===0;return home?[CLUB,p[0]===CLUB?p[1]:p[0]]:[p[0]===CLUB?p[1]:p[0],CLUB]}));
  if(S.games===10)rounds=rounds.concat(rounds.map(r=>r.map(([h,a])=>[a,h])));
  S.fixtures=rounds;
}
function myFixture(wk){return S.fixtures[wk].find(p=>p.includes(CLUB))}
function oppOf(wk){const[h,a]=myFixture(wk);return h===CLUB?a:h}
function blankTable(){const t={};teamNames().forEach(n=>t[n]={w:0,l:0,t:0,pf:0,pa:0,res:[]});return t}
function record(T,h,a,hs,as){
  const rh=hs>as?"w":hs<as?"l":"t",ra=rh==="w"?"l":rh==="l"?"w":"t";
  T[h][rh]++;T[a][ra]++;T[h].pf+=hs;T[h].pa+=as;T[a].pf+=as;T[a].pa+=hs;
  T[h].res.push({opp:a,r:rh,for:hs,ag:as});T[a].res.push({opp:h,r:ra,for:as,ag:hs});
}
const winsOf=r=>r.w+r.t/2;
/* Standings: win percentage, then head to head among the tied teams, then
   points difference, then points scored. */
function standings(T){
  const rows=Object.entries(T).map(([n,r])=>({n,...r,g:r.w+r.l+r.t,pct:(r.w+r.l+r.t)?winsOf(r)/(r.w+r.l+r.t):0,diff:r.pf-r.pa}));
  const h2h=(n,group)=>{let w=0,g=0;T[n].res.forEach(x=>{if(group.includes(x.opp)){g++;w+=x.r==="w"?1:x.r==="t"?.5:0}});return g?w/g:.5};
  rows.sort((x,y)=>y.pct-x.pct);
  const out=[];let i=0;
  while(i<rows.length){let j=i;while(j<rows.length&&rows[j].pct===rows[i].pct)j++;
    const grp=rows.slice(i,j),names=grp.map(r=>r.n);
    grp.sort((x,y)=>h2h(y.n,names)-h2h(x.n,names)||y.diff-x.diff||y.pf-x.pf||x.n.localeCompare(y.n));
    out.push(...grp);i=j}
  return out;
}
function posOf(n,T){return standings(T||S.table).findIndex(r=>r.n===n)+1}

/* ---- the Shark ------------------------------------------------------------------
   Many seasons simulated before a ball is snapped, for a WELL-RUN Your Team
   (SHARK_UPLIFT), with every team's hidden swing drawn afresh each time --
   the Shark cannot see this season's. */
function sharkForecast(runs=1500){
  return sandbox(()=>{
    const names=teamNames(),wins={},pos={},title={},perGame=new Array(S.games).fill(0);
    names.forEach(n=>{wins[n]=0;pos[n]=0;title[n]=0});
    const saved=CTX,savedNext=S.next,savedRoster=JSON.stringify(S.roster);S.next={};
    for(let r=0;r<runs;r++){
      S.roster=JSON.parse(savedRoster);
      const swing={};names.forEach(n=>swing[n]=(rng()*2-1)*SEASON_SWING);
      CTX={swing,uplift:SHARK_UPLIFT};
      const T=blankTable();
      S.fixtures.forEach((round,wk)=>round.forEach(([h,a])=>{
        const mine=h===CLUB||a===CLUB;
        /* a well-run team rests the questionable starter */
        if(mine)S.roster.forEach(p=>{if(p.knock)p.benched=true});
        const o={neutral:S.neutral};if(h===CLUB)o.hPlan=quickPlan(a);if(a===CLUB)o.aPlan=quickPlan(h);
        const g=playOut(newGame(h,a,o));record(T,h,a,g.hs,g.as);
        if(mine){const m=h===CLUB?g.hs-g.as:g.as-g.hs;perGame[wk]+=m>0?1:m===0?.5:0;
          S.roster.forEach(p=>{if(p.out>0)p.out--;p.benched=false;p.knock=false});injuries(S.roster)}
      }));
      const st=standings(T);st.forEach((row,i)=>{wins[row.n]+=winsOf(row);pos[row.n]+=i+1});title[st[0].n]++;
    }
    CTX=saved;S.next=savedNext;S.roster=JSON.parse(savedRoster);
    names.forEach(n=>{wins[n]/=runs;pos[n]/=runs;title[n]/=runs});
    return{wins,pos,title,perGame:perGame.map(x=>x/runs)};
  },SEED+"|shark");
}
/* The Shark's par so far: the wins it expected from the games played. */
function sharkPar(){return S.shark.perGame.slice(0,S.wk).reduce((a,b)=>a+b,0)}
function myWins(){return winsOf(S.table[CLUB])}
function score(){
  const done=S.wk>=S.games;
  const title=done&&posOf(CLUB)===1;
  return sharkScore(myWins(),done?S.shark.wins[CLUB]:sharkPar(),PER_WIN,title);
}

/* ---- the season's state ------------------------------------------------------------ */
function newSeason(level,role,seed){
  SEED=seed||("NFL-"+Math.random().toString(36).slice(2,7).toUpperCase());
  R.s=hashSeed(SEED);
  const L=LEVELS[level];
  S={level,role,games:L.games,neutral:L.neutral,wk:0,full:0,plan:"balanced",
    off:0,def:0,morale:0,next:{},cap:12,roster:null,table:null,fixtures:null,shark:null,
    swing:{},log:[],calls:{fourth:[],half:[],plan:[]},alive:true,traded:false};
  pickRivals();
  S.roster=makeRoster();
  buildFixtures();
  S.table=blankTable();
  teamNames().forEach(n=>S.swing[n]=(rng()*2-1)*SEASON_SWING);
  S.shark=sharkForecast(typeof SHARK_RUNS==="number"?SHARK_RUNS:1500);
  CTX={swing:S.swing,uplift:0};
  return S;
}
function unlocked(f){return S.role==="coach"&&S.full>=LEVELS[S.level].unlock[f]}

/* ---- your game -------------------------------------------------------------------- */
function startMyGame(){
  const[h,a]=myFixture(S.wk),home=h===CLUB,opp=home?a:h;
  const o={neutral:S.neutral,fourths:unlocked("fourth")?FOURTHS_PER_GAME[S.level]:0,twopt:unlocked("twopt")};
  if(home)o.hPlan=S.plan;else o.aPlan=S.plan;
  /* The GM's coach is competent: he picks the plan himself. */
  if(S.role==="gm"){const p=bestPlan(opp,home);if(home)o.hPlan=p;else o.aPlan=p;S.plan=p}
  return newGame(h,a,o);
}
/* The rest of the week's games, simulated. */
function playOthers(wk){
  return S.fixtures[wk].filter(p=>!p.includes(CLUB)).map(([h,a])=>{const g=playOut(newGame(h,a,{neutral:S.neutral}));return{h,a,hs:g.hs,as:g.as}});
}
/* After your game: record it, count the week down, injuries. */
function finishMyGame(g){
  record(S.table,g.h,g.a,g.hs,g.as);
  g.calls.forEach(c=>{if(c.kind==="fourth")S.calls.fourth.push(c);if(c.kind==="half")S.calls.half.push(c)});
  S.next={};
  // the hurt starter who played: a chance it gets worse
  S.roster.forEach(p=>{if(p.out>0)p.out--;
    if(p.hurt){p.hurt=false;if(p.playedHurt&&rng()<.35)p.out=2;p.playedHurt=false}
    p.benched=false});
  S.roster.forEach(p=>p.knock=false);
  const{injury,knock}=injuries(S.roster);
  S.full++;
  return injury;
}
/* After every game of yours: about one in four a starter is hurt (out one or
   two games), and about one in three a key starter picks up a knock and is
   questionable for the next. The Shark's forecast runs the same process. */
const INJURY={out:.25,knock:.3};
function injuries(roster){
  let injury=null,knock=null;
  if(rng()<INJURY.out){injury=pick(roster.filter(x=>!x.out&&x.pos!=="QB2"&&x.pos!=="RB2"&&x.pos!=="K"));injury.out=rnd(1,2)}
  if(rng()<INJURY.knock){knock=pick(roster.filter(x=>KEY_STARTERS.includes(x.pos)&&!x.out));if(knock)knock.knock=true}
  return{injury,knock};
}
function endWeek(others){others.forEach(r=>record(S.table,r.h,r.a,r.hs,r.as));S.wk++}

/* ---- the injury report (who starts) ----------------------------------------------- */
/* A starter carrying a knock from the last game is questionable. */
function injuryReport(){return S.roster.find(p=>p.knock&&!p.out)||null}
function reportWins(p,opp,home){
  const play=sandbox(()=>{p.hurt=true;p.playedHurt=true;const v=preview(opp,home,S.plan,MC).win;p.hurt=false;p.playedHurt=false;return v});
  const rest=sandbox(()=>{p.benched=true;const v=preview(opp,home,S.plan,MC).win;p.benched=false;return v});
  return{play,rest};
}

/* ---- events: effects ---------------------------------------------------------------- */
/* fx keys: off, def (season, rating points), morale, cap ($m), next {off,def,passPen}
   (next game only), heal (everyone out returns), injure (a position, games),
   upgrade {pos, by}, swap {pos, nm, r} (a new player in that position). */
function apply(fx){
  if(!fx)return[];
  const tags=[];
  if(fx.off){S.off+=fx.off;tags.push([fx.off>0,`Offence ${fx.off>0?"+":""}${fx.off}`])}
  if(fx.def){S.def+=fx.def;tags.push([fx.def>0,`Defence ${fx.def>0?"+":""}${fx.def}`])}
  if(fx.morale){const before=S.morale;S.morale=clamp(S.morale+fx.morale,-10,10);const d=S.morale-before;if(d)tags.push([d>0,`Locker room ${d>0?"+":""}${d}`])}
  if(fx.cap){S.cap+=fx.cap;tags.push([fx.cap>0,`Cap space ${fx.cap>0?"+":"−"}$${Math.abs(fx.cap)}m`])}
  if(fx.next){for(const k in fx.next)S.next[k]=(S.next[k]||0)+fx.next[k];
    const v=(fx.next.off||0)+(fx.next.def||0)-(fx.next.passPen||0);if(v)tags.push([v>0,`Next game ${v>0?"+":""}${v}`])}
  if(fx.heal){const back=S.roster.filter(p=>p.out);back.forEach(p=>p.out=0);if(back.length)tags.push([true,`${back.length} back from injury`])}
  if(fx.injure){const p=player(fx.injure);if(p){p.out=Math.max(p.out,fx.games||1);tags.push([false,`${p.nm} out`])}}
  if(fx.upgrade){const p=player(fx.upgrade.pos);if(p){p.r+=fx.upgrade.by;tags.push([fx.upgrade.by>0,`${POS_SHORT[p.pos]} ${fx.upgrade.by>0?"+":""}${fx.upgrade.by}`])}}
  if(fx.swap){const p=player(fx.swap.pos);if(p){p.nm=fx.swap.nm;p.r=fx.swap.r;p.out=0;tags.push([true,`${fx.swap.nm} in`])}}
  return tags;
}
/* What a choice is worth, for the checks' look-ahead and the "best" policy:
   your overall strength after it, with this week's effects included. */
function evalChoice(c){
  const snap=JSON.stringify({S,R:R.s});
  try{apply(c.fx);if(c.after)c.after();return myStrength()}
  finally{const o=JSON.parse(snap);S=o.S;R.s=o.R}
}
function affordable(c){return!(c.fx&&c.fx.cap<0&&S.cap+c.fx.cap<0)}
