/* ===========================================================================
   engine.js — seeded RNG, the league, fixtures, the Monte Carlo, the squad and scoring.
   =========================================================================== */

/* ===========================================================================
   SAVE OUR CLUB v7

   Scoring is now TWO THINGS ONLY: cash in the bank, and where you finish.
   Fifty points each. Everything else in the simulation -- squad quality,
   fitness, morale, supporters, the board -- still exists and still matters,
   but only because it moves those two numbers. That is the whole point: the
   levers are many, the scoreboard is simple.

   Also new:
   - Squad list shows QUALITY and CONDITION as numbers and pips.
   - OWNER gets two transfer windows: pre-season and January.
   - MANAGER gets a pre-season programme and a winter break.
   - STAR PLAYER gets a summer and a midwinter of his own, on and off the
     pitch, where the bad decisions are the interesting ones.
   =========================================================================== */
const R={s:0,next(){let a=this.s|=0;a=this.s=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
function hashSeed(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
const rng=()=>R.next(),rnd=(a,b)=>a+Math.floor(rng()*(b-a+1)),pick=a=>a[Math.floor(rng()*a.length)];
const shuffle=a=>{const r=a.slice();for(let i=r.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[r[i],r[j]]=[r[j],r[i]]}return r};
const clamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,v));
const fmtMoney=v=>(v<0?"-£":"£")+Math.abs(Math.round(v))+"k";
function ord(n){const s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])}
const estRange=(v,e)=>`${fmtMoney(Math.round(v*(1-e)))}–${fmtMoney(Math.round(v*(1+e)))}`;
let SEED="SOC-S01";

/* ---------------------------------------------------------------------------
   NAMES
   Your club is "Your Team" -- memorable, and the name of a page on the site.
   Rivals are affectionate puns on real clubs; players are puns on historical
   figures and a few long-retired legends. They are parody names attached to
   invented characters: no event anywhere mirrors a real person's history.
   The shark theme lives in the world around the football instead -- the
   papers, the podcast, the stadium, the league.
   ------------------------------------------------------------------------- */
const CLUB="Your Team";
const STADIUM="the Shark Tank";
const RIVAL_STR=TIERS.map(t=>t.str);
let RIVALS=[];
function pickRivals(){
  R.s=hashSeed(SEED+"|rivals");
  RIVALS=TIERS.map(t=>{const[n,d]=pick(t.names);return{n,d,str:t.str}});
}
const SURNAMES=["Dean Holloway","Kyle Mottram","Reece Tanner","Jordan Ashby","Lewis Pritchard","Callum Fenwick",
  "Tom Ellery","Sam Oduya","Ryan Keogh","Jamie Whitlock","Ollie Barnes","Kieran Doyle","Aaron Slade","Luke Harrop",
  "Danny Marsh","Connor Fell","Tariq Hussain","Kofi Mensah","Nathan Oyelaran","Ben Castle","Liam Rourke","Joe Pritchett"];
const PAPERS=["THE DAILY FIN","THE GREAT WHITE PAGES","THE SUNDAY SHOAL","THE FINANCIAL FINS"];
const PUNDITS=[{n:"BRUCE",d:"a former centre-half with forty caps and no patience"},
  {n:"FLINT",d:"promoted twice, relegated three times, has seen everything"},
  {n:"OKORO",d:"the analyst, who quotes numbers at people"}];
const PODCAST="THE DEEP END";
const sharkRate=S=>`FixtureShark rate this squad <b>${S.squad}</b> — ${S.squad>62?"top-two material":S.squad>50?"mid-table on paper":"bottom-two on paper"}.`;

/* --- roles: same scoreboard, different levers ----------------------------- */
const ROLES={
owner:{id:"owner",name:"The Owner",tag:"You sign the cheques",
  blurb:"The club is yours, and so are the debts. Two transfer windows, a stadium and a chequebook. You do not pick the team.",
  mission:"BEAT THE SHARK",
  missionLong:"FixtureShark have predicted where you finish. Finish higher. Cash is not scored — it is what you spend to prove the model wrong.",
  pool:["kebab","mascot","wedding","barfly","scout","ticketprice","stadiumuse","creditor","rivalshark","director","tannoy","prawn","sharkdeal","bonus","bonus"]},
manager:{id:"manager",name:"The Manager",tag:"You pick the team",
  blurb:"Selection, training, the dressing room, and a pre-season you actually get to plan. You can ask the owner for money. Asking is all you can do.",
  mission:"BEAT THE SHARK",
  missionLong:"FixtureShark have predicted where you finish. Finish higher. Your shape, your selection and your half-time calls are the biggest levers in the game.",
  pool:["psychic","kitcolour","bus","tiktok","training","tactics","youth","discipline","medical","askowner","hisjob","mindgames","sharkscout"]},
player:{id:"player",name:"The Star Player",tag:"You are the asset",
  blurb:"You are the one being sold, chased and blamed. Everything you do on and off the pitch lands on someone else's balance sheet.",
  mission:"BEAT THE SHARK",
  missionLong:"FixtureShark have predicted where your club finishes. Drag it higher. You have less control than anyone — which makes beating the model harder.",
  pool:["selfpens","selfcontract","selfrole","selfdeadline","selfsponsor","selfextras","selfinjury","selfcaptain"]}
};
let ROLE=null,S=null;

/* --- season --------------------------------------------------------------- */
const MW=10;
let FIXTURES=[],TABLE={},PREDICT={};
function buildFixtures(){
  const teams=[CLUB].concat(RIVALS.map(r=>r.n)),n=teams.length,rounds=[],arr=teams.slice();
  for(let r=0;r<n-1;r++){const wk=[];for(let i=0;i<n/2;i++)wk.push([arr[i],arr[n-1-i]]);rounds.push(wk);arr.splice(1,0,arr.pop())}
  FIXTURES=rounds.concat(rounds.map(wk=>wk.map(([h,a])=>[a,h])));
}
/* A rival's strength can move mid-season through luck events (an injury to
   their star, a new signing), stored per season in S.rivalMod. Guarded
   because the pre-season model runs before a season state exists. */
const strOf=n=>{if(n===CLUB)return null;
  const live=typeof S!=="undefined"&&S;
  return RIVALS.find(r=>r.n===n).str+((live&&S.rivalMod&&S.rivalMod[n])||0)
    /* the hidden season swing -- invisible to the Shark's own simulation */
    +((live&&!S._mc&&S.swing&&S.swing[n])||0)};
function oppFormation(n){
  /* Rivals pick shapes that suit their strength, with some variety. */
  const st=strOf(n);
  return st>=60?pick(["4-3-3","4-3-3","3-5-2"]):st<=44?pick(["5-3-2","4-5-1","5-3-2"]):pick(Object.keys(FORMATIONS));
}
/* Your club's goal rates against an opponent, with attack and defence
   modified independently by formation, bonuses and in-match changes. */
