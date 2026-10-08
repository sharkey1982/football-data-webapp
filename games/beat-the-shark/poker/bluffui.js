/* ===========================================================================
   poker/bluffui.js — "Bluff or value?": catch the bluff on the river.

   Before you answer: the board, your hand, the pot and the bet, and the
   Shark's betting range by part (value, same hand, bluffs) with how many
   ways of each. The Shark's type is hidden. After: the bluffs' share
   against what the price needs, what a call is worth, the Shark's type,
   and what a balanced Shark would have bluffed at this size.
   Severity from chips given away as a share of the call (as Pot odds).
   =========================================================================== */
let BL=null;
const BL_CLASS={value:"Value",ties:"Same hand (split)",bluff:"Bluffs"};
function newBluff(){BL={T:newTrainingSession("poker-bluff"),q:null,n:0,rec:null,lost:0};btsTrack("pk_bl_start",{})}
function paintBluffHeader(){
  const T=BL&&BL.T,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">BLUFF SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Right</div><div class="v">${ok} / ${n}</div></div>
    <div class="two"><div class="k">Chips given away</div><div class="v">${BL?Math.round(BL.lost):0}</div><div class="pts">on average</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · BLUFF OR VALUE?</span><span></span></div>`;
}
function renderBluffIntro(){
  BL=null;paintBluffHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · BLUFF OR VALUE?</div>
    <div class="mission">Catch the bluff</div>
    <p class="lede" style="margin-top:10px">The river's out and the Shark bets. Your hand beats its bluffs and loses to its value hands. Its range is on the table: are there enough bluffs to call?</p></div>
    <div class="card"><div class="datechip">THE SUM</div>
      <table class="tbl"><tbody>
        <tr><td>Pot 600, the Shark bets 300</td><td class="n">you call 300</td></tr>
        <tr><td>Bluffs you need: 300 ÷ (600 + 300 + 300)</td><td class="n">25% of its bets</td></tr>
        <tr><td>Its range: 90 value, 30 bluffs</td><td class="n">25%: break even</td></tr></tbody></table>
      <p class="small">A <b>balanced</b> Shark bluffs exactly that much, so your call breaks even whatever you do. Some Sharks bluff less, some more, and you won't be told which: count the range. Only hands it would have played before the flop are in it.</p>
      ${button("go","Deal a hand","",true)}</div>`;
  $("go").onclick=()=>{newBluff();nextBluff()};
}
function nextBluff(){
  $("app").innerHTML=`<div class="card"><p class="lede">The Shark is building its range…</p></div>`;
  setTimeout(()=>{BL.q=bluffQuestion();BL.n++;BL.rec=null;renderBluff()},20);
}
function blRangeHTML(q){
  return`<table class="tbl" style="margin-top:4px"><tbody>${blBreakdown(q).filter(b=>b.k!=="ties"||b.n).map(b=>`<tr><td><b>${BL_CLASS[b.k]}</b> · ${b.n} way${b.n===1?"":"s"}<div class="small" style="margin:1px 0 0">${b.n?b.parts.map(([l,n])=>`${l} ${n}`).join(" · "):"none"}</div></td>
    <td class="n">${Math.round(b.n/q.n*100)}%</td></tr>`).join("")}</tbody></table>`;
}
function renderBluff(){
  const q=BL.q,done=!!BL.rec;paintBluffHeader();
  $("app").innerHTML=`<div class="card"><div class="datechip">HAND ${BL.n} · THE RIVER · THE SHARK BETS ${q.betText.toUpperCase()}</div>
    <div class="seat"><div class="who">THE BOARD</div><div class="cards">${q.board.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="seat"><div class="who">YOUR CARDS <span class="tot">${q.kind.t}</span></div><div class="cards">${q.hole.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="potline"><div><span>POT</span><b>${q.pot.toLocaleString("en-GB")}</b></div><div><span>THE SHARK BETS</span><b>${q.bet.toLocaleString("en-GB")}</b></div><div><span>TO CALL</span><b>${q.bet.toLocaleString("en-GB")}</b></div></div>
    <div class="datechip" style="margin:12px 0 2px">THE SHARK'S BETTING RANGE${done?` · ${q.T.name.toUpperCase()}`:""}</div>${blRangeHTML(q)}</div>
    <div class="card">${done?bluffFeedback()+button("next","Next hand","",true)+(BL.T.decisions.length>=6?button("report","Finish: your report",`${BL.n} hands`):"")
      :`<div class="answers"><button class="ans big fold" id="bl-fold">Fold</button><button class="ans big call" id="bl-call">Call</button></div>`}</div>`;
  if(!done){$("bl-fold").onclick=()=>bluffAnswer("fold");$("bl-call").onclick=()=>bluffAnswer("call")}
  else{$("next").onclick=nextBluff;const rp=$("report");if(rp)rp.onclick=renderBluffReport}
}
function bluffAnswer(a){
  const q=BL.q,lossChips=a===q.answer?0:Math.abs(q.ev);
  const rec=recordDecision(BL.T,{situation:`${q.kind.t}, ${q.betText}`,group:`v ${q.T.art} Shark`,
    chosen:a,best:q.answer,optimal:a===q.answer||q.close,evChosen:a==="call"?q.ev/q.bet:0,evBest:Math.max(q.ev,0)/q.bet,stake:q.bet});
  BL.rec=rec;BL.lost+=rec.optimal?0:lossChips;
  btsTrack("pk_bl_answer",{right:rec.optimal?1:0,type:q.type});renderBluff();
}
function bluffFeedback(){
  const q=BL.q,r=BL.rec,pc=x=>(Math.round(x*1000)/10).toFixed(1)+"%",chips=n=>Math.round(Math.abs(n)).toLocaleString("en-GB");
  const balancedBluffs=Math.round(blBreakEven(q.range.value.length,q.range.ties.length,q.pot,q.bet));
  const table=`<table class="tbl" style="margin-top:6px"><tbody>
    <tr><td>Bluffs in its range</td><td class="n"><b>${pc(q.bluffShare)}</b></td></tr>
    <tr><td>The price: ${q.bet.toLocaleString("en-GB")} ÷ (${q.pot.toLocaleString("en-GB")} + ${q.bet.toLocaleString("en-GB")} + ${q.bet.toLocaleString("en-GB")})</td><td class="n">need ${pc(q.need)}</td></tr>
    <tr><td>A call is worth, on average</td><td class="n" style="color:${q.ev>0?"var(--good)":"var(--bad)"}">${q.ev>=0?"+":"−"}${chips(q.ev)} chips</td></tr></tbody></table>`;
  const who=`This was <b>${q.T.art}</b> Shark: it ${q.T.d}. A balanced Shark would bluff ${balancedBluffs} times at this size, ${balancedBluffs===q.range.bluff.length?"exactly this":balancedBluffs>q.range.bluff.length?`${balancedBluffs-q.range.bluff.length} more than this`:`${q.range.bluff.length-balancedBluffs} fewer than this`}.`;
  const why=q.close?`The bluffs are almost exactly what the price needs: calling and folding are worth the same. That's what balanced means: it leaves you nothing to win by guessing.`
    :q.answer==="call"?`${pc(q.bluffShare)} bluffs is more than the ${pc(q.need)} the price needs: call, and the bluffs you catch pay for the value hands you pay off.`
    :`${pc(q.bluffShare)} bluffs is short of the ${pc(q.need)} the price needs: fold, even though you'll sometimes be folding the best hand.`;
  return r.optimal?`<div class="okline">✓ <b>Right</b>: ${q.close?"either is fine":q.answer}.</div>${table}<p class="small">${why}</p><p class="small">${who}</p>`
    :`<div class="lesson sev-${r.severity}" role="alert"><div class="band">✗ ${SEVERITY.find(s=>s.id===r.severity).name.toUpperCase()} · ${q.answer.toUpperCase()} WAS RIGHT</div><div class="lb">
      <p class="lt">${why}</p>${table}<p class="lc">${r.chosen==="call"?"Calling":"Folding"} gives away about ${chips(q.ev)} chips on average here.</p></div></div><p class="small">${who}</p>`;
}
function renderBluffReport(){
  const S=summarise(BL.T,3);btsTrack("pk_bl_report",{answered:S.decisions,score:S.score==null?-1:S.score});
  pkRecord("bluff",S);
  paintBluffHeader();
  const groups=Object.entries(S.byGroup).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n);
  const ds=BL.T.decisions.filter(d=>!d.optimal),tight=ds.filter(d=>d.chosen==="fold").length,loose=ds.length-tight;
  $("app").innerHTML=`<div class="card"><div class="datechip">BLUFF OR VALUE? · ${S.decisions} HANDS</div>
    <div class="twin"><div class="tile"><div class="k">BLUFF SCORE</div><div class="big">${S.score}<small>/100</small></div><div class="s">Decisions right</div></div>
      <div class="tile"><div class="k">CHIPS GIVEN AWAY</div><div class="big ${BL.lost>0?"down":""}">${Math.round(BL.lost).toLocaleString("en-GB")}</div><div class="s">on average</div></div></div>
    <table class="tbl" style="margin-top:10px"><tbody>${groups.map(([g,o])=>`<tr><td>${g}</td><td class="n">${o.ok} of ${o.n}</td></tr>`).join("")}</tbody></table>
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>To work on: ${S.leak.group}</b> · ${S.leak.ok} of ${S.leak.n} right.</div>`:""}
    ${ds.length>=3&&tight!==loose?`<p class="small" style="margin-top:8px">Your mistakes lean <b>${tight>loose?"too tight":"too loose"}</b>: ${tight>loose?"you fold when the Shark bluffs enough.":"you pay off a Shark that doesn't bluff enough."}</p>`:""}
    ${button("next","Keep going","",true)}</div>`;
  $("next").onclick=nextBluff;
}
