/* ===========================================================================
   world-cup/ui.js — screens: start, your nation, picking the squad, the
   base camp, each match (bills, team sheet, live, half time, extra time,
   penalties, results), the money, the ending. Last line starts the game.
   =========================================================================== */

let CUR=null; // what's next: "squad" | "camp" | "match" | "event" | "end"
let EVENT_I=0;

/* ---- the header: stage, cash and record ------------------------------------- */
function stageShort(){if(!S.t)return"—";if(S.t.champion||S.t.exit)return"END";if(S.t.stage==="group")return"GRP";
  return{32:"R32",16:"R16",8:"QF",4:"SF",2:"F"}[S.t.ko.length*2]||"KO"}
function paintHeader(){
  if(!S)return;
  $("hScore").innerHTML=`${stageShort()}<span class="sub">STAGE</span>`;
  if(S._cashSeen==null)S._cashSeen=S.cash;
  if(S.cash!==S._cashSeen){S._cashDelta=S.cash-S._cashSeen;S._cashSeen=S.cash}
  const dl=S._cashDelta||0,r=S.record;
  $("hTwo").innerHTML=`<div class="two cash"><div class="k">Cash</div>
      <div class="v cashv${S.cash<0?" neg":""}">${money(S.cash)}</div>
      ${dl?`<div class="cashd ${dl>0?"up":"down"}">${dl>0?"▲ ":"▼ "}${money(dl,true)}</div>`:""}
      ${S.cash<0?`<div class="pts">in the red: a player will be sent home</div>`:""}</div>
    <div class="two"><div class="k">${S.me}</div><div class="v" style="font-size:20px">W${r.w} D${r.d} L${r.l}</div></div>`;
  const total=S.level==="beginner"?5:8;
  $("hSeason").innerHTML=`<div class="lbl"><span>MATCH ${Math.min(S.played+1,total)} OF UP TO ${total}</span><span></span></div>
    <div class="track"><i style="width:${Math.min(1,S.played/total)*100}%"></i></div>`;
}
function screen(html){paintHeader();$("app").innerHTML=html;if(typeof window!=="undefined"&&window.scrollTo)window.scrollTo(0,0)}
function tagsHTML(tags){return tags.map(([up,t])=>`<span class="tag ${up?"up":"down"}">${t}</span>`).join("")}
const slug=n=>n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

/* ---- a decision card (between matches), as the NFL game's ------------------ */
function renderSpec(spec,chip,done){
  screen(`<div class="card"><div class="datechip">${chip}</div><h1>${spec.title}</h1>
    <p class="lede">${spec.lede}</p><div id="ch"></div></div>`);
  spec.choices.forEach(c=>{const b=document.createElement("button");b.className="choice";
    b.innerHTML=`<span class="t">${c.t}</span><span class="d">${c.d}</span>`;
    b.onclick=()=>{const tags=apply(c.fx);
      screen(`<div class="card"><div class="datechip">${chip}</div><h1>${spec.title}</h1>
        <div class="outcome">${c.out}</div><div class="delta">${tagsHTML(tags)}</div>${button("go","Continue","",true)}</div>`);$("go").onclick=done};
    $("ch").appendChild(b)});
}

/* ---- start ------------------------------------------------------------------- */
let pickLevel="beginner",pickNation=null;
function renderStart(){
  S=null;
  renderGamePicker("world-cup","../",renderNationPick);
}
/* Pick your nation (Chris, 7 Oct 2026): its real strength, FixtureShark's
   international Elo, is the difficulty. The best nation has the best chance. */
const NATION_TIERS=[
  {from:1,to:3,name:"Favourites",d:"The best chance of winning it"},
  {from:4,to:12,name:"Contenders",d:"A real chance, with the favourites in the way"},
  {from:13,to:30,name:"Dark horses",d:"It takes a well-run campaign"},
  {from:31,to:48,name:"Underdogs",d:"The hardest: a run to the semi-final is a success"}];
