/* ===========================================================================
   nations-cup/ui.js — screens: start, your nation, the squad, the training
   block, each tie (bills, line-up, the rubbers set by set, after the
   singles, one set all, dead rubbers, results), the money, the ending.
   Last line starts the game.
   =========================================================================== */

let CUR=null; // what's next: "camp" | "tie" | "event"
let EVENT_I=0;
let pickLevel="beginner";

/* ---- the header: round, cash and ties won ------------------------------------------ */
function paintHeader(){
  if(!S)return;
  const over=!!(S.champion||S.exit||!S.alive),short=over?"END":ROUNDS[Math.min(S.round,3)].short;
  $("hScore").innerHTML=`${short}<span class="sub">ROUND</span>`;
  if(S._cashSeen==null)S._cashSeen=S.cash;
  if(S.cash!==S._cashSeen){S._cashDelta=S.cash-S._cashSeen;S._cashSeen=S.cash}
  const dl=S._cashDelta||0;
  $("hTwo").innerHTML=`<div class="two cash"><div class="k">Cash</div>
      <div class="v cashv${S.cash<0?" neg":""}">${money(S.cash)}</div>
      ${dl?`<div class="cashd ${dl>0?"up":"down"}">${dl>0?"▲ ":"▼ "}${money(dl,true)}</div>`:""}
      ${S.cash<0&&!over?`<div class="pts">in the red: a player will be sent home</div>`:""}</div>
    <div class="two"><div class="k">${S.me} · ties</div><div class="v" style="font-size:20px">W${S.record.w} L${S.record.l}</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>${over?`${S.played} TIE${S.played===1?"":"S"} PLAYED`:`TIE ${Math.min(S.played+1,4)} OF UP TO 4`}</span><span>${over?"":SURF_NAME[ROUNDS[Math.min(S.round,3)].surface].toUpperCase()}</span></div>
    <div class="track"><i style="width:${Math.min(1,S.played/4)*100}%"></i></div>`;
}
function screen(html){paintHeader();$("app").innerHTML=html;if(typeof window!=="undefined"&&window.scrollTo)window.scrollTo(0,0)}
function tagsHTML(tags){return tags.map(([up,t])=>`<span class="tag ${up?"up":"down"}">${t}</span>`).join("")}
const surname=p=>p.nm.split(" ").slice(-1)[0];
const lefty=p=>p.hand==="L"?" (L)":"";
const loading=t=>{$("app").innerHTML=`<div class="card"><p class="lede">${t}</p></div>`};

/* ---- a decision card between ties ------------------------------------------------------ */
function renderSpec(spec,chip,done){
  screen(`<div class="card"><div class="datechip">${chip}</div><h1>${spec.title}</h1>
    <p class="lede">${spec.lede}</p><div id="ch"></div></div>`);
  choiceCards($("ch"),spec.choices.map((c,i)=>({id:String(i),t:c.t,d:c.d})),"Confirm",id=>{const c=spec.choices[+id],tags=apply(c.fx);
    screen(`<div class="card"><div class="datechip">${chip}</div><h1>${spec.title}</h1>
      <div class="outcome">${c.out}</div><div class="delta">${tagsHTML(tags)}</div>${button("go","Continue","",true)}</div>`);$("go").onclick=done});
}

/* ---- start: the sports, then your nation ------------------------------------------------ */
function renderStart(){
  S=null;
  renderGamePicker("nations-cup","../",renderNations);
}
function renderNations(){
  const list=seedList();
  $("app").innerHTML=`<div class="card"><div class="datechip">THE NATIONS CUP</div><h1>Pick your nation</h1>
    <p class="small">Real strength from FixtureShark's tennis ratings: the higher the seed, the better your chance.</p><div id="ch"></div></div>`;
  choiceCards($("ch"),list.map((n,i)=>{const t=team(n),avg=g=>disp(SURFS.reduce((a,s)=>a+t[g][s],0)/3);
    return{id:n,t:n,d:`Seed ${i+1} · men ${avg("m")} · women ${avg("w")}`}}),"Captain them",n=>{
    loading("The Shark is simulating the Nations Cup…");setTimeout(()=>{beginSeason(pickLevel,n);renderNation()},30)});
}
function beginSeason(level,me,seed){
  newSeason(level,me,seed);CUR="camp";EVENT_I=0;
  const sq=sharkSquad();S.sharkSquad=sq;          // both simulate, and restore S from a copy:
  const fc=forecast(sq,typeof SHARK_RUNS==="number"?SHARK_RUNS:SHARK_RUNS_DEFAULT);S.shark=fc; // assign after they return
  $("foot").innerHTML=`Nations Cup ${SEED}`;
}
function predictionPhrase(fc){const s=likeliest(fc);return s==="Champions"?"to win it":s==="Final"?"to reach the final":`to go out in the ${s.toLowerCase()}`}

