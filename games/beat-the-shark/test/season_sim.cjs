/* ===========================================================================
   games/beat-the-shark/test/season_sim.cjs

   Headless season simulator. It plays the REAL game code in ../index.html
   end to end, choosing options by policy (none / best / worst), so every
   result reflects the actual engine rather than a model of it.

   .cjs, deliberately not *.test.*: the analytics site's Vitest run uses the
   default *.test.* pattern and must never pick these up.
   =========================================================================== */
const fs=require('fs'),path=require('path');
const GAME=process.env.GAME||path.join(__dirname,'..','index.html');
/* Load the game exactly as the browser does: every <script src> listed in
   index.html, in order, as one shared scope. Falls back to a single inline
   <script> so older one-file builds (and GAME=copy.html) still work. */
function loadGame(file){
  const html=fs.readFileSync(file,'utf8'),dir=path.dirname(file);
  const srcs=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]);
  if(srcs.length)return srcs.map(s=>fs.readFileSync(path.join(dir,s),'utf8')).join('\n;\n');
  const inline=html.match(/<script>([\s\S]*)<\/script>/);
  if(!inline)throw new Error('No game script found in '+file);
  return inline[1];
}
const src=loadGame(GAME);
global.document={getElementById:()=>({innerHTML:'',textContent:'',onclick:null,style:{},appendChild(){},classList:{add(){}},querySelectorAll:()=>[]}),
  querySelectorAll:()=>[],createElement:()=>({className:'',innerHTML:'',onclick:null,style:{}})};
global.setTimeout=()=>{};
const G=eval(src+`;({ROLES,SHAPES,FORMATIONS,PLAN,MW,newState,buildFixtures,blankTable,monteCarlo,recalcSquadRating,pickRivals,
  playFixture,simScore,strOf,award,standings,resolveMine,apply,later,drainPending,myStrength,clubRates,
  presserSpec,callSpec,physioSpec,preseasonSpec,winterSpec,playerSummerSpec,playerWinterSpec,makeTargets,drawEvent,
  available,alive,myFixture,xiStats,currentXI,autoXI,balanceAdj,squadHTML,drawLuck,getForm:()=>({FORM,CLEAN}),teamAtt,teamDef,pickGoal,setPieceTaker,roleSignal,
  setSeed:v=>{SEED=v},setRole:r=>{ROLE=r},setS:x=>{S=x},getS:()=>S,setTable:t=>{TABLE=t},T:()=>TABLE,
  setPredict:p=>{PREDICT=p},setCursor:v=>{cursor=v},getR:()=>R.s,setR:v=>{R.s=v},
  resetRecent:()=>{RECENT=new Set();RECENT_Q=[]},getRivals:()=>RIVALS,getRoleId:()=>ROLE.id,
  otherFixtures:wk=>FIXTURES[wk].filter(([h,a])=>h!==CLUB&&a!==CLUB)})`);

/* What the policy optimises: the strength the match engine will actually
   use, including the attack/defence split and delayed consequences. */
function metric(){const S=G.getS();return G.myStrength()+((S.attMod||0)+(S.defMod||0))/2}
function evalChoice(c){
  const S=G.getS(),snap={st:JSON.stringify(S),r:G.getR()};
  try{
    if(c.fx)G.apply(c.fx,false);
    if(c.after)c.after();
    if(c.delayed){const amp={};for(const[k,v]of Object.entries(c.delayed))amp[k]=v*2.4;G.apply(amp,false)}
    G.recalcSquadRating();
    return metric();
  }finally{G.setS(JSON.parse(snap.st));G.setR(snap.r)}
}
function choose(spec,policy){
  const real=(spec.choices||[]).filter(c=>!c.ask);
  if(!real.length)return null;
  if(policy==="none")return null;
  let best=null,bv=policy==="best"?-1e9:1e9;
  real.forEach(c=>{const v=evalChoice(c);if(policy==="best"?v>bv:v<bv){bv=v;best=c}});
  return best;
}
function doChoice(c){
  if(!c)return;
  if(c.after)c.after();
  if(c.fx)G.apply(c.fx,true);
  if(c.delayed)G.later(2,c.delayed,c.delayedText);
  G.recalcSquadRating();
}
/* Owner transfer windows. Best: buy the best value you can afford that
   raises the squad. Worst: sell your best players. None: do nothing. */