function clubRates(opp,home,scale,oppFm){
  const base=myStrength();
  const f=FORMATIONS[S.formation||"4-4-2"],of=FORMATIONS[oppFm||"4-4-2"];
  const[bA,bD]=balanceAdj();
  const att=base+(S.attMod||0)+f.att+(S.matchAtt||0)+bA;
  const def=base+(S.defMod||0)+f.def+(S.matchDef||0)+bD;
  const os=strOf(opp),oAtt=os+of.att,oDef=os+of.def;
  const k=scale||1.25;
  /* Divisor lowered 20 -> 16 after playtesting: decisions that raised
     attack and defence were not showing up in results enough. A steeper
     response makes every lever count for more -- and widens where Your Team
     can finish, which was also asked for. Rival-v-rival games keep the
     gentler curve in simScore. */
  return[Math.max(.08,k*Math.pow(1.5,(att-oDef)/CLUB_SENS)*(home?HOME_MULT:1)),
         Math.max(.08,k*Math.pow(1.5,(oAtt-def)/CLUB_SENS)*(home?1:HOME_MULT))];
}
const pois=l=>{let L=Math.exp(-l),k=0,p=1;do{k++;p*=rng()}while(p>L);return k-1};
/* One entry point for any fixture, so your club always uses the split
   engine and rivals use the simple one. */
function playFixture(h,a,credit){
  if(h!==CLUB&&a!==CLUB)return simScore(strOf(h),strOf(a));
  const home=h===CLUB,opp=home?a:h;
  let[m,t]=clubRates(opp,home,1.25,oppFormation(opp));
  /* Red cards, at the same odds as the vidiprinter (see drawReds). A red
     lands on average around the hour, so over a whole match it is worth
     roughly half its full effect. */
  const hot=currentXI().some(s=>S.squadList[s.i].nm==="Hot Head");
  if(rng()<RED_THEM){t*=.86;m*=1.12}
  if(rng()<(hot?RED_US_HOTHEAD:RED_US)){m*=.86;t*=1.12}
  const mg=Math.min(5,pois(m)),tg=Math.min(5,pois(t));
  /* credit=true where no vidiprinter names the scorers. The classified
     check names them itself, so it must NOT pass this -- or every goal
     there would be counted twice against a goal bonus. */
  if(credit)for(let i=0;i<mg;i++)pickGoal();
  return home?[mg,tg]:[tg,mg];
}
function simScore(hs,as){
  /* home advantage as the real model applies it: see HOME_MULT */
  const hx=Math.max(.2,1.25*Math.pow(1.5,(hs-as)/20)*HOME_MULT),ax=Math.max(.2,1.25*Math.pow(1.5,(as-hs)/20));
  const pois=l=>{let L=Math.exp(-l),k=0,p=1;do{k++;p*=rng()}while(p>L);return k-1};
  return[Math.min(5,pois(hx)),Math.min(5,pois(ax))];
}
let FORM={},CLEAN={};
function blankTable(){const t={};FORM={};CLEAN={};[CLUB].concat(RIVALS.map(r=>r.n)).forEach(n=>{t[n]={p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0};FORM[n]=[];CLEAN[n]=0});return t}
function award(t,h,a,hg,ag){t[h].p++;t[a].p++;t[h].gf+=hg;t[h].ga+=ag;t[a].gf+=ag;t[a].ga+=hg;
  if(hg>ag){t[h].w++;t[h].pts+=3;t[a].l++}else if(hg<ag){t[a].w++;t[a].pts+=3;t[h].l++}else{t[h].d++;t[a].d++;t[h].pts++;t[a].pts++}
  if(FORM[h]){FORM[h].push(hg>ag?'w':hg<ag?'d':'d');FORM[h][FORM[h].length-1]=hg>ag?'w':hg===ag?'d':'l'}
  if(FORM[a]){FORM[a].push(ag>hg?'w':ag===hg?'d':'l')}
  if(ag===0&&CLEAN[h]!=null)CLEAN[h]++;
  if(hg===0&&CLEAN[a]!=null)CLEAN[a]++;}
function standings(t){return Object.entries(t).map(([n,v])=>({n,...v,gd:v.gf-v.ga}))
  .sort((x,y)=>y.pts-x.pts||y.gd-x.gd||y.gf-x.gf||x.n.localeCompare(y.n))}
/* THE SHARK'S PREDICTION. It simulates the season thousands of times using
   the SAME match engine the game plays -- your actual squad, formation
   balance and red-card odds -- but with no decisions made. That is what
   makes the score mean "what your decisions were worth": the prediction is
   the no-decision baseline, by construction rather than by tuning.
   (It used to simulate Your Team as a fixed rating of 52 on a gentler curve,
   so every change to the real engine silently moved the baseline.)
   Rates are cached per opponent, venue and shape, because the pre-season
   state does not change during the simulation. Before a season exists --
   the opening screen -- it falls back to the fixed rating. */
function modelView(fn){
  if(typeof S==="undefined"||!S)return fn();
  const was=S._mc;S._mc=true;try{return fn()}finally{S._mc=was}
}
/* The shape each rival usually plays -- a fixed expectation for displays,
   where the actual match shape is drawn at kickoff. */
function typicalShape(n){const st=RIVALS.find(r=>r.n===n).str;return st>=60?"4-3-3":st<=44?"5-3-2":"4-4-2"}
/* Exact Poisson probabilities for Your Team against an opponent: xGF, xGA,
   clean sheet chance and 1X2. Computed, not simulated -- so the same
   question always gets the same answer on every screen. */
function matchProbs(opp,home){
  return modelView(()=>{
    const[m,t]=clubRates(opp,home,1.25,typicalShape(opp));
    const pm=[],pt=[];let a=Math.exp(-m),b=Math.exp(-t);
    for(let k=0;k<=12;k++){pm.push(a);pt.push(b);a*=m/(k+1);b*=t/(k+1)}
    let w=0,d=0;for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const p=pm[i]*pt[j];if(i>j)w+=p;else if(i===j)d+=p}
    const W=Math.round(w*100),D=Math.round(d*100);
    return{xgf:m,xga:t,cs:Math.exp(-t),w:W,d:D,l:100-W-D};
  });
}
/* The formation a competent manager would pick against this opponent: the
   one with the best expected goal difference in the model's view. The Shark
   assumes your club is run this well, and so does the manager you employ
   when you are the owner. */
function bestShapeFor(opp,home){
  const was=S.formation,wasXI=S.manualXI;let best=was,bv=-1e9;
  for(const f of Object.keys(FORMATIONS)){S.formation=f;S.manualXI=null;const p=matchProbs(opp,home);if(p.xgf-p.xga>bv){bv=p.xgf-p.xga;best=f}}
  S.formation=was;S.manualXI=wasXI;return best;
}
/* Expected league points from a fixture, in the model's view. */
function expPts(opp,home){const p=matchProbs(opp,home);return(3*p.w+p.d)/100}
/* What home advantage is worth this season: for each home fixture, the
   expected points at home minus what the same game would give away. */