/* ---- your nation, the route and the draw -------------------------------------------- */
function drawHTML(){
  const b=S.field,rows=[];for(let k=0;k<b.length;k+=2)rows.push(`<tr><td class="${b[k]===S.me?"me":""}">${b[k]}${b[k]===S.me?'<span class="you">YOU</span>':""}</td><td class="n">${seedOf(b[k])}</td>
    <td>v</td><td class="${b[k+1]===S.me?"me":""}">${b[k+1]}${b[k+1]===S.me?'<span class="you">YOU</span>':""}</td><td class="n">${seedOf(b[k+1])}</td></tr>`);
  return`<table class="tbl"><tr><th>First round · hard</th><th class="n">Seed</th><th></th><th></th><th class="n">Seed</th></tr>${rows.join("")}</table>`;
}
function renderNation(){
  screen(`<div class="card hero"><div class="hero-kicker">THE NATIONS CUP</div>
    <div class="mission">You captain ${S.me}</div>
    <p class="lede" style="margin-top:8px">Seeded ${seedOf(S.me)} of 16. FixtureShark predicts ${S.me} ${predictionPhrase(S.shark)} (win it ${pct(S.shark.Champions)}).</p></div>
    <div class="card"><div class="datechip">YOUR ROUTE</div>
    ${ROUNDS.map((r,i)=>`<div class="res${i===0?" mine":""}"><span><b>${r.name}</b> · ${SURF_NAME[r.surface]}</span><span>${i===0?"v "+nextOpponent():"likeliest "+likelyOpp(i)}</span></div>`).join("")}
    <div class="datechip" style="margin-top:12px">THE DRAW</div>${drawHTML()}
    ${button("go","Pick your squad","",true)}</div>`);
  $("go").onclick=renderSquad;
}

/* ---- the squad: three men and three women from twelve ----------------------------------- */
function ratingsLine(p,s){return s?`${SURF_NAME[s]} ${disp(sr(p,s))}`:SURFS.map(x=>`${SURF_NAME[x][0]} ${disp(p.surf[x])}`).join(" · ")}
function doublesOf(p){return disp(avgRating(p)+p.dbl)}
function renderSquad(){
  const picked=new Set(S.squad.length?S.squad:[]);let fc=null;
  const paint=()=>{
    const ids=[...picked],nm=ids.filter(i=>P(i).g==="m").length,nw=ids.length-nm,ready=nm===3&&nw===3;
    if(ready&&!fc)fc=forecast(ids,typeof SQUAD_RUNS==="number"?SQUAD_RUNS:250);
    const fees=ids.reduce((a,i)=>a+P(i).fee,0);
    screen(`<div class="card"><div class="datechip">THE SQUAD · MEN ${nm} OF 3 · WOMEN ${nw} OF 3</div><h1>Pick three men and three women</h1>
      <p class="small">Ratings on hard (H), clay (C) and grass (G); Dbl is doubles.</p>
      <div class="outcome" style="border-left-color:${MONEY.travel+fees>MONEY.prize.w?"var(--bad)":"var(--good)"}">Each tie costs ${money(MONEY.travel+fees)}: travel ${money(MONEY.travel)} and appearance fees ${money(fees)}. A win pays ${money(MONEY.prize.w)}. Cash now ${money(S.cash)}.</div>
      <div class="benchh">MEN</div><div class="sq" id="plm"></div><div class="benchh">WOMEN</div><div class="sq" id="plw"></div>
      <div class="market" id="fcBox">${ready&&fc?`<div class="top"><span class="nm">With this squad</span></div>
        <div class="meta">Win it ${pct(fc.Champions)} · reach the final ${pct(reachChance(fc,"Final"))} · reach the semi-final ${pct(reachChance(fc,"Semi-final"))}</div>`
        :`<div class="meta">Pick three men and three women to see the forecast.</div>`}</div>
      <button class="choice primary" id="nameSquad" ${ready?"":"disabled"} style="${ready?"":"opacity:.5"}"><span class="t">Name the squad</span></button></div>`);
    S.pool.filter(p=>!p.standIn).forEach(p=>{const on=picked.has(p.id),b=document.createElement("button");b.className="pl";
      b.style.cssText="width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit"+(on?";outline:2px solid var(--amber);background:color-mix(in srgb,var(--amber) 14%,var(--panel2))":"");
      b.setAttribute("aria-pressed",on);
      b.innerHTML=`<span class="pos">${p.hand==="L"?"LEFT":"RIGHT"}</span><span class="nm">${p.nm}<small>${STYLE_NAME[p.style]} · ${p.tag}</small>
        <small>${ratingsLine(p)} · Dbl ${doublesOf(p)}${p.cond<100?` · fitness ${Math.round(p.cond)}%`:""}</small></span>
        <span class="stat"><span class="lb">Fee</span><span class="vv">${money(p.fee)}</span></span>`;
      b.onclick=()=>{if(on)picked.delete(p.id);else if([...picked].filter(i=>P(i).g===p.g).length<3)picked.add(p.id);fc=null;paint()};
      $(p.g==="m"?"plm":"plw").appendChild(b)});
    $("nameSquad").onclick=()=>{if(!ready)return;S.squad=[...picked].sort((a,b)=>a-b);CUR="camp";step()};
  };
  paint();
}

