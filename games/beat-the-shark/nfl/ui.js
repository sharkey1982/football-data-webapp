/* ===========================================================================
   nfl/ui.js — screen flow: start, the division, your team, each game
   (report, preview, live drives, decisions, results), the week's events,
   the ending. Loaded last: its final line starts the game.
   =========================================================================== */

/* ---- the season plan ------------------------------------------------------
   "game" is a whole game day (summary, injury report, preview, the game,
   results); the beats between are the week's decisions. The final boss is
   always the last game, with the trade deadline straight before it. */
function planFor(level,role){
  const n=LEVELS[level].games,between=role==="coach"
    ?(n===5?["presser","event","event"]:["event","presser","event","event","presser","event","event","event"])
    :(n===5?["gm","gm","gm"]:["gm","gm","gm","gm","gm","gm","gm","gm"]);
  const p=role==="gm"?["gm"]:[];
  for(let i=0;i<n;i++){p.push("game");if(i<n-2)p.push(between[i%between.length]);if(i===n-2)p.push("deadline")}
  p.push("end");return p;
}
let PLAN=[],cursor=0,RECENT=[];
function next(){cursor++;step()}
function step(){
  const b=PLAN[cursor];
  if(!b||b==="end")return renderEnding();
  if(b==="game")return gameDay(next);
  if(b==="presser")return renderSpec(presserSpec(),"FRIDAY · PRESS CONFERENCE",next);
  if(b==="event")return renderSpec(drawEvent(COACH_EVENTS),"THIS WEEK",next);
  if(b==="gm")return renderSpec(drawEvent(GM_EVENTS),"THE FRONT OFFICE",next);
  if(b==="deadline")return renderSpec(deadlineSpec(),"BEFORE THE FINAL GAME",next);
  return next();
}
function drawEvent(pool){
  let c=null;for(let t=0;t<9;t++){c=pick(pool)();if(!RECENT.includes(c.sig))break}
  RECENT.push(c.sig);if(RECENT.length>4)RECENT.shift();return c;
}

/* ---- the header -------------------------------------------------------------- */
function paintHeader(){
  if(!S)return;
  const played=S.table[CLUB].w+S.table[CLUB].l+S.table[CLUB].t,r=S.table[CLUB];
  $("hScore").innerHTML=`${played?ord(posOf(CLUB)):"—"}<span class="sub">POSITION</span>`;
  const diff=myWins()-sharkPar();
  $("hTwo").innerHTML=`<div class="two"><div class="k">Record</div><div class="v" style="font-size:22px">${r.w}–${r.l}${r.t?"–"+r.t:""}</div></div>
    <div class="two"><div class="k">v the Shark</div><div class="v" style="font-size:22px;color:${!played?"inherit":diff>=0?"#7ee2a8":"#ffb3ab"}">${played?(diff>=0?"+":"−")+Math.abs(diff).toFixed(1):"—"}</div>
    <div class="pts">wins ahead of its par</div></div>
    ${S.role==="gm"?`<div class="two"><div class="k">Cap space</div><div class="v" style="font-size:22px">$${S.cap}m</div></div>`:""}`;
  const left=S.games-S.wk;
  $("hSeason").innerHTML=`<div class="lbl"><span>GAME ${Math.min(S.wk+1,S.games)} / ${S.games} · ${left===0?"SEASON OVER":left===1?"THE FINAL GAME":`${left} TO PLAY`}</span>
    <span>${r.res.length?"FORM "+r.res.slice(-5).map(x=>x.r.toUpperCase()).join(" "):""}</span></div>
    <div class="track"><i style="width:${(S.wk/S.games)*100}%"></i></div>`;
}
function screen(html){paintHeader();$("app").innerHTML=html;if(typeof window!=="undefined"&&window.scrollTo)window.scrollTo(0,0)}
function tagsHTML(tags){return tags.map(([up,t])=>`<span class="tag ${up?"up":"down"}">${t}</span>`).join("")}