function homeValue(){let v=0;
  for(let wk=0;wk<MW;wk++){const[h,a]=myFixture(wk);if(h===CLUB)v+=expPts(a,true)-expPts(a,false)}
  return v}
/* ===========================================================================
   THE MODEL'S VIEW, NOW -- one set of numbers behind every table.
   ratingsNow()     each club's attack (xGF per game) and defence (xGA per
                    game) across its fixtures against this league, as things
                    stand. Your Team is rated AS YOU ARE RUNNING IT.
   projectionNow()  where the model expects everyone to finish, from the
                    current table plus those same ratings for the games left.
   Because the projection is built from the ratings, a club can never be
   shown stronger but projected lower -- which happened in 1 in 5 pairs by
   halfway when the table was ordered by a frozen pre-season prediction.
   The Shark's TARGET is separate: points a well-run club would take, fixed
   pre-season, and never shown as a league position.
   =========================================================================== */
function fixtureRates(h,a){
  return modelView(()=>{
    if(h!==CLUB&&a!==CLUB){const hs=strOf(h),as=strOf(a);
      return[Math.max(.2,1.25*Math.pow(1.5,(hs-as)/20)*HOME_MULT),Math.max(.2,1.25*Math.pow(1.5,(as-hs)/20))]}
    const home=h===CLUB,opp=home?a:h,[m,t]=clubRates(opp,home,1.25,typicalShape(opp));
    return home?[m,t]:[t,m];
  });
}
/* Exact Poisson win/draw chances from two expected-goals figures. */
function probsFromRates(x,y){
  const px=[],py=[];let a=Math.exp(-x),b=Math.exp(-y);
  for(let k=0;k<=12;k++){px.push(a);py.push(b);a*=x/(k+1);b*=y/(k+1)}
  let w=0,d=0;for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){const p=px[i]*py[j];if(i>j)w+=p;else if(i===j)d+=p}
  return{w,d,l:Math.max(0,1-w-d)};
}
/* xPts -- expected points per game -- is the HEADLINE strength figure,
   because it is what the projection is built on. Goal difference alone can
   rank clubs differently from points: a tight, low-scoring side draws more
   and can out-point a slightly "stronger" open one. Ranking by xGF minus xGA
   produced that apparent contradiction in 2 of 300 pairs; xPts cannot. */
/* from = the first gameweek to include. 0 rates a club over its whole
   season (its quality, independent of the schedule); S.mw rates only the
   games still to play (its run-in), which is what the projection uses. */
function ratingsNow(from){
  const teams=[CLUB].concat(RIVALS.map(r=>r.n)),r={};teams.forEach(n=>r[n]={f:0,a:0,p:0,k:0});
  const wks=FIXTURES.slice(from&&from<MW?from:0);
  for(const wk of wks)for(const[h,a]of wk){const[x,y]=fixtureRates(h,a),q=probsFromRates(x,y);
    r[h].f+=x;r[h].a+=y;r[h].p+=3*q.w+q.d;r[h].k++;r[a].f+=y;r[a].a+=x;r[a].p+=3*q.l+q.d;r[a].k++}
  const out={};for(const n of teams)out[n]={xgf:r[n].f/r[n].k,xga:r[n].a/r[n].k,xpts:r[n].p/r[n].k};
  return out;
}
function projectionNow(runs=1500){
  const saved=R.s;R.s=hashSeed(SEED+"|proj|"+S.mw);
  const teams=[CLUB].concat(RIVALS.map(r=>r.n)),acc={};teams.forEach(n=>acc[n]={sum:0,top:0,bot:0,pts:0});
  const left=[];for(let wk=S.mw;wk<MW;wk++)for(const[h,a]of FIXTURES[wk])left.push([h,a,...fixtureRates(h,a)]);
  for(let i=0;i<runs;i++){
    const t={};teams.forEach(n=>t[n]={pts:TABLE[n].pts,gd:TABLE[n].gf-TABLE[n].ga,gf:TABLE[n].gf});
    for(const[h,a,x,y]of left){const hg=pois(x),ag=pois(y);
      t[h].gf+=hg;t[a].gf+=ag;t[h].gd+=hg-ag;t[a].gd+=ag-hg;
      if(hg>ag)t[h].pts+=3;else if(ag>hg)t[a].pts+=3;else{t[h].pts++;t[a].pts++}}
    teams.slice().sort((p,q)=>t[q].pts-t[p].pts||t[q].gd-t[p].gd||t[q].gf-t[p].gf||p.localeCompare(q))
      .forEach((n,idx)=>{acc[n].sum+=idx+1;acc[n].pts+=t[n].pts;if(idx===0)acc[n].top++;if(idx>=teams.length-2)acc[n].bot++});
  }
  R.s=saved;
  const out={};for(const n of teams)out[n]={avg:acc[n].sum/runs,pts:acc[n].pts/runs,title:Math.round(acc[n].top/runs*100),rel:Math.round(acc[n].bot/runs*100)};
  return out;
}
/* THE PROJECTED TABLE: points won so far plus expected points for the games
   left, in that order. Exact arithmetic on the columns shown beside it, so
   the order can never contradict them -- ordering by average simulated
   finishing position disagreed with expected points now and then, because a
   volatile club and a steady one can share expected points but not average
   position. The simulation is still used for what it is good at: title and
   relegation chances. */
