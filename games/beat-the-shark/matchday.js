/* ===========================================================================
   matchday.js — the vidiprinter, half time, the classified check and the Sports Centre.
   =========================================================================== */
/* --- matchweeks ----------------------------------------------------------- */
function playOthers(wk){const out=[];
  FIXTURES[wk].forEach(([h,a])=>{if(h===CLUB||a===CLUB)return;
    const[hg,ag]=simScore(strOf(h),strOf(a));award(TABLE,h,a,hg,ag);out.push({h,a,hg,ag})});return out}
function myFixture(wk){return FIXTURES[wk].find(([h,a])=>h===CLUB||a===CLUB)}
function resolveMine(hg,ag,home){
  const mg=home?hg:ag,tg=home?ag:hg;let fx,res;
  if(mg>tg){res='w';fx={fans:7,board:7,cash:rnd(16,30)}}
  else if(mg===tg){res='d';fx={fans:1,board:1,cash:rnd(10,19)}}
  else{res='l';fx={fans:-7,board:-6,cash:rnd(8,15)}}
  S.formArr.push(res);S.lastRes=res;S.matchBoost=0;
  /* Squad fatigue now RECOVERS between matches, settling around the mid-40s
     unless decisions push it. It used to climb 5-9 every match with nothing
     bringing it down (22 -> 85 over a season, measured), which double-counted
     tiredness once every player had his own condition -- a side that simply
     played its fixtures lost 12 strength points by May. */
  S.fatigue=clamp(S.fatigue+rnd(2,5)-Math.max(0,(S.fatigue-30)*.25));
  S.seasonLog.push({mw:S.mw+1,gf:mg,ga:tg,cs:tg===0?1:0});
  /* Only the players who PLAYED tire and risk injury; the bench recovers.
     That is what makes rotation a real decision rather than a readout.
     Every player also drifts by his trajectory: the young improve through
     the season, the veterans decline -- so the squad you finish with is not
     the one you started with. */
  const played=new Set(currentXI().map(s=>s.i));
  S.squadList.forEach((p,i)=>{
    if(p.gone)return;
    p.rtf=(p.rtf==null?p.rt:p.rtf)+(p.dev||0);
    p.rt=clamp(Math.round(p.rtf),30,85);
    if(p.out){p.out--;if(!p.out)p.fit=clamp(p.fit+18);return}   /* recovering */
    if(!played.has(i)){p.fit=clamp(p.fit+rnd(4,8));return}     /* rested */
    p.fit=clamp(p.fit-rnd(3,8)*(p.inj>1.2?1.3:1),25,100);
    /* The lower the condition, the likelier the match breaks him -- and
       some players break more easily than others. */
    const risk=(p.fit<55?.26:p.fit<70?.12:.04)*(p.inj||1);
    if(rng()<risk){p.out=rnd(1,3);p.fit=clamp(p.fit-10)}
  });
  if(ROLE.id==="player"){S.fitness=clamp(S.fitness-rnd(2,6));S.form=clamp(S.form+(mg>tg?5:mg===tg?0:-4))}
  return{fx,res};
}
/* Who you are playing, and whether they are better than you. This was the
   missing context: the vidiprinter named an opponent with no sense of where
   they sat or what the model made of the tie. */
/* Team Strength, in the site's own currency: an attack rating and a defence
   rating expressed as expected goals per match, not an opaque 0-100 score. */
function teamAtt(n){const st=n===CLUB?myStrength()+(S.attMod||0)+FORMATIONS[S.formation||"4-4-2"].att+balanceAdj()[0]:strOf(n);
  return Math.max(.35,0.95+(st-52)/26)}
function teamDef(n){const st=n===CLUB?myStrength()+(S.defMod||0)+FORMATIONS[S.formation||"4-4-2"].def+balanceAdj()[1]:strOf(n);
  return Math.max(.35,1.55-(st-52)/26)}