/* ---- a decision card (events) ------------------------------------------------- */
function renderSpec(spec,chip,done){
  screen(`<div class="card"><div class="datechip">${chip}</div><h1>${spec.title}</h1>
    <p class="lede">${spec.lede}</p>${spec.body||""}<div id="ch"></div></div>`);
  const box=$("ch");
  spec.choices.forEach((c,i)=>{const b=document.createElement("button");b.className="choice";
    const ok=affordable(c);b.disabled=!ok;
    b.innerHTML=`<span class="t">${c.t}</span><span class="d">${c.d}${ok?"":" · not enough cap space"}</span>`;
    b.onclick=()=>{const tags=apply(c.fx);if(c.after)c.after();
      screen(`<div class="card"><div class="datechip">${chip}</div><h1>${spec.title}</h1>
        <div class="outcome">${c.out}</div><div class="delta">${tagsHTML(tags)}</div>
        ${button("go","Continue","",true)}</div>`);$("go").onclick=done};
    box.appendChild(b)});
}

/* ---- start ------------------------------------------------------------------------- */
let pickLevel="beginner",pickRole="coach";
function renderStart(){
  $("hScore").innerHTML=`—<span class="sub">POSITION</span>`;$("hTwo").innerHTML="";$("hSeason").innerHTML="";
  $("app").innerHTML=`<div class="card hero">
    <div class="hero-kicker">BEAT THE SHARK · NFL</div>
    <div class="mission">Win the division</div>
    <p class="lede" style="margin-top:8px">FixtureShark's model predicts how many games Your Team wins. Win more.</p>
    <div class="datechip" style="margin:14px 0 6px">LEVEL</div>
    <div id="lv"></div>
    <div class="datechip" style="margin:12px 0 6px">YOU ARE</div>
    <div id="rl"></div>
    ${button("start","Start the season","",true)}
    <div class="seed">Other games: <a href="../" style="color:var(--pitch2)">Football</a></div></div>`;
  const paint=()=>{
    $("lv").innerHTML=Object.entries(LEVELS).map(([k,l])=>`<button class="choice" data-lv="${k}" style="${k===pickLevel?"border-color:var(--amber)":""}"><span class="t">${l.name}</span><span class="d">${l.games} games</span></button>`).join("");
    $("rl").innerHTML=[["coach","Head Coach","Game plans, fourth downs, half time"],["gm","General Manager","Contracts, trades, the cap"]]
      .map(([k,t,d])=>`<button class="choice" data-rl="${k}" style="${k===pickRole?"border-color:var(--amber)":""}"><span class="t">${t}</span><span class="d">${d}</span></button>`).join("");
    document.querySelectorAll("[data-lv]").forEach(b=>b.onclick=()=>{pickLevel=b.dataset.lv;paint()});
    document.querySelectorAll("[data-rl]").forEach(b=>b.onclick=()=>{pickRole=b.dataset.rl;paint()});
  };
  paint();
  $("start").onclick=()=>{$("app").innerHTML=`<div class="card"><p class="lede">The Shark is simulating your season…</p></div>`;
    setTimeout(()=>{beginSeason(pickLevel,pickRole);renderDivision()},30)};
}
function beginSeason(level,role,seed){
  newSeason(level,role,seed);PLAN=planFor(level,role);cursor=0;RECENT=[];
  $("foot").innerHTML=`Season ${SEED}`;
}