function expectedFinal(RL){
  RL=RL||ratingsNow(S.mw);const left=MW-S.mw,out={};
  for(const n of [CLUB].concat(RIVALS.map(r=>r.n)))out[n]=TABLE[n].pts+RL[n].xpts*left;
  return out;
}
function projOrder(teams,P,RL){
  const E=expectedFinal(RL);
  return teams.slice().sort((a,b)=>E[b]-E[a]||(TABLE[b].gf-TABLE[b].ga)-(TABLE[a].gf-TABLE[a].ga)||a.localeCompare(b));
}
function projectedPlace(n){return projOrder([CLUB].concat(RIVALS.map(r=>r.n)),null,ratingsNow(S.mw)).indexOf(n)+1}
function monteCarlo(runs=4000){
  /* blankTable() resets -- and award() fills -- the FORM and CLEAN records,
     which are shared with the real season. Without saving and restoring
     them, the real game began with the form and clean sheets of the last
     simulated season (60 results and 21 clean sheets, measured). */
  const savedForm=FORM,savedClean=CLEAN;
  const saved=R.s,counts={};R.s=hashSeed(SEED+"|shark");[CLUB].concat(RIVALS.map(r=>r.n)).forEach(n=>counts[n]={sum:0,bot2:0,top:0,pts:0});
  const live=typeof S!=="undefined"&&S&&S.squadList&&typeof ROLE!=="undefined"&&ROLE;
  const cache={},shapeCache={};
  const clubGame=(h,a)=>{
    const home=h===CLUB,opp=home?a:h,fm=oppFormation(opp),key=opp+"|"+home+"|"+fm;
    /* A WELL-RUN club, not a club making no decisions: it picks the right
       shape for each opponent. Predicting a club that does nothing made the
       Shark easy to beat (a sensible manager beat it 71% of the time) and
       quietly taught that the model is naive. */
    if(!cache[key]){const was=S.formation,wasB=S.matchBoost;S.formation=shapeCache[opp+"|"+home]||(shapeCache[opp+"|"+home]=bestShapeFor(opp,home));
      /* ...and it makes the rest of its decisions sensibly too: training,
         morale, transfers. SHARK_UPLIFT is that, as strength -- see config. */
      S.matchBoost=SHARK_UPLIFT;cache[key]=clubRates(opp,home,1.25,fm);S.formation=was;S.matchBoost=wasB}
    const[m0,t0]=cache[key];
    let m=m0,t=t0;
    if(rng()<RED_THEM){t*=.86;m*=1.12}
    if(rng()<RED_US_BASE){m*=.86;t*=1.12}
    const mg=Math.min(5,pois(m)),tg=Math.min(5,pois(t));
    return home?[mg,tg]:[tg,mg];
  };
  const hot=live&&currentXI().some(x=>S.squadList[x.i].nm==="Hot Head");
  const RED_US_BASE=hot?RED_US_HOTHEAD:RED_US;
  /* A season is not played at August freshness. The Shark assumes a normal
     season's wear: squad fatigue and player condition at their season-long
     averages for a side that simply plays its fixtures, measured from this
     engine (fatigue ~35, condition ~76 across GW1-10). Without this it
     predicted from the fresh pre-season squad and was systematically
     optimistic, so doing nothing scored well below the 50 it should. */
  let restore=null;
  if(live)S._mc=true;
  if(live){
    const fits=S.squadList.map(p=>p.fit),fat=S.fatigue;
    S.squadList.forEach(p=>{p.fit=Math.min(p.fit,SEASON_WEAR.condition)});S.fatigue=SEASON_WEAR.fatigue;
    restore=()=>{S.squadList.forEach((p,i)=>{p.fit=fits[i]});S.fatigue=fat};
  }
  for(let i=0;i<runs;i++){const t=blankTable();
    FIXTURES.forEach(wk=>wk.forEach(([h,a])=>{
      const[hg,ag]=(live&&(h===CLUB||a===CLUB))?clubGame(h,a)
        :simScore(h===CLUB?52:strOf(h),a===CLUB?52:strOf(a));
      award(t,h,a,hg,ag)}));
    standings(t).forEach((row,idx)=>{counts[row.n].sum+=idx+1;counts[row.n].pts+=row.pts;if(idx>=4)counts[row.n].bot2++;if(idx===0)counts[row.n].top++})}
  if(restore)restore();
  if(live)S._mc=false;
  R.s=saved;FORM=savedForm;CLEAN=savedClean;
  const out={};for(const[n,c]of Object.entries(counts))out[n]={avg:c.sum/runs,pts:c.pts/runs,rel:Math.round(c.bot2/runs*100),title:Math.round(c.top/runs*100)};
  return out;
}

/* --- squad ---------------------------------------------------------------- */
/* ===========================================================================
   THE SQUAD
   Sixteen players, each named for what they ARE rather than who they are, so
   the name tells you how to use them. Every player carries:
     rt    quality             fit   condition
     att   attacking lean      def   defensive lean
     dev   change in quality per matchweek (young +, veterans -)
     inj   injury proneness (multiplies the risk of breaking down)
   Balance is the point: the XI you field moves attack and defence
   independently, players out of position cost you, and only the players who
   PLAY get tired -- so rotation, not just quality, decides a season.
   =========================================================================== */
const ARCHETYPES=[
  {pos:"GK",nm:"Safe Hands",          rt:56,fit:90,att:0,def:2, dev:0,   inj:.15, sp:0,aer:0,line:"never spectacular, never wrong"},
  {pos:"GK",nm:"Error-Prone Keeper",  rt:49,fit:95,att:0,def:-1,dev:.3,  inj:.15, sp:0,aer:0,line:"brilliant saves, baffling mistakes"},
  {pos:"DF",nm:"Captain Grit",        rt:55,fit:78,att:0,def:3, dev:-.4, inj:1.3,sp:1,aer:2,line:"thirty-four, organises everyone"},
  {pos:"DF",nm:"Aerial Giant",        rt:53,fit:88,att:1,def:2, dev:0,   inj:.9, sp:0,aer:3,line:"wins every header, loses every race"},
  {pos:"DF",nm:"Ball-Playing Defender",rt:52,fit:88,att:2,def:-1,dev:.1, inj:1,  sp:1,aer:1,line:"lovely on the ball, nervy off it"},
  {pos:"DF",nm:"Journeyman Defender", rt:49,fit:92,att:0,def:1, dev:0,   inj:.6, sp:0,aer:1,line:"seventh club, never injured"},
  {pos:"DF",nm:"Young Full-Back",     rt:45,fit:96,att:1,def:0, dev:.8,  inj:.9, sp:0,aer:0,line:"raw, quick, better every week"},
  {pos:"MF",nm:"Playmaker",           rt:56,fit:84,att:3,def:-2,dev:0,   inj:1,  sp:2,aer:0,line:"sees passes nobody else does"},
  {pos:"MF",nm:"Engine Room",         rt:54,fit:94,att:1,def:2, dev:0,   inj:.7, sp:1,aer:1,line:"runs all day, never tires"},
  {pos:"MF",nm:"Hot Head",            rt:53,fit:88,att:1,def:1, dev:0,   inj:1,  sp:1,aer:1,line:"brilliant, and one tackle from a red"},
  {pos:"MF",nm:"Set-Piece Specialist",rt:49,fit:88,att:2,def:0, dev:0,   inj:.9, sp:3,aer:1,line:"worth a goal a month from dead balls"},
  {pos:"MF",nm:"Loan Kid",            rt:46,fit:96,att:1,def:0, dev:1.0, inj:.9, sp:1,aer:0,line:"on loan from a big club, improving fast"},
  {pos:"FW",nm:"Old Superstar",       rt:62,fit:72,att:4,def:-1,dev:-.6, inj:1.8,sp:2,aer:1,line:"used to be brilliant; still is, for an hour"},
  {pos:"FW",nm:"Greedy but Quick",    rt:55,fit:90,att:3,def:-1,dev:0,   inj:1,  sp:1,aer:0,line:"shoots from everywhere, passes to nobody"},
  {pos:"FW",nm:"Fox in the Box",      rt:53,fit:88,att:2,def:0, dev:0,   inj:.9, sp:1,aer:2,line:"does nothing except score"},
  {pos:"FW",nm:"Young Potential",     rt:45,fit:97,att:1,def:0, dev:1.2, inj:.8, sp:0,aer:1,line:"the academy's best hope in years"}
];
/* Out of position: an outfield player in the wrong line loses a little;
   anyone swapping to or from goalkeeper loses a great deal. */