function strengthTableHTML(){
  const rows=[CLUB].concat(RIVALS.map(r=>r.n))
    .map(n=>({n,att:teamAtt(n),def:teamDef(n),t:TABLE[n]}))
    .sort((a,b)=>(b.att-b.def)-(a.att-a.def));
  return `<table class="tbl"><thead><tr><th>Club</th><th class="n">Attack</th><th class="n">Defence</th>
    <th class="n">GF</th><th class="n">GA</th><th class="n">CS</th></tr></thead><tbody>
    ${rows.map(r=>`<tr class="${r.n===CLUB?'me':''}"><td>${r.n}${youTag(r.n)}</td>
      <td class="n">${r.att.toFixed(2)}</td><td class="n">${r.def.toFixed(2)}</td>
      <td class="n">${r.t.gf}</td><td class="n">${r.t.ga}</td><td class="n">${CLEAN[r.n]||0}</td></tr>`).join('')}
    </tbody></table>
  <div style="font-size:11px;color:var(--mute);margin-top:4px">Attack and defence as expected goals per match · CS = clean sheets</div>`;
}
/* Fixture heat map: every remaining match rated by opponent strength and
   venue. Exactly the thing the site does, shown here as a row of squares. */
/* FIXTURE HEAT MAP, in the site's own language: GW numbers, a three-letter
   opponent code with H or A (the site shows "CHI - H"), a whole-number FDR
   from 1 (easiest) to 5 (hardest), and the site's legend wording. The game
   used to say "MW" and show a raw decimal, which nobody could read. */
function heatColour(d){return["#2d6b48","#5d8f4e","#c9901a","#c26a2a","#a8322b"][clamp(d,1,5)-1]}
function oppCode(n){return n.replace(/[^A-Za-z]/g,"").slice(0,3).toUpperCase()}
function fixtureHeatHTML(fromWk,count){
  const cells=[],to=Math.min(MW,fromWk+(count||5));
  for(let wk=fromWk;wk<to;wk++){
    const f=FIXTURES[wk].find(([h,a])=>h===CLUB||a===CLUB);
    const home=f[0]===CLUB,opp=home?f[1]:f[0];
    const gap=strOf(opp)-myStrength()+(home?-4:4);
    cells.push({wk:wk+1,opp,home,d:Math.round(clamp(3+gap/6,1,5))});
  }
  if(!cells.length)return "";
  const easy=cells.filter(c=>c.d<=2).length,hard=cells.filter(c=>c.d>=4).length;
  const worst=cells.reduce((a,c)=>c.d>a.d?c:a),best=cells.reduce((a,c)=>c.d<a.d?c:a);
  const say=`${easy} ${easy===1?"looks":"look"} kind, ${hard} ${hard===1?"looks":"look"} hard. `+
    `Toughest: GW${worst.wk}, ${worst.home?"home to":"away at"} ${worst.opp}. `+
    `Kindest: GW${best.wk}, ${best.home?"home to":"away at"} ${best.opp}.`;
  return `<div style="display:grid;grid-template-columns:repeat(${cells.length},1fr);gap:4px;margin:6px 0 4px">
    ${cells.map(c=>`<div title="GW${c.wk}: ${CLUB} ${c.home?"vs":"@"} ${c.opp} — FDR ${c.d}"
      style="min-width:0;background:${heatColour(c.d)};color:#f6f4ea;border-radius:6px;padding:7px 3px;text-align:center">
      <div style="font-family:var(--mono);font-size:10px;opacity:.9">GW${c.wk}</div>
      <div style="font-family:var(--mono);font-size:14px;font-weight:600;margin-top:2px">${oppCode(c.opp)} - ${c.home?"H":"A"}</div>
      <div style="font-family:var(--mono);font-size:9.5px;opacity:.85;margin-top:2px">FDR ${c.d}</div></div>`).join('')}
  </div>
  <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--mute);margin:4px 0 6px">
    <span>Easiest fixtures (FDR)</span>
    <span style="flex:1;height:6px;border-radius:3px;background:linear-gradient(90deg,#2d6b48,#5d8f4e,#c9901a,#c26a2a,#a8322b)"></span>
    <span>Hardest fixtures (FDR)</span></div>
  <p class="small" style="margin:0">${say}</p>`;
}
function posOf(n){return standings(TABLE).findIndex(r=>r.n===n)+1}
function formPips(n){const f=(FORM[n]||[]).slice(-5);
  return f.length?`<span class="form">${f.map(x=>`<i class="${x}"></i>`).join('')}</span>`:'<span style="color:var(--mute)">—</span>'}
