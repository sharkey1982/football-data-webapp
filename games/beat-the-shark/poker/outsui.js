/* ===========================================================================
   poker/outsui.js — "Outs & draws": count your outs, then the chance of
   making your hand by the river.

   Two answers per draw, each judged at once (tick when right, red band when
   wrong): the outs, shown afterwards as the actual cards; and the chance,
   shown three ways: the rule of 4 and 2, the outs counted exactly, and the
   exact chance over every card still to come.
   =========================================================================== */
let O=null;
function stepperHTML(id,label){
  return`<div class="stepper"><span class="sl">${label}</span><button class="sb" id="${id}-m" aria-label="minus one">−</button>
    <output id="${id}-v" class="sv">0</output><button class="sb" id="${id}-p" aria-label="plus one">+</button></div>`;
}
function newOuts(){O={T:newTrainingSession("poker-outs"),q:null,stage:"outs",n:0,streak:0,bestStreak:0,opts:null,ans:null};btsTrack("pk_outs_start",{})}
function paintOutsHeader(){
  const T=O&&O.T,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">OUTS SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Right</div><div class="v">${ok} / ${n}</div></div>
    <div class="two"><div class="k">Streak</div><div class="v">${O?O.streak:0}</div><div class="pts">best ${O?O.bestStreak:0}</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · OUTS & DRAWS</span><span></span></div>`;
}
function renderOutsIntro(){
  paintOutsHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · OUTS & DRAWS</div>
    <div class="mission">What are you drawing to?</div>
    <p class="lede" style="margin-top:10px">An <b>out</b> is a card still to come that makes your hand. Count them, and you know your chance.</p></div>
    <div class="card"><div class="datechip">THE RULE OF 4 AND 2</div>
      <table class="tbl"><tbody>
        <tr><td>On the flop (two cards to come)</td><td class="n">outs × 4</td></tr>
        <tr><td>On the turn (one card to come)</td><td class="n">outs × 2</td></tr>
        <tr><td>A flush draw on the flop: 9 outs</td><td class="n">about 36%</td></tr></tbody></table>
      <p class="small">Each draw asks two things: how many outs, then the chance of hitting by the river. The answers show the actual out cards, the rule of thumb and the exact chance.</p>
      ${button("go","Deal a draw","",true)}</div>`;
  $("go").onclick=()=>{newOuts();nextDraw()};
}
function nextDraw(){O.q=outsQuestion();O.stage="outs";O.n++;O.ans=null;O.opts=chanceOptions(O.q);renderDraw()}
function miniCards(cs){return`<div class="minis">${cs.map(c=>pkCardHTML(c,"mini")).join("")}</div>`}
function renderDraw(){
  const q=O.q;paintOutsHeader();
  let body="";
  if(O.stage==="outs"){
    let v=0;
    body=`${stepperHTML("ov","Outs")}${button("check","Check","",true)}`;
    $("app").innerHTML=drawFrame(q)+`<div class="card">${body}</div>`;
    const paint=()=>{$("ov-v").textContent=v};$("ov-m").onclick=()=>{v=Math.max(0,v-1);paint()};$("ov-p").onclick=()=>{v=Math.min(25,v+1);paint()};paint();
    $("check").onclick=()=>answerOuts(v);return;
  }
  if(O.stage==="chance"){
    $("app").innerHTML=drawFrame(q)+`<div class="card">${outsFeedback()}
      <div class="datechip" style="margin:12px 0 6px">THE CHANCE</div><h2>Chance of making it by the river?</h2>
      <p class="small">${q.toCome===2?"Two cards to come (turn and river).":"One card to come (the river)."}</p>
      <div class="answers">${O.opts.map((o,i)=>`<button class="ans" id="o-${i}">${o.v}%</button>`).join("")}</div></div>`;
    O.opts.forEach((o,i)=>$("o-"+i).onclick=()=>answerChance(i));return;
  }
  $("app").innerHTML=drawFrame(q)+`<div class="card">${outsFeedback()}${chanceFeedback()}
    ${button("next","Next draw","",true)}${O.T.decisions.length>=6?button("report","Finish: your report",`${O.n} draws`):""}</div>`;
  $("next").onclick=nextDraw;const rp=$("report");if(rp&&O.T.decisions.length>=6)rp.onclick=renderOutsReport;
}
function drawFrame(q){
  return`<div class="card"><div class="datechip">DRAW ${O.n} · ON THE ${q.street.toUpperCase()}</div>
    <div class="seat"><div class="who">THE BOARD</div><div class="cards">${q.board.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="seat"><div class="who">YOUR CARDS <span class="tot">${describeHand(bestHand(q.hole.concat(q.board)))}</span></div><div class="cards">${q.hole.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="goal">Drawing to <b>${q.draw.goal}</b></div></div>`;
}
function answerOuts(v){
  const q=O.q,right=q.outs.length;
  const rec=recordDecision(O.T,{situation:q.draw.name,group:q.draw.name,chosen:v,best:right,stake:1});
  O.outsRec=rec;tally(rec);O.stage="chance";btsTrack("pk_outs_answer",{right:rec.optimal?1:0,kind:q.kind});renderDraw();
}
function answerChance(i){
  const o=O.opts[i],q=O.q,right=O.opts.find(x=>x.right).v;
  const rec=recordDecision(O.T,{situation:"chance",group:q.toCome===2?"Chance on the flop":"Chance on the turn",chosen:o.v,best:right,stake:1});
  O.chanceRec=rec;tally(rec);O.stage="done";renderDraw();
}
function tally(rec){if(rec.optimal){O.streak++;O.bestStreak=Math.max(O.bestStreak,O.streak)}else O.streak=0}
function outsFeedback(){
  const q=O.q,r=O.outsRec,n=q.outs.length;
  const cards=miniCards(q.outs);
  return r.optimal?`<div class="okline">✓ <b>Right</b>: ${n} outs. <span class="small">${DRAW_WHY[q.kind]}</span></div>${cards}`
    :`<div class="lesson sev-mistake" role="alert"><div class="band">✗ ${n} OUTS, NOT ${r.chosen}</div><div class="lb">
      <p class="lt"><b>${q.draw.name}.</b> ${DRAW_WHY[q.kind]}</p><p class="small" style="margin:0">The outs:</p>${cards}</div></div>`;
}
function chanceFeedback(){
  const q=O.q,r=O.chanceRec,pc=x=>Math.round(x*100)+"%";
  const table=`<table class="tbl" style="margin-top:6px"><tbody>
    <tr><td>Rule of ${q.toCome===2?"4":"2"}: ${q.outs.length} × ${q.toCome===2?4:2}</td><td class="n">${pc(q.thumb)}</td></tr>
    <tr><td>From the ${q.outs.length} outs, exactly</td><td class="n">${pc(q.fromOuts)}</td></tr>
    <tr><td><b>Exact${q.toCome===2?", including two-card runouts":""}</b></td><td class="n"><b>${pc(q.exact)}</b></td></tr></tbody></table>`;
  const note=q.toCome===2&&Math.round(q.exact*100)>Math.round(q.fromOuts*100)?`<p class="small">The exact chance is a little higher: with two cards to come, some pairs of cards make the hand together (a "runner-runner").</p>`:"";
  return r.optimal?`<div class="okline" style="margin-top:10px">✓ <b>Right</b>: about ${pc(q.exact)}.</div>${table}${note}`
    :`<div class="lesson sev-mistake" role="alert" style="margin-top:10px"><div class="band">✗ ABOUT ${pc(q.exact)}, NOT ${r.chosen}%</div><div class="lb">${table}${note}</div></div>`;
}
function renderOutsReport(){
  pkMarkDone("outs");
  const S=summarise(O.T,3);btsTrack("pk_outs_report",{answered:S.decisions,score:S.score==null?-1:S.score});
  const groups=Object.entries(S.byGroup).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n);
  paintOutsHeader();
  $("app").innerHTML=`<div class="card"><div class="datechip">OUTS & DRAWS · ${O.n} DRAWS</div>
    <div class="twin"><div class="tile"><div class="k">OUTS SCORE</div><div class="big">${S.score}<small>/100</small></div><div class="s">Answers right</div></div>
      <div class="tile"><div class="k">BEST STREAK</div><div class="big">${O.bestStreak}</div><div class="s">in a row</div></div></div>
    <div class="datechip" style="margin-top:12px">BY QUESTION</div>
    <table class="tbl"><tbody>${groups.map(([g,o])=>`<tr><td>${g}</td><td class="n">${o.ok} of ${o.n}</td></tr>`).join("")}</tbody></table>
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>To work on: ${S.leak.group}</b> · ${S.leak.ok} of ${S.leak.n} right.</div>`:""}
    <p class="small" style="margin-top:8px">Next in the poker trainers: pot odds, where the chance of hitting meets the price of calling.</p>
    ${button("next","Keep going","",true)}</div>`;
  $("next").onclick=nextDraw;
}