const OOP_PENALTY=7,GK_OOP_PENALTY=18;
/* ---------------------------------------------------------------------------
   OUT OF POSITION, and what it is FOR.
   A player's registered position is where he is listed (G/D/M/F, as in FPL).
   His SLOT is where he plays. Moving a player FORWARD is not simply a worse
   version of him: a defender in midfield still defends like a defender, so
   the team keeps its defensive shape -- which makes it a DEFENSIVE move that
   also hands a defender a midfielder's chances in front of goal. That is
   exactly why "out of position" players are prized in Fantasy: they keep
   their registered position's points (a defender scores 6 a goal and 4 for a
   clean sheet) while playing further forward. The site's Starting Lineups
   marks them the same way this game does: green ring, up arrow.
   Moving a player BACKWARDS is the opposite: a forward cannot defend.
   Each entry: quality lost, and how his attacking/defensive lean carries.
   --------------------------------------------------------------------------- */
const LINE_ORDER={GK:0,DF:1,MF:2,FW:3};
const OOP={
  "DF>MF":{pen:3,att:1, def:1, keepDef:1},   /* defensive midfielder: holds the shape */
  "DF>FW":{pen:6,att:1, def:0, keepDef:.8},  /* target man who defends from the front */
  "MF>FW":{pen:3,att:1, def:0, keepDef:.7},
  "MF>DF":{pen:4,att:-1,def:0, keepDef:.7},
  "FW>MF":{pen:3,att:0, def:-1,keepDef:.6},
  "FW>DF":{pen:8,att:-1,def:-2,keepDef:.4}
};
function oopInfo(p,slot){return p.pos===slot?null:(OOP[p.pos+">"+slot]||null)}
function roleSignal(p,slot){if(p.pos===slot||p.pos==="GK"||slot==="GK")return "";
  return LINE_ORDER[slot]>LINE_ORDER[p.pos]?"advanced":"deeper"}
/* SHARPNESS. Resting restores condition, but a player left out too long
   gets rusty. Above RUST_LINE there is no cost; below it, quality drops. */
const RUST_LINE=75,RUST_COST=.16;
function rust(p){return Math.max(0,(RUST_LINE-(p.sharp==null?90:p.sharp)))*RUST_COST}
function makeSquad(){
  return ARCHETYPES.map(a=>{const rt=a.rt+rnd(-2,2);
    return Object.assign({},a,{rt,rtf:rt,fit:clamp(a.fit+rnd(-4,3)),sharp:90,gone:false,out:0,goals:0,goalsAdv:0,spGoals:0})});
}
function pips(v,max,cls){let h="";for(let i=0;i<5;i++)h+=`<i class="${v>=(i+1)*(max/5)?cls:''}"></i>`;return `<div class="pips">${h}</div>`}
function lineShape(fm){const[d,m,f]=fm.split("-").map(Number);return{GK:1,DF:d,MF:m,FW:f}}
function effRating(p,slot){
  const r=p.rt-rust(p);
  if(p.pos===slot)return r;
  if(p.pos==="GK"||slot==="GK")return r-GK_OOP_PENALTY;
  const o=oopInfo(p,slot);return r-(o?o.pen:OOP_PENALTY);
}
/* SET PIECES. The taker is the XI's best set-piece skill unless the manager
   names one. He takes penalties and free kicks wherever he plays; corners
   are won in the air, so aerial players -- defenders included -- score from
   them. Around a quarter of goals at this level come this way. */
function setPieceTaker(xi){
  xi=xi||currentXI();
  const cand=xi.filter(s=>s.slot!=="GK").map(s=>S.squadList[s.i]);
  if(S.spTaker!=null){const p=S.squadList[S.spTaker];if(p&&cand.includes(p))return p}
  return cand.slice().sort((a,b)=>(b.sp||0)-(a.sp||0)||b.rt-a.rt)[0]||null;
}
function aerialThreat(xi){return(xi||currentXI()).filter(s=>s.slot!=="GK")
  .map(s=>S.squadList[s.i].aer||0).sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0)}
/* The best XI the formation allows from AVAILABLE players, rated with a
   little weight on condition. Where a line runs short -- injuries, sales --
   it borrows the best remaining outfield player and plays him out of
   position, visibly and at a cost. */
function autoXI(){
  const shape=lineShape(S.formation||"4-4-2");
  const pool=S.squadList.map((p,i)=>({p,i})).filter(x=>!x.p.gone&&!x.p.out);
  const val=x=>(x.p.rt-rust(x.p))*(0.7+0.3*x.p.fit/100);
  const used=new Set(),xi=[];
  for(const slot of ["GK","DF","MF","FW"]){
    const cands=pool.filter(x=>x.p.pos===slot).sort((a,b)=>val(b)-val(a));
    for(let k=0;k<shape[slot];k++){
      let c=cands.find(x=>!used.has(x.i));
      /* No keeper fit: the LEAST valuable outfield player goes in goal --
         not the best one, which would cost you your striker too. */
      if(!c&&slot==="GK")c=pool.filter(x=>!used.has(x.i)).sort((a,b)=>a.p.rt-b.p.rt)[0];
      /* Short in this line: borrow the best unused player, keeping keepers
         out of outfield slots unless nobody else is left. */
      if(!c)c=pool.filter(x=>!used.has(x.i)&&(slot==="GK"||x.p.pos!=="GK"))
                  .sort((a,b)=>effRating(b.p,slot)-effRating(a.p,slot))[0];
      if(!c)c=pool.filter(x=>!used.has(x.i)).sort((a,b)=>effRating(b.p,slot)-effRating(a.p,slot))[0];
      if(!c)break;
      used.add(c.i);xi.push({i:c.i,slot});
    }
  }
  return xi;
}
/* A lineup the manager picked by hand stands until one of its players is
   no longer available, or the formation changes -- then the game re-picks. */
