/* ===========================================================================
   poker/sizingui.js — "Bet sizing": check or bet, and how much, on the river.

   Before you answer: the board, your hand, the pot, the Shark's type and its
   stated calling rule. Six answers: check, ⅓, ½, ¾, pot, 1½ pots. After:
   every option's value in chips, how often the Shark calls each, how often
   you win when it does, and why the best one is best. Severity from chips
   given away as a share of the pot; within 2% of the pot is right.
   =========================================================================== */
let SZ=null;
function newSizing(){SZ={T:newTrainingSession("poker-sizing"),q:null,n:0,rec:null,lost:0};btsTrack("pk_sz_start",{})}
function paintSizingHeader(){
  const T=SZ&&SZ.T,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">SIZING SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Right</div><div class="v">${ok} / ${n}</div></div>
    <div class="two"><div class="k">Chips left behind</div><div class="v">${SZ?Math.round(SZ.lost):0}</div><div class="pts">on average</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · BET SIZING</span><span></span></div>`;
}
function renderSizingIntro(){
  SZ=null;paintSizingHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · BET SIZING</div>
    <div class="mission">How much?</div>
    <p class="lede" style="margin-top:10px">You've got a good hand on the river. Bet small and the Shark calls with more hands; bet big and it calls with fewer, better ones. Find the size that wins the most.</p></div>
    <div class="card"><div class="datechip">THE SHARK'S RULE</div>
      <table class="tbl"><tbody>
        <tr><td>Facing a bet</td><td class="n">calls with its best hands</td></tr>
        <tr><td>How many, if balanced</td><td class="n">pot ÷ (pot + bet)</td></tr>
        <tr><td>A half-pot bet</td><td class="n">it calls ⅔ of its hands</td></tr>
        <tr><td>A pot-sized bet</td><td class="n">it calls ½</td></tr>
        <tr><td>Facing a check</td><td class="n">checks: a showdown</td></tr></tbody></table>
      <p class="small">A tight Shark calls less than that, a sticky one more: you'll be told which. Its hands are the ones it would have played before the flop. Each hand is scored by its value in chips, counting the pot.</p>
      ${button("go","Deal a hand","",true)}</div>`;
  $("go").onclick=()=>{newSizing();nextSizing()};
}
function nextSizing(){
  $("app").innerHTML=`<div class="card"><p class="lede">The Shark is sorting its range…</p></div>`;
  setTimeout(()=>{SZ.q=sizingQuestion();SZ.n++;SZ.rec=null;renderSizing()},20);
}
function renderSizing(){
  const q=SZ.q,done=!!SZ.rec;paintSizingHeader();
  $("app").innerHTML=`<div class="card"><div class="datechip">HAND ${SZ.n} · THE RIVER · YOUR TURN</div>
    <div class="seat"><div class="who">THE BOARD</div><div class="cards">${q.board.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="seat"><div class="who">YOUR CARDS <span class="tot">${describeHand(bestHand(q.hole.concat(q.board)))}</span></div><div class="cards">${q.hole.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="potline"><div><span>POT</span><b>${q.pot.toLocaleString("en-GB")}</b></div><div><span>THE SHARK</span><b style="font-size:18px">${q.T.name}</b></div><div><span>ITS HANDS</span><b>${q.n}</b></div></div>
    <p class="small" style="margin:6px 0 0">The Shark is ${q.T.art} player: it ${q.T.d}. Your hand beats ${Math.round(q.beats*100)}% of its range.</p></div>
    <div class="card">${done?sizingFeedback()+button("next","Next hand","",true)+(SZ.T.decisions.length>=6?button("report","Finish: your report",`${SZ.n} hands`):"")
      :`<h2>Check, or bet how much?</h2><div class="answers">${SZ_OPTS.map(o=>`<button class="ans" id="sz-${o.id}">${o.f?`${o.t} · ${Math.round(q.pot*o.f/10)*10}`:"Check"}</button>`).join("")}</div>`}</div>`;
  if(!done)SZ_OPTS.forEach(o=>$("sz-"+o.id).onclick=()=>sizingAnswer(o.id));
  else{$("next").onclick=nextSizing;const rp=$("report");if(rp)rp.onclick=renderSizingReport}
}
function sizingAnswer(id){
  const q=SZ.q,mine=q.vals.find(v=>v.id===id),lost=q.best.value-mine.value,close=lost<.02*q.pot;
  const rec=recordDecision(SZ.T,{situation:`${q.kind.t} v ${q.T.art} Shark`,group:q.kind.t,chosen:id,best:q.best.id,optimal:id===q.best.id||close,
    evChosen:mine.value/q.pot,evBest:q.best.value/q.pot,stake:q.pot,lostChips:lost});
  SZ.rec=rec;SZ.lost+=rec.optimal?0:lost;btsTrack("pk_sz_answer",{right:rec.optimal?1:0,type:q.type});renderSizing();
}
function sizingFeedback(){
  const q=SZ.q,r=SZ.rec,ch=n=>Math.round(n).toLocaleString("en-GB"),pc=x=>Math.round(x*100)+"%";
  const rows=q.vals.map(v=>`<tr${v.id===q.best.id?' style="font-weight:600"':""}><td>${v.f?`${v.t} (${v.bet})`:"Check"}${v.id===r.chosen?" ← you":""}</td>
    <td class="n">${v.f?`calls ${pc(v.callShare)}, you win ${pc(v.winWhenCalled)}`:`you win ${pc(q.beats)}`}</td><td class="n">${ch(v.value)}</td></tr>`).join("");
  const table=`<table class="tbl" style="margin-top:6px"><tbody><tr><td class="small">Option</td><td class="n small">The Shark</td><td class="n small">Worth</td></tr>${rows}</tbody></table>`;
  const b=q.best,check=q.vals[0];
  const why=b.id==="check"?`Your hand isn't strong enough to bet: the hands that call beat you too often. Check and take the showdown.`
    :b.f>=1?`Your hand is strong enough that even the hands that call a big bet mostly lose to it (you win ${pc(b.winWhenCalled)} when called): make them pay the most.`
    :`A bigger bet gets called only by hands that beat you more often; ${b.t} keeps enough worse hands calling (you win ${pc(b.winWhenCalled)} when called).`;
  const typeNote=q.type==="sticky"?" A sticky Shark calls too much: value bets get paid.":q.type==="tight"?" A tight Shark folds too much: bet smaller to keep it calling.":"";
  const gap=r.optimal?"":`<p class="lc">${SZ_OPTS.find(o=>o.id===r.chosen).t} leaves about ${ch(q.best.value-q.vals.find(v=>v.id===r.chosen).value)} chips behind on average.</p>`;
  return r.optimal?`<div class="okline">✓ <b>Right</b>: ${b.t.toLowerCase()}${r.chosen!==b.id?" is best, but yours is within a whisker":""}.</div>${table}<p class="small">${why}${typeNote}</p>`
    :`<div class="lesson sev-${r.severity}" role="alert"><div class="band">✗ ${SEVERITY.find(s=>s.id===r.severity).name.toUpperCase()} · ${b.t.toUpperCase()} WAS BEST</div><div class="lb">
      <p class="lt">${why}${typeNote}</p>${table}${gap}</div></div>`;
}
function renderSizingReport(){
  const S=summarise(SZ.T,3);btsTrack("pk_sz_report",{answered:S.decisions,score:S.score==null?-1:S.score});
  pkRecord("sizing",S);
  paintSizingHeader();
  const groups=Object.entries(S.byGroup).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n);
  const ds=SZ.T.decisions.filter(d=>!d.optimal),order=id=>SZ_OPTS.findIndex(o=>o.id===id),small=ds.filter(d=>order(d.chosen)<order(d.best)).length,big=ds.length-small;
  $("app").innerHTML=`<div class="card"><div class="datechip">BET SIZING · ${S.decisions} HANDS</div>
    <div class="twin"><div class="tile"><div class="k">SIZING SCORE</div><div class="big">${S.score}<small>/100</small></div><div class="s">Decisions right</div></div>
      <div class="tile"><div class="k">LEFT BEHIND</div><div class="big ${SZ.lost>0?"down":""}">${Math.round(SZ.lost).toLocaleString("en-GB")}</div><div class="s">chips, on average</div></div></div>
    <table class="tbl" style="margin-top:10px"><tbody>${groups.map(([g,o])=>`<tr><td>${g}</td><td class="n">${o.ok} of ${o.n}</td></tr>`).join("")}</tbody></table>
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>To work on: ${S.leak.group}</b> · ${S.leak.ok} of ${S.leak.n} right.</div>`:""}
    ${ds.length>=3&&small!==big?`<p class="small" style="margin-top:8px">Your mistakes lean <b>${small>big?"too small":"too big"}</b>: ${small>big?"with strong hands, make the Shark pay.":"with medium hands, a big bet only gets called by better ones."}</p>`:""}
    ${button("next","Keep going","",true)}</div>`;
  $("next").onclick=nextSizing;
}