/* ---- the flow ------------------------------------------------------------------------- */
function step(){
  if(!S.alive||S.champion||S.exit)return renderEnding();
  if(CUR==="camp"){CUR="tie";return renderSpec(campSpec(),"BEFORE THE EVENT",step)}
  if(CUR==="event"){CUR="tie";const e=nextEvent(EVENT_I);if(e){EVENT_I=e.next;return renderSpec(e.spec,"BETWEEN TIES",step)}}
  return tieDay();
}
function tieDay(){
  const stand=ensureTwo(),b=payTie(),opp=nextOpponent(),r=ROUNDS[S.round];
  screen(`<div class="card"><div class="datechip">${r.name.toUpperCase()} · PAYING THE BILLS</div>
    <div class="payday"><div class="payamt">−${money(b.travel+b.fees)}</div><div class="small">Travel ${money(b.travel)} · appearance fees ${money(b.fees)}</div></div>
    <div class="outcome" style="border-left-color:${b.card.v<0?"var(--bad)":"var(--good)"}">${b.card.t}: <b>${money(b.card.v,true)}</b></div>
    ${stand.length?`<div class="outcome" style="border-left-color:var(--bad)">Short of players: the federation flies in ${stand.map(p=>p.nm).join(" and ")}.</div>`:""}
    <p class="lede">Cash ${money(b.before)} → <b>${money(b.after)}</b></p>
    ${button("go",`On to ${opp}`,`${r.name} · ${SURF_NAME[r.surface]}`,true)}</div>`);
  $("go").onclick=()=>renderTeamSheet(newTie());
}

/* ---- the line-up ------------------------------------------------------------------------------- *
   The staff's suggestion is the obvious one: the higher-rated player plays
   the singles, the next the mixed. Surface, left-handers and partnerships
   are yours to weigh. */
function defaultLineup(){const by=g=>available(g).sort((a,b)=>avgRating(b)-avgRating(a)).map(p=>p.id);
  const m=by("m"),w=by("w");return{m:[m[0],m[1]],w:[w[0],w[1]]}}
