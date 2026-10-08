/* ===========================================================================
   poker/preflopui.js — "Pre-flop": heads-up push/fold against the Shark.

   Two parts: the small blind (shove or fold) and the big blind (the Shark
   shoves: call or fold). Each answer is judged at once by its value in big
   blinds against the Shark's equilibrium range; the answer shows both
   values, where the hand sits in the Shark's chart, and the whole range at
   this stack on the 13x13 grid with your hand marked. Severity from big
   blinds given away (shared/training.js: 0.1 bb or less a small mistake,
   up to 0.5 bb a mistake, more a major one).
   =========================================================================== */
let PF=null;
const PF_BB_SCALE=5; // severity: big blinds lost ÷ 5, so 0.1 bb = 2%, 0.5 bb = 10%
function newPreflop(role){PF={role,T:newTrainingSession("poker-preflop",{role}),q:null,n:0,rec:null,lost:0,streak:0,bestStreak:0};btsTrack("pk_pf_start",{role})}
const bbText=x=>`${x>0?"+":x<0?"−":""}${Math.abs(x).toFixed(2)} bb`;
function paintPreflopHeader(){
  const T=PF&&PF.T,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">PRE-FLOP SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Right</div><div class="v">${ok} / ${n}</div></div>
    <div class="two"><div class="k">Given away</div><div class="v">${PF?PF.lost.toFixed(1):"0.0"}</div><div class="pts">big blinds</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · PRE-FLOP${PF?` · ${PF.role==="sb"?"SMALL BLIND":"BIG BLIND"}`:""}</span><span></span></div>`;
}
function renderPreflopIntro(){
  PF=null;paintPreflopHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · PRE-FLOP</div>
    <div class="mission">Shove or fold?</div>
    <p class="lede" style="margin-top:10px">Heads-up against the Shark with a short stack, every hand is one decision before the flop: all in, or fold. The Shark plays the <b>equilibrium</b>: the strategy neither player can beat by changing their own.</p></div>
    <div class="card"><div class="datechip">HOW IT WORKS</div>
      <table class="tbl"><tbody>
        <tr><td>The blinds</td><td class="n">small 0.5 · big 1</td></tr>
        <tr><td>Your stack (and the Shark's)</td><td class="n">2 to 20 big blinds</td></tr>
        <tr><td>Fold the small blind</td><td class="n">−0.5 bb</td></tr>
        <tr><td>Fold the big blind to a shove</td><td class="n">−1 bb</td></tr></tbody></table>
      <p class="small">Each answer is worth something in big blinds on average, against the hands the Shark plays. The shorter the stacks, the more hands are worth playing: the blinds are a bigger share of what you have.</p>
      <div class="datechip" style="margin:12px 0 6px">PICK A SEAT</div><div id="ch"></div></div>`;
  choiceCards($("ch"),[{id:"sb",t:"Small blind: shove or fold",d:"You act first: all in, or give up the half blind"},
    {id:"bb",t:"Big blind: call or fold",d:"The Shark shoves: is your hand good enough to call?"}],"Deal",id=>{newPreflop(id);nextPreflop()});
}
function nextPreflop(){PF.q=pfQuestion(PF.role);PF.n++;PF.rec=null;renderPreflop()}
function renderPreflop(){
  const q=PF.q,done=!!PF.rec,sb=q.role==="sb";paintPreflopHeader();
  const playLabel=sb?"Shove":"Call";
  $("app").innerHTML=`<div class="card"><div class="datechip">HAND ${PF.n} · ${q.S} BIG BLINDS EACH</div>
    <div class="seat"><div class="who">THE SHARK · ${sb?"BIG BLIND":"SMALL BLIND"}</div><div class="cards"><span class="pc back"></span><span class="pc back"></span></div>
      ${sb?"":`<div class="outcome" style="margin:4px 0 0;border-left-color:var(--bad)"><b>The Shark shoves all in: ${q.S} big blinds.</b></div>`}</div>
    <div class="seat"><div class="who">YOUR CARDS · ${sb?"SMALL BLIND":"BIG BLIND"} <span class="tot">${q.name}</span></div><div class="cards">${q.cards.map(c=>pkCardHTML(c)).join("")}</div></div>
    <p class="small" style="margin:6px 0 0">${sb?`You've posted the small blind (0.5). Shove all ${q.S} big blinds, or fold?`:`You've posted the big blind (1). Call ${q.S-1} more for all ${q.S}, or fold?`}</p></div>
    <div class="card">${done?preflopFeedback()+button("next","Next hand","",true)+`<div class="endrow2">${PF.T.decisions.length>=6?button("report","Finish: your report",`${PF.n} hands`):""}${button("switch",sb?"Switch to the big blind":"Switch to the small blind","")}</div>`
      :`<div class="answers"><button class="ans big fold" id="pf-fold">Fold</button><button class="ans big call" id="pf-play">${playLabel}</button></div>`}</div>`;
  if(!done){$("pf-fold").onclick=()=>preflopAnswer("fold");$("pf-play").onclick=()=>preflopAnswer(q.play)}
  else{$("next").onclick=nextPreflop;const rp=$("report");if(rp)rp.onclick=renderPreflopReport;
    $("switch").onclick=()=>{PF.role=PF.role==="sb"?"bb":"sb";nextPreflop()}}
}
function preflopAnswer(a){
  const q=PF.q,val=x=>x==="fold"?q.foldV:q.playV,best=Math.max(q.playV,q.foldV),lost=Math.max(0,best-val(a));
  const rec=recordDecision(PF.T,{situation:`${q.name} at ${q.S} bb`,group:`${q.role==="sb"?"Small blind":"Big blind"}, ${pfStackGroup(q.S)}`,
    chosen:a,best:q.answer,optimal:a===q.answer||q.close,evChosen:-lost/PF_BB_SCALE,evBest:0,stake:1,lostBB:lost});
  PF.rec=rec;PF.lost+=rec.optimal?0:lost;
  if(rec.optimal){PF.streak++;PF.bestStreak=Math.max(PF.bestStreak,PF.streak)}else PF.streak=0;
  btsTrack("pk_pf_answer",{role:q.role,right:rec.optimal?1:0});renderPreflop();
}
/* The Shark's range at this stack on the 13x13 grid, your hand marked. */
function pfGridHTML(role,S,mine){
  let h=`<div class="pfgrid" role="img" aria-label="The hands the Shark's chart ${role==="sb"?"shoves":"calls"} at ${S} big blinds">`;
  for(let r=0;r<13;r++)for(let c=0;c<13;c++){const n=pfGridName(r,c),i=pfIndex(n);h+=`<span class="${pfPlays(role,S,i)?"in":""}${n===mine?" me":""}">${n.replace(/[so]$/,"")}</span>`}
  return h+`</div><p class="small" style="margin:4px 0 0"><span class="pfkey in"></span> ${role==="sb"?"shove":"call"} · <span class="pfkey"></span> fold · suited above the pairs, offsuit below · <b>${Math.round((role==="sb"?PF_EV[S].shoveShare:PF_EV[S].callShare)*100)}%</b> of hands</p>`;
}
function preflopFeedback(){
  const q=PF.q,r=PF.rec,sb=q.role==="sb",verb=sb?"shoves":"calls",playW=sb?"Shoving":"Calling";
  const table=`<table class="tbl" style="margin-top:6px"><tbody>
    <tr><td>${playW} ${q.name}</td><td class="n" style="color:${q.gain>0?"var(--good)":"var(--bad)"}">${bbText(q.playV)}</td></tr>
    <tr><td>Folding</td><td class="n">${bbText(q.foldV)}</td></tr>
    <tr><td><b>${q.gain>0?playW:"Folding"} is better by</b></td><td class="n"><b>${Math.abs(q.gain).toFixed(2)} bb</b></td></tr></tbody></table>`;
  const chartLine=(q.S<=q.to)===(q.gain>0)?`<p class="small">The equilibrium ${verb} ${q.name} ${pfToText(q.to)}; you have ${q.S}.</p>`:"";
  const why=sb?(q.gain>0?`Against the hands the Shark calls with, ${q.name} wins often enough, and the Shark folds often enough, that shoving beats giving up the half blind.`
      :`When the Shark calls, ${q.name} is too far behind to make up for the times it folds: give up the half blind.`)
    :(q.gain>0?`The Shark shoves a wide range at ${q.S} big blinds; ${q.name} does well enough against it to call.`
      :`Against the hands the Shark shoves at ${q.S} big blinds, ${q.name} loses too often: let the big blind go.`);
  const grid=`<div class="datechip" style="margin:12px 0 6px">THE EQUILIBRIUM AT ${q.S} BIG BLINDS · ${sb?"SMALL BLIND":"BIG BLIND"}</div>${pfGridHTML(q.role,q.S,q.name)}`;
  if(r.optimal)return`<div class="okline">✓ <b>Right</b>: ${a3(r.chosen)}.${q.close&&r.chosen!==q.answer?" A coin flip: either is fine.":q.close?" A close one.":""}</div>${table}${chartLine}<p class="small">${why}</p>${grid}`;
  const sev=SEVERITY.find(s=>s.id===r.severity);
  return`<div class="lesson sev-${r.severity}" role="alert"><div class="band">✗ ${sev.name.toUpperCase()} · ${q.answer.toUpperCase()} WAS RIGHT</div><div class="lb">
    <p class="lt">${why}</p>${table}${chartLine}<p class="lc">${A3[r.chosen]} gives away ${r.lostBB.toFixed(2)} big blinds on average.</p></div></div>${grid}`;
}
const a3=x=>x;
const A3={fold:"Folding",shove:"Shoving",call:"Calling"};
function renderPreflopReport(){
  const S=summarise(PF.T,3);btsTrack("pk_pf_report",{answered:S.decisions,score:S.score==null?-1:S.score});
  paintPreflopHeader();
  const groups=Object.entries(S.byGroup).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n);
  const ds=PF.T.decisions.filter(d=>!d.optimal),tight=ds.filter(d=>d.chosen==="fold").length,loose=ds.length-tight;
  $("app").innerHTML=`<div class="card"><div class="datechip">PRE-FLOP · ${S.decisions} HANDS</div>
    <div class="twin"><div class="tile"><div class="k">PRE-FLOP SCORE</div><div class="big">${S.score}<small>/100</small></div><div class="s">Decisions right</div></div>
      <div class="tile"><div class="k">GIVEN AWAY</div><div class="big ${PF.lost>0?"down":""}">${PF.lost.toFixed(1)}</div><div class="s">big blinds, on average</div></div></div>
    <table class="tbl" style="margin-top:10px"><tbody>${groups.map(([g,o])=>`<tr><td>${g}</td><td class="n">${o.ok} of ${o.n}</td></tr>`).join("")}</tbody></table>
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>To work on: ${S.leak.group}</b> · ${S.leak.ok} of ${S.leak.n} right.</div>`:""}
    ${ds.length>=3&&tight!==loose?`<p class="small" style="margin-top:8px">Your mistakes lean <b>${tight>loose?"too tight":"too loose"}</b>: ${tight>loose?"you fold hands worth playing. Short-stacked, the blinds are worth fighting for.":"you play hands that lose money against the Shark's range."}</p>`:""}
    <p class="small" style="margin-top:8px">Next: ranges, counting the ways the Shark can hold a hand and playing against all of them.</p>
    ${button("next","Keep going","",true)}${button("switch",PF.role==="sb"?"Switch to the big blind":"Switch to the small blind","")}</div>`;
  $("next").onclick=nextPreflop;$("switch").onclick=()=>{PF.role=PF.role==="sb"?"bb":"sb";nextPreflop()};
}
