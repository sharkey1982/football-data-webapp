/* ===========================================================================
   poker/detectiveui.js — "Range detective": what does the size of the bet
   say?

   Each hand: the board, your hand, the pot, and the Shark's stated river
   strategy (which hands bet big, which bet small, how it bluffs). Then the
   bet. Two answers: what it most likely holds (counted, combo by combo),
   then call or fold (exact). The feedback adds the other size: the same
   hand facing the other bet, and whether that would change the answer.
   =========================================================================== */
let DT=null;
function newDetective(){DT={T:newTrainingSession("poker-detective"),q:null,n:0,stage:"read",read:null,rec:null,lost:0};btsTrack("pk_dt_start",{})}
function paintDetectiveHeader(){
  const T=DT&&DT.T,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">DETECTIVE SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Right</div><div class="v">${ok} / ${n}</div></div>
    <div class="two"><div class="k">Chips given away</div><div class="v">${DT?Math.round(DT.lost):0}</div><div class="pts">on average</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · RANGE DETECTIVE</span><span></span></div>`;
}
function renderDetectiveIntro(){
  DT=null;paintDetectiveHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · RANGE DETECTIVE</div>
    <div class="mission">Read the bet</div>
    <p class="lede" style="margin-top:10px">The size of a bet says which hands it can be. The Shark's river strategy is on the table: work out what this bet means, then call or fold.</p></div>
    <div class="card"><div class="datechip">THE SHARK ON THE RIVER</div>
      <table class="tbl"><tbody>
        <tr><td><b>Bets the pot</b></td><td class="n">its strongest ${Math.round(DT_BIG*100)}% + bluffs</td></tr>
        <tr><td><b>Bets a third</b></td><td class="n">the next ${Math.round(DT_SMALL*100)}% + bluffs</td></tr>
        <tr><td><b>Checks</b></td><td class="n">everything else</td></tr></tbody></table>
      <p class="small">How often it bluffs with each size is its style, and you'll be told it: some Sharks bluff big, some bluff small, some are balanced. Two answers a hand: what it most likely holds, then call or fold.</p>
      ${button("go","Deal a hand","",true)}</div>`;
  $("go").onclick=()=>{newDetective();nextDetective()};
}
function nextDetective(){
  $("app").innerHTML=`<div class="card"><p class="lede">The Shark is choosing its bet…</p></div>`;
  setTimeout(()=>{DT.q=detectiveQuestion();DT.n++;DT.stage="read";DT.read=null;DT.rec=null;renderDetective()},20);
}
function dtCountsHTML(q){const n=q.part.length;
  return`<table class="tbl" style="margin-top:6px"><tbody>${DT_GROUPS.map(g=>`<tr${q.likely.includes(g.id)?' style="font-weight:600"':""}><td>${g.t}</td><td class="n">${q.counts[g.id]} way${q.counts[g.id]===1?"":"s"} · ${Math.round(q.counts[g.id]/n*100)}%</td></tr>`).join("")}</tbody></table>`}