function rubberLine(ev,R,O,s,p){
  const nm=ids=>ids.map(id=>surname(P(id))+lefty(P(id))).join("/");
  return`<div class="res"><span><b>${EVENT_NAME[ev]}</b> · ${nm(R[ev])} v ${nm(O[ev])}</span><span class="n">${pct(p)}</span></div>`;
}
function renderTeamSheet(t){
  const can=unlocked("lineup");
  let lu=can?(S.lastLineup&&validLineup(S.lastLineup)?S.lastLineup:defaultLineup()):bestLineup(t.olu,t.s);
  const paint=()=>{
    const R=rubbersOf(lu),O=rubbersOf(t.olu),ch=rubberChances(lu,t.olu,t.s),tc=tieChance(lu,t.olu,t.s);
    screen(`<div class="card"><div class="datechip">${ROUNDS[t.round].name.toUpperCase()} · ${SURF_NAME[t.s].toUpperCase()}</div>
      <h1>v ${t.opp}</h1><p class="small" style="margin-top:-4px">Seed ${seedOf(t.opp)} · their line-up: ${["m","w"].map(g=>t.olu[g].map(id=>`${P(id).nm}${lefty(P(id))} ${disp(sr(P(id),t.s))}`).join(", ")).join(" · ")}</p>
      <div class="market"><div class="top"><span class="nm">The model</span><span class="fee">Win the tie ${pct(tc)}</span></div>
        ${EVENTS.map((ev,i)=>rubberLine(ev,R,O,t.s,ch[i])).join("")}</div>
      ${["m","w"].map(g=>`<div class="datechip" style="margin:10px 0 6px">${g==="m"?"MEN":"WOMEN"}${can?"":" · YOUR STAFF'S CALL"}</div>
        <div class="sq" id="sq${g}"></div>${can?`<div class="roles" id="ro${g}"></div>`:""}`).join("")}
      ${unavailableNote()}
      ${button("ko","Start the tie","",true)}</div>`);
    for(const g of["m","w"]){
      available(g).forEach(p=>{const role=lu[g][0]===p.id?"SINGLES":lu[g][1]===p.id?"MIXED":"REST";
        const d=document.createElement("div");d.className="pl";if(role==="REST")d.style.opacity=".7";
        d.innerHTML=`<span class="pos">${role}</span><span class="nm">${p.nm}${lefty(p)}<small>${ratingsLine(p,t.s)} · Dbl ${disp(sr(p,t.s)+p.dbl)} · ${STYLE_NAME[p.style]}${p.knock?" · <b style=\"color:var(--bad)\">carrying a knock</b>":""}</small></span>
          <span class="stat"><span class="lb">Fitness</span><span class="vv" style="color:${p.cond>=80?"var(--good)":p.cond>=60?"var(--amber)":"var(--bad)"}">${Math.round(p.cond)}%</span></span>`;
        $("sq"+g).appendChild(d)});
      if(!can)continue;
      [["Singles",0],["Mixed",1]].forEach(([label,k])=>{const row=document.createElement("div");row.className="rolerow";
        row.innerHTML=`<span class="rl">${label}</span>`;
        available(g).forEach(p=>{const b=document.createElement("button");b.className="choice rb";b.dataset.role=k;
          const on=lu[g][k]===p.id;b.setAttribute("aria-pressed",on);if(on)b.style.cssText="border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,var(--panel2))";
          b.textContent=surname(p);
          b.onclick=()=>{const cur=lu[g].slice();if(cur[1-k]===p.id)cur[1-k]=cur[k];cur[k]=p.id;lu={...lu,[g]:cur};paint()};
          row.appendChild(b)});
        $("ro"+g).appendChild(row)});
    }
    $("ko").onclick=()=>{S.lastLineup=lu;S.calls.push({round:t.round,mine:tc,best:tieChance(bestLineup(t.olu,t.s),t.olu,t.s)});startTie(t,lu);renderTie(t)};
  };
  paint();
}
function validLineup(lu){return["m","w"].every(g=>lu[g].length===2&&lu[g][0]!==lu[g][1]&&lu[g].every(id=>available(g).some(p=>p.id===id)))}
function unavailableNote(){
  const out=S.squad.map(P).filter(p=>p.out||p.home);
  return out.length?`<p class="small">Unavailable: ${out.map(p=>`${p.nm} (${p.home?"sent home":"injured"})`).join(", ")}</p>`:"";
}