function currentXI(){
  const m=S.manualXI;
  if(m&&S.manualFm===S.formation&&m.every(s=>{const p=S.squadList[s.i];return p&&!p.gone&&!p.out}))return m;
  S.manualXI=null;
  return autoXI();
}
function xiStats(){
  const xi=currentXI();
  if(!xi.length)return{q:40,fit:70,att:0,def:0,xi};
  let q=0,fit=0,att=0,def=0;
  for(const s of xi){const p=S.squadList[s.i],o=oopInfo(p,s.slot);
    q+=effRating(p,s.slot);fit+=p.fit;
    if(!o||p.pos==="GK"||s.slot==="GK"){att+=o?p.att*.5:p.att;def+=o?p.def*.5-1:p.def}
    else{att+=p.att*.5+o.att;def+=p.def*o.keepDef+o.def}
    /* An outfield player in goal is not a small inefficiency -- it is a
       defensive crisis, and it must feel like one in the results. */
    if(s.slot==="GK"&&p.pos!=="GK")def-=12}
  const n=xi.length;
  /* Set pieces feed attack: the taker's skill and the XI's aerial threat. */
  const tk=setPieceTaker(xi);
  att+=(tk?(tk.sp||0):0)*SP_WEIGHT+aerialThreat(xi)*AER_WEIGHT;
  /* Fewer than eleven fit players is punished directly. */
  return{q:q/n-(11-n)*3,fit:fit/n,att,def,xi};
}
/* How far the XI's attacking and defensive lean has moved from the side
   you started the season with. Feeds attack and defence separately. */
function balanceAdj(){const x=xiStats();return[(x.att-(S.attBase||0))*BAL_WEIGHT,(x.def-(S.defBase||0))*BAL_WEIGHT]}
/* THE PITCH, drawn the way the site's Starting Lineups draws it: a marked
   pitch, players placed by tactical role (LB, LCB, CM, CF...), each a circle
   showing his REGISTERED position letter (G/D/M/F, as in FPL), ringed green
   with a ▲ when he plays a more advanced role than his position and red
   with a ▼ when deeper -- the site's own signals -- plus set-piece duties
   in the site's P1 FK1 C1 format. Keeping the visual language identical is
   deliberate: a player who learns it here can read the real page. */
const ROLE_NAMES={GK:{1:["GK"]},DF:{3:["LCB","CB","RCB"],4:["LB","LCB","RCB","RB"],5:["LWB","LCB","CB","RCB","RWB"]},
  MF:{3:["LCM","CM","RCM"],4:["LM","LCM","RCM","RM"],5:["LM","LCM","CM","RCM","RM"]},
  FW:{1:["CF"],2:["CF","CF"],3:["LW","CF","RW"]}};
const ROW_TOP={GK:89,DF:70,MF:46,FW:17};
const ACROSS={1:[50],2:[36,64],3:[22,50,78],4:[12,37,63,88],5:[10,30,50,70,90]};
const POS_LETTER={GK:"G",DF:"D",MF:"M",FW:"F"};
function pitchSlots(xi){
  const out=[];
  for(const line of ["GK","DF","MF","FW"]){
    const row=xi.filter(s=>s.slot===line),n=row.length;
    row.forEach((s,k)=>out.push({...s,top:ROW_TOP[line],left:(ACROSS[n]||ACROSS[4])[k]??50,
      role:((ROLE_NAMES[line]||{})[n]||[])[k]||line}));
  }
  return out;
}
function squadHTML(opts){
  opts=opts||{};
  const xi=currentXI(),inXI=new Set(xi.map(s=>s.i)),tk=setPieceTaker(xi);
  const condCol=f=>f<60?'var(--bad)':f<78?'var(--amber)':'var(--good)';
  const marker=s=>{const p=S.squadList[s.i],sig=roleSignal(p,s.slot),sel=opts.sel===s.i;
    const flag=(p.sharp!=null&&p.sharp<RUST_LINE)?"Rusty":p.fit<62?"Tired":"";
    return `<button type="button" class="pm${sel?' sel':''}${s.i===S.meIdx?' me':''}" style="top:${s.top}%;left:${s.left}%"
        ${opts.pick?`data-xi="${s.i}"`:'disabled'} title="${p.nm} — ${p.line}">
      <span class="dot ${sig}">${POS_LETTER[p.pos]}</span>
      <span class="pn">${p.nm}</span>
      <span class="pq"><b>Q${p.rt}</b> · <span style="color:${condCol(p.fit)}">${p.fit}%</span></span>
      <span class="pr">${s.role}${sig==="advanced"?'<b class="up">▲</b>':sig==="deeper"?'<b class="dn">▼</b>':''}</span>
      ${p===tk?'<span class="psp">P1 FK1 C1</span>':''}
      ${flag?`<span class="pf">${flag}</span>`:''}
    </button>`};
  const bench=S.squadList.map((p,i)=>({p,i})).filter(x=>!x.p.gone&&!inXI.has(x.i));
  return `<!--SQ--><div class="pitchbox">
    <div class="pitch2">
      <i class="ln-half"></i><i class="ln-circle"></i><i class="ln-box top"></i><i class="ln-box bot"></i>
      ${pitchSlots(xi).map(marker).join('')}
    </div>
    <div class="plegend">
      <span><i class="dot advanced sm"></i> Advanced role (▲)</span>
      <span><i class="dot deeper sm"></i> Deeper role (▼)</span>
      <span><b style="color:var(--amber)">P1 FK1 C1</b> set-piece duties</span>
      <span><b style="color:#7cb9e8">Rusty</b> rested too long</span>
      <span><b>Q</b> quality · <b>%</b> condition (fitness)</span>
    </div>
    <div class="benchh">Bench${opts.pick?' — tap a player on the pitch, then one here, to swap':''}
      <span style="float:right;text-transform:none;letter-spacing:0">Quality · Condition</span></div>
    <div class="bench">${bench.map(({p,i})=>
      `<button type="button" class="bp${p.out?' out':''}${i===S.meIdx?' me':''}" ${opts.pick&&!p.out?`data-bench="${i}"`:'disabled'}>
        <span class="bpos">${p.pos}</span>
        <span class="bn">${p.nm}<small>${p.out?`<b style="color:var(--bad)">OUT ${p.out} ${p.out===1?"week":"weeks"}</b> · `:
          (p.sharp!=null&&p.sharp<RUST_LINE)?'<b style="color:#7cb9e8">Rusty</b> · ':''}${p.line}</small></span>
        <span class="bq">Q${p.rt}</span>
        <span class="bq" style="color:${condCol(p.fit)};min-width:38px;text-align:right">${p.fit}%</span></button>`).join('')}</div>
  </div><!--/SQ-->`;
}
const alive=()=>S.squadList.filter(p=>!p.gone);
/* AVAILABLE is not the same as at the club. The Physio Room is where the
   difference lives, and it is the difference that decides Saturdays. */
