/* ===========================================================================
   blackjack/countdrill.js — "What's the count?": the Hi-Lo counting drill.

   Cards come off a six-deck shoe one at a time at the speed you choose. After
   each run you give the running count (since the shuffle, not just this
   run); every third check you also give the true count, from the decks left
   in the discard tray. Wrong answers show the run again with each card's
   value, so you see which you missed. Right answers make the runs longer.

   Scored with the shared training framework, as its own Count Score: the
   share of checks you got exactly right.
   =========================================================================== */
const DRILL={startLen:6,maxLen:20,grow:2,growAfter:3,trueEvery:3,speeds:{slow:1500,normal:950,fast:550}};
let D=null;

function renderCountIntro(){
  paintCountHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">BLACKJACK · WHAT'S THE COUNT?</div>
    <div class="mission">Keep the count</div>
    <p class="lede" style="margin-top:10px">Card counters don't remember cards. They keep one running number, and bet more when it says the shoe is rich in tens and aces.</p></div>
    <div class="card"><div class="datechip">THE HI-LO COUNT</div>
      <div class="hilo"><div><b>+1</b><span>2 3 4 5 6</span></div><div><b>0</b><span>7 8 9</span></div><div><b>−1</b><span>10 J Q K A</span></div></div>
      <ul class="rules">
        <li><b>Running count:</b> add up every card since the shuffle.</li>
        <li><b>True count:</b> the running count ÷ the decks still to come, rounded down. That is the number you bet on.</li>
        <li>Each point of true count is worth about half a per cent of edge. From about +2 the player has it.</li></ul>
      <div class="datechip" style="margin:10px 0 6px">SPEED</div>
      <div class="stakes" style="grid-template-columns:repeat(3,1fr)">${["slow","normal","fast"].map(k=>`<button class="stk" id="sp-${k}" aria-pressed="${(D&&D.speed||"normal")===k}">${k[0].toUpperCase()+k.slice(1)}</button>`).join("")}</div>
      ${button("go","Start counting","Six decks · counting resets at each shuffle",true)}</div>`;
  const speed=D&&D.speed||"normal";
  ["slow","normal","fast"].forEach(k=>$("sp-"+k).onclick=()=>{D=D||{};D.speed=k;renderCountIntro()});
  $("go").onclick=()=>{newDrill(D&&D.speed||speed);btsTrack("bj_count_start",{speed:D.speed});nextRun()};
}
function newDrill(speed){
  D={speed,shoe:newShoe(RULES_V1),rc:0,len:DRILL.startLen,streak:0,best:0,checks:0,run:[],T:newTrainingSession("blackjack-count"),last:null,shuffles:0};
}
function paintCountHeader(){
  const T=D&&D.T?D.T:null,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">COUNT SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Checks</div><div class="v">${ok} / ${n}</div><div class="pts">right</div></div>
    <div class="two"><div class="k">Run length</div><div class="v">${D&&D.len?D.len:DRILL.startLen} cards</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>WHAT'S THE COUNT?</span><span>${D&&D.shoe?`${(D.shoe.size-D.shoe.i)} CARDS LEFT IN THE SHOE`:""}</span></div>`;
}
/* A run: cards one at a time, then the question. */
function nextRun(){
  if(needsShuffle(D.shoe,RULES_V1)){D.shoe=newShoe(RULES_V1);D.rc=0;D.lastAnswer=0;D.shuffles++;D.justShuffled=true}else D.justShuffled=false;
  D.run=[];for(let k=0;k<D.len;k++)D.run.push(draw(D.shoe));
  D.rcBefore=D.rc;D.rc+=runningCount(D.run);
  paintCountHeader();
  $("app").innerHTML=`<div class="card"><div class="datechip">RUN ${D.checks+1} · ${D.len} CARDS${D.justShuffled?" · NEW SHOE, COUNT FROM 0":""}</div>
    <div class="flash" id="flash"><span class="pc ghost"></span></div>
    <p class="small" id="flashn" style="text-align:center">Get ready…</p>
    <div id="paceBox">${paceControlsHTML("Show them all")}</div></div>`;
  let i=0,skip=false;wirePaceControls($("paceBox"),()=>{skip=true});
  const step=()=>{if(i>=D.run.length||skip)return ask();
    $("flash").innerHTML=cardHTML(D.run[i]);$("flashn").textContent=`Card ${i+1} of ${D.run.length}`;i++;
    setTimeout(step,DRILL.speeds[D.speed]*(SPEED==="fast"?.6:SPEED==="slow"?1.4:1))};
  setTimeout(step,700);
}
function stepperHTML(id,label){
  return`<div class="stepper"><span class="sl">${label}</span><button class="sb" id="${id}-m" aria-label="minus one">−</button>
    <output id="${id}-v" class="sv">0</output><button class="sb" id="${id}-p" aria-label="plus one">+</button></div>`;
}
function wireStepper(id,get,set){
  const paint=()=>{$(id+"-v").textContent=(get()>0?"+":"")+get()};
  $(id+"-m").onclick=()=>{set(get()-1);paint()};$(id+"-p").onclick=()=>{set(get()+1);paint()};paint();
}
/* The question: the running count, and every third check the true count. */
function ask(){
  const askTrue=(D.checks+1)%DRILL.trueEvery===0,decks=decksLeftShown(D.shoe);
  let rc=D.lastAnswer!=null?D.lastAnswer:D.rcBefore,tc=0;
  $("app").innerHTML=`<div class="card"><div class="datechip">CHECK ${D.checks+1}</div>
    <h1>What's the running count?</h1>
    <p class="small">Since the shuffle${D.checks&&!D.justShuffled?`: it was ${D.lastAnswer>0?"+":""}${D.lastAnswer} before this run`:""}.</p>
    ${stepperHTML("rc","Running")}
    ${askTrue?`<p class="small" style="margin-top:12px">The discard tray says about <b>${decks} decks</b> are still to come.</p>${stepperHTML("tc","True")}`:""}
    ${button("check","Check","",true)}</div>`;
  wireStepper("rc",()=>rc,v=>rc=v);if(askTrue)wireStepper("tc",()=>tc,v=>tc=v);
  $("check").onclick=()=>judge(rc,askTrue?tc:null,decks);
}
function judge(rc,tc,decks){
  D.checks++;
  const r1=recordDecision(D.T,{situation:"running count",group:"Running count",chosen:rc,best:D.rc,stake:1});
  let r2=null;const trueAns=trueCountFor(D.rc,decks);
  if(tc!=null)r2=recordDecision(D.T,{situation:"true count",group:"True count",chosen:tc,best:trueAns,stake:1});
  const ok=r1.optimal&&(!r2||r2.optimal);
  D.lastAnswer=D.rc; // carry on from the right count, whatever was said
  if(ok){D.streak++;D.best=Math.max(D.best,D.streak);if(D.streak%DRILL.growAfter===0)D.len=Math.min(DRILL.maxLen,D.len+DRILL.grow)}
  else{D.streak=0;D.len=Math.max(DRILL.startLen,D.len-DRILL.grow)}
  btsTrack("bj_count_check",{right:ok?1:0,len:D.run.length});
  paintCountHeader();
  const sign=n=>(n>0?"+":"")+n;
  $("app").innerHTML=`<div class="card">
    ${ok?`<div class="okline" style="font-size:16px">✓ <b>Right</b>: running count ${sign(D.rc)}${r2?`, true count ${sign(trueAns)}`:""}.</div>`
      :`<div class="lesson sev-mistake" role="alert"><div class="band">✗ ${!r1.optimal?`THE COUNT WAS ${sign(D.rc)}`:`TRUE COUNT ${sign(trueAns)}`}</div><div class="lb">
        ${!r1.optimal?`<p class="lt">You said ${sign(rc)}. Before this run it was ${sign(D.rcBefore)}; this run added ${sign(D.rc-D.rcBefore)}.</p>`:`<p class="lt">Running count right (${sign(D.rc)}).</p>`}
        ${r2&&!r2.optimal?`<p class="lt">True count: ${sign(D.rc)} ÷ ${decks} decks = ${(D.rc/decks).toFixed(1)}, rounded down: <b>${sign(trueAns)}</b>. You said ${sign(tc)}.</p>`:""}
        <div class="runrev">${D.run.map(c=>`<span>${cardHTML(c)}<em class="t${hiLo(c)}">${sign(hiLo(c))}</em></span>`).join("")}</div>
      </div></div>`}
    <p class="small">${ok&&D.streak%DRILL.growAfter===0&&D.len<=DRILL.maxLen?`Three right in a row: runs are now ${D.len} cards.`:ok?`${D.streak} right in a row.`:`Runs back to ${D.len} cards.`}</p>
    ${button("next","Next run","",true)}${D.checks>=3?button("report","Finish: your report",`${D.checks} checks`):""}</div>`;
  $("next").onclick=nextRun;const rp=$("report");if(rp&&D.checks>=3)rp.onclick=renderCountReport;
}
function renderCountReport(){
  const S=summarise(D.T,99),g=S.byGroup;
  bjRecord("count",S);
  btsTrack("bj_count_report",{checks:D.checks,score:S.score==null?-1:S.score});
  const acc=o=>o&&o.n?`${o.ok} of ${o.n} (${Math.round(100*o.ok/o.n)}%)`:"—";
  paintCountHeader();
  $("app").innerHTML=`<div class="card"><div class="datechip">WHAT'S THE COUNT? · ${D.checks} CHECKS</div>
    <div class="twin"><div class="tile"><div class="k">COUNT SCORE</div><div class="big">${S.score==null?"—":S.score}<small>/100</small></div><div class="s">Answers exactly right</div></div>
      <div class="tile"><div class="k">LONGEST RUN</div><div class="big">${D.len}</div><div class="s">cards at the end</div></div></div>
    <table class="tbl" style="margin-top:10px"><tbody>
      <tr><td>Running count</td><td class="n">${acc(g["Running count"])}</td></tr>
      <tr><td>True count</td><td class="n">${acc(g["True count"])}</td></tr>
      <tr><td>Best streak</td><td class="n">${D.best}</td></tr>
      <tr><td>Speed</td><td class="n">${D.speed}</td></tr></tbody></table>
    <p class="small" style="margin-top:8px">${S.score>=90&&D.checks>=10?"Good enough to use at the table: try Beat the house, where the count sets your bet.":"Counters practise until they are right nearly every time at casino speed. Keep going, or try a slower speed."}</p>
    ${button("more","Keep counting","Same shoe",true)}${button("house","Beat the house","Use the count to size your bets")}</div>`;
  $("more").onclick=nextRun;$("house").onclick=()=>{location.href="./?mode=house#play"};
}