/* ---- the tie, rubber by rubber, set by set ------------------------------------------------------- */
function renderTie(t){
  screen(`<div class="card"><div class="datechip">${ROUNDS[t.round].name.toUpperCase()} · ${SURF_NAME[t.s].toUpperCase()}</div><h1>v ${t.opp}</h1>
    <div class="vp"><div class="teams"><span>${S.me.toUpperCase()}</span><span id="sb" style="font-size:18px">0–0</span><span style="text-align:right">${t.opp.toUpperCase()}</span></div>
      <div id="vpl"></div></div>
    <div id="paceBox">${paceControlsHTML("Skip to the end")}</div><div id="htBox"></div></div>`);
  const lines=$("vpl");let skipping=false;
  const add=(code,text,cls)=>{const d=document.createElement("div");d.className="ln"+(cls?" "+cls:"");
    d.innerHTML=`<span class="min">${code}</span><span class="tx">${text}</span><span class="sc">${t.a}–${t.b}</span>`;lines.appendChild(d);$("sb").textContent=`${t.a}–${t.b}`};
  wirePaceControls($("paceBox"),()=>{skipping=true});
  const delay=()=>skipping?0:PACE.commentaryMs*speedFactor()*(0.9+Math.random()*0.2);
  const decide=(chip,title,opts,goLabel,onPick)=>{skipping=false;
    $("htBox").innerHTML=`<div style="margin-top:12px"><div class="datechip">${chip}</div><h2 style="margin-top:5px">${title}</h2><div id="dc"></div></div>`;
    choiceCards($("dc"),opts,goLabel,id=>{$("htBox").innerHTML="";onPick(id)})};
  const code=ev=>({MS:"MS",WS:"WS",MD:"MD",WD:"WD",XD:"XD"})[ev];
  const names=ids=>ids.map(id=>P(id).nm).join(" and ");
  function run(){
    if(t.i>=EVENTS.length)return finish();
    if(tieOver(t)&&t.dead==null){
      const left=EVENTS.length-t.i,go=id=>{t.dead=id;if(id==="concede"){concedeRest(t);add("","Dead rubbers conceded: the players rest","ft");return finish()}
        const g=playDead(t);add("",`Dead rubbers played out: the gate ${money(g,true)}`,"ft");setTimeout(run,delay())};
      if(!unlocked("deadRubber"))return go("play");
      return decide("DEAD RUBBERS",`${t.a>t.b?"Won":"Lost"} ${t.a}–${t.b}, ${left} to play`,[
        {id:"play",t:"Play them out",d:`The crowd has paid for five · ${money(MONEY.gate*left,true)}`},
        {id:"concede",t:"Concede them",d:"Rest the players for the next tie"}],"Confirm",go);
    }
    if(t.i===2&&!t.asked&&!tieOver(t)){t.asked=true;
      if(unlocked("afterSingles"))return decide("AFTER THE SINGLES",`${S.me} ${t.a}–${t.b}. The doubles pairs?`,afterSinglesOptions(t),"Confirm the pairs",id=>{
        const o=afterSinglesOptions(t).find(x=>x.id===id);useOption(t,o);if(id!=="keep")add("","Change: "+o.t,"ft");setTimeout(run,delay())});
    }
    const r=nextRubber(t);add(code(r.ev),`<b>${EVENT_NAME[r.ev]}</b>: ${names(r.mine)} v ${names(r.theirs)}`,"");
    const nextSet=()=>{
      if(r.done){const won=endRubber(t),w=won?names(r.mine):names(r.theirs);
        add(code(r.ev),`${w} win${r.mine.length===1?"s":""} ${won?setsText(r,true):r.sets.map(([a,b])=>`${b}–${a}`).join(" ")}`,won?"goal":"against");
        return setTimeout(run,delay())}
      if(r.sa===1&&r.sb===1&&r.ev[1]==="D"&&!r.asked&&unlocked("setBreak")){r.asked=true;
        return decide("ONE SET ALL",`${EVENT_NAME[r.ev]}: the deciding set`,setBreakOptions(t),"Make the call",id=>{
          r.bonus=setBreakOptions(t).find(x=>x.id===id).bonus;setTimeout(nextSet,delay())})}
      const[a,b]=playSet(r);add(code(r.ev),`Set ${r.sets.length}: ${a}–${b} ${a>b?S.me:t.opp}`,"");
      setTimeout(nextSet,delay());
    };
    setTimeout(nextSet,delay());
  }
  function finish(){
    const won=t.a>t.b;
    add("END",won?`${S.me} win the tie ${t.a}–${t.b}`:`${t.opp} win the tie ${t.b}–${t.a}`,"ft");
    $("paceBox").innerHTML=button("toT","The results",`${S.me} ${t.a}–${t.b} ${t.opp}`,true);
    $("toT").onclick=()=>renderAfter(t);
  }
  run();
}