function winProb(oppName,home){
  const saved=R.s;let w=0,d=0;
  const fm=S.nextOppFm||"4-4-2";
  for(let i=0;i<500;i++){
    const[m,t]=clubRates(oppName,home,1.25,fm);
    const mg=Math.min(5,pois(m)),tg=Math.min(5,pois(t));
    if(mg>tg)w++;else if(mg===tg)d++;
  }
  R.s=saved;
  return{w:Math.round(w/5),d:Math.round(d/5),l:Math.round((500-w-d)/5)};
}
function opponentPanel(opp,home){
  const myP=posOf(CLUB),oP=posOf(opp),t=TABLE[opp],mt=TABLE[CLUB];
  const oStr=strOf(opp),gap=Math.round(myStrength()-oStr);
  const pr=winProb(opp,home);
  const played=mt.p>0;
  return `<div style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:11px 12px;margin-bottom:11px">
    <div style="display:flex;gap:10px;align-items:stretch">
      <div style="flex:1;text-align:center">
        <div style="font-family:var(--mono);font-size:9px;letter-spacing:.09em;color:var(--mute);text-transform:uppercase">You${home?" (home)":""}</div>
        <div style="font-family:var(--disp);font-size:22px;font-weight:700;line-height:1.1">${played?ord(myP):"—"}</div>
        <div style="font-size:11.5px;color:var(--ink2)">${mt.pts} pts · rated ${Math.round(myStrength())}</div>
        <div style="margin-top:3px">${formPips(CLUB)}</div>
      </div>
      <div style="width:1px;background:var(--line)"></div>
      <div style="flex:1;text-align:center">
        <div style="font-family:var(--mono);font-size:9px;letter-spacing:.09em;color:var(--mute);text-transform:uppercase">${opp}${home?"":" (home)"}</div>
        <div style="font-family:var(--disp);font-size:22px;font-weight:700;line-height:1.1">${played?ord(oP):"—"}</div>
        <div style="font-size:11.5px;color:var(--ink2)">${t.pts} pts · rated ${oStr}</div>
        <div style="margin-top:3px">${formPips(opp)}</div>
      </div>
    </div>
    <div style="margin-top:9px;padding-top:9px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink2)">
      <b style="color:var(--ink)">Team Strength</b> — you ${teamAtt(CLUB).toFixed(2)} attack / ${teamDef(CLUB).toFixed(2)} defence,
      them ${teamAtt(opp).toFixed(2)} / ${teamDef(opp).toFixed(2)} expected goals.
      ${gap>4?"Well below you":gap>0?"Slightly below you":gap>-5?"Slightly above you":"Well above you"}. Model odds:
      <span style="font-family:var(--mono);color:var(--good)">W ${pr.w}%</span> ·
      <span style="font-family:var(--mono)">D ${pr.d}%</span> ·
      <span style="font-family:var(--mono);color:var(--bad)">L ${pr.l}%</span>
    </div></div>`;
}
/* CLASSIFIED CHECK: all three of the week's fixtures streamed together, in
   minute order, the way a results service actually reads. The old roundup
   printed final scores instantly, which threw away the one thing people
   liked about the match screen -- watching it happen, including to the
   clubs you are chasing. */
/* Is this a week where the table genuinely matters? Title race or relegation
   fight, in the run-in. The final day always counts. */
function inRace(){
  const st=standings(TABLE),me=st.findIndex(r=>r.n===CLUB),left=MW-S.mw;
  if(left>4||!TABLE[CLUB].p)return false;
  const top=st[0].pts-TABLE[CLUB].pts<=3&&me<=2;
  const safe=st[3]?st[3].pts:0;
  const bottom=me>=3&&TABLE[CLUB].pts-safe<=3;
  return top||bottom;
}
/* Every "live" week is now your own match, quickly, followed by the 3pm
   results -- the old classified check streamed all three fixtures at once,
   which was hard to follow. */