/* ---- the division, as the Shark sees it ------------------------------------------ */
function renderDivision(){
  const rows=teamNames().slice().sort((a,b)=>S.shark.wins[b]-S.shark.wins[a]);
  screen(`<div class="card"><div class="datechip">THE DIVISION · ${S.games} GAMES</div><h1>The Shark's prediction</h1>
    <table class="tbl"><tr><th>#</th><th>Team</th><th class="n">Wins</th><th class="n">Title</th></tr>
    ${rows.map((n,i)=>{const t=rival(n);return`<tr class="${n===CLUB?"me":""}"><td>${i+1}</td><td>${n}${n===CLUB?'<span class="you">YOU</span>':""}
      <br><small style="color:var(--mute)">${t?t.d:"you decide"}</small></td><td class="n">${S.shark.wins[n].toFixed(1)}</td><td class="n">${pct(S.shark.title[n])}</td></tr>`}).join("")}</table>
    ${button("go","Your team","",true)}</div>`);
  $("go").onclick=renderYourTeam;
}
function unitBars(u){
  const row=(k,v)=>`<div class="brk"><span class="bk">${k}</span><span class="bb"><i style="width:${clamp((v-30)/45*100)}%"></i></span><span class="bv">${Math.round(v)}</span></div>`;
  return row("Run offence",u.runO)+row("Pass offence",u.passO)+row("Run defence",u.runD)+row("Pass defence",u.passD);
}
function rosterHTML(){
  const grp=(t,list)=>`<div class="benchh">${t}</div><div class="sq">${list.map(pos=>{const p=player(pos);
    return`<div class="pl${p.out?" gone":""}"><span class="pos">${POS_SHORT[pos]}</span><span class="nm">${p.nm}<small>${p.label}${p.out?` · out ${p.out} game${p.out>1?"s":""}`:""}</small></span>
    <span class="stat"><span class="lb">Rating</span><span class="vv">${Math.round(p.r)}</span></span></div>`}).join("")}</div>`;
  return grp("Offence",["QB","RB","WR1","WR2","TE","OL"])+grp("Defence",["EDGE","DT","LB","CB1","CB2","S"])+grp("Special teams and backups",["K","QB2","RB2"]);
}
function renderYourTeam(){
  const u=myUnits(),place=Math.round(S.shark.pos[CLUB]);
  screen(`<div class="card"><div class="datechip">YOUR TEAM</div><h1>${S.shark.wins[CLUB].toFixed(1)} wins, ${ord(place)}</h1>
    <p class="lede">The Shark's prediction for a well-run Your Team.</p>
    ${unitBars(u)}${rosterHTML()}
    ${button("go",S.role==="gm"?"To the front office":"First game","",true)}</div>`);
  $("go").onclick=step;
}

