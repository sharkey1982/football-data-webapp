/* ===========================================================================
   poker/equityui.js — "Equity": both hands face up; estimate your share.

   Your two cards against the Shark's, before the flop or with a flop or turn
   out. Set your estimate (steps of 5%, from 50) and lock it in; the answer
   is the exact equity (sampled before the flop), with wins and splits, the
   matchup and its rule of thumb. Within 5 points is Close (right); 5–10 a
   mistake; more than 10 a major one. Equity Score = share Close; the average
   miss is kept beside it.
   =========================================================================== */
let EQ=null;
function newEquity(){EQ={T:newTrainingSession("poker-equity"),q:null,n:0,guess:50,rec:null,errs:[],streak:0,bestStreak:0};btsTrack("pk_eq_start",{})}
const eqAvg=()=>EQ&&EQ.errs.length?EQ.errs.reduce((a,b)=>a+Math.abs(b),0)/EQ.errs.length:null;
function paintEquityHeader(){
  const T=EQ&&EQ.T,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0,av=eqAvg();
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">EQUITY SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Close</div><div class="v">${ok} / ${n}</div></div>
    <div class="two"><div class="k">Average miss</div><div class="v">${av==null?"—":av.toFixed(1)}</div><div class="pts">points</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · EQUITY</span><span></span></div>`;
}
function renderEquityIntro(){
  paintEquityHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · EQUITY</div>
    <div class="mission">How often do you win?</div>
    <p class="lede" style="margin-top:10px">Your <b>equity</b> is your share of the pot if every card were dealt out: the hands you win, plus half the splits. Both hands are face up; you say your share.</p></div>
    <div class="card"><div class="datechip">RULES OF THUMB</div>
      <table class="tbl"><tbody>
        <tr><td>A higher pair against a lower pair</td><td class="n">about 80%</td></tr>
        <tr><td>Same high card, better kicker</td><td class="n">about 70–75%</td></tr>
        <tr><td>A pair against one higher card</td><td class="n">about 70%</td></tr>
        <tr><td>Two higher cards against two lower</td><td class="n">about 60–65%</td></tr>
        <tr><td>A pair against two higher cards</td><td class="n">about 55%</td></tr>
        <tr><td>A flush draw against top pair, on the flop</td><td class="n">about 35–40%</td></tr></tbody></table>
      <p class="small">Within 5 points counts as close. The answer is exact after the flop (every card that can come); before the flop it is 30,000 deals, within about half a point.</p>
      ${button("go","Deal two hands","",true)}</div>`;
  $("go").onclick=()=>{newEquity();nextEquity()};
}
function nextEquity(){EQ.q=equityQuestion();EQ.n++;EQ.guess=50;EQ.rec=null;renderEquity()}
const pc1=x=>(Math.round(x*1000)/10).toFixed(1)+"%";
function renderEquity(){
  const q=EQ.q,done=!!EQ.rec;paintEquityHeader();
  const street=q.street==="pre-flop"?"BEFORE THE FLOP":`ON THE ${q.street.toUpperCase()}`;
  $("app").innerHTML=`<div class="card"><div class="datechip">HAND ${EQ.n} · ${street}</div>
    <div class="seat"><div class="who">THE SHARK${done?` <span class="tot">${pc1(1-q.eq)}</span>`:""}</div><div class="cards">${q.b.map(c=>pkCardHTML(c)).join("")}</div></div>
    ${q.board.length?`<div class="seat"><div class="who">THE BOARD</div><div class="cards">${q.board.map(c=>pkCardHTML(c)).join("")}</div></div>`:""}
    <div class="seat"><div class="who">YOUR CARDS${done?` <span class="tot">${pc1(q.eq)}</span>`:""}</div><div class="cards">${q.a.map(c=>pkCardHTML(c)).join("")}</div></div></div>
    <div class="card">${done?equityFeedback()+button("next","Next hand","",true)+(EQ.T.decisions.length>=6?button("report","Finish: your report",`${EQ.n} hands`):"")
      :`<h2>Your equity?</h2><p class="small">Your share of the pot if ${q.board.length?`the ${q.board.length===3?"turn and river":"river"} were dealt`:"all five board cards were dealt"}.</p>
        <div class="stepper"><span class="sl">Equity</span><button class="sb" id="eq-m" aria-label="minus five">−</button>
        <output id="eq-v" class="sv">50%</output><button class="sb" id="eq-p" aria-label="plus five">+</button></div>
        ${button("lock","Lock in","",true)}`}</div>`;
  if(!done){
    const paint=()=>{$("eq-v").textContent=EQ.guess+"%"};
    $("eq-m").onclick=()=>{EQ.guess=Math.max(0,EQ.guess-5);paint()};$("eq-p").onclick=()=>{EQ.guess=Math.min(100,EQ.guess+5);paint()};paint();
    $("lock").onclick=()=>equityAnswer(EQ.guess);
  }else{$("next").onclick=nextEquity;const rp=$("report");if(rp&&EQ.T.decisions.length>=6)rp.onclick=renderEquityReport}
}
function equityAnswer(g){
  const q=EQ.q,err=g-q.eq*100,band=eqBand(err);
  const rec=recordDecision(EQ.T,{situation:q.match.name,group:q.match.name,chosen:g,best:Math.round(q.eq*100),optimal:band.id==="close",
    evChosen:-Math.abs(err)/100,evBest:0,stake:1,band:band.id});
  EQ.rec=rec;EQ.errs.push(err);
  if(rec.optimal){EQ.streak++;EQ.bestStreak=Math.max(EQ.bestStreak,EQ.streak)}else EQ.streak=0;
  btsTrack("pk_eq_answer",{close:rec.optimal?1:0,err:Math.round(Math.abs(err))});renderEquity();
}
function equityFeedback(){
  const q=EQ.q,r=EQ.rec,err=r.chosen-q.eq*100,band=eqBand(err);
  const how=q.exact?`every ${q.street==="flop"?"turn and river":"river"} that can come (${q.n.toLocaleString("en-GB")})`:`${q.n.toLocaleString("en-GB")} deals of the board`;
  const table=`<table class="tbl" style="margin-top:6px"><tbody>
    <tr><td>You said</td><td class="n">${r.chosen}%</td></tr>
    <tr><td><b>Your equity</b></td><td class="n"><b>${pc1(q.eq)}</b></td></tr>
    <tr><td>You win / split / the Shark wins</td><td class="n">${pc1(q.win)} / ${pc1(q.tie)} / ${pc1(1-q.win-q.tie)}</td></tr></tbody></table>
    <p class="small">From ${how}.</p>`;
  const thumb=`<p class="small"><b>${q.match.name}.</b> ${q.match.thumb}</p>`;
  const miss=`${Math.abs(err).toFixed(1)} points ${err>0?"too high":"too low"}`;
  return r.optimal?`<div class="okline">✓ <b>Close</b>: ${Math.abs(err)<.5?"spot on":miss}.</div>${table}${thumb}`
    :`<div class="lesson sev-${r.severity}" role="alert"><div class="band">✗ ${band.name.toUpperCase()} · ${miss.toUpperCase()}</div><div class="lb">
      <p class="lt">Your share here is <b>${pc1(q.eq)}</b>.</p>${table}<p class="lw">${q.match.name}. ${q.match.thumb}</p></div></div>`;
}
function renderEquityReport(){
  const S=summarise(EQ.T,3),av=eqAvg();btsTrack("pk_eq_report",{answered:S.decisions,score:S.score==null?-1:S.score});
  paintEquityHeader();
  const groups=Object.entries(S.byGroup).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n);
  const hi=EQ.errs.filter(e=>e>5).length,lo=EQ.errs.filter(e=>e<-5).length;
  $("app").innerHTML=`<div class="card"><div class="datechip">EQUITY · ${S.decisions} HANDS</div>
    <div class="twin"><div class="tile"><div class="k">EQUITY SCORE</div><div class="big">${S.score}<small>/100</small></div><div class="s">Within 5 points</div></div>
      <div class="tile"><div class="k">AVERAGE MISS</div><div class="big">${av.toFixed(1)}</div><div class="s">points</div></div></div>
    <table class="tbl" style="margin-top:10px"><tbody>${groups.map(([g,o])=>`<tr><td>${g}</td><td class="n">${o.ok} of ${o.n}</td></tr>`).join("")}</tbody></table>
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>To work on: ${S.leak.group}</b> · ${S.leak.ok} of ${S.leak.n} close.</div>`:""}
    ${hi+lo>=3&&Math.max(hi,lo)>=2*Math.min(hi,lo)?`<p class="small" style="margin-top:8px">Your misses lean <b>${hi>lo?"too high":"too low"}</b>: ${hi>lo?"you rate your hand better than it is.":"your hand is stronger than you think."}</p>`:""}
    <p class="small" style="margin-top:8px">Next: pre-flop, heads-up shove or fold against the Shark.</p>
    ${button("next","Keep going","",true)}</div>`;
  $("next").onclick=nextEquity;
}