function renderDetective(){
  const q=DT.q;paintDetectiveHeader();
  const top=`<div class="card"><div class="datechip">HAND ${DT.n} · THE RIVER</div>
    <div class="seat"><div class="who">THE BOARD</div><div class="cards">${q.board.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="seat"><div class="who">YOUR CARDS <span class="tot">${q.kind.t}</span></div><div class="cards">${q.hole.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="outcome" style="margin:8px 0 0"><b>This Shark: ${q.ST.name.toLowerCase()}.</b> ${q.ST.d}</div>
    <div class="potline"><div><span>POT</span><b>${q.pot.toLocaleString("en-GB")}</b></div><div><span>THE SHARK BETS</span><b>${q.bet.toLocaleString("en-GB")}</b></div><div><span>SIZE</span><b style="font-size:18px">${q.size==="big"?"Big":"Small"}</b></div></div>
    <p class="small" style="margin:6px 0 0">The Shark bets ${DT_SIZES[q.size].t}: ${q.size==="big"?`its strongest ${Math.round(DT_BIG*100)}% of hands`:`its next ${Math.round(DT_SMALL*100)}%, the medium hands`}, and its ${q.size} bluffs.</p></div>`;
  let body;
  if(DT.stage==="read")body=`<h2>What is it most likely to hold?</h2><div class="answers">${DT_GROUPS.map(g=>`<button class="ans" id="dt-${g.id}">${g.t}</button>`).join("")}</div>`;
  else if(DT.stage==="call")body=dtReadFeedback()+`<div class="datechip" style="margin:12px 0 6px">SO</div><h2>Call ${q.bet.toLocaleString("en-GB")}?</h2>
    <div class="answers"><button class="ans big fold" id="dt-fold">Fold</button><button class="ans big call" id="dt-call">Call</button></div>`;
  else body=dtReadFeedback()+dtCallFeedback()+button("next","Next hand","",true)+(DT.n>=4?button("report","Finish: your report",`${DT.n} hands`):"");
  $("app").innerHTML=top+`<div class="card">${body}</div>`;
  if(DT.stage==="read")DT_GROUPS.forEach(g=>$("dt-"+g.id).onclick=()=>detectiveRead(g.id));
  else if(DT.stage==="call"){$("dt-fold").onclick=()=>detectiveCall("fold");$("dt-call").onclick=()=>detectiveCall("call")}
  else{$("next").onclick=nextDetective;const rp=$("report");if(rp)rp.onclick=renderDetectiveReport}
}
function detectiveRead(id){
  const q=DT.q,ok=q.likely.includes(id);
  DT.read=recordDecision(DT.T,{situation:`read a ${q.size} bet`,group:"Reading the bet",chosen:id,best:q.likely[0],optimal:ok,stake:1});
  DT.stage="call";btsTrack("pk_dt_read",{right:ok?1:0});renderDetective();
}
function dtReadFeedback(){
  const q=DT.q,r=DT.read,g=DT_GROUPS.find(x=>x.id===q.likely[0]).t;
  return r.optimal?`<div class="okline">✓ <b>Right</b>: ${g.toLowerCase()} is likeliest.</div>${dtCountsHTML(q)}`
    :`<div class="lesson sev-mistake" role="alert"><div class="band">✗ ${g.toUpperCase()} IS LIKELIEST</div><div class="lb"><p class="lt">Count the hands that bet ${q.size==="big"?"big":"small"}:</p>${dtCountsHTML(q)}</div></div>`;
}
function detectiveCall(a){
  const q=DT.q,loss=a===q.answer?0:Math.abs(q.ev);
  DT.rec=recordDecision(DT.T,{situation:`${q.kind.t} v a ${q.size} bet (${q.ST.name.toLowerCase()})`,group:`Facing a ${q.size} bet`,chosen:a,best:q.answer,optimal:a===q.answer||q.close,
    evChosen:a==="call"?q.ev/q.bet:0,evBest:Math.max(q.ev,0)/q.bet,stake:q.bet});
  DT.lost+=DT.rec.optimal?0:loss;DT.stage="done";btsTrack("pk_dt_call",{right:DT.rec.optimal?1:0,size:q.size,style:q.style});renderDetective();
}
function dtCallFeedback(){
  const q=DT.q,r=DT.rec,pc=x=>Math.round(x*100)+"%",chips=n=>Math.round(Math.abs(n)).toLocaleString("en-GB"),sg=n=>(n>=0?"+":"−")+chips(n);
  const table=`<table class="tbl" style="margin-top:6px"><tbody>
    <tr><td>Your hand beats</td><td class="n"><b>${pc(q.beatShare)}</b> of these hands</td></tr>
    <tr><td>The price needs</td><td class="n">${pc(q.need)}</td></tr>
    <tr><td>A call is worth, on average</td><td class="n" style="color:${q.ev>0?"var(--good)":"var(--bad)"}">${sg(q.ev)} chips</td></tr></tbody></table>`;
  const contrast=`<p class="small"><b>Had it bet ${q.other==="big"?"big":"small"}</b> (${q.obet.toLocaleString("en-GB")}): calling would be worth ${sg(q.evOther)} chips, so <b>${q.evOther>0?"call":"fold"}</b>${q.otherAnswer!==q.answer?": the same hand, the opposite answer. The size told you which.":" there too."}</p>`;
  const why=q.close?`It's balanced at this size: calling and folding are worth the same.`:q.answer==="call"?`You beat ${pc(q.beatShare)} of the hands that bet like this: more than the ${pc(q.need)} the price needs.`
    :`You beat only ${pc(q.beatShare)} of the hands that bet like this: short of the ${pc(q.need)} the price needs.`;
  return r.optimal?`<div class="okline" style="margin-top:10px">✓ <b>Right</b>: ${q.close?"either":q.answer}.</div>${table}<p class="small">${why}</p>${contrast}`
    :`<div class="lesson sev-${r.severity}" role="alert" style="margin-top:10px"><div class="band">✗ ${SEVERITY.find(s=>s.id===r.severity).name.toUpperCase()} · ${q.answer.toUpperCase()} WAS RIGHT</div><div class="lb">
      <p class="lt">${why}</p>${table}<p class="lc">${r.chosen==="call"?"Calling":"Folding"} gives away about ${chips(q.ev)} chips on average.</p></div></div>${contrast}`;
}
function renderDetectiveReport(){
  const S=summarise(DT.T,3);btsTrack("pk_dt_report",{answered:S.decisions,score:S.score==null?-1:S.score});
  pkRecord("detective",S);
  paintDetectiveHeader();
  const groups=Object.entries(S.byGroup).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n);
  $("app").innerHTML=`<div class="card"><div class="datechip">RANGE DETECTIVE · ${DT.n} HANDS</div>
    <div class="twin"><div class="tile"><div class="k">DETECTIVE SCORE</div><div class="big">${S.score}<small>/100</small></div><div class="s">Answers right</div></div>
      <div class="tile"><div class="k">CHIPS GIVEN AWAY</div><div class="big ${DT.lost>0?"down":""}">${Math.round(DT.lost).toLocaleString("en-GB")}</div><div class="s">on average</div></div></div>
    <table class="tbl" style="margin-top:10px"><tbody>${groups.map(([g,o])=>`<tr><td>${g}</td><td class="n">${o.ok} of ${o.n}</td></tr>`).join("")}</tbody></table>
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>To work on: ${S.leak.group}</b> · ${S.leak.ok} of ${S.leak.n} right.</div>`:""}
    ${button("next","Keep going","",true)}</div>`;
  $("next").onclick=nextDetective;
}