/* ---- game day -------------------------------------------------------------------- */
function gameDay(done){
  const opp=oppOf(S.wk),[h]=myFixture(S.wk),home=h===CLUB;
  const toPreview=()=>renderPreview(opp,home,done);
  /* A questionable starter: your call once the injury report is unlocked;
     until then (and for the GM) the staff rest him, the competent default. */
  const toReport=()=>{const p=injuryReport();if(!p)return toPreview();
    if(unlocked("report"))return renderReport(p,opp,home,toPreview);
    p.benched=true;return toPreview()};
  if(S.wk>0)return renderSummary(toReport);
  toReport();
}
function renderSummary(then){
  const r=S.table[CLUB],diff=myWins()-sharkPar();
  const out=hurtList();
  screen(`<div class="card"><div class="datechip">GAME ${S.wk+1} OF ${S.games}</div>
    <h1>${ord(posOf(CLUB))}, ${r.w}–${r.l}${r.t?"–"+r.t:""}</h1>
    <div class="kpis"><div class="kpi"><div class="kl">Wins</div><div class="kb">${myWins()}</div></div>
      <div class="kpi"><div class="kl">Shark par</div><div class="kb">${sharkPar().toFixed(1)}</div></div>
      <div class="kpi"><div class="kl">Points for</div><div class="kb">${r.pf}</div></div>
      <div class="kpi"><div class="kl">Points against</div><div class="kb">${r.pa}</div></div></div>
    <p>${diff>=0?`${diff.toFixed(1)} wins ahead of the Shark.`:`${(-diff).toFixed(1)} wins behind the Shark.`}</p>
    ${out.length?`<p class="small">Out: ${out.map(p=>`${p.nm} (${POS_SHORT[p.pos]})`).join(", ")}</p>`:""}
    ${button("go","On to the game","",true)}</div>`);
  $("go").onclick=then;
}
function renderReport(p,opp,home,then){
  const w=reportWins(p,opp,home);
  screen(`<div class="card"><div class="datechip">THE INJURY REPORT</div><h1>${p.nm} is questionable</h1>
    <p class="lede">${p.label}. He can play, at about 85%, and the injury could get worse.</p>
    <div id="ch"></div></div>`);
  const opts=[{t:`Start ${p.nm}`,d:`Win chance ${pct(w.play)} · about 1 in 3 he misses the next two games`,go:()=>{p.hurt=true;p.playedHurt=true}},
    {t:`Rest him`,d:`Win chance ${pct(w.rest)} · fit for the next game`,go:()=>{p.benched=true}}];
  opts.forEach((o,i)=>{const b=document.createElement("button");b.className="choice";b.innerHTML=`<span class="t">${o.t}</span><span class="d">${o.d}</span>`;
    b.onclick=()=>{o.go();then()};$("ch").appendChild(b)});
}
function bandsHTML(b){
  const row=(k,v)=>`<div class="brk"><span class="bk">${k}</span><span class="bb"><i style="width:${v*100}%"></i></span><span class="bv">${pct(v)}</span></div>`;
  return row("Win by 8+",b.big)+row("Win by 1–7",b.close)+row("Lose by 0–7",b.closeL)+row("Lose by 8+",b.bigL);
}
function lineText(pv){return pv.spread===0?"Pick 'em":`${CLUB} ${pv.spread>0?"−":"+"}${Math.abs(pv.spread)}`}
function renderPreview(opp,home,done){
  const t=rival(opp),them=rivalUnits(opp),final=S.wk===S.games-1;
  const venue=S.neutral?`v ${opp}`:home?`${opp}, at home`:`Away at ${opp}`;
  const canPlan=unlocked("plan");
  if(S.role==="gm")S.plan=bestPlan(opp,home);
  else if(!canPlan)S.plan="balanced";
  const pvs={};for(const k of Object.keys(PLANS))pvs[k]=preview(opp,home,k);
  const paint=()=>{
    const pv=pvs[S.plan];
    screen(`<div class="card"><div class="datechip">GAME ${S.wk+1} OF ${S.games}${final?" · THE FINAL BOSS":""}</div>
      <h1>${venue}</h1>
      <p class="small" style="margin-top:-4px">${t.d}. ${styleWord(t.style)} offence · <b>${weakWord(t.weak)}</b></p>
      <div class="market"><div class="top"><span class="nm">The line: ${lineText(pv)}</span><span class="fee">Win ${pct(pv.win)}</span></div>
        <div class="meta">How it might finish</div>${bandsHTML(pv.bands)}</div>
      ${S.role==="coach"&&canPlan?`<div class="datechip" style="margin:10px 0 6px">YOUR GAME PLAN</div>
        ${Object.entries(PLANS).map(([k,p])=>`<button class="choice" data-plan="${k}" style="${k===S.plan?"border-color:var(--amber);background:color-mix(in srgb,var(--amber) 10%,var(--panel2))":""}">
          <span class="t">${p.name}</span><span class="d">Win ${pct(pvs[k].win)} · line ${lineText(pvs[k])}</span></button>`).join("")}`
        :`<p class="small">Game plan: ${PLANS[S.plan].name}${S.role==="gm"?" (your coach's call)":""}.</p>`}
      <div class="datechip" style="margin:10px 0 6px">THE MATCH-UP</div>
      <table class="tbl"><tr><th></th><th class="n">You</th><th class="n">Them</th></tr>
        ${[["Run offence","runO"],["Pass offence","passO"],["Run defence","runD"],["Pass defence","passD"]].map(([l,k])=>`<tr><td>${l}</td><td class="n">${Math.round(myUnits()[k])}</td><td class="n">${Math.round(them[k])}</td></tr>`).join("")}</table>
      ${button("ko","Kick off","",true)}</div>`);
    document.querySelectorAll("[data-plan]").forEach(b=>b.onclick=()=>{S.plan=b.dataset.plan;paint()});
    $("ko").onclick=()=>{S.calls.plan.push({opp,plan:S.plan,weak:t.weak,best:Object.keys(pvs).reduce((a,b)=>pvs[b].win>pvs[a].win?b:a)});renderGame(done)};
  };
  paint();
}

