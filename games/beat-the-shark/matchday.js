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
  S.formArr.push(res);S.lastRes=res;S.fatigue=clamp(S.fatigue+rnd(5,9));S.matchBoost=0;
  S.seasonLog.push({mw:S.mw+1,gf:mg,ga:tg,cs:tg===0?1:0});
  S.squadList.forEach(p=>{
    if(p.gone)return;
    if(p.out){p.out--;if(!p.out)p.fit=clamp(p.fit+18);return}   /* recovering */
    p.fit=clamp(p.fit-rnd(3,8),25,100);
    /* The lower the condition, the likelier the match breaks him. This is
       what makes the Physio Room matter rather than being a readout. */
    const risk=p.fit<55?.26:p.fit<70?.12:.04;
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
function teamAtt(n){const st=n===CLUB?myStrength()+(S.attMod||0)+FORMATIONS[S.formation||"4-4-2"].att:strOf(n);
  return Math.max(.35,0.95+(st-52)/26)}
function teamDef(n){const st=n===CLUB?myStrength()+(S.defMod||0)+FORMATIONS[S.formation||"4-4-2"].def:strOf(n);
  return Math.max(.35,1.55-(st-52)/26)}
function strengthTableHTML(){
  const rows=[CLUB].concat(RIVALS.map(r=>r.n))
    .map(n=>({n,att:teamAtt(n),def:teamDef(n),t:TABLE[n]}))
    .sort((a,b)=>(b.att-b.def)-(a.att-a.def));
  return `<table class="tbl"><thead><tr><th>Club</th><th class="n">Attack</th><th class="n">Defence</th>
    <th class="n">GF</th><th class="n">GA</th><th class="n">CS</th></tr></thead><tbody>
    ${rows.map(r=>`<tr class="${r.n===CLUB?'me':''}"><td>${r.n}</td>
      <td class="n">${r.att.toFixed(2)}</td><td class="n">${r.def.toFixed(2)}</td>
      <td class="n">${r.t.gf}</td><td class="n">${r.t.ga}</td><td class="n">${CLEAN[r.n]||0}</td></tr>`).join('')}
    </tbody></table>
  <div style="font-size:11px;color:var(--mute);margin-top:4px">Attack and defence as expected goals per match · CS = clean sheets</div>`;
}
/* Fixture heat map: every remaining match rated by opponent strength and
   venue. Exactly the thing the site does, shown here as a row of squares. */
function heatColour(d){
  return d<=1.5?"#2d6b48":d<=2.5?"#5d8f4e":d<=3.5?"#c9901a":d<=4.5?"#c26a2a":"#a8322b";
}
/* Five at a time in a fixed five-column grid. Ten tiles in a flex-wrap
   row broke on mobile into eight-then-two; five columns cannot wrap. */
function fixtureHeatHTML(fromWk,count){
  const cells=[],to=Math.min(MW,fromWk+(count||5));
  for(let wk=fromWk;wk<to;wk++){
    const f=FIXTURES[wk].find(([h,a])=>h===CLUB||a===CLUB);
    const home=f[0]===CLUB,opp=home?f[1]:f[0];
    const gap=strOf(opp)-myStrength()+(home?-4:4);
    const d=clamp(3+gap/6,1,5);
    cells.push({wk:wk+1,opp,home,d});
  }
  return `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:6px 0 4px">
    ${cells.map(c=>`<div title="${c.opp}" style="min-width:0;overflow:hidden;background:${heatColour(c.d)};
      color:#f6f4ea;border-radius:6px;padding:6px 4px;text-align:center">
      <div style="font-family:var(--mono);font-size:9px;opacity:.85">MW${c.wk}</div>
      <div style="font-family:var(--disp);font-size:13px;font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.opp.split(" ")[0]}</div>
      <div style="font-family:var(--mono);font-size:9px;opacity:.85">${c.home?"H":"A"} · ${c.d.toFixed(1)}</div></div>`).join('')}
  </div>
  <div style="font-size:11px;color:var(--mute)">Fixture difficulty 1 (easiest) to 5 (hardest), from Team Strength and venue</div>`;
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
function renderLiveWeek(){
  if(S.mw===MW-1||inRace())return renderSportsCentre();
  const wk=S.mw, fx=FIXTURES[wk];
  const games=fx.map(([h,a])=>{
    const[hg,ag]=playFixture(h,a);
    const mins=n=>{const r=[];for(let i=0;i<n;i++)r.push(rnd(3,90));return r.sort((x,y)=>x-y)};
    const scorers=(t)=>{if(t!==CLUB)return t.toUpperCase();const p=pickScorer();if(p)p.goals=(p.goals||0)+1;return p?p.nm.toUpperCase():"TRIALIST"};
    const ev=[];
    mins(hg).forEach(m=>ev.push({m,team:h,who:scorers(h)}));
    mins(ag).forEach(m=>ev.push({m,team:a,who:scorers(a)}));
    return{h,a,hg,ag,ev,ch:0,ca:0,mine:h===CLUB||a===CLUB};
  });
  const all=[];
  games.forEach((g,gi)=>g.ev.forEach(e=>all.push({...e,gi})));
  all.sort((x,y)=>x.m-y.m);
  paintHeader();
  const final=wk===MW-1;
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">MATCHWEEK ${wk+1} OF ${MW} · ${final?"FINAL DAY · ALL KICKING OFF TOGETHER":"SATURDAY, 3PM · CLASSIFIED CHECK"}</div>
    <h1>${final?"Everything at once":"Around the grounds"}</h1>
    ${final?`<p class="lede">Three matches, one kick-off, and nothing decided until all of them finish.</p>`:''}
    <div id="board"></div>
    <div class="vp" style="margin-top:10px;min-height:120px"><div id="tick"></div></div>
    <button class="skip" id="skipB">skip to full time</button></div>`;
  const board=document.getElementById('board'),tick=document.getElementById('tick');
  function drawBoard(){
    board.innerHTML=games.map(g=>{
      const ph=posOf(g.h),pa=posOf(g.a),any=TABLE[CLUB].p>0;
      return `<div class="res ${g.mine?'mine':''}">
        <span>${any?`<span style="color:var(--mute);font-family:var(--mono);font-size:11px">${ph}</span> `:""}${g.h}
          v ${g.a}${any?` <span style="color:var(--mute);font-family:var(--mono);font-size:11px">${pa}</span>`:""}</span>
        <span class="sc">${g.ch}–${g.ca}</span></div>`}).join('');
  }
  drawBoard();
  let i=0,stopped=false;
  const add=(m,t,cls)=>{const d=document.createElement('div');d.className='ln'+(cls?' '+cls:'');
    d.innerHTML=`<span class="min">${m}</span><span class="tx">${t}</span>`;tick.appendChild(d)};
  function finishAll(){
    if(stopped)return;stopped=true;
    games.forEach(g=>{g.ch=g.hg;g.ca=g.ag});drawBoard();
    add("FT","All full time","ft");
    let myFx=null,myRes=null;
    games.forEach(g=>{
      award(TABLE,g.h,g.a,g.hg,g.ag);
      if(g.mine){const home=g.h===CLUB;const r=resolveMine(g.hg,g.ag,home);myFx=r.fx;myRes=r.res}
    });
    S.mw++;const d=apply(myFx,true);myPos();
    setTimeout(()=>{
      const el=document.createElement('div');el.className='card';
      const mid=S.mw===5,run=S.mw===8;
      el.innerHTML=`<div class="outcome">${myRes==='w'?"A win. The place feels like a football club again.":myRes==='d'?"A point. Not nothing.":"Beaten. The phone-in will be unpleasant."}</div>
        <div class="delta">${d}</div>
        ${mid?`<p class="lede" style="margin-top:10px">Halfway. ${ord(S.pos)} of six.</p>`:''}
        ${run?`<p class="lede" style="margin-top:10px">Three left. Whatever you are going to do, do it now.</p>`:''}
        <div style="margin-top:10px">${tableHTML()}</div>
        <button class="choice primary" id="mn" style="margin-top:10px"><span class="t">Continue</span></button>`;
      document.getElementById('app').appendChild(el);paintHeader();
      document.getElementById('mn').onclick=next;
    },650);
  }
  function stepEv(){
    if(stopped)return;
    if(i>=all.length)return setTimeout(finishAll,700);
    const e=all[i++],g=games[e.gi];
    if(e.team===g.h)g.ch++;else g.ca++;
    drawBoard();
    const mineGoal=g.mine&&e.team===CLUB;
    const againstMe=g.mine&&e.team!==CLUB;
    add(e.m+"'",`${g.h} ${g.ch}–${g.ca} ${g.a}   ${e.who}`,mineGoal?'goal':againstMe?'against':'');
    setTimeout(stepEv,760+Math.random()*300);
  }
  document.getElementById('skipB').onclick=()=>{if(!stopped){tick.innerHTML='';add("","(skipped)","");finishAll()}};
  setTimeout(stepEv,700);
}
function renderRoundup(){
  const wk=S.mw,[h,a]=myFixture(wk),home=h===CLUB;
  const[hg,ag]=playFixture(h,a);
  award(TABLE,h,a,hg,ag);const others=playOthers(wk);
  const{fx}=resolveMine(hg,ag,home);S.mw++;
  const d=apply(fx,true);myPos();paintHeader();
  const mid=S.mw===5,run=S.mw===8;
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">MATCHWEEK ${S.mw} OF ${MW} · RESULTS</div>
    <h1>${mid?"Halfway":run?"The run-in begins":"Saturday's results"}</h1>
    ${mid?`<p class="lede">Five played, five to go. ${ord(S.pos)} of six.</p>`:''}
    ${run?`<p class="lede">Three matches left. Whatever you are going to do, do it now.</p>`:''}
    <div class="res mine"><span>${h} v ${a}</span><span class="sc">${hg}–${ag}</span></div>
    ${others.map(o=>`<div class="res"><span>${o.h} v ${o.a}</span><span class="sc">${o.hg}–${o.ag}</span></div>`).join('')}
    <div class="delta" style="margin-bottom:10px">${d}</div>${tableHTML()}
    <button class="choice primary" id="nx" style="margin-top:11px"><span class="t">Continue</span></button></div>`;
  document.getElementById('nx').onclick=next;
}
function renderMatch(done){
  const wk=S.mw,[hT,aT]=myFixture(wk),home=hT===CLUB,opp=home?aT:hT;
  const oFm=oppFormation(opp);S.nextOppFm=oFm;
  S.matchBoost=0;S.matchAtt=0;S.matchDef=0;S.subsUsed=0;
  paintHeader();
  const fmLine=(mine)=>`<span style="font-family:var(--mono);font-size:11px;color:var(--mute)">${mine?S.formation:oFm}</span>`;
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">MATCHWEEK ${wk+1} OF ${MW} · SATURDAY, 3PM</div>
    <h1>${home?`${opp}, at ${STADIUM}`:`Away at ${opp}`}</h1>
    ${opponentPanel(opp,home)}
    <div class="vp"><div class="teams">
      <span>${hT.toUpperCase()}<br>${fmLine(home)}</span>
      <span style="text-align:right">${aT.toUpperCase()}<br>${fmLine(!home)}</span></div><div id="vpl"></div></div>
    <div id="htBox"></div></div>`;
  const lines=document.getElementById('vpl');let h=0,a=0;
  const add=(m,t,cls,sc2)=>{const d=document.createElement('div');d.className='ln'+(cls?' '+cls:'');
    d.innerHTML=`<span class="min">${m}</span><span class="tx">${t}</span>${sc2?`<span class="sc">${sc2}</span>`:''}`;lines.appendChild(d)};
  const sc=()=>`${h}–${a}`;
  function half(from,to,cb){
    const[mr,tr]=clubRates(opp,home,.62,oFm);
    const mg=Math.min(3,pois(mr)),tg=Math.min(3,pois(tr)),ev=[];
    const mins=n=>{const r=[];for(let i=0;i<n;i++)r.push(rnd(from,to));return r.sort((x,y)=>x-y)};
    for(const m of mins(mg))ev.push({m,mine:1,p:pickScorer()});
    for(const m of mins(tg))ev.push({m,mine:0});
    if(rng()<.4)ev.push({m:rnd(from,to),card:1});
    ev.sort((x,y)=>x.m-y.m);let i=0;
    (function go(){if(i>=ev.length)return setTimeout(cb,460);const e=ev[i++];
      if(e.card)add(e.m+"'","Yellow card","");
      else if(e.mine){home?h++:a++;if(e.p)e.p.goals=(e.p.goals||0)+1;
        add(e.m+"'",(e.p?e.p.nm:"TRIALIST").toUpperCase(),"goal",sc())}
      else{home?a++:h++;add(e.m+"'",opp.toUpperCase()+" GOAL","against",sc())}
      setTimeout(go,780+Math.random()*260)})();
  }
  half(4,45,()=>{
    add("HT","Half time","ft",sc());
    const mg=home?h:a,tg=home?a:h;
    if(ROLE.id==="manager")return tacticalHalfTime(mg,tg,oFm,()=>{add("46'","— second half —","");half(46,92,finish)});
    const losing=mg<tg,level=mg===tg;
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
    award(TABLE,hT,aT,h,a);
    const others=[];
    FIXTURES[wk].forEach(([x,y])=>{if(x===CLUB||y===CLUB)return;const[xg,yg]=simScore(strOf(x),strOf(y));award(TABLE,x,y,xg,yg);others.push({h:x,a:y,hg:xg,ag:yg})});
    const{fx,res}=resolveMine(h,a,home);S.mw++;const d=apply(fx,true);myPos();
    S.matchAtt=0;S.matchDef=0;
    setTimeout(()=>{const el=document.createElement('div');el.className='card';
      el.innerHTML=`<div class="outcome">${res==='w'?"A win. The place feels like a football club again.":res==='d'?"A point. Not nothing.":"Beaten. The phone-in will be unpleasant."}</div>
        <div class="delta">${d}</div>
        <div style="font-size:12px;color:var(--mute);margin:10px 0 6px">Elsewhere</div>
        ${others.map(o=>`<div class="res"><span>${o.h} v ${o.a}</span><span class="sc">${o.hg}–${o.ag}</span></div>`).join('')}
        <div style="margin-top:10px">${tableHTML()}</div>
        <button class="choice primary" id="mn" style="margin-top:10px"><span class="t">Continue</span></button>`;
      document.getElementById('app').appendChild(el);paintHeader();
      document.getElementById('mn').onclick=done},600);
  }
}
/* Who scores. A player on a goal bonus shoots more, so he is likelier to be
   the name on the vidiprinter -- the bonus has a visible consequence. */
function pickScorer(){
  const pool=available().filter(p=>p.pos!=="GK");
  if(!pool.length)return null;
  const w=pool.map(p=>{let x=p.pos==="FW"?3:p.pos==="MF"?2:1;
    if(S.bonuses.some(b=>b.type==="goals"&&b.nm===p.nm))x*=2.2;return x});
  let r=rng()*w.reduce((a,b)=>a+b,0);
  for(let i=0;i<pool.length;i++){r-=w[i];if(r<=0)return pool[i]}
  return pool[pool.length-1];
}
/* THE MANAGER'S HALF TIME: a real tactical panel, not a tone of voice.
   Pick a shape, make substitutions, push someone out of position, then
   send them back out. Every option states what it does to attack and
   defence, because that is the trade being made. */
function tacticalHalfTime(mg,tg,oFm,resume){
  const box=document.getElementById('htBox');
  let fm=S.formation,subs=[],oop=null;
  const tired=available().filter(p=>p.fit<72).sort((a,b)=>a.fit-b.fit).slice(0,3);
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
