/* ===========================================================================
   poker/rangesui.js — "Ranges": two parts.

   How many ways?   a stepper for the number of combos; exact or wrong; the
                    rule (pairs 6, suited 4, offsuit 12), the sum with the
                    cards you can see taken out, and the combos as cards.
   Your hand v the Shark's range: the Shark shoves; its whole range on the
                    13x13 grid; estimate your equity against it (5% steps);
                    within 5 points is right; then what calling needs.
   =========================================================================== */
let RG=null;
function newRanges(part){RG={part,T:newTrainingSession("poker-ranges",{part}),q:null,n:0,v:0,rec:null,streak:0,bestStreak:0};btsTrack("pk_rg_start",{part})}
function paintRangesHeader(){
  const T=RG&&RG.T,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">RANGE SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Right</div><div class="v">${ok} / ${n}</div></div>
    <div class="two"><div class="k">Streak</div><div class="v">${RG?RG.streak:0}</div><div class="pts">best ${RG?RG.bestStreak:0}</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · RANGES${RG?` · ${RG.part==="combos"?"HOW MANY WAYS?":"YOU V A RANGE"}`:""}</span><span></span></div>`;
}
function renderRangesIntro(){
  RG=null;paintRangesHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · RANGES</div>
    <div class="mission">What could the Shark have?</div>
    <p class="lede" style="margin-top:10px">Good players don't put the Shark on one hand. They think in its <b>range</b>: every hand it could hold, and how many ways it could hold each.</p></div>
    <div class="card"><div class="datechip">COUNTING COMBOS</div>
      <table class="tbl"><tbody>
        <tr><td>A pocket pair (say, kings)</td><td class="n">6 ways</td></tr>
        <tr><td>A suited hand (ace-king of one suit)</td><td class="n">4 ways</td></tr>
        <tr><td>An offsuit hand (ace-king, two suits)</td><td class="n">12 ways</td></tr>
        <tr><td>Each card you can see of that rank</td><td class="n">takes ways away</td></tr></tbody></table>
      <p class="small">So there are 16 ways to hold ace-king but only 6 to hold aces: ace-king is the likelier hand, before you count the cards you can see. And against a whole range, a hand that looks weak can be ahead more often than you'd think.</p>
      <div class="datechip" style="margin:12px 0 6px">PICK A PART</div><div id="ch"></div></div>`;
  choiceCards($("ch"),[{id:"combos",t:"How many ways?",d:"Count the combos the Shark could hold, with blockers"},
    {id:"range",t:"Your hand v the Shark's range",d:"The Shark shoves: your equity against everything it shoves"}],"Deal",id=>{newRanges(id);nextRanges()});
}
function nextRanges(){RG.q=RG.part==="combos"?comboQuestion():rangeQuestion();RG.n++;RG.rec=null;RG.v=RG.part==="combos"?0:50;renderRanges()}
function rgStepper(label,step){return`<div class="stepper"><span class="sl">${label}</span><button class="sb" id="rg-m" aria-label="minus ${step}">−</button>
  <output id="rg-v" class="sv">${RG.v}${step===5?"%":""}</output><button class="sb" id="rg-p" aria-label="plus ${step}">+</button></div>`}