/* ---- the live game ------------------------------------------------------------- */
/* The words only: drawn from their own seeded stream, so the commentary
   never changes what happens next, and a replayed season reads the same. */
function scorerLine(g,ev){return sandbox(()=>scorerText(g,ev),SEED+"|ln|"+S.wk+"|"+g.half+"|"+g.i+"|"+ev.type)}
function scorerText(g,ev){
  const mine=sideTeam(g,ev.side)===CLUB,run=rng()<g.run[ev.side];
  const nm=pos=>player(pos)&&!player(pos).out?player(pos).nm:"a backup";
  if(ev.type==="td"){
    if(!mine)return`${sideTeam(g,ev.side).toUpperCase()} TOUCHDOWN`;
    const yds=run?rnd(1,12):rnd(6,48),who=run?`${nm("RB")}, ${yds}-yard run`:`${nm("QB")} to ${nm(pick(["WR1","WR1","WR2","TE"]))}, ${yds} yards`;
    return`TOUCHDOWN · ${who}${ev.converted?" (after going for it)":""}`;
  }
  if(ev.type==="fg")return mine?`Field goal · ${nm("K")}${ev.dist?`, ${ev.dist} yards`:""}`:`${sideTeam(g,ev.side)} field goal`;
  if(ev.type==="fgmiss")return mine?`Field goal missed, ${ev.dist} yards`:`${sideTeam(g,ev.side)} miss a field goal`;
  if(ev.type==="to")return mine?(run?"Fumble, recovered by them":"Interception"):`${sideTeam(g,ev.side)} turn it over`;
  if(ev.type==="stopped")return mine?"Stopped on fourth down":`${sideTeam(g,ev.side)} stopped on fourth down`;
  return mine?"Punt":`${sideTeam(g,ev.side)} punt`;
}
function renderGame(done){
  const g=startMyGame(),opp=g.mine==="h"?g.a:g.h;g.live=true;
  screen(`<div class="card"><div class="datechip">GAME ${S.wk+1} OF ${S.games} · ${PLANS[S.plan].name.toUpperCase()}</div>
    <h1>${S.neutral?`v ${opp}`:g.mine==="h"?`${opp}, at home`:`Away at ${opp}`}</h1>
    <div class="vp"><div class="teams"><span>${CLUB.toUpperCase()}</span><span id="sb" style="font-size:18px">0–0</span><span style="text-align:right">${opp.toUpperCase()}</span></div>
      <div id="vpl"></div></div>
    <div id="paceBox">${paceControlsHTML("Skip to the end")}</div><div id="htBox"></div></div>`);
  const lines=$("vpl");let skipping=false;
  const my=()=>g.mine==="h"?g.hs:g.as,th=()=>g.mine==="h"?g.as:g.hs;
  const add=(clock,text,cls)=>{const d=document.createElement("div");d.className="ln"+(cls?" "+cls:"");
    d.innerHTML=`<span class="min" style="width:66px">${clock||""}</span><span class="tx">${text}</span><span class="sc">${my()}–${th()}</span>`;
    lines.appendChild(d);$("sb").textContent=`${my()}–${th()}`};
  wirePaceControls($("paceBox"),()=>{skipping=true});
  const delay=()=>skipping?0:PACE.commentaryMs*speedFactor()*(0.9+Math.random()*0.2);
  const decide=(chip,title,opts,onPick)=>{skipping=false;
    $("htBox").innerHTML=`<div style="margin-top:12px"><div class="datechip">${chip}</div><h2 style="margin-top:5px">${title}</h2><div id="dc"></div></div>`;
    opts.forEach(o=>{const b=document.createElement("button");b.className="choice";
      b.innerHTML=`<span class="t">${o.t}</span><span class="d">${o.d}${o.win!=null?` · win chance <b>${pct(o.win)}</b>`:""}</span>`;
      b.onclick=()=>{$("htBox").innerHTML=`<div class="outcome" style="margin-top:10px">${o.t}.</div>`;onPick(o.id)};$("dc").appendChild(b)});
  };
  function tick(){
    const ev=nextDrive(g);
    if(!ev)return;
    if(ev.type==="end")return finish();
    if(ev.type==="ot"){add("OT","Level after four quarters: overtime, next score wins","ft");return setTimeout(tick,delay())}
    if(ev.type==="half"){
      add("HT","Half time","ft");
      if(S.role==="coach"&&unlocked("half"))return decide("HALF TIME",th()>my()?`Behind by ${th()-my()}.`:my()>th()?`Ahead by ${my()-th()}.`:"Level at the break.",
        halfWins(g),id=>{startSecondHalf(g,id);add("","— second half —","");setTimeout(tick,delay())});
      startSecondHalf(g,S.role==="gm"?bestHalf(g):"steady");add("","— second half —","");return setTimeout(tick,delay());
    }
    if(ev.type==="fourth"){
      const s=ev.sit,where=s.yl<50?`their ${s.yl}`:s.yl===50?"midfield":`your ${100-s.yl}`;
      add(ev.clock,`Fourth and ${s.togo} at ${where}`,"");
      if(S.role==="gm"){const opts=fourthWins(g);const best=opts.reduce((a,b)=>b.win>a.win?b:a);const r=resolveFourth(g,best.id);add(r.clock,scorerLine(g,r),cls(r));return setTimeout(tick,delay())}
      return decide("FOURTH DOWN",`Fourth and ${s.togo} at ${where}. ${my()}–${th()}.`,fourthWins(g),id=>{const r=resolveFourth(g,id);add(r.clock,scorerLine(g,r),cls(r));setTimeout(tick,delay())});
    }
    add(ev.clock,scorerLine(g,ev)+(ev.type==="td"&&!ev.pending&&ev.xp===false?" (extra point missed)":""),cls(ev));
    if(ev.pending){return decide("THE CONVERSION","Touchdown, and a point behind.",twoWins(g),id=>{const r=resolveTwo(g,id);
      add("",id==="go"?(r.ok?"Two-point conversion good":"Two-point conversion fails"):(r.ok?"Extra point good":"Extra point missed"),r.ok?"goal":"against");setTimeout(tick,delay())})}
    setTimeout(tick,delay());
  }
  const cls=ev=>{const mine=sideTeam(g,ev.side)===CLUB,scored=["td","fg"].includes(ev.type);return scored?(mine?"goal":"against"):""};
  function finish(){
    const m=my()-th();add("FT",m>0?"Full time: a win":m<0?"Full time: beaten":"Full time: a tie","ft");
    const injury=finishMyGame(g);
    const others=playOthers(S.wk);
    $("paceBox").innerHTML=button("toT","The division",`${CLUB} ${my()}–${th()} ${opp}`,true);
    $("toT").onclick=()=>renderAfter({g,opp,m,injury,others},done);
  }
  setTimeout(tick,delay());
}
function bestHalf(g){const o=halfWins(g);return o.reduce((a,b)=>b.win>a.win?b:a).id}
function renderAfter(info,done){
  const{m,opp,injury,others,g}=info,final=S.wk===S.games-1;
  endWeek(others);
  screen(`<div class="card"><div class="datechip">GAME ${S.wk} OF ${S.games} · THE DIVISION</div>
    <h1>${m>0?"A win.":m<0?"Beaten.":"A tie."}</h1>
    <div class="res mine"><span><b>${CLUB}</b> ${g.mine==="h"?g.hs:g.as}–${g.mine==="h"?g.as:g.hs} ${opp}</span></div>
    ${others.map(r=>`<div class="res"><span>${r.h} ${r.hs}–${r.as} ${r.a}</span></div>`).join("")}
    ${injury?`<div class="outcome" style="border-left-color:var(--bad)">${injury.nm} (${POS_SHORT[injury.pos]}) is hurt: out for ${injury.out} game${injury.out>1?"s":""}.</div>`:""}
    ${tableHTML()}
    ${button("go",final?"The verdict":"Continue","",true)}</div>`);
  $("go").onclick=done;
}
function tableHTML(){
  const st=standings(S.table);
  return`<table class="tbl" style="margin-top:8px"><tr><th>#</th><th>Team</th><th class="n">W</th><th class="n">L</th><th class="n">T</th><th class="n">Diff</th></tr>
    ${st.map((r,i)=>`<tr class="${r.n===CLUB?"me":""}"><td>${i+1}</td><td>${r.n}${r.n===CLUB?'<span class="you">YOU</span>':""}</td>
      <td class="n">${r.w}</td><td class="n">${r.l}</td><td class="n">${r.t}</td><td class="n">${r.diff>0?"+":""}${r.diff}</td></tr>`).join("")}</table>`;
}