const available=()=>S.squadList.filter(p=>!p.gone&&!p.out);
const me=()=>S.squadList[S.meIdx]||alive()[0];
function newState(){
  const keep=R.s;R.s=hashSeed(SEED+"|squad");
  const sq=makeSquad();
  const swing=Object.fromEntries([CLUB].concat(RIVALS.map(r=>r.n)).map(n=>[n,rnd(-SEASON_SWING,SEASON_SWING)]));
  R.s=keep;
  /* As the star player you are the best FORWARD who is not in decline --
     the player events are written for someone in his prime. */
  const meIdx=ROLE.id==="player"?sq.reduce((b,p,i)=>(p.pos==="FW"&&p.dev>=0&&(b<0||p.rt>sq[b].rt))?i:b,-1):-1;
  return{club:CLUB,cash:120,debt:850,wages:41,squad:52,morale:50,fans:55,board:50,fatigue:22,
    form:62,fitness:88,interest:40,mw:0,pos:6,formArr:[],lastRes:null,alive:true,
    pending:[],flags:{},squadList:sq,meIdx,manualXI:null,manualFm:null,
    matchBoost:0,lastScore:null,ticketLevel:0,signings:0,seasonLog:[],physioLevel:0,
    formation:"4-4-2",attMod:0,defMod:0,matchAtt:0,matchDef:0,bonuses:[],rivalMod:{},
    swing};
}
/* S.squad is now a READOUT of the XI's quality, recomputed freely. What
   events change is MORALE -- a separate number that persists. They used to
   share one number, so every "Squad +4" an event showed was overwritten by
   the next recalculation and did nothing at all. */
function recalcSquadRating(){
  const x=xiStats();
  if(S.attBase==null){S.attBase=x.att;S.defBase=x.def}
  S.squad=clamp(Math.round(x.q));
}
function myStrength(){
  const x=xiStats();
  let b=x.q+(x.fit-86)*.16-(S.fatigue-40)*.12+(S.fans-50)*.04+((S.morale==null?50:S.morale)-50)*.12;
  if(ROLE.id==="player")b+=(S.form-62)*.12+(S.fitness-86)*.05;
  /* your own hidden season swing, again invisible to the Shark */
  if(!S._mc&&S.swing)b+=S.swing[CLUB]||0;
  return b+(S.matchBoost||0);
}
/* Your Team is marked the same way in every table, so it can be found at a
   glance whatever else is on screen. */
const youTag=n=>n===CLUB?' <span class="you">YOU</span>':'';
function tableHTML(){const st=standings(TABLE),N=st.length;
  return `<table class="tbl"><thead><tr><th class="n">#</th><th>Club</th><th class="n">P</th><th class="n">GD</th><th class="n">Pts</th></tr></thead><tbody>
  ${st.map((r,i)=>`<tr class="${r.n===CLUB?'me':''} ${i>=N-2?'rel':''}"><td class="n">${i+1}</td><td>${r.n}${youTag(r.n)}</td>
  <td class="n">${r.p}</td><td class="n">${r.gd>0?'+':''}${r.gd}</td><td class="n">${r.pts}</td></tr>`).join('')}</tbody></table>
  <div style="font-size:11px;color:var(--mute);margin-top:4px">The FixtureShark League · bottom two relegated</div>`}
function myPos(){S.pos=standings(TABLE).findIndex(r=>r.n===CLUB)+1;return S.pos}
/* Pre-season there are no results, so the league table is meaningless and
   reads as though the season has already gone badly. Show FixtureShark's
   PREDICTED table instead, which is both accurate and the thing the site
   actually does. */
function predictedPos(){return Math.round(projectionNow()[CLUB].avg)}
function predictedTableHTML(){
  const P=projectionNow(),R=ratingsNow();
  const rows=projOrder([CLUB].concat(RIVALS.map(r=>r.n)),P,R).map(n=>({n,...P[n]}));
  return `<table class="tbl"><thead><tr><th class="n">#</th><th>Club</th><th class="n">Title</th><th class="n">Down</th></tr></thead><tbody>
  ${rows.map((r,i)=>{const rv=RIVALS.find(x=>x.n===r.n);return `<tr class="${r.n===CLUB?'me':''} ${i>=rows.length-2?'rel':''}"><td class="n">${i+1}</td>
    <td>${r.n}${youTag(r.n)}${rv?`<div style="font-size:11px;color:var(--mute);font-weight:400">${rv.d}</div>`:`<div style="font-size:11px;color:var(--mute);font-weight:400">as the squad stands — the rest is up to you</div>`}</td>
    <td class="n">${r.title}%</td><td class="n">${r.rel}%</td></tr>`}).join('')}</tbody></table>
  <div style="font-size:11px;color:var(--mute);margin-top:4px">The model's projection before a ball is kicked · the same ratings as Team Strength</div>`;
}

/* --- THE SCORE: you against the Shark ------------------------------------
   The Shark's number is its pre-season prediction -- effectively what
   happens if a club makes no decisions at all. Matching it scores 50. Each
   place better is +15, each place worse -15, and winning the league adds 15.
   So the score is literally "how much better than the model were you". */
/* THE SCORE IS POINTS. The Shark predicts how many league points a
   well-run club with your squad would take; you are scored on how many you
   actually take against that. Points rather than position, because a
   predicted position (say 3.56) only changes when you jump a whole place --
   so beating it was often luck -- while every decision moves your points.
   It is also how Fantasy players already think, and what the site's own
   projections predict.
     Matching the Shark's points scores 50; each point above or below is
     worth 5; winning the league adds 10.
     THE OWNER also answers for the money: finishing the season in the red
     costs up to 30. The manager is not scored on cash -- it is the owner's
     problem, and his constraint. */
function sharkPos(){return clamp(Math.round(PREDICT[CLUB].avg),1,6)}
function sharkPts(){return PREDICT[CLUB].pts}
/* SCORING BY FINISHING POSITION (Chris: the best finishing position is the
   main thing being assessed). The target is the place a WELL-RUN club with
   your squad would finish (the Shark's prediction). Each place above it is
   worth 15, the title adds 10; points against target pace are only a small
   tie-breaker. Pre-season the score is 50; during the season it tracks your
   PROJECTED finish, steadier than the week-to-week table. Money no longer
   docks the score directly: it bites through forced sales and a points
   deduction (cashConsequences), i.e. through league position. */
function scoreParts(){
  const pred=sharkPts(),pts=TABLE[CLUB].pts;
  const par=pred*(S.mw/MW),diff=pts-par,done=S.mw>=MW;
  const target=sharkPos();
  const place=done?S.pos:S.mw===0?target:projectedPlace(CLUB);
  let total=S.mw===0?50:50+15*(target-place)+2*(done?pts-pred:diff)+(done&&S.pos===1?10:0);
  if(!S.alive)total*=.3;
  return{pred,par,pts,diff,target,place,red:0,total:Math.round(clamp(total,0,100))};
}
/* MONEY WITH FOOTBALL CONSEQUENCES (Chris). Checked at the end of every
   gameweek, by the game and by the simulator alike:
   - deep in the red (below CASH_RULES.deductBelow): a points deduction, once
     a season -- 3 points, the ten-game equivalent of the real 12;
   - in the red at all: the bank forces the sale of your most valuable player,
     as long as eleven would still be fit to play.
   Returns what happened, for the results screen to say. */
