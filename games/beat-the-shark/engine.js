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
const strOf=n=>n===CLUB?null:RIVALS.find(r=>r.n===n).str;
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
  const att=base+(S.attMod||0)+f.att+(S.matchAtt||0);
  const def=base+(S.defMod||0)+f.def+(S.matchDef||0);
  const os=strOf(opp),oAtt=os+of.att,oDef=os+of.def,h=home?5:-5;
  const k=scale||1.25;
  return[Math.max(.08,k*Math.pow(1.5,(att+h-oDef)/20)),Math.max(.08,k*Math.pow(1.5,(oAtt-def-h)/20))];
}
const pois=l=>{let L=Math.exp(-l),k=0,p=1;do{k++;p*=rng()}while(p>L);return k-1};
/* One entry point for any fixture, so your club always uses the split
   engine and rivals use the simple one. */
function playFixture(h,a,credit){
  if(h!==CLUB&&a!==CLUB)return simScore(strOf(h),strOf(a));
  const home=h===CLUB,opp=home?a:h;
  const[m,t]=clubRates(opp,home,1.25,oppFormation(opp));
  const mg=Math.min(5,pois(m)),tg=Math.min(5,pois(t));
  /* credit=true where no vidiprinter names the scorers. The classified
     check names them itself, so it must NOT pass this -- or every goal
     there would be counted twice against a goal bonus. */
  if(credit)for(let i=0;i<mg;i++){const p=pickScorer();if(p)p.goals=(p.goals||0)+1}
  return home?[mg,tg]:[tg,mg];
}
function simScore(hs,as){
  const hx=Math.max(.2,1.25*Math.pow(1.5,(hs+5-as)/20)),ax=Math.max(.2,1.25*Math.pow(1.5,(as-hs-5)/20));
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
function monteCarlo(runs=4000){
  const saved=R.s,counts={};[CLUB].concat(RIVALS.map(r=>r.n)).forEach(n=>counts[n]={sum:0,bot2:0,top:0});
  for(let i=0;i<runs;i++){const t=blankTable();
    FIXTURES.forEach(wk=>wk.forEach(([h,a])=>{const hs=h===CLUB?52:strOf(h),as=a===CLUB?52:strOf(a);
      const[hg,ag]=simScore(hs,as);award(t,h,a,hg,ag)}));
    standings(t).forEach((row,idx)=>{counts[row.n].sum+=idx+1;if(idx>=4)counts[row.n].bot2++;if(idx===0)counts[row.n].top++})}
  R.s=saved;const out={};for(const[n,c]of Object.entries(counts))out[n]={avg:c.sum/runs,rel:Math.round(c.bot2/runs*100),title:Math.round(c.top/runs*100)};
  return out;
}

/* --- squad ---------------------------------------------------------------- */
const QUIRKS=["never passes left","unplayable in the rain","allergic to tracking back","captain material, eventually",
  "hasn't scored since March","best trainer at the club","argues with everyone","thirty-four and knows it",
  "quick, and nothing else","the fans adore him"];
function makeSquad(){
  const nm=shuffle(SURNAMES).slice(0,8),base=[56,54,50,58,46,71,49,44],pos=["GK","DF","DF","MF","MF","FW","FW","DF"];
  const q=shuffle(QUIRKS);
  return nm.map((n,i)=>({pos:pos[i],nm:n,rt:base[i],fit:rnd(74,98),gone:false,out:0,quirk:q[i%q.length]}));
}
function pips(v,max,cls){let h="";for(let i=0;i<5;i++)h+=`<i class="${v>=(i+1)*(max/5)?cls:''}"></i>`;return `<div class="pips">${h}</div>`}
function squadHTML(opts){
  return `<!--SQ--><div class="sq">${S.squadList.map((p,i)=>
   `<div class="pl ${p.gone?'gone':''} ${i===S.meIdx?'me':''}" ${p.out?'style="opacity:.62"':''}>
      <span class="pos">${p.pos}</span>
      <span class="nm">${p.nm}${i===S.meIdx?' <span style="color:var(--amber);font-size:11px">you</span>':''}
        ${p.out?`<span style="color:var(--bad);font-size:11px">OUT ${p.out} ${p.out===1?"week":"weeks"}</span>`:''}
        <small>${p.quirk}</small></span>
      <span class="stat"><span class="lb">Quality</span><span class="vv">${p.gone?'—':p.rt}</span>${p.gone?'':pips(p.rt,100,'on')}</span>
      <span class="stat"><span class="lb">Condition</span><span class="vv" style="color:${p.fit<60?'var(--bad)':p.fit<78?'var(--amber)':'var(--good)'}">${p.gone?'—':p.fit}</span>
        ${p.gone?'':pips(p.fit,100,p.fit<60?'bad':p.fit<78?'hot':'on')}</span>
    </div>`).join('')}</div><!--/SQ-->`;
}
const alive=()=>S.squadList.filter(p=>!p.gone);
/* AVAILABLE is not the same as at the club. The Physio Room is where the
   difference lives, and it is the difference that decides Saturdays. */
const available=()=>S.squadList.filter(p=>!p.gone&&!p.out);
const me=()=>S.squadList[S.meIdx]||alive()[0];
function newState(){
  const sq=makeSquad();
  return{club:CLUB,cash:120,debt:850,wages:41,squad:52,fans:55,board:50,fatigue:22,
    form:62,fitness:88,interest:40,mw:0,pos:6,formArr:[],lastRes:null,alive:true,
    pending:[],flags:{},squadList:sq,meIdx:ROLE.id==="player"?sq.reduce((b,p,i)=>p.rt>sq[b].rt?i:b,0):-1,
    matchBoost:0,lastScore:null,ticketLevel:0,signings:0,seasonLog:[],physioLevel:0,
    formation:"4-4-2",attMod:0,defMod:0,matchAtt:0,matchDef:0,bonuses:[],
    departed:shuffle(SURNAMES.filter(n=>!sq.some(p=>p.nm===n))).slice(0,6)
      .map(n=>({nm:n,rt:rnd(58,74),to:pick(["a League One side","a rival","free agency","retirement","abroad","a National League club"])}))};
}
function recalcSquadRating(){
  const a=alive();if(!a.length)return;
  S.squad=clamp(Math.round(a.reduce((x,p)=>x+p.rt,0)/a.length + (S.board-50)*.05));
}
function myStrength(){const a=available().length?available():alive();
  const fit=a.length?a.reduce((x,p)=>x+p.fit,0)/a.length:80;
  const rs=a.map(p=>p.rt),avail=rs.length?rs.reduce((x,y)=>x+y,0)/rs.length:S.squad;
  let b=avail+(fit-86)*.16-(S.fatigue-40)*.12+(S.fans-50)*.04;
  if(ROLE.id==="player")b+=(S.form-62)*.12+(S.fitness-86)*.05;
  return b+(S.matchBoost||0)}
function tableHTML(){const st=standings(TABLE),N=st.length;
  return `<table class="tbl"><thead><tr><th class="n">#</th><th>Club</th><th class="n">P</th><th class="n">GD</th><th class="n">Pts</th></tr></thead><tbody>
  ${st.map((r,i)=>`<tr class="${r.n===CLUB?'me':''} ${i>=N-2?'rel':''}"><td class="n">${i+1}</td><td>${r.n}</td>
  <td class="n">${r.p}</td><td class="n">${r.gd>0?'+':''}${r.gd}</td><td class="n">${r.pts}</td></tr>`).join('')}</tbody></table>
  <div style="font-size:11px;color:var(--mute);margin-top:4px">The FixtureShark League · bottom two relegated</div>`}
function myPos(){S.pos=standings(TABLE).findIndex(r=>r.n===CLUB)+1;return S.pos}
/* Pre-season there are no results, so the league table is meaningless and
   reads as though the season has already gone badly. Show FixtureShark's
   PREDICTED table instead, which is both accurate and the thing the site
   actually does. */
function predictedPos(){return Math.round(PREDICT[CLUB].avg)}
function predictedTableHTML(){
  const rows=[CLUB].concat(RIVALS.map(r=>r.n)).map(n=>({n,avg:PREDICT[n].avg,rel:PREDICT[n].rel}))
    .sort((a,b)=>a.avg-b.avg);
  return `<table class="tbl"><thead><tr><th class="n">#</th><th>Club</th><th class="n">Title</th><th class="n">Down</th></tr></thead><tbody>
  ${rows.map((r,i)=>{const rv=RIVALS.find(x=>x.n===r.n);return `<tr class="${r.n===CLUB?'me':''} ${i>=rows.length-2?'rel':''}"><td class="n">${i+1}</td>
    <td>${r.n}${rv?`<div style="font-size:11px;color:var(--mute);font-weight:400">${rv.d}</div>`:`<div style="font-size:11px;color:var(--mute);font-weight:400">that is up to you</div>`}</td>
    <td class="n">${PREDICT[r.n].title}%</td><td class="n">${r.rel}%</td></tr>`}).join('')}</tbody></table>
  <div style="font-size:11px;color:var(--mute);margin-top:4px">FixtureShark pre-season model · 4,000 simulated seasons · nothing played yet</div>`;
}

/* --- THE SCORE: you against the Shark ------------------------------------
   The Shark's number is its pre-season prediction -- effectively what
   happens if a club makes no decisions at all. Matching it scores 50. Each
   place better is +15, each place worse -15, and winning the league adds 15.
   So the score is literally "how much better than the model were you". */
function sharkPos(){return Math.round(PREDICT[CLUB].avg)}
function scoreParts(){
  const pred=sharkPos(),diff=pred-S.pos;
  let total=50+diff*15+(S.pos===1?15:0);
  if(!S.alive)total*=.3;
  return{pred,diff,total:Math.round(clamp(total,0,100))};
}
function apply(fx,noisy){const out=[];
  for(const[k,v0]of Object.entries(fx||{})){if(!v0)continue;
    const v=noisy?Math.round(v0*(1+(rng()*2-1)*NOISE)):v0,M=x=>fmtMoney(Math.abs(x)).replace('-','');
    if(k==='cash'){S.cash+=v;out.push([`Cash ${v>0?'+':'−'}${M(v)}`,v>0])}
    else if(k==='debt'){S.debt+=v;out.push([`Debt ${v>0?'+':'−'}${M(v)}`,v<0])}
    else if(k==='wages'){S.wages+=v;out.push([`Wages ${v>0?'+':'−'}${M(v)}/w`,v<0])}
    else if(k==='squad'){S.squad=clamp(S.squad+v);out.push([`Squad ${v>0?'+':''}${v}`,v>0])}
    else if(k==='fans'){S.fans=clamp(S.fans+v);out.push([`Fans ${v>0?'+':''}${v}`,v>0])}
    else if(k==='board'){S.board=clamp(S.board+v);out.push([`Board ${v>0?'+':''}${v}`,v>0])}
    else if(k==='fatigue'){S.fatigue=clamp(S.fatigue+v);out.push([`Fatigue ${v>0?'+':''}${v}`,v<0])}
    else if(k==='form'){S.form=clamp(S.form+v);out.push([`Form ${v>0?'+':''}${v}`,v>0])}
    else if(k==='fitness'){S.fitness=clamp(S.fitness+v);out.push([`Fitness ${v>0?'+':''}${v}`,v>0])}
    else if(k==='interest'){S.interest=clamp(S.interest+v);out.push([`Interest ${v>0?'+':''}${v}`,v>0])}
    else if(k==='condition'){S.squadList.forEach(p=>{if(!p.gone)p.fit=clamp(p.fit+v)});out.push([`Condition ${v>0?'+':''}${v} all`,v>0])}}
  return out.map(([t,g])=>`<span class="${g?'up':'down'}">${t}</span>`).join('')}
function later(n,fx,text){if(!fx)return;const a={};for(const[k,v]of Object.entries(fx))a[k]=Math.round(v*DELAY_AMP);
  S.pending.push({at:cursor+n,fx:a,text})}
function drainPending(){const d=S.pending.filter(p=>p.at<=cursor);S.pending=S.pending.filter(p=>p.at>cursor);return d}

function paintHeader(){
  if(!S)return;myPos();
  const {pred,diff,total}=scoreParts();
  document.getElementById('hScore').innerHTML=`${total}<span class="sub">SCORE</span>`;
  const played=S.mw>0;
  document.getElementById('hTwo').innerHTML=
   `<div class="two"><div class="k">The Shark says</div><div class="v">${ord(pred)}</div>
      <div class="pts">pre-season prediction</div></div>
    <div class="two"><div class="k">You are</div><div class="v">${played?ord(S.pos):"—"}</div>
      <div class="pts" style="color:${!played?'inherit':diff>0?'#9ce0b9':diff<0?'#f0a89f':'inherit'}">
        ${!played?"nothing played":diff>0?`beating it by ${diff}`:diff<0?`${Math.abs(diff)} behind it`:"level with it"}</div></div>`;
  const tr=document.getElementById('hTrend');
  if(S.lastScore==null){tr.className="trend fl";tr.textContent="—"}
  else{const d=total-S.lastScore;tr.className="trend "+(d>0?"up":d<0?"dn":"fl");
    tr.textContent=(d>0?"▲ +"+d:d<0?"▼ "+Math.abs(d):"— ")}
  const left=MW-S.mw;
  let note=S.mw===0?"Pre-season · nothing played":left===0?"Season over":left<=2?`${left} to play — the run-in`:S.mw===5?"Halfway":`${left} matches left`;
  document.getElementById('hSeason').innerHTML=
   `<div class="lbl"><span>MATCHWEEK ${S.mw} / ${MW} · ${note.toUpperCase()}</span>
     <span>${ROLE.id==="owner"?"CASH "+fmtMoney(S.cash):S.formArr.length?"FORM "+S.formArr.slice(-5).map(f=>f.toUpperCase()).join(" "):""}</span></div>
    <div class="track"><i style="width:${(S.mw/MW)*100}%"></i></div>`;
  S.lastScore=total;
}