function renderLiveWeek(){return renderMatch(next,true)}
function renderRoundup(){
  const wk=S.mw,[h,a]=myFixture(wk),home=h===CLUB;
  const[hg,ag]=playFixture(h,a);
  award(TABLE,h,a,hg,ag);const others=playOthers(wk);
  const{fx}=resolveMine(hg,ag,home);S.mw++;
  const d=apply(fx,true);myPos();paintHeader();
  const mid=S.mw===5,run=S.mw===8;
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">GAMEWEEK ${S.mw} OF ${MW} · RESULTS</div>
    <h1>${mid?"Halfway":run?"The run-in begins":"Saturday's results"}</h1>
    ${mid?`<p class="lede">Five played, five to go. ${ord(S.pos)} of six.</p>`:''}
    ${run?`<p class="lede">Three matches left. Whatever you are going to do, do it now.</p>`:''}
    <div class="res mine"><span>${h} v ${a}</span><span class="sc">${hg}–${ag}</span></div>
    ${others.map(o=>`<div class="res"><span>${o.h} v ${o.a}</span><span class="sc">${o.hg}–${o.ag}</span></div>`).join('')}
    <div class="delta" style="margin-bottom:10px">${d}</div>${tableHTML()}
    <button class="choice primary" id="nx" style="margin-top:11px"><span class="t">Continue</span></button></div>`;
  document.getElementById('nx').onclick=next;
}
/* THE TEAM SHEET, before every match you watch in full. The opponent's
   shape is decided HERE and carried into the match, so what you pick
   against is what you play against (re-rolling it at kickoff would also
   shift the seeded random sequence). The manager picks the formation and
   the XI; other roles see the manager's choice. */
function renderTeamSheet(done){
  const wk=S.mw,[hT,aT]=myFixture(wk),home=hT===CLUB,opp=home?aT:hT;
  if(!S.pendingOppFm)S.pendingOppFm=oppFormation(opp);
  const mgr=ROLE.id==="manager";
  let sel=null;
  function draw(){
    recalcSquadRating();paintHeader();
    const x=xiStats(),[bA,bD]=balanceAdj();
    const lean=v=>`<span style="color:${v>0.4?'var(--good)':v<-0.4?'var(--bad)':'var(--mute)'}">${v>0?'+':''}${v.toFixed(1)}</span>`;
    document.getElementById('app').innerHTML=`<div class="card">
      <div class="datechip">GAMEWEEK ${wk+1} OF ${MW} · TEAM SHEET</div>
      <h1>${home?`${opp}, at ${STADIUM}`:`Away at ${opp}`}</h1>
      <p class="small">They are lining up <b>${S.pendingOppFm}</b>. ${mgr?"Pick your shape and your eleven.":"The manager has picked the side."}</p>
      ${mgr?`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:6px 0 10px">
        ${Object.entries(FORMATIONS).map(([k,v])=>`<button class="choice" data-fm="${k}" style="margin:0;padding:7px 2px;text-align:center;
          ${k===S.formation?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
          <span class="t" style="font-size:13px">${k}</span><span class="d" style="font-size:10px">${v.att>0?'+':''}${v.att}/${v.def>0?'+':''}${v.def}</span></button>`).join('')}
      </div>`:''}
      <div class="xibar">XI quality <b>${Math.round(x.q)}</b> · condition <b>${Math.round(x.fit)}</b>
        · attack lean ${lean(bA)} · defence lean ${lean(bD)}</div>
      ${squadHTML({pick:mgr,sel})}
      ${mgr?`<button class="choice" id="bestXI" style="margin-top:9px"><span class="t">Pick my best XI</span>
        <span class="d">Let the game choose the strongest available side for this shape</span></button>`:''}
      <button class="choice primary" id="kick" style="margin-top:6px"><span class="t">Kick off</span></button></div>`;
    if(mgr){
      document.querySelectorAll('[data-fm]').forEach(b=>b.onclick=()=>{S.formation=b.dataset.fm;S.manualXI=null;sel=null;draw()});
      document.querySelectorAll('[data-xi]').forEach(b=>b.onclick=()=>{const i=+b.dataset.xi;sel=sel===i?null:i;draw()});
      document.querySelectorAll('[data-bench]').forEach(b=>b.onclick=()=>{
        if(sel==null)return;
        const j=+b.dataset.bench,xi=currentXI().map(s=>({...s}));
        const k=xi.findIndex(s=>s.i===sel);if(k<0)return;
        xi[k].i=j;S.manualXI=xi;S.manualFm=S.formation;sel=null;draw()});
      document.getElementById('bestXI').onclick=()=>{S.manualXI=null;sel=null;draw()};
    }
    document.getElementById('kick').onclick=done;
  }
  draw();
}
/* RED CARDS -- luck, not decisions. Drawn at kickoff for either side. A red
   before half time changes the second half; the Hot Head in your XI makes
   your own far likelier. The same odds are used in the quick simulation
   (playFixture), so the balance checks measure the game as it is played. */
function drawReds(){
  const hot=currentXI().some(s=>S.squadList[s.i].nm==="Hot Head");
  const r=[];
  if(rng()<RED_THEM)r.push({m:rnd(15,85),us:0});
  if(rng()<(hot?RED_US_HOTHEAD:RED_US)){
    const xi=currentXI().filter(s=>s.slot!=="GK").map(s=>S.squadList[s.i]);
    const who=hot?"Hot Head":(pick(xi)||{nm:"a defender"}).nm;
    r.push({m:rnd(15,85),us:1,who});
  }
  return r;
}
/* YOUR MATCH. Your Team is always on the left and the score is always
   yours first -- it used to follow home/away convention, which made your
   own result hard to follow. quick=true is the lighter version: no team
   sheet, no half-time call, a faster vidiprinter. */
function renderMatch(done,quick){
  if(!quick&&!S._sheetShown){S._sheetShown=true;return renderTeamSheet(()=>renderMatch(done,false))}
  S._sheetShown=false;
  const wk=S.mw,[hT,aT]=myFixture(wk),home=hT===CLUB,opp=home?aT:hT,final=wk===MW-1;
  const oFm=S.pendingOppFm||oppFormation(opp);S.pendingOppFm=null;S.nextOppFm=oFm;
  S.matchBoost=0;S.matchAtt=0;S.matchDef=0;
  const startPos=TABLE[CLUB].p?posOf(CLUB):null;
  const reds=drawReds();
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">GAMEWEEK ${wk+1} OF ${MW} · ${final?"FINAL DAY · ":""}THE EARLY KICK-OFF</div>
    <h1>${home?`${opp}, at ${STADIUM}`:`Away at ${opp}`}</h1>
    ${quick?"":opponentPanel(opp,home)}
    <div class="vp"><div class="teams">
      <span>${CLUB.toUpperCase()} <small style="opacity:.7">(${home?"H":"A"})</small><br><span style="font-family:var(--mono);font-size:11px;color:var(--mute)">${S.formation}</span></span>
      <span style="text-align:right">${opp.toUpperCase()}<br><span style="font-family:var(--mono);font-size:11px;color:var(--mute)">${oFm}</span></span></div>
      <div id="vpl"></div></div>
    <div id="htBox"></div></div>`;
  const lines=document.getElementById('vpl');let mine=0,theirs=0;
  const add=(m,t,cls,sc2)=>{const d=document.createElement('div');d.className='ln'+(cls?' '+cls:'');
    d.innerHTML=`<span class="min">${m}</span><span class="tx">${t}</span>${sc2?`<span class="sc">${sc2}</span>`:''}`;lines.appendChild(d)};
  const sc=()=>`${mine}–${theirs}`;
  const tick=quick?430:780;
  function half(from,to,cb){
    let[mr,tr]=clubRates(opp,home,.62,oFm);
    /* a first-half red card shapes the second half */
    for(const r of reds)if(from>45&&r.m<=45){if(r.us){mr*=.72;tr*=1.25}else{tr*=.72;mr*=1.25}}
    const mg=Math.min(3,pois(mr)),tg=Math.min(3,pois(tr)),ev=[];
    const mins=n=>{const r=[];for(let i=0;i<n;i++)r.push(rnd(from,to));return r.sort((x,y)=>x-y)};
    for(const m of mins(mg))ev.push({m,mine:1,p:pickScorer()});
    for(const m of mins(tg))ev.push({m,mine:0});
    for(const r of reds)if(r.m>=from&&r.m<=to)ev.push({m:r.m,red:r});
    if(rng()<.4)ev.push({m:rnd(from,to),card:1});
    ev.sort((x,y)=>x.m-y.m);let i=0;
    (function go(){if(i>=ev.length)return setTimeout(cb,quick?260:460);const e=ev[i++];
      if(e.card)add(e.m+"'","Yellow card","");
      else if(e.red)add(e.m+"'",e.red.us?`RED CARD — ${e.red.who.toUpperCase()} (YOURS)`:`RED CARD — ${opp.toUpperCase()}`,e.red.us?"against":"goal");
      else if(e.mine){mine++;if(e.p)e.p.goals=(e.p.goals||0)+1;
        add(e.m+"'",(e.p?e.p.nm:"TRIALIST").toUpperCase(),"goal",sc())}
      else{theirs++;add(e.m+"'",opp.toUpperCase()+" GOAL","against",sc())}
      setTimeout(go,tick+Math.random()*(quick?120:260))})();
  }
  half(4,45,()=>{
    add("HT","Half time","ft",sc());
    if(quick){add("46'","— second half —","");return half(46,92,finish)}
    if(ROLE.id==="manager")return tacticalHalfTime(mine,theirs,oFm,()=>{add("46'","— second half —","");half(46,92,finish)});
    const losing=mine<theirs,level=mine===theirs;
    const spec=ROLE.id==="player"
      ?{title:losing?"You are losing. Forty-five minutes left.":level?"Level at the break.":"You are ahead.",
        choices:[{t:"Play safe, keep the rating up",d:"Protect the body",fx:{form:-1},att:-2,def:1},
          {t:"Take it on yourself",d:"Shoot on sight",fx:{fitness:-6,form:3},att:4,def:-1}]}
      :{title:"Half time in the directors' box",
        choices:[{t:"Go down to the concourse",d:"Be seen among the supporters",fx:{fans:6}},
          {t:"Work the room upstairs",d:"Sponsors and contacts",fx:{cash:18,fans:-2}},
          {t:"Stay in your seat",d:"You are a fan too",fx:{fans:2}}]};
    const box=document.getElementById('htBox');
    box.innerHTML=`<div style="margin-top:12px"><div class="datechip">HALF TIME</div>
      <h2 style="margin-top:5px">${spec.title}</h2><div id="htCh"></div></div>`;
    spec.choices.forEach(c=>{const b=document.createElement('button');b.className='choice';
      b.innerHTML=`<span class="t">${c.t}</span><span class="d">${c.d}</span>`;
      b.onclick=()=>{box.innerHTML=`<div style="margin-top:10px" class="outcome">${c.t}.</div>`;
        apply(c.fx,true);S.matchAtt=c.att||0;S.matchDef=c.def||0;add("46'","— second half —","");half(46,92,finish)};
      document.getElementById('htCh').appendChild(b)});
  });
  function finish(){
    add("FT","Full time","ft",sc());
    const hg=home?mine:theirs,ag=home?theirs:mine;
    award(TABLE,hT,aT,hg,ag);
    const{fx,res}=resolveMine(hg,ag,home);
    S.matchAtt=0;S.matchDef=0;
    setTimeout(()=>renderElsewhere({wk,fx,res,mine,theirs,opp,home,startPos,final},done),quick?600:900);
  }
}
/* THE 3PM KICK-OFFS. Your game was the early one. The table is shown AS IT
   STANDS -- your result in, everyone else still to play -- then their
   results arrive one by one and the table re-sorts under you. Fixtures that
   involve a club within three points of you are flagged, because those are
   the ones you would actually be watching. */
function renderElsewhere(info,done){
  const{wk,fx,res,mine,theirs,opp,home,startPos,final}=info;
  const others=FIXTURES[wk].filter(([h,a])=>h!==CLUB&&a!==CLUB)
    .map(([h,a])=>{const[hg,ag]=simScore(strOf(h),strOf(a));return{h,a,hg,ag}});
  const posMap=()=>{const m={};standings(TABLE).forEach((r,i)=>m[r.n]=i+1);return m};
  const near=n=>Math.abs(TABLE[n].pts-TABLE[CLUB].pts)<=3;
  const d=apply(fx,true);myPos();paintHeader();
  const kickOffPos=posOf(CLUB);
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">GAMEWEEK ${wk+1} OF ${MW} · ${final?"FINAL DAY · ":""}THE 3PM KICK-OFFS</div>
    <h1>${res==='w'?"Job done.":res==='d'?"A point on the board.":"Beaten."} Now it's up to everyone else.</h1>
    <div class="res mine" style="font-size:15px;padding:10px">
      <span><b>${CLUB}</b> ${mine}–${theirs} ${opp} <small style="color:var(--mute)">(${home?"H":"A"})</small></span></div>
    <div class="delta" style="margin:6px 0 8px">${d}</div>
    <p class="small">You played the early kick-off. ${others.length} ${others.length===1?"game is":"games are"} still to play at 3pm${
      others.some(o=>near(o.h)||near(o.a))?" — and the ones marked ★ involve a club within three points of you":""}.</p>
    <div id="scTable"><div class="datechip" style="margin:8px 0 5px">AS IT STANDS · ${others.length} STILL TO PLAY</div>${tableRowsHTML(null)}</div>
    <div id="scFeed"></div><div id="scEnd"></div></div>`;
  const feed=document.getElementById('scFeed');
  let i=0;
  (function nextResult(){
    if(i>=others.length)return finish();
    const r=others[i++],prev=posMap();
    setTimeout(()=>{
      const star=near(r.h)||near(r.a);
      award(TABLE,r.h,r.a,r.hg,r.ag);myPos();
      const el=document.createElement('div');el.className='res';el.style.marginTop='6px';
      el.innerHTML=`<span>${star?"★ ":""}<b>FULL TIME</b> · ${r.h} v ${r.a}</span><span class="sc">${r.hg}–${r.ag}</span>`;
      feed.appendChild(el);
      const left=others.length-i;
      document.getElementById('scTable').innerHTML=`<div class="datechip" style="margin:8px 0 5px">${left?`AS IT STANDS · ${left} STILL TO PLAY`:"FULL TIME · ALL GAMES DONE"}</div>${tableRowsHTML(prev)}`;
      paintHeader();nextResult();
    },1500);
  })();
  function finish(){
    S.mw++;myPos();paintHeader();
    const endPos=posOf(CLUB),moved=kickOffPos-endPos;
    const line=final
      ?(endPos===1?"Champions.":endPos>=5?"Relegated.":`${ord(endPos)}, and safe.`)
      :`${moved>0?`Up ${moved} from where the 3pm games found you`:moved<0?`Down ${-moved} from where the 3pm games found you`:"Everyone else's results left you where you were"} — ${ord(endPos)} of six.`;
    document.getElementById('scEnd').innerHTML=`<div class="outcome" style="margin-top:10px;font-size:15px"><b>${line}</b></div>
      <button class="choice primary" id="mn" style="margin-top:10px"><span class="t">${final?"To the final whistle":"Continue"}</span></button>`;
    document.getElementById('mn').onclick=done;
  }
}
/* Who scores. A player on a goal bonus shoots more, so he is likelier to be
   the name on the vidiprinter -- the bonus has a visible consequence. */
function pickScorer(){
  /* Scorers come from the XI actually on the pitch, weighted by where they
     are playing and how attacking they are. A player on a goal bonus shoots
     more, so he is likelier to be the name on the vidiprinter. */
  const pool=currentXI().filter(s=>s.slot!=="GK").map(s=>({p:S.squadList[s.i],slot:s.slot}));
  if(!pool.length)return null;
  const w=pool.map(({p,slot})=>{let x=(slot==="FW"?3:slot==="MF"?2:1)*(1+Math.max(0,p.att)*.25);
    if(S.bonuses.some(b=>b.type==="goals"&&b.nm===p.nm))x*=2.2;return x});
  let r=rng()*w.reduce((a,b)=>a+b,0);
  for(let i=0;i<pool.length;i++){r-=w[i];if(r<=0)return pool[i].p}
  return pool[pool.length-1].p;
}
/* THE MANAGER'S HALF TIME: a real tactical panel, not a tone of voice.
   Pick a shape, make substitutions, push someone out of position, then
   send them back out. Every option states what it does to attack and
   defence, because that is the trade being made. */
function tacticalHalfTime(mg,tg,oFm,resume){
  const box=document.getElementById('htBox');
  let fm=S.formation,subs=[],oop=null;
  const tired=currentXI().map(s=>S.squadList[s.i]).filter(p=>p.fit<72).sort((a,b)=>a.fit-b.fit).slice(0,3);
  const defenders=available().filter(p=>p.pos==="DF");
  function effect(){
    const f=FORMATIONS[fm],fb=FORMATIONS[S.formation];
    let at=f.att-fb.att,de=f.def-fb.def;
    at+=subs.length*2;de+=subs.length*1;
    if(oop){at+=5;de-=5}
    return{at,de};
  }
  function draw(){
    const e=effect();
    box.innerHTML=`<div style="margin-top:12px">
      <div class="datechip">HALF TIME · ${mg}–${tg} · THEY ARE IN ${oFm}</div>
      <h2 style="margin-top:5px">${mg<tg?"Losing. Change something.":mg===tg?"Level. Chase it or hold it?":"Ahead. Protect it or kill it?"}</h2>
      <div style="font-family:var(--mono);font-size:10px;letter-spacing:.09em;color:var(--mute);margin:8px 0 5px">FORMATION</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">
        ${Object.entries(FORMATIONS).map(([k,v])=>`<button class="choice" data-fm="${k}" style="margin:0;padding:8px 2px;text-align:center;
          ${k===fm?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
          <span class="t" style="font-size:13px">${k}</span>
          <span class="d" style="font-size:10px">${v.att>0?'+':''}${v.att}/${v.def>0?'+':''}${v.def}</span></button>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--mute);margin-top:4px">${FORMATIONS[fm].d} · attack/defence</div>
      ${tired.length?`<div style="font-family:var(--mono);font-size:10px;letter-spacing:.09em;color:var(--mute);margin:12px 0 5px">SUBSTITUTIONS · FRESH LEGS FOR TIRED ONES</div>
        ${tired.map(p=>`<button class="choice" data-sub="${p.nm}" style="margin:0 0 5px;padding:8px 11px;
          ${subs.includes(p.nm)?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
          <span class="t" style="font-size:14px">${subs.includes(p.nm)?"✓ ":""}Take off ${p.nm}</span>
          <span class="d">${p.pos}, condition ${p.fit} · +2 attack, +1 defence</span></button>`).join('')}`:''}
      ${defenders.length&&mg<=tg?`<div style="font-family:var(--mono);font-size:10px;letter-spacing:.09em;color:var(--mute);margin:12px 0 5px">OUT OF POSITION</div>
        <button class="choice" data-oop="1" style="margin:0 0 5px;padding:8px 11px;
          ${oop?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
          <span class="t" style="font-size:14px">${oop?"✓ ":""}Push ${defenders[0].nm} up front</span>
          <span class="d">Centre-back as a target man · +5 attack, −5 defence</span></button>`:''}
      <div style="margin-top:10px;padding:8px 11px;border-radius:8px;background:var(--panel2);font-family:var(--mono);font-size:12.5px">
        Second-half change: <span style="color:${e.at>=0?'var(--good)':'var(--bad)'}">attack ${e.at>0?'+':''}${e.at}</span>
        · <span style="color:${e.de>=0?'var(--good)':'var(--bad)'}">defence ${e.de>0?'+':''}${e.de}</span></div>
      <button class="choice primary" id="goSecond" style="margin-top:9px"><span class="t">Send them back out</span></button></div>`;
    box.querySelectorAll('[data-fm]').forEach(b=>b.onclick=()=>{fm=b.dataset.fm;draw()});
    box.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>{const n=b.dataset.sub;
      subs=subs.includes(n)?subs.filter(x=>x!==n):(subs.length<3?subs.concat(n):subs);draw()});
    box.querySelectorAll('[data-oop]').forEach(b=>b.onclick=()=>{oop=!oop;draw()});
    document.getElementById('goSecond').onclick=()=>{
      const e=effect(),was=S.formation;
      /* The formation takes effect through S.formation, which clubRates
         reads. matchAtt/matchDef carry ONLY the subs and out-of-position
         parts -- otherwise the shape change would be counted twice. */
      const fAt=FORMATIONS[fm].att-FORMATIONS[was].att,fDe=FORMATIONS[fm].def-FORMATIONS[was].def;
      S.formation=fm;S.matchAtt=e.at-fAt;S.matchDef=e.de-fDe;
      /* subs: fresh legs now, and the tired man recovers a little */
      subs.forEach(n=>{const p=S.squadList.find(x=>x.nm===n);if(p)p.fit=clamp(p.fit+6)});
      S.fatigue=clamp(S.fatigue-subs.length*2);
      const bits=[fm!==was?`Switched from ${was} to ${fm}`:`Stayed in ${fm}`];
      if(subs.length)bits.push(`${subs.length} ${subs.length===1?"change":"changes"}: ${subs.join(", ")} off`);
      if(oop)bits.push(`${defenders[0].nm} pushed up front`);
      box.innerHTML=`<div style="margin-top:10px" class="outcome">${bits.join(". ")}.</div>`;
      resume();
    };
  }
  draw();
}
