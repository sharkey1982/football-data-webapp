/* ===========================================================================
   poker/potui.js — "Pot odds": call or fold with a draw, at a price.

   Call or fold, judged at once against the value of calling. The answer
   shows the price (the equity you need), your chance (rule of thumb and
   exact), and what the call is worth in chips on average, whether or not
   the card then comes. Severity from the chips a wrong decision gives away,
   as a share of the call (shared/training.js), so a close call wrongly made
   is a small mistake and a bad price is a major one.
   =========================================================================== */
let PO=null;
function newPot(){PO={T:newTrainingSession("poker-pot"),q:null,n:0,streak:0,bestStreak:0,rec:null,lost:0};btsTrack("pk_pot_start",{})}
function paintPotHeader(){
  const T=PO&&PO.T,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">POT ODDS SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Right</div><div class="v">${ok} / ${n}</div></div>
    <div class="two"><div class="k">Chips given away</div><div class="v">${PO?Math.round(PO.lost):0}</div><div class="pts">on average</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · POT ODDS</span><span></span></div>`;
}
function renderPotIntro(){
  paintPotHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · POT ODDS</div>
    <div class="mission">Is the price right?</div>
    <p class="lede" style="margin-top:10px">You're drawing. The Shark bets. Calling is right when your chance of winning beats the share of the final pot you're putting in.</p></div>
    <div class="card"><div class="datechip">THE SUM</div>
      <table class="tbl"><tbody>
        <tr><td>Pot 600, the Shark bets 300</td><td class="n">you call 300</td></tr>
        <tr><td>The pot you'd win</td><td class="n">600 + 300 + 300 = 1,200</td></tr>
        <tr><td>The equity you need</td><td class="n">300 ÷ 1,200 = 25%</td></tr></tbody></table>
      <p class="small">Then compare it with your chance from your outs. Here the Shark always has the better hand now, so you win if your draw comes in and lose if it doesn't. On the flop the Shark is all in, so one call sees both cards.</p>
      ${button("go","Deal a hand","",true)}</div>`;
  $("go").onclick=()=>{newPot();nextPot()};
}
function nextPot(){PO.q=potQuestion();PO.n++;PO.rec=null;renderPot()}
function renderPot(){
  const q=PO.q,done=!!PO.rec;paintPotHeader();
  $("app").innerHTML=`<div class="card"><div class="datechip">HAND ${PO.n} · ON THE ${q.street.toUpperCase()}${q.street==="flop"?" · THE SHARK IS ALL IN":""}</div>
    <div class="seat"><div class="who">THE BOARD</div><div class="cards">${q.board.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="seat"><div class="who">YOUR CARDS <span class="tot">${q.draw.name}</span></div><div class="cards">${q.hole.map(c=>pkCardHTML(c)).join("")}</div></div>
    <div class="potline"><div><span>POT</span><b>${q.pot.toLocaleString("en-GB")}</b></div><div><span>THE SHARK BETS</span><b>${q.bet.toLocaleString("en-GB")}</b></div><div><span>TO CALL</span><b>${q.bet.toLocaleString("en-GB")}</b></div></div>
    <p class="small" style="margin:6px 0 0">The Shark bets ${q.betText}. You're drawing to ${q.draw.goal}.</p></div>
    <div class="card">${done?potFeedback()+button("next","Next hand","",true)+(PO.T.decisions.length>=6?button("report","Finish: your report",`${PO.n} hands`):"")
      :`<div class="answers"><button class="ans big fold" id="p-fold">Fold</button><button class="ans big call" id="p-call">Call</button></div>`}</div>`;
  if(!done){$("p-fold").onclick=()=>potAnswer("fold");$("p-call").onclick=()=>potAnswer("call")}
  else{$("next").onclick=nextPot;const rp=$("report");if(rp&&PO.T.decisions.length>=6)rp.onclick=renderPotReport}
}
function potAnswer(a){
  const q=PO.q,lossChips=a===q.answer?0:Math.abs(q.ev);
  const rec=recordDecision(PO.T,{situation:`${q.draw.name}, ${q.betText}`,group:q.close?"Close calls":q.answer==="call"?"Good price: call":"Bad price: fold",
    chosen:a,best:q.answer,evChosen:a==="call"?q.ev/q.bet:0,evBest:Math.max(q.ev,0)/q.bet,stake:q.bet});
  PO.rec=rec;PO.lost+=lossChips;
  if(rec.optimal){PO.streak++;PO.bestStreak=Math.max(PO.bestStreak,PO.streak)}else PO.streak=0;
  btsTrack("pk_pot_answer",{right:rec.optimal?1:0});renderPot();
}
function potFeedback(){
  const q=PO.q,r=PO.rec,pc=x=>(Math.round(x*1000)/10).toString()+"%",chips=n=>Math.round(Math.abs(n)).toLocaleString("en-GB");
  const sev=SEVERITY.find(s=>s.id===r.severity);
  const table=`<table class="tbl" style="margin-top:6px"><tbody>
    <tr><td>The price: ${q.bet.toLocaleString("en-GB")} to win ${(q.pot+q.bet).toLocaleString("en-GB")} (${oddsText(q.pot,q.bet)})</td><td class="n">need <b>${pc(q.need)}</b></td></tr>
    <tr><td>Your chance: ${q.outs.length} outs, rule of ${q.toCome===2?"4":"2"}</td><td class="n">${Math.round(q.thumb*100)}%</td></tr>
    <tr><td><b>Your chance, exactly</b></td><td class="n"><b>${pc(q.eq)}</b></td></tr>
    <tr><td>A call is worth, on average</td><td class="n" style="color:${q.ev>0?"var(--good)":"var(--bad)"}">${q.ev>0?"+":"−"}${chips(q.ev)} chips</td></tr></tbody></table>`;
  const why=q.answer==="call"?`Your ${pc(q.eq)} beats the ${pc(q.need)} the price needs: calling makes money over time, even though you'll miss ${Math.round((1-q.eq)*100)}% of the time.`
    :`Your ${pc(q.eq)} is short of the ${pc(q.need)} the price needs: calling loses money over time, even on the hands where you hit.`;
  return r.optimal?`<div class="okline">✓ <b>Right</b>: ${q.answer==="call"?"call":"fold"}.${q.close?" A close one.":""}</div>${table}<p class="small">${why}</p>`
    :`<div class="lesson sev-${r.severity}" role="alert"><div class="band">✗ ${sev.name.toUpperCase()} · ${q.answer==="call"?"CALL":"FOLD"} WAS RIGHT</div><div class="lb">
      <p class="lt">${why}</p>${table}<p class="lc">${a2(r.chosen)} gives away about ${chips(q.ev)} chips on average here (${pc(Math.abs(q.ev)/q.bet)} of the call).</p></div></div>`;
}
const a2=x=>x==="call"?"Calling":"Folding";
function renderPotReport(){
  const S=summarise(PO.T,3);btsTrack("pk_pot_report",{answered:S.decisions,score:S.score==null?-1:S.score});
  paintPotHeader();
  const groups=Object.entries(S.byGroup).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n);
  $("app").innerHTML=`<div class="card"><div class="datechip">POT ODDS · ${S.decisions} HANDS</div>
    <div class="twin"><div class="tile"><div class="k">POT ODDS SCORE</div><div class="big">${S.score}<small>/100</small></div><div class="s">Decisions right</div></div>
      <div class="tile"><div class="k">CHIPS GIVEN AWAY</div><div class="big ${PO.lost>0?"down":""}">${Math.round(PO.lost).toLocaleString("en-GB")}</div><div class="s">on average, by wrong calls and folds</div></div></div>
    <table class="tbl" style="margin-top:10px"><tbody>${groups.map(([g,o])=>`<tr><td>${g}</td><td class="n">${o.ok} of ${o.n}</td></tr>`).join("")}</tbody></table>
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>To work on: ${S.leak.group}</b> · ${S.leak.ok} of ${S.leak.n} right.</div>`:""}
    <p class="small" style="margin-top:8px">Next: equity, where the Shark's hand is face up and you estimate your share against it.</p>
    ${button("next","Keep going","",true)}</div>`;
  $("next").onclick=nextPot;
}
