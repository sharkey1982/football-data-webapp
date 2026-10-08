/* ===========================================================================
   poker/postflopui.js — "Post-flop": the Shark goes all in; its range is
   on the table; call or fold.

   Before you answer: the board, your hand, the pot and the bet, and the
   Shark's range by part (value, draws, bluffs) with how many ways of each.
   After: your equity against each part and the whole, what the price needs,
   what a call is worth in chips, and why. Severity from chips given away as
   a share of the call (as Pot odds); within 2 points of the price either
   answer is right.
   =========================================================================== */
let PO2=null;
function newPostflop(){PO2={T:newTrainingSession("poker-postflop"),q:null,n:0,rec:null,lost:0};btsTrack("pk_po_start",{})}
function paintPostflopHeader(){
  const T=PO2&&PO2.T,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">POST-FLOP SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Right</div><div class="v">${ok} / ${n}</div></div>
    <div class="two"><div class="k">Chips given away</div><div class="v">${PO2?Math.round(PO2.lost):0}</div><div class="pts">on average</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · POST-FLOP</span><span></span></div>`;
}
function renderPostflopIntro(){
  PO2=null;paintPostflopHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · POST-FLOP</div>
    <div class="mission">Call or fold against a range</div>
    <p class="lede" style="margin-top:10px">The Shark goes all in after the flop. You can't see its hand, but you can see its <b>range</b>: every hand it bets like this, and how many ways it can hold each. Your equity against all of them decides the call.</p></div>
    <div class="card"><div class="datechip">THE SHARK'S RANGE</div>
      <table class="tbl"><tbody>
        <tr><td><b>Value</b></td><td class="n">top pair or better</td></tr>
        <tr><td><b>Draws</b></td><td class="n">flush and straight draws</td></tr>
        <tr><td><b>Bluffs</b></td><td class="n">nothing at all</td></tr></tbody></table>
      <p class="small">Three kinds of Shark: honest (value and some draws), balanced (a few bluffs too) and aggressive (lots of bluffs). Only hands it would have played before the flop count, about half of all hands. It's all in, so this is the last decision: call when your equity beats the price, as in Pot odds.</p>
      ${button("go","Deal a hand","",true)}</div>`;
  $("go").onclick=()=>{newPostflop();nextPostflop()};
}
function nextPostflop(){
  $("app").innerHTML=`<div class="card"><p class="lede">The Shark is building its range…</p></div>`;
  setTimeout(()=>{PO2.q=postflopQuestion();PO2.n++;PO2.rec=null;renderPostflop()},20);
}
function poRangeHTML(q,shown){
  const pc=x=>x==null?"—":Math.round(x*100)+"%";
  return`<table class="tbl" style="margin-top:4px"><tbody>${poBreakdown(q).map(b=>`<tr><td><b>${PO_CLASS[b.k]}</b> · ${b.n} way${b.n===1?"":"s"}<div class="small" style="margin:1px 0 0">${b.n?b.parts.map(([l,n])=>`${l} ${n}`).join(" · "):"none"}</div></td>
    <td class="n">${Math.round(b.n/q.n*100)}%${shown?`<div class="small" style="margin:1px 0 0">you ${pc(q.eq[b.k])}</div>`:""}</td></tr>`).join("")}</tbody></table>`;
}
function renderPostflop(){
  const q=PO2.q,done=!!PO2.rec;paintPostflopHeader();
  $("app").innerHTML=`<div class="card"><div class="datechip">HAND ${PO2.n} · ON THE ${q.street.toUpperCase()} · THE SHARK IS ALL IN</div>
    <div class="seat"><div class="who">THE BOARD</div><div class="cards">${q.board.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="seat"><div class="who">YOUR CARDS <span class="tot">${q.kind.t}</span></div><div class="cards">${q.hole.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="potline"><div><span>POT</span><b>${q.pot.toLocaleString("en-GB")}</b></div><div><span>THE SHARK BETS</span><b>${q.bet.toLocaleString("en-GB")}</b></div><div><span>TO CALL</span><b>${q.bet.toLocaleString("en-GB")}</b></div></div>
    <div class="datechip" style="margin:12px 0 2px">THE SHARK'S RANGE · ${q.T.name.toUpperCase()}: ${q.T.d.toUpperCase()}</div>${poRangeHTML(q,done)}</div>
    <div class="card">${done?postflopFeedback()+button("next","Next hand","",true)+(PO2.T.decisions.length>=6?button("report","Finish: your report",`${PO2.n} hands`):"")
      :`<div class="answers"><button class="ans big fold" id="po-fold">Fold</button><button class="ans big call" id="po-call">Call</button></div>`}</div>`;
  if(!done){$("po-fold").onclick=()=>postflopAnswer("fold");$("po-call").onclick=()=>postflopAnswer("call")}
  else{$("next").onclick=nextPostflop;const rp=$("report");if(rp)rp.onclick=renderPostflopReport}
}
function postflopAnswer(a){
  const q=PO2.q,lossChips=a===q.answer?0:Math.abs(q.ev);
  const rec=recordDecision(PO2.T,{situation:`${q.kind.t} v ${q.T.name.toLowerCase()} Shark`,group:`v the ${q.T.name.toLowerCase()} Shark`,
    chosen:a,best:q.answer,optimal:a===q.answer||q.close,evChosen:a==="call"?q.ev/q.bet:0,evBest:Math.max(q.ev,0)/q.bet,stake:q.bet,hand:q.kind.k});
  PO2.rec=rec;PO2.lost+=rec.optimal?0:lossChips;
  btsTrack("pk_po_answer",{right:rec.optimal?1:0,type:q.type});renderPostflop();
}
function postflopFeedback(){
  const q=PO2.q,r=PO2.rec,pc=x=>(Math.round(x*1000)/10).toFixed(1)+"%",chips=n=>Math.round(Math.abs(n)).toLocaleString("en-GB");
  const nonValue=(q.range.draw.length+q.range.bluff.length)/q.n;
  const table=`<table class="tbl" style="margin-top:6px"><tbody>
    <tr><td><b>Your equity against the whole range</b></td><td class="n"><b>${pc(q.eq.all)}</b></td></tr>
    <tr><td>The price: ${q.bet.toLocaleString("en-GB")} to win ${(q.pot+q.bet).toLocaleString("en-GB")}</td><td class="n">need ${pc(q.need)}</td></tr>
    <tr><td>A call is worth, on average</td><td class="n" style="color:${q.ev>0?"var(--good)":"var(--bad)"}">${q.ev>0?"+":"−"}${chips(q.ev)} chips</td></tr></tbody></table>`;
  const vs=`against its value hands you have ${pc(q.eq.value)}`,db=q.range.bluff.length?"draws and bluffs":"draws";
  const why=q.answer==="call"?(q.eq.value<q.need?`You're behind its value hands (${vs}), but ${Math.round(nonValue*100)}% of the range is ${db}, and you do well enough against those to call.`:`Even ${vs}: enough to call on its own.`)
    :(nonValue<.25?`Almost all of this range is value (${vs}): there aren't enough ${db} to pay for the call.`:`The ${db} (${Math.round(nonValue*100)}% of the range) help, but not enough: ${vs}.`);
  const typeNote=q.type==="honest"?" An honest Shark doesn't bluff: believe the bet.":q.type==="aggressive"?" An aggressive Shark bluffs a lot: catch it with hands that beat the bluffs.":"";
  return r.optimal?`<div class="okline">✓ <b>Right</b>: ${q.answer}.${q.close?" A close one: either is fine.":""}</div>${table}<p class="small">${why}${typeNote}</p>`
    :`<div class="lesson sev-${r.severity}" role="alert"><div class="band">✗ ${SEVERITY.find(s=>s.id===r.severity).name.toUpperCase()} · ${q.answer.toUpperCase()} WAS RIGHT</div><div class="lb">
      <p class="lt">${why}${typeNote}</p>${table}<p class="lc">${r.chosen==="call"?"Calling":"Folding"} gives away about ${chips(q.ev)} chips on average here.</p></div></div>`;
}
function renderPostflopReport(){
  const S=summarise(PO2.T,3);btsTrack("pk_po_report",{answered:S.decisions,score:S.score==null?-1:S.score});
  pkRecord("postflop",S);
  paintPostflopHeader();
  const groups=Object.entries(S.byGroup).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n);
  const ds=PO2.T.decisions.filter(d=>!d.optimal),tight=ds.filter(d=>d.chosen==="fold").length,loose=ds.length-tight;
  $("app").innerHTML=`<div class="card"><div class="datechip">POST-FLOP · ${S.decisions} HANDS</div>
    <div class="twin"><div class="tile"><div class="k">POST-FLOP SCORE</div><div class="big">${S.score}<small>/100</small></div><div class="s">Decisions right</div></div>
      <div class="tile"><div class="k">CHIPS GIVEN AWAY</div><div class="big ${PO2.lost>0?"down":""}">${Math.round(PO2.lost).toLocaleString("en-GB")}</div><div class="s">on average</div></div></div>
    <table class="tbl" style="margin-top:10px"><tbody>${groups.map(([g,o])=>`<tr><td>${g}</td><td class="n">${o.ok} of ${o.n}</td></tr>`).join("")}</tbody></table>
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>To work on: ${S.leak.group}</b> · ${S.leak.ok} of ${S.leak.n} right.</div>`:""}
    ${ds.length>=3&&tight!==loose?`<p class="small" style="margin-top:8px">Your mistakes lean <b>${tight>loose?"too tight":"too loose"}</b>: ${tight>loose?"you fold to bets the range can't back up.":"you pay off ranges that are mostly value."}</p>`:""}
    ${button("next","Keep going","",true)}</div>`;
  $("next").onclick=nextPostflop;
}