/* ---- the ending ------------------------------------------------------------------ */
function lessonsHTML(){
  const f=S.calls.fourth,went=f.filter(c=>c.call==="go").length,plans=S.calls.plan;
  const matched=plans.filter(p=>p.plan===p.best).length;
  const out=[];
  if(S.role==="coach"&&plans.length)out.push(`Your game plan was the Shark's best plan in <b>${matched} of ${plans.length}</b> games.`);
  if(f.length)out.push(`Fourth downs: you went for it <b>${went} of ${f.length}</b> times. Analytics-led NFL teams go for it far more than coaches did twenty years ago, because the win chance says to.`);
  out.push(`Margins of 3 and 7 are the commonest in the NFL, and in this game: scores come in field goals and touchdowns. FixtureShark's margin chart on every game page is built on that.`);
  return out.map(x=>`<p class="small">${x}</p>`).join("");
}
function renderEnding(){
  S.wk=S.games;
  const sc=score(),exp=S.shark.wins[CLUB],w=myWins(),pos=posOf(CLUB),beat=w>exp;
  screen(`<div class="card hero"><div class="hero-kicker">THE VERDICT</div>
    <div class="verdict ${beat?"ok":"fail"}">${pos===1?"Division champions!":beat?"You beat the Shark.":"The Shark wins."}</div>
    <div class="bigstats"><div><div class="bigstat">${sc}</div><div class="biglabel">Score</div></div>
      <div><div class="bigstat">${w}</div><div class="biglabel">Wins · Shark ${exp.toFixed(1)}</div></div></div>
    <p>${ord(pos)} in the division. The Shark predicted ${ord(Math.round(S.shark.pos[CLUB]))}.</p></div>
    <div class="card"><h2>The table</h2>${tableHTML()}</div>
    <div class="card"><h2>What it shows</h2>${lessonsHTML()}
      <div class="tip"><b>The real thing</b>
        <a href="${SITE}/nfl/fixtures">Fixtures & Results</a>: FixtureShark's Elo model beside the betting line ·
        <a href="${SITE}/nfl/table">League Table</a> · <a href="${SITE}/nfl/snap-outlook">Snap Outlook</a>: who plays, and how much</div>
      ${button("again","Play again","New season",true)}${button("same","Replay this season",`Season ${SEED}`)}</div>`);
  $("again").onclick=renderStart;
  $("same").onclick=()=>{const seed=SEED;$("app").innerHTML=`<div class="card"><p class="lede">The Shark is simulating your season…</p></div>`;
    setTimeout(()=>{beginSeason(S.level,S.role,seed);renderDivision()},30)};
}

renderStart();