function tierOf(rank){return NATION_TIERS.find(t=>rank>=t.from&&rank<=t.to)||NATION_TIERS[3]}
function renderNationPick(){
  pickNation=null;
  $("hScore").innerHTML=`48<span class="sub">NATIONS</span>`;$("hTwo").innerHTML="";$("hSeason").innerHTML=`<div class="lbl"><span>THE WORLD CUP · PICK YOUR NATION</span><span></span></div>`;
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">THE WORLD CUP</div>
    <div class="mission">Pick your nation</div>
    <p class="lede" style="margin-top:8px">Every nation plays at its real strength (FixtureShark's international Elo), so your nation is the difficulty: the stronger it is, the better your chance.</p>
    ${button("surprise","Surprise me","A dark horse, drawn at random")}</div>
    <div class="card">${NATION_TIERS.map(t=>`<div class="benchh" style="margin-top:4px">${t.name.toUpperCase()} · ${t.d}</div>
      <div class="natgrid">${NATIONS.slice(t.from-1,t.to).map((x,i)=>`<button class="nat" data-nat="${x.n}" aria-pressed="false"><span class="nn">${x.n}${HOSTS.includes(x.n)?' <i title="Host: home advantage">H</i>':""}</span><span class="ne">${ord(t.from+i)} · Elo ${x.elo}</span></button>`).join("")}</div>`).join("")}
    <p class="small">H: a host nation, with home advantage in every match.</p>
    <div class="natgo"><button class="choice primary" id="natGo" disabled style="opacity:.5;text-align:center"><span class="t">Play</span><span class="d">Pick a nation above</span></button></div></div>`;
  natButtons().forEach(b=>b.onclick=()=>chooseNation(b.dataset.nat));
  $("natGo").onclick=()=>{if(pickNation)startAs(pickNation)};
  $("surprise").onclick=()=>startAs(null);
}
const natButtons=()=>Array.from(document.querySelectorAll?document.querySelectorAll("[data-nat]"):[]);
function chooseNation(n){pickNation=n;const g=$("natGo");g.disabled=false;if(g.style)g.style.opacity=1;
    const t=g.querySelector&&g.querySelector(".t");if(t)t.textContent="Play as "+n;
    const d=g.querySelector&&g.querySelector(".d");if(d)d.textContent=tierOf(rankOf(n)).name.replace(/s$/,"")+" · "+ord(rankOf(n))+" in the world";
  natButtons().forEach(b=>b.setAttribute("aria-pressed",b.dataset.nat===n));
}
function startAs(n){
  $("app").innerHTML=`<div class="card"><p class="lede">The Shark is simulating the tournament…</p></div>`;
  setTimeout(()=>{beginSeason(pickLevel,null,n);renderNation()},30);
  if(typeof btsTrack==="function")btsTrack("wc_nation",{nation:n||"surprise"});
}
function beginSeason(level,seed,nation){
  newSeason(level,seed,nation);CUR="squad";EVENT_I=0;
  const sq=sharkSquad();S.sharkSquad=sq; // sharkSquad() simulates, which restores S from a copy
  /* forecast() restores S from a copy, so assign after it returns */
  const fc=forecast(S.sharkSquad,typeof SHARK_RUNS==="number"?SHARK_RUNS:SHARK_RUNS_DEFAULT);S.shark=fc;
  $("foot").innerHTML=`Tournament ${SEED}`;
}
function predictionPhrase(fc){const s=likeliest(fc);return s==="Champions"?"to win it":s==="Final"?"to reach the final":s==="Group stage"?"to go out in the group":`to go out in the ${s.toLowerCase()}`}

/* ---- your nation and the draw -------------------------------------------------- */
function groupsHTML(){
  return S.field.groups.map((g,i)=>`<div class="benchh">Group ${String.fromCharCode(65+i)}</div>
    <table class="tbl"><tbody>${g.slice().sort((a,b)=>eloOf(b)-eloOf(a)).map(n=>`<tr class="${n===S.me?"me":""}"><td>${n}${n===S.me?'<span class="you">YOU</span>':""}</td><td class="n">${eloOf(n)}</td></tr>`).join("")}</tbody></table>`).join("");
}
function renderNation(){
  const g=myGroup(),big=S.level!=="beginner";
  screen(`<div class="card hero"><div class="hero-kicker">THE WORLD CUP</div>
    <div class="mission">You are ${S.me}</div>
    <p class="lede" style="margin-top:8px">Elo ${S.myElo}, ${ord(rankOf(S.me))} in the world. FixtureShark predicts ${S.me} ${predictionPhrase(S.shark)}.</p></div>
    <div class="card"><div class="datechip">${big?"YOUR GROUP":"THE DRAW"} · ELO</div>
    ${big?`<table class="tbl"><tbody>${g.slice().sort((a,b)=>eloOf(b)-eloOf(a)).map(n=>`<tr class="${n===S.me?"me":""}"><td>${n}${n===S.me?'<span class="you">YOU</span>':""}</td><td class="n">${eloOf(n)}</td></tr>`).join("")}</tbody></table>`:groupsHTML()}
    ${button("go","Pick your squad","",true)}</div>`);
  $("go").onclick=renderSquad;
}

/* ---- picking the squad: 7 from 10 --------------------------------------------------- */
function playerTag(p){return`<span class="pos">${p.pos}${p.pos2?"/"+p.pos2:""}</span>`}
function renderSquad(){
  const picked=new Set(S.squad.length?S.squad:[]);
  let fc=null;
  const paint=()=>{
    const ids=[...picked],ps=ids.map(player),n=ids.length,gk=ps.filter(p=>p.pos==="GK").length;
    const cover=["GK","DF","MF","FW"].map(pos=>`${pos} ${ps.filter(p=>p.pos===pos||p.pos2===pos).length}`).join(" · ");
    if(n===7&&gk>=1&&!fc)fc=forecast(ids,typeof SQUAD_RUNS==="number"?SQUAD_RUNS:250);
    const ready=n===7&&gk>=1;
    screen(`<div class="card"><div class="datechip">THE SQUAD · ${n} OF 7</div><h1>Pick seven</h1>
      <p class="small">${cover}${gk===0&&n?` · <b style="color:var(--bad)">no keeper</b>`:""}</p>
      <div class="sq" id="pl"></div>
      <div class="market" id="fcBox">${ready&&fc?`<div class="top"><span class="nm">With this squad</span></div>
        <div class="meta">Win it ${pct(fc.Champions)} · reach the semi-final ${pct(reachChance(fc,"Semi-final"))}${S.level!=="beginner"?` · reach the last 16 ${pct(reachChance(fc,"Round of 16"))}`:""}</div>`
        :`<div class="meta">Pick seven, with a keeper, to see the forecast.</div>`}</div>
      <button class="choice primary" id="nameSquad" ${ready?"":"disabled"} style="${ready?"":"opacity:.5"}"><span class="t">Name the squad</span></button></div>`);
    S.pool.slice(0,10).forEach(p=>{const b=document.createElement("button");b.className="pl";b.style.cssText="width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit"+(picked.has(p.id)?";outline:2px solid var(--amber);background:color-mix(in srgb,var(--amber) 14%,var(--panel2))":"");
      b.setAttribute("aria-pressed",picked.has(p.id));
      b.innerHTML=`${playerTag(p)}<span class="nm">${p.nm}<small>${POS_NAME[p.pos]}${p.tag?" · "+p.tag:""}</small></span><span class="stat"><span class="lb">Rating</span><span class="vv">${p.r}</span></span>`;
      b.onclick=()=>{if(picked.has(p.id))picked.delete(p.id);else if(picked.size<7)picked.add(p.id);fc=null;paint()};
      $("pl").appendChild(b)});
    $("nameSquad").onclick=()=>{if(!ready)return;S.squad=[...picked].sort((a,b)=>a-b);CUR="camp";step()};
  };
  paint();
}

/* ---- the flow ------------------------------------------------------------------- */
function step(){
  if(!S.alive||S.t.champion||S.t.exit)return renderEnding();
  if(CUR==="camp"){CUR="match";return renderSpec(baseCampSpec(),"BEFORE THE TOURNAMENT",step)}
  if(CUR==="event"){CUR="match";const spec=BETWEEN_EVENTS[EVENT_I++%BETWEEN_EVENTS.length]();return renderSpec(spec,"BETWEEN MATCHES",step)}
  return matchDay();
}
function matchDay(){
  ensureFive();
  const b=payCamp(),opp=nextOpponent();
  screen(`<div class="card"><div class="datechip">${stageName().toUpperCase()} · PAYING THE BILLS</div>
    <div class="payday"><div class="payamt">−${money(b.camp)}</div><div class="small">Camp costs</div></div>
    <div class="outcome" style="border-left-color:${b.card.v<0?"var(--bad)":"var(--good)"}">${b.card.t}: <b>${money(b.card.v,true)}</b></div>
    <p class="lede">Cash ${money(b.before)} → <b>${money(b.after)}</b></p>
    ${button("go",`On to ${opp}`,"",true)}</div>`);
  $("go").onclick=()=>renderTeamSheet(opp);
}

/* ---- the team sheet: shape and who starts ------------------------------------------------- */
function lineHTML(m,t){const p=outcomeProbs(m,t);return`Win ${pct(p.w)} · draw ${pct(p.d)} · lose ${pct(p.l)}`}
function renderTeamSheet(opp){
  const canShape=unlocked("shape"),canRotate=unlocked("rotation");
  let shape=canShape?(S.lastShape||"balanced"):bestShapeFor(autoStarters("balanced"),opp);
  let starters=autoStarters(shape);
  const paint=()=>{
    const lu=assign(starters,shape),[m,t]=myRates(lu,opp);
    const av=available();
    screen(`<div class="card"><div class="datechip">${stageName().toUpperCase()}${isKnockout()?" · KNOCKOUT":""}</div>
      <h1>v ${opp}</h1>
      <p class="small" style="margin-top:-4px">Elo ${eloOf(opp)}${HOSTS.includes(opp)?" · hosts":""}</p>
      <div class="market"><div class="top"><span class="nm">The model</span></div><div class="meta" id="line">${lineHTML(m,t)}</div></div>
      <div class="datechip" style="margin:10px 0 6px">SHAPE${canShape?"":" · YOUR STAFF'S CALL"}</div>
      ${Object.entries(SHAPES).map(([k,sh])=>`<button class="choice" data-shape="${k}" ${canShape?"":"disabled"} style="${k===shape?"border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,var(--panel2))":""}">
        <span class="t">${sh.name} <small style="font-family:var(--mono);color:var(--mute)">${sh.code}</small></span><span class="d">${sh.d}</span></button>`).join("")}
      <div class="datechip" style="margin:10px 0 6px">THE FIVE${canRotate?" · TAP TO SWAP":""}</div>
      <div class="sq" id="xi"></div>
      ${button("ko","Kick off","",true)}</div>`);
    const slotOf=Object.fromEntries(lu.map(x=>[x.id,x.slot]));
    av.forEach(p=>{const on=starters.includes(p.id),slot=slotOf[p.id];
      const b=document.createElement("button");b.className="pl";
      b.style.cssText="width:100%;text-align:left;font:inherit;color:inherit;"+(canRotate?"cursor:pointer;":"")+(on?"outline:2px solid var(--amber)":"opacity:.75");
      b.innerHTML=`<span class="pos">${on?slot:"SUB"}</span><span class="nm">${p.nm}<small>${POS_NAME[p.pos]}${on&&oop(p,slot)?" · <b style=\"color:var(--bad)\">out of position</b>":""}${p.knock?" · carrying a knock":""}${p.yellows?" · one yellow card":""}${p.rusty?" · short of games":""}</small></span>
        <span class="stat"><span class="lb">Fitness</span><span class="vv" style="color:${p.cond>=75?"var(--good)":p.cond>=55?"var(--amber)":"var(--bad)"}">${Math.round(p.cond)}%</span></span>`;
      if(canRotate)b.onclick=()=>{if(on){if(av.length>5){const bench=av.find(x=>!starters.includes(x.id));if(bench)starters=starters.map(x=>x===p.id?bench.id:x)}}
        else{const worst=starters.map(player).filter(x=>x.pos!=="GK"||p.pos==="GK").sort((a,b)=>a.cond-b.cond)[0];if(worst)starters=starters.map(x=>x===worst.id?p.id:x)}
        paint()};
      $("xi").appendChild(b)});
    unavailableNote();
    if(canShape)document.querySelectorAll("[data-shape]").forEach(b=>b.onclick=()=>{shape=b.dataset.shape;if(!canRotate)starters=autoStarters(shape);paint()});
    $("ko").onclick=()=>{S.lastShape=shape;S.calls.shape.push({opp,shape,best:bestShapeFor(starters,opp)});
      starters.forEach(id=>{const p=player(id);if(p.knock)p.hurt=true});renderMatch(newMatch(opp,shape,starters))};
  };
  paint();
}
function unavailableNote(){
  const out=S.squad.map(player).filter(p=>p.out||p.ban||p.home);
  if(!out.length)return;const d=document.createElement("p");d.className="small";
  d.innerHTML="Unavailable: "+out.map(p=>`${p.nm} (${p.home?"sent home":p.ban?"suspended":"injured"})`).join(", ");
  $("xi").appendChild(d);
}

/* ---- the live match -------------------------------------------------------------------------- */
function renderMatch(m){
  screen(`<div class="card"><div class="datechip">${stageName().toUpperCase()} · ${SHAPES[m.shape].code}</div><h1>v ${m.opp}</h1>
    <div class="vp"><div class="teams"><span>${S.me.toUpperCase()}</span><span id="sb" style="font-size:18px;white-space:nowrap">0–0</span><span style="text-align:right">${m.opp.toUpperCase()}</span></div>
      <div id="vpl"></div></div>
    <div id="paceBox">${paceControlsHTML("Skip to the end")}</div><div id="htBox"></div></div>`);
  const lines=$("vpl");let skipping=false;
  const add=(min,text,cls)=>{const d=document.createElement("div");d.className="ln"+(cls?" "+cls:"");
    d.innerHTML=`<span class="min">${min}</span><span class="tx">${text}</span><span class="sc">${m.my}–${m.th}</span>`;lines.appendChild(d);$("sb").textContent=`${m.my}–${m.th}`};
  wirePaceControls($("paceBox"),()=>{skipping=true});
  const delay=()=>skipping?0:PACE.commentaryMs*speedFactor()*(0.9+Math.random()*0.2);
  /* Events are shown with the score as it stood after each, so replay the
     period's events one at a time. */
  const showPeriod=(evs,done)=>{const startMy=m.my-evs.filter(e=>e.type==="goal"&&e.mine).length,startTh=m.th-evs.filter(e=>e.type==="goal"&&!e.mine).length;
    let a=startMy,b=startTh,i=0;
    const next=()=>{if(i>=evs.length)return setTimeout(done,delay());const e=evs[i++];
      const saveMy=m.my,saveTh=m.th;
      if(e.type==="goal"){if(e.mine)a++;else b++}
      m.my=a;m.th=b;
      if(e.type==="goal")add(e.min+"'",e.mine?`GOAL · ${player(e.who).nm}`:`${m.opp.toUpperCase()} GOAL`,e.mine?"goal":"against");
      else if(e.type==="yellow")add(e.min+"'",`Yellow card · ${player(e.id).nm}${e.second?" (his second: banned for the next match)":""}`,"");
      m.my=saveMy;m.th=saveTh;
      setTimeout(next,delay())};
    next()};
  const decide=(chip,title,opts,goLabel,onPick)=>{skipping=false;
    $("htBox").innerHTML=`<div style="margin-top:12px"><div class="datechip">${chip}</div><h2 style="margin-top:5px">${title}</h2><div id="dc"></div></div>`;
    choiceCards($("dc"),opts,goLabel,id=>{$("htBox").innerHTML="";onPick(id)})};
  const first=playPeriod(m,1,20,.5);
  showPeriod(first,()=>{
    add("HT","Half time","ft");
    const second=()=>{add("","— second half —","");const ev=playPeriod(m,21,40,.5);showPeriod(ev,fullTime)};
    if(!unlocked("half"))return second();
    const opts=halfOptions(m).map(o=>({...o,win:winFromHalf(m,o)}));
    decide("HALF TIME",m.my>m.th?`Ahead by ${m.my-m.th}.`:m.my<m.th?`Behind by ${m.th-m.my}.`:"Level.",opts,"Send them out",id=>{
      const o=opts.find(x=>x.id===id);changeShape(m,o.shape,o.starters);second()});
  });
  function fullTime(){
    if(m.ko&&m.my===m.th){m.et=true;add("40'","Level: five minutes each way of extra time","ft");
      const ev=playPeriod(m,41,50,.25);return showPeriod(ev,()=>{if(m.my!==m.th)return finish();add("50'","Still level: penalties","ft");
        const opts=shootoutOptions(m).map(o=>({...o,win:shootoutWin(o,eloOf(m.opp))}));
        const go=id=>{const o=opts.find(x=>x.id===id);const r=shootout(o,eloOf(m.opp));m.pens=r;
          add("PENS",`${r.won?S.me:m.opp} win the shootout ${Math.max(r.a,r.b)}–${Math.min(r.a,r.b)}`,r.won?"goal":"against");finish()};
        if(!unlocked("shootout"))return go(opts[0].id);
        decide("PENALTIES","Who takes them?",opts,"Make the call",go)})}
    finish();
  }
  function finish(){
    const res=m.my>m.th?"w":m.my<m.th?"l":m.pens?(m.pens.won?"w":"l"):"d";
    add("FT",res==="w"?"Full time: a win":res==="l"?"Full time: beaten":"Full time: a draw","ft");
    $("paceBox").innerHTML=button("toT","The results",`${S.me} ${m.my}–${m.th} ${m.opp}`,true);
    $("toT").onclick=()=>renderAfter(m,res);
  }
}

/* ---- after the match ---------------------------------------------------------------------- */
function renderAfter(m,res){
  const wasKo=isKnockout(),stageBefore=stageName();
  S.record[m.pens?(m.pens.won?"w":"l"):res]++;S.lastResult=res;S.played++;
  const news=afterMatch(m);
  const myRes={a:S.me,b:m.opp,x:m.my,y:m.th,winner:res==="w"?S.me:res==="l"?m.opp:null,pens:m.pens?(m.pens.won?S.me:m.opp):null};
  const others=playRoundOthers(myRes);
  const newRound=!S.t.exit&&!S.t.champion&&(wasKo||S.t.stage==="ko")&&S.t.ko.some(p=>p.includes(S.me));
  const prize=prizeMoney(m.pens?(m.pens.won?"w":"l"):res,newRound||S.t.champion===S.me);
  const cash=cashCheck();
  const newsHTML=news.map(n=>{const p=player(n.id);return n.type==="ban"?`${p.nm} is suspended for the next match.`:n.type==="injury"?`${p.nm} is injured: out for ${n.games} match${n.games>1?"es":""}.`:`${p.nm} has a knock.`}).join(" ");
  const tableNow=S.t.stage==="group"||!wasKo&&S.t.stage==="ko"?groupTable(myGroup(),S.t.res):null;
  screen(`<div class="card"><div class="datechip">${stageBefore.toUpperCase()} · RESULT</div>
    <h1>${res==="w"?"A win.":res==="l"?"Beaten.":"A draw."}</h1>
    <div class="res mine"><span><b>${S.me}</b> ${m.my}–${m.th} ${m.opp}${m.pens?` (${m.pens.won?"won":"lost"} on penalties)`:""}</span></div>
    ${others.filter(o=>wasKo||myGroup().includes(o.a)).map(o=>`<div class="res"><span>${o.a} ${o.x}–${o.y} ${o.b}${o.pens?` (${o.pens} on penalties)`:""}</span></div>`).join("")}
    <div class="outcome">Prize money: <b style="color:var(--good)">${money(prize,true)}</b></div>
    ${newsHTML?`<div class="outcome" style="border-left-color:var(--bad)">${newsHTML}</div>`:""}
    ${tableNow?`<table class="tbl" style="margin-top:8px"><tr><th>Group</th><th class="n">P</th><th class="n">GD</th><th class="n">Pts</th></tr>
      ${tableNow.map(r=>`<tr class="${r.n===S.me?"me":""}"><td>${r.n}</td><td class="n">${r.p}</td><td class="n">${r.gf-r.ga>0?"+":""}${r.gf-r.ga}</td><td class="n">${r.pts}</td></tr>`).join("")}</table>`:""}
    ${S.t.stage==="ko"&&!S.t.exit&&!S.t.champion?`<p class="lede" style="margin-top:8px">Next: ${stageName()} v ${nextOpponent()}.</p>`:""}
    ${S.t.exit?`<p class="lede" style="margin-top:8px">${S.me} are out.</p>`:""}
    ${button("go",cash==="sacked"||cash==="home"?"The FA wants a word":"Continue","",true)}</div>`);
  $("go").onclick=()=>{
    if(cash==="sacked")return renderEnding();
    if(cash==="home")return renderSendHome();
    CUR="event";step()};
}
/* IN THE RED (as the football game's bank): the FA sends a player home to
   cut costs, and you choose who. */
function renderSendHome(){
  const cands=S.squad.map(player).filter(p=>!p.home&&!p.standIn);
  screen(`<div class="card"><div class="datechip">THE FA HAS CALLED</div><h1>A player is going home</h1>
    <p class="lede">Cash is ${money(S.cash)}. Below ${money(MONEY.sackedBelow)} you are sacked.</p><div id="ch"></div></div>`);
  choiceCards($("ch"),cands.map(p=>({id:String(p.id),t:p.nm,d:`${POS_NAME[p.pos]} · rating ${p.r}${p.out?" · injured":""}`})),"Send him home",id=>{
    const p=sendHome(+id);
    screen(`<div class="card"><div class="datechip">THE FA HAS CALLED</div><h1>${p.nm} flies home</h1>
      <div class="outcome">One fewer in the camp: ${money(MONEY.sendHomeSaving,true)} now, and camp costs fall.</div>
      ${button("go","Continue","",true)}</div>`);$("go").onclick=()=>{CUR="event";step()}});
}

/* ---- the ending ---------------------------------------------------------------------------------- */
function renderEnding(){
  if(!S.t.champion)finishTournament();
  const pred=likeliest(S.shark);
  const reached=S.t.champion===S.me?"Champions":S.t.exit||"Champions";
  const v=S.sacked?"SACKED":S.t.champion===S.me?"WORLD CHAMPIONS":reached==="Final"?"RUNNERS-UP":reached==="Group stage"?"OUT IN THE GROUP":`OUT IN THE ${reached.toUpperCase()}`;
  const ps=S.squad.map(player),gks=ps.filter(p=>p.pos==="GK").length,shapes=S.calls.shape,matched=shapes.filter(s=>s.shape===s.best).length;
  const lessons=[
    `FixtureShark predicted ${S.me} ${predictionPhrase(S.shark)}, from the best seven of the ten.`,
    gks<2?"You took one keeper: an extra outfield player, and no cover in goal.":"You took two keepers: cover in goal, one fewer outfield player.",
    shapes.length?`Your shape was the model's best for the players on the pitch in ${matched} of ${shapes.length} matches.`:"",
    S.sentHome.length?`Money: ${S.sentHome.join(", ")} sent home to cut costs.`:""].filter(Boolean);
  screen(`<div class="card"><div class="datechip">THE WORLD CUP · ${S.me.toUpperCase()}</div>
    <div class="verdict ${S.t.champion===S.me&&!S.sacked?"ok":"fail"}">${v}</div>
    <p class="lede">${S.sacked?`The FA ran out of money: ${money(S.cash)}.`:S.t.champion===S.me?`FixtureShark gave ${S.me} a ${pct(S.shark.Champions)} chance.`:`${S.t.champion} won the World Cup.`}</p>
    ${lessons.map(x=>`<p class="small">${x}</p>`).join("")}
    <div class="tip"><b>The real thing</b>
      <a href="${SITE}/international/teams/${slug(S.me)}">${S.me}</a>: the real squad, record and Elo ·
      <a href="${SITE}/international/tournaments">Tournaments</a> · <a href="${SITE}/international/history">Through Time</a></div>
    ${button("same","Same draw, different decisions","Identical seed",true)}${button("again","A new World Cup","New seed")}</div>`);
  $("again").onclick=renderStart;
  $("same").onclick=()=>{const seed=SEED,lv=S.level;$("app").innerHTML=`<div class="card"><p class="lede">The Shark is simulating the tournament…</p></div>`;
    setTimeout(()=>{beginSeason(lv,seed);renderNation()},30)};
}

renderStart();