const CASH_RULES={deductBelow:-300,deductPts:3,minSquad:11};
function cashConsequences(){
  const out=[];
  if(!S.alive)return out;
  if(S.cash<CASH_RULES.deductBelow&&!S.deducted){
    TABLE[CLUB].pts-=CASH_RULES.deductPts;S.deducted=true;out.push({type:"deduction",pts:CASH_RULES.deductPts});
  }
  if(S.cash<0){
    const fit=alive().filter(p=>!p.gone);
    if(fit.length>CASH_RULES.minSquad){
      const p=fit.slice().sort((a,b)=>b.rt-a.rt)[0],fee=Math.round((p.rt-38)*13);
      S.cash+=fee;S.wages=Math.max(8,S.wages-Math.round((p.rt-40)*.5+3));p.gone=true;recalcSquadRating();
      out.push({type:"sale",nm:p.nm,pos:p.pos,rt:p.rt,fee});
    }
  }
  return out;
}
function apply(fx,noisy){const out=[];
  for(const[k,v0]of Object.entries(fx||{})){if(!v0)continue;
    const v=noisy?Math.round(v0*(1+(rng()*2-1)*NOISE)):v0,M=x=>fmtMoney(Math.abs(x)).replace('-','');
    if(k==='cash'){S.cash+=v;out.push([`Cash ${v>0?'+':'−'}${M(v)}`,v>0])}
    else if(k==='debt'){S.debt+=v;out.push([`Debt ${v>0?'+':'−'}${M(v)}`,v<0])}
    else if(k==='wages'){S.wages+=v;out.push([`Wages ${v>0?'+':'−'}${M(v)}/w`,v<0])}
    else if(k==='squad'){S.morale=clamp((S.morale==null?50:S.morale)+v);out.push([`Morale ${v>0?'+':''}${v}`,v>0])}
    else if(k==='fans'){S.fans=clamp(S.fans+v);out.push([`Fans ${v>0?'+':''}${v}`,v>0])}
    else if(k==='board'){S.board=clamp(S.board+v);out.push([`Board ${v>0?'+':''}${v}`,v>0])}
    else if(k==='fatigue'){S.fatigue=clamp(S.fatigue+v);out.push([`Fatigue ${v>0?'+':''}${v}`,v<0])}
    else if(k==='form'){S.form=clamp(S.form+v);out.push([`Form ${v>0?'+':''}${v}`,v>0])}
    else if(k==='fitness'){S.fitness=clamp(S.fitness+v);out.push([`Fitness ${v>0?'+':''}${v}`,v>0])}
    else if(k==='interest'){S.interest=clamp(S.interest+v);out.push([`Interest ${v>0?'+':''}${v}`,v>0])}
    else if(k==='condition'){S.squadList.forEach(p=>{if(!p.gone)p.fit=clamp(p.fit+v)});out.push([`Condition ${v>0?'+':''}${v} all`,v>0])}}
  // The exact figures, as before.
  const exact=out.map(([t,g])=>`<span class="${g?'up':'down'}">${t}</span>`).join('');
  if(typeof LEVELS!=="undefined"&&LEVELS[LEVEL]&&LEVELS[LEVEL].guru)return exact;
  // Everyone else: a few tags in football terms (Chris: "a mess of numbers").
  // Arrows show size: small, big, major. Green is good for you.
  const T={team:0,fans:0,board:0},M={cash:0,debt:0,wages:0};let interest=0;
  for(const[k,v0]of Object.entries(fx||{})){if(!v0)continue;
    if(['squad','form','fitness','condition'].includes(k))T.team+=v0;
    else if(k==='fatigue')T.team-=v0;
    else if(k==='fans'||k==='board')T[k]+=v0;
    else if(k in M)M[k]+=v0;
    else if(k==='interest')interest+=v0}
  const size=v=>{const a=Math.abs(v);return a<=3?1:a<=8?2:3};
  const tag=(label,v,good)=>`<span class="tag ${good?'up':'down'}">${label} ${(v>0?'\u25b2':'\u25bc').repeat(size(v))}</span>`;
  const tags=[];
  if(T.team)tags.push(tag("Team",T.team,T.team>0));
  if(T.fans)tags.push(tag("Fans",T.fans,T.fans>0));
  if(T.board)tags.push(tag("Board",T.board,T.board>0));
  if(interest)tags.push(tag("Interest",interest,interest>0));
  if(M.cash)tags.push(`<span class="tag ${M.cash>0?'up':'down'}">Cash ${M.cash>0?'+':'\u2212'}${fmtMoney(Math.abs(M.cash))}</span>`);
  if(M.debt)tags.push(tag("Debt",M.debt,M.debt<0));
  if(M.wages)tags.push(tag("Wages",M.wages,M.wages<0));
  return tags.join('')+(tags.length?why(`<div class="delta">${exact}</div>`,"The numbers"):"")}
function later(n,fx,text){if(!fx)return;const a={};for(const[k,v]of Object.entries(fx))a[k]=Math.round(v*DELAY_AMP);
  S.pending.push({at:cursor+n,fx:a,text})}
function drainPending(){const d=S.pending.filter(p=>p.at<=cursor);S.pending=S.pending.filter(p=>p.at>cursor);return d}

function paintHeader(){
  if(!S)return;myPos();
  const {pred,par,pts,diff,total}=scoreParts();
  // The top of the screen: league position and cash. Nothing else (Chris).
  document.getElementById('hScore').innerHTML=`${S.mw?ord(S.pos):"—"}<span class="sub">POSITION</span>`;
  document.getElementById('hTwo').innerHTML=`<div class="two"><div class="k">Cash</div><div class="v${S.cash<0?' neg':''}">${fmtMoney(S.cash)}</div>
      <div class="pts">${S.cash<0?"in the red: the bank will sell a player":""}</div></div>`;
  const tr=document.getElementById('hTrend');tr.className="trend fl";tr.textContent="";
  const left=MW-S.mw;
  let note=S.mw===0?"Pre-season · nothing played":left===0?"Season over":left<=2?`${left} to play — the run-in`:S.mw===5?"Halfway":`${left} matches left`;
  document.getElementById('hSeason').innerHTML=
   `<div class="lbl"><span>GAMEWEEK ${S.mw} / ${MW} · ${note.toUpperCase()}</span>
     <span>${ROLE.id==="owner"?"CASH "+fmtMoney(S.cash):S.formArr.length?"FORM "+S.formArr.slice(-5).map(f=>f.toUpperCase()).join(" "):""}</span></div>
    <div class="track"><i style="width:${(S.mw/MW)*100}%"></i></div>`;
  S.lastScore=total;
}