/* ---- after the tie ------------------------------------------------------------------------------- */
function renderAfter(t){
  const won=t.a>t.b,rname=ROUNDS[t.round].name;
  S.lastResult=won?"w":"l";
  afterTie(t);const others=playRoundOthers(won,[t.a,t.b]);
  const prize=prizeMoney(won,S.champion===S.me);
  const cash=cashCheck();
  const news=t.news.map(n=>{const p=P(n.id);return n.type==="injury"?`${p.nm} is injured: out of the next tie.`:`${p.nm} has a knock.`}).join(" ");
  screen(`<div class="card"><div class="datechip">${rname.toUpperCase()} · RESULT</div>
    <h1>${won?"Through.":"Beaten."}</h1>
    <div class="res mine"><span><b>${S.me}</b> ${t.a}–${t.b} ${t.opp}</span></div>
    ${others.filter(o=>!o.mine).map(o=>`<div class="res"><span>${o.a} ${o.x}–${o.y} ${o.b}</span></div>`).join("")}
    <div class="outcome">Prize money: <b style="color:var(--good)">${money(prize,true)}</b></div>
    ${news&&S.alive&&!S.exit&&!S.champion?`<div class="outcome" style="border-left-color:var(--bad)">${news}</div>`:""}
    ${!S.exit&&!S.champion?`<p class="lede" style="margin-top:8px">Next: the ${ROUNDS[S.round].name.toLowerCase()} on ${SURF_NAME[ROUNDS[S.round].surface].toLowerCase()}, v ${nextOpponent()}.</p>`:""}
    ${S.exit?`<p class="lede" style="margin-top:8px">${S.me} are out.</p>`:""}
    ${button("go",cash==="sacked"||cash==="home"?"The federation wants a word":"Continue","",true)}</div>`);
  $("go").onclick=()=>{
    if(cash==="sacked")return renderEnding();
    if(cash==="home"&&!S.exit&&!S.champion)return renderSendHome();
    CUR="event";step()};
}
/* IN THE RED: the federation sends a player home to cut costs; you choose. */
function renderSendHome(){
  const cands=S.squad.map(P).filter(p=>!p.home&&!p.standIn);
  screen(`<div class="card"><div class="datechip">THE FEDERATION HAS CALLED</div><h1>A player is going home</h1>
    <p class="lede">Cash is ${money(S.cash)}. Below ${money(MONEY.sackedBelow)} you are sacked.</p><div id="ch"></div></div>`);
  choiceCards($("ch"),cands.map(p=>({id:String(p.id),t:p.nm,d:`${p.g==="m"?"Men":"Women"} · ${ratingsLine(p)} · fee ${money(p.fee)} a tie${p.out?" · injured":""}`})),"Send them home",id=>{
    const p=sendHome(+id);
    screen(`<div class="card"><div class="datechip">THE FEDERATION HAS CALLED</div><h1>${p.nm} flies home</h1>
      <div class="outcome">One fewer appearance fee: ${money(p.fee)} a tie saved.</div>
      ${button("go","Continue","",true)}</div>`);$("go").onclick=()=>{CUR="event";step()}});
}

/* ---- the ending ---------------------------------------------------------------------------------- */
function renderEnding(){
  if(!S.champion)finishTournament();
  const reached=S.champion===S.me?"Champions":S.exit||"Champions";
  const v=S.sacked?"SACKED":S.champion===S.me?"NATIONS CUP WINNERS":reached==="Final"?"RUNNERS-UP":`OUT IN THE ${reached.toUpperCase()}`;
  const calls=S.calls,good=calls.filter(c=>c.mine>=c.best-.005).length;
  const lessons=[
    `FixtureShark predicted ${S.me} ${predictionPhrase(S.shark)}, from the best squad of the twelve.`,
    calls.length?`Your line-up was the model's best (or as good) in ${good} of ${calls.length} tie${calls.length>1?"s":""}.`:"",
    S.sentHome.length?`Money: ${S.sentHome.join(", ")} sent home to cut costs.`:"",
    "Singles strength comes from FixtureShark's real tennis ratings; the tennis data is singles only, so doubles and partnerships are the game's own rules."].filter(Boolean);
  screen(`<div class="card"><div class="datechip">THE NATIONS CUP · ${S.me.toUpperCase()}</div>
    <div class="verdict ${S.champion===S.me&&!S.sacked?"ok":"fail"}">${v}</div>
    <p class="lede">${S.sacked?`The federation ran out of money: ${money(S.cash)}.`:S.champion===S.me?`FixtureShark gave ${S.me} a ${pct(S.shark.Champions)} chance.`:`${S.champion} won the Nations Cup.`}</p>
    ${lessons.map(x=>`<p class="small">${x}</p>`).join("")}
    <div class="tip"><b>The real thing</b>
      <a href="${SITE}/tennis/head-to-head">Head to head</a>: any two players' chances by surface ·
      <a href="${SITE}/tennis/players">Your Player</a> · <a href="${SITE}/tennis">FixtureShark Tennis</a></div>
    ${button("same","Same draw, different decisions","Identical seed",true)}${button("again","A new Nations Cup","New seed")}</div>`);
  $("again").onclick=renderStart;
  $("same").onclick=()=>{const seed=SEED,lv=S.level,me=S.me;loading("The Shark is simulating the Nations Cup…");
    setTimeout(()=>{beginSeason(lv,me,seed);renderNation()},30)};
}

renderStart();