function renderRanges(){
  const q=RG.q,done=!!RG.rec;paintRangesHeader();
  let top,ask,step,max;
  if(q.part==="combos"){
    top=`<div class="card"><div class="datechip">HAND ${RG.n}${q.board.length?" · ON THE FLOP":" · BEFORE THE FLOP"}</div>
      ${q.board.length?`<div class="seat"><div class="who">THE BOARD</div><div class="cards">${q.board.map(c=>pkCardHTML(c)).join("")}</div></div>`:""}
      <div class="seat"><div class="who">YOUR CARDS</div><div class="cards">${q.hole.map(c=>pkCardHTML(c)).join("")}</div></div></div>`;
    ask=`<h2>How many ways can the Shark hold ${q.t.ask}?</h2>`;step=1;max=60;
  }else{
    top=`<div class="card"><div class="datechip">HAND ${RG.n} · ${q.S} BIG BLINDS EACH · YOU'RE IN THE BIG BLIND</div>
      <div class="outcome" style="margin:0 0 8px;border-left-color:var(--bad)"><b>The Shark shoves all in: ${q.S} big blinds.</b> It shoves ${Math.round(q.share*100)}% of hands here:</div>
      ${pfGridHTML("sb",q.S,q.name)}
      <div class="seat" style="margin-top:10px"><div class="who">YOUR CARDS <span class="tot">${q.name}</span></div><div class="cards">${q.cards.map(c=>pkCardHTML(c)).join("")}</div></div></div>`;
    ask=`<h2>Your equity against that range?</h2><p class="small">Your share of the pot, on average, against every hand the Shark shoves.</p>`;step=5;max=100;
  }
  $("app").innerHTML=top+`<div class="card">${done?rangesFeedback()+button("next","Next hand","",true)+`<div class="endrow2">${RG.T.decisions.length>=6?button("report","Finish: your report",`${RG.n} hands`):""}${button("switch",RG.part==="combos"?"Switch to you v a range":"Switch to how many ways?","")}</div>`
    :ask+rgStepper(q.part==="combos"?"Ways":"Equity",step)+button("lock",q.part==="combos"?"Check":"Lock in","",true)}</div>`;
  if(!done){const paint=()=>{$("rg-v").textContent=RG.v+(step===5?"%":"")};
    $("rg-m").onclick=()=>{RG.v=Math.max(0,RG.v-step);paint()};$("rg-p").onclick=()=>{RG.v=Math.min(max,RG.v+step);paint()};paint();
    $("lock").onclick=()=>rangesAnswer(RG.v)}
  else{$("next").onclick=nextRanges;const rp=$("report");if(rp)rp.onclick=renderRangesReport;$("switch").onclick=()=>{RG.part=RG.part==="combos"?"range":"combos";nextRanges()}}
}
function rangesAnswer(v){
  const q=RG.q;let rec;
  if(q.part==="combos"){const miss=Math.abs(v-q.answer);
    rec=recordDecision(RG.T,{situation:q.t.ask,group:{pair:"Pocket pairs",suited:"Suited hands",offsuit:"Offsuit hands",any:"Any suits",set:"Sets on the flop",toppair:"Top pair on the flop",flush:"Flushes on the flop"}[q.t.kind],
      chosen:v,best:q.answer,evChosen:-miss/Math.max(4,q.answer),evBest:0,stake:1})}
  else{const err=v-q.eq*100;
    rec=recordDecision(RG.T,{situation:`${q.name} v ${q.S} bb shove`,group:`Your hand v a range, ${pfStackGroup(q.S)}`,chosen:v,best:Math.round(q.eq*100),
      optimal:Math.abs(err)<=5,evChosen:-Math.abs(err)/100,evBest:0,stake:1})}
  RG.rec=rec;if(rec.optimal){RG.streak++;RG.bestStreak=Math.max(RG.bestStreak,RG.streak)}else RG.streak=0;
  btsTrack("pk_rg_answer",{part:q.part,right:rec.optimal?1:0});renderRanges();
}
function rangesFeedback(){
  const q=RG.q,r=RG.rec,sev=SEVERITY.find(s=>s.id===r.severity);
  if(q.part==="combos"){
    const cards=q.combos.length&&q.combos.length<=16?`<div class="minis" style="flex-wrap:wrap;gap:8px">${q.combos.map(p=>`<span style="display:inline-flex;gap:2px">${p.map(c=>pkCardHTML(c,"mini")).join("")}</span>`).join("")}</div>`:"";
    const sum=new RegExp(`(^|\\D)${q.answer}$`).test(q.t.sum)?q.t.sum.replace(new RegExp(`${q.answer}$`),`<b>${q.answer}</b>`):`${q.t.sum} = <b>${q.answer}</b>`;
    const body=`<p class="small" style="margin:0 0 4px">How many ways can the Shark hold ${q.t.ask}?</p><p class="small"><b>${q.t.base}.</b> Here: ${sum}.</p>${cards}`;
    return r.optimal?`<div class="okline">✓ <b>Right</b>: ${q.answer} way${q.answer===1?"":"s"}.</div>${body}`
      :`<div class="lesson sev-${r.severity}" role="alert"><div class="band">✗ ${q.answer} WAY${q.answer===1?"":"S"}, NOT ${r.chosen}</div><div class="lb">${body}
        ${q.fresh!==q.answer?`<p class="lw">Without your two cards it would be ${q.fresh}${q.board.length?" (the board's cards already counted out)":""}. Your cards can't be in the Shark's hand, so they take away ${q.fresh-q.answer}: count them out first.</p>`:""}</div></div>`;
  }
  const pc=x=>(Math.round(x*1000)/10).toFixed(1)+"%",err=r.chosen-q.eq*100;
  const call=`<table class="tbl" style="margin-top:6px"><tbody>
    <tr><td>You said</td><td class="n">${r.chosen}%</td></tr>
    <tr><td><b>Your equity v the range</b></td><td class="n"><b>${pc(q.eq)}</b></td></tr>
    <tr><td>Calling needs: ${q.S-1} more to win ${2*q.S}, the 1 already in</td><td class="n">${pc(q.need)}</td></tr></tbody></table>
    <p class="small">So <b>${q.call?"call":"fold"}</b>: ${q.call?`your ${pc(q.eq)} beats the ${pc(q.need)} the price needs.`:`your ${pc(q.eq)} is short of the ${pc(q.need)} the price needs.`}
    ${q.eq>.42&&q.eq<.56&&q.share>.4?` Against the hands you fear most you'd be behind, but the Shark shoves ${Math.round(q.share*100)}% of hands, and most of them are worse.`:""}</p>`;
  return r.optimal?`<div class="okline">✓ <b>Close</b>: ${Math.abs(err)<.5?"spot on":`${Math.abs(err).toFixed(1)} points ${err>0?"too high":"too low"}`}.</div>${call}`
    :`<div class="lesson sev-${r.severity}" role="alert"><div class="band">✗ ${Math.abs(err).toFixed(1)} POINTS ${err>0?"TOO HIGH":"TOO LOW"}</div><div class="lb">${call}</div></div>`;
}
function renderRangesReport(){
  pkMarkDone("ranges");
  const S=summarise(RG.T,3);btsTrack("pk_rg_report",{answered:S.decisions,score:S.score==null?-1:S.score});
  paintRangesHeader();
  const groups=Object.entries(S.byGroup).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n);
  $("app").innerHTML=`<div class="card"><div class="datechip">RANGES · ${S.decisions} HANDS</div>
    <div class="twin"><div class="tile"><div class="k">RANGE SCORE</div><div class="big">${S.score}<small>/100</small></div><div class="s">Answers right</div></div>
      <div class="tile"><div class="k">BEST STREAK</div><div class="big">${RG.bestStreak}</div><div class="s">in a row</div></div></div>
    <table class="tbl" style="margin-top:10px"><tbody>${groups.map(([g,o])=>`<tr><td>${g}</td><td class="n">${o.ok} of ${o.n}</td></tr>`).join("")}</tbody></table>
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>To work on: ${S.leak.group}</b> · ${S.leak.ok} of ${S.leak.n} right.</div>`:""}
    <p class="small" style="margin-top:8px">Next in the poker trainers: post-flop decisions, scored against the Shark's range.</p>
    ${button("next","Keep going","",true)}${button("switch",RG.part==="combos"?"Switch to you v a range":"Switch to how many ways?","")}</div>`;
  $("next").onclick=nextRanges;$("switch").onclick=()=>{RG.part=RG.part==="combos"?"range":"combos";nextRanges()};
}