function transferWindow(policy){
  const S=G.getS();
  if(policy==="none")return;
  if(policy==="best"){
    const t=G.makeTargets(3).sort((a,b)=>(b.rt-38)/b.fee-(a.rt-38)/a.fee);
    for(const x of t){if(S.cash>=x.fee&&x.rt>S.squad){S.cash-=x.fee;S.wages+=x.wage;
      S.squadList.push({pos:x.pos,nm:x.nm,rt:x.rt,fit:x.fit,gone:false,out:0,quirk:""});G.recalcSquadRating()}}
  }else{
    const sell=G.alive().sort((a,b)=>b.rt-a.rt).slice(0,2);
    sell.forEach(p=>{if(G.alive().length>5){S.cash+=Math.round((p.rt-38)*13);p.gone=true}});G.recalcSquadRating();
  }
}
/* In-match shape: best picks the formation with the best expected goal
   difference against this opponent; worst the reverse; none stays 4-4-2. */
function setFormation(opp,home,policy){
  const S=G.getS();
  if(policy==="none"){S.formation="4-4-2";return}
  let bf="4-4-2",bv=policy==="best"?-1e9:1e9;
  for(const f of Object.keys(G.FORMATIONS)){S.formation=f;const[m,t]=G.clubRates(opp,home,1.25,"4-4-2");
    const v=m-t;if(policy==="best"?v>bv:v<bv){bv=v;bf=f}}
  S.formation=bf;
}
function playWeek(policy,credit){
  const S=G.getS(),wk=S.mw,T=G.T();
  const fx=G.myFixture(wk),home=fx[0]==="Your Team",opp=home?fx[1]:fx[0];
  if(G.getRoleId()==="manager")setFormation(opp,home,policy);
  const[hg,ag]=G.playFixture(fx[0],fx[1],true);
  G.award(T,fx[0],fx[1],hg,ag);
  G.otherFixtures(wk).forEach(([h,a])=>{const[x,y]=G.simScore(G.strOf(h),G.strOf(a));G.award(T,h,a,x,y)});
  const r=G.resolveMine(hg,ag,home);G.apply(r.fx,true);S.mw++;
}
function season(seed,roleId,policy){
  G.setSeed(seed);G.pickRivals();G.buildFixtures();G.setTable(G.blankTable());
  G.setRole(G.ROLES[roleId]);G.setR(hashSeedJS(seed+"|"+roleId));G.resetRecent();
  const S=G.newState();G.setS(S);G.recalcSquadRating();
  for(let i=0;i<G.PLAN.length;i++){
    G.setCursor(i);
    const b=G.PLAN[i];
    if(["match","live","round"].includes(b))playWeek(policy);
    else if(b==="special1"){
      if(roleId==="owner")transferWindow(policy);
      else doChoice(choose(roleId==="manager"?G.preseasonSpec():G.playerSummerSpec(),policy));
    }else if(b==="special2"){
      if(roleId==="owner")transferWindow(policy);
      else doChoice(choose(roleId==="manager"?G.winterSpec():G.playerWinterSpec(),policy));
    }else if(b==="presser")doChoice(choose(G.presserSpec(),policy));
    else if(b==="call")doChoice(choose(G.callSpec(),policy));
    else if(b==="physio")doChoice(choose(G.physioSpec(),policy));
    else if(b==="event")doChoice(choose(G.drawEvent(),policy));
    else if(b==="luck"){const L=G.drawLuck();if(L)L.apply()}
    G.drainPending().forEach(p=>G.apply(p.fx));
    if(S.mw>=G.MW)break;
  }
  const st=G.standings(G.T());return st.findIndex(r=>r.n==="Your Team")+1;
}
function hashSeedJS(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
module.exports={G,season};
