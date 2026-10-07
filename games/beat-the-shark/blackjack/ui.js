/* ===========================================================================
   blackjack/ui.js — screens: start, the table (dealer, your hand, stake,
   HIT | STAND | DOUBLE | SPLIT, then the result and the verdict on your
   decisions), and the session report. Last line starts the game.

   Learn mode (V1): every decision is judged the moment you make it.
   =========================================================================== */
const START_CHIPS=10000;
/* Three ways to play, one table (Chris, 7 Oct 2026):
     basic  Blackjack: basic strategy — every playing decision judged
     count  What's the count? — the Hi-Lo drill (countdrill.js)
     house  Beat the house — basic strategy plus the count: bet by the true count
   chosen by ?mode= in the address, so each has its own entry on the picker. */
const MODE_ID=(()=>{try{const m=new URLSearchParams(location.search||"").get("mode");return m==="count"||m==="house"?m:"basic"}catch(e){return"basic"}})();
const PICKER_ID={basic:"blackjack",count:"blackjack-count",house:"blackjack-house"}[MODE_ID];
const UNIT=100;
const STAKES=MODE_ID==="house"?BET_UNITS.map(u=>u*UNIT):[100,250,500,1000];
const MODE="learn"; // feedback timing; later: "practice" (judged at the end of the hand), "session", "challenge"
let G=null;

const fmt=n=>Math.round(n).toLocaleString("en-GB");
const signed=n=>(n>0?"+":n<0?"−":"")+fmt(Math.abs(n));
const pctTxt=x=>(x*100<1&&x>0?(x*100).toFixed(1):Math.round(x*100))+"%";

/* ---- the header: Shark Score and chips, side by side and separate ---------- */
function paintHeader(){
  if(!G)return;const sc=sharkScore(G.T),n=G.T.decisions.length,opt=G.T.decisions.filter(d=>d.optimal).length,res=G.T.outcomes.reduce((a,o)=>a+o.net,0);
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">SHARK SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Shark Chips</div><div class="v">${fmt(G.chips)}</div>
      ${res?`<div class="hd ${res>0?"up":"down"}">${signed(res)} this session</div>`:""}</div>
    ${G.house?`<div class="two"><div class="k">Bet score</div><div class="v">${sharkScore(G.TB)==null?"—":sharkScore(G.TB)}</div><div class="pts">${G.TB.decisions.filter(d=>d.optimal).length} / ${G.TB.decisions.length} bets right</div></div>`
      :`<div class="two"><div class="k">Decisions</div><div class="v">${opt} / ${n}</div><div class="pts">optimal</div></div>`}`;
  $("hSeason").innerHTML=`<div class="lbl"><span>${G.house?"BEAT THE HOUSE":"BASIC STRATEGY"} · HAND ${G.hands+(G.R&&G.R.phase==="player"?1:0)}</span><span></span></div>`;
}
function screen(html){paintHeader();$("app").innerHTML=html}

/* ---- start --------------------------------------------------------------------- */
function renderStart(){G=null;renderGamePicker(PICKER_ID,"../",MODE_ID==="count"?renderCountIntro:renderIntro)}
function renderIntro(){
  $("hScore").innerHTML=`—<span class="sub">SHARK SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Shark Chips</div><div class="v">${fmt(START_CHIPS)}</div></div><div class="two"><div class="k">Decisions</div><div class="v">0</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>${MODE_ID==="house"?"BEAT THE HOUSE":"BASIC STRATEGY"}</span><span></span></div>`;
  const house=MODE_ID==="house";
  $("app").innerHTML=house?`<div class="card hero"><div class="hero-kicker">BLACKJACK · BEAT THE HOUSE</div>
    <div class="mission">Count, then bet</div>
    <p class="lede" style="margin-top:10px">Basic strategy keeps the house edge to about half a per cent. The count tells you when the shoe has turned in your favour: bet small when it hasn't, bigger when it has.</p></div>
    <div class="card"><div class="datechip">THE BET RAMP</div>
      <table class="tbl"><tbody>${BET_RAMP.map((r,i)=>`<tr><td>True count ${i===0?"+1 or less":i===BET_RAMP.length-1?`+${r.from} or more`:`+${r.from}`}</td><td class="n">${r.units} unit${r.units>1?"s":""} (${fmt(r.units*UNIT)})</td><td class="n">edge ${edgeLabel(i===0?1:r.from)}</td></tr>`).join("")}</tbody></table>
      <p class="small">Keep the Hi-Lo count yourself (2–6 +1, 7–9 0, 10–A −1); the true count is the running count ÷ decks left, rounded down. Each bet is judged against the ramp, and each play against basic strategy: two scores. Counting is legal, but casinos can refuse to deal to counters.</p></div>
    <div class="card"><div class="datechip">THE TABLE</div>
      <ul class="rules">${rulesText(RULES_V1).map(t=>`<li>${t}</li>`).join("")}</ul>
      <p class="small">You start with ${fmt(START_CHIPS)} Shark Chips. They are fictional: they can't be bought, won, cashed or swapped for anything.</p>
      ${button("go","Take a seat","Every bet and every play judged as you make it",true)}</div>`
    :`<div class="card hero"><div class="hero-kicker">BLACKJACK · BASIC STRATEGY</div>
    <div class="mission">Did you win?<br>Did you play it right?</div>
    <p class="lede" style="margin-top:10px">Two different questions. Your chips answer the first. Your Shark Score answers the second, decision by decision, against basic strategy.</p></div>
    <div class="card"><div class="datechip">THE TABLE</div>
      <ul class="rules">${rulesText(RULES_V1).map(t=>`<li>${t}</li>`).join("")}</ul>
      <p class="small">You start with ${fmt(START_CHIPS)} Shark Chips. They are fictional: they can't be bought, won, cashed or swapped for anything.</p>
      ${button("go","Take a seat",house?"Every bet and every play judged as you make it":"Every decision judged as you make it",true)}</div>`;
  $("go").onclick=()=>{newSession();btsTrack("bj_session_start",{mode:MODE_ID});renderTable()};
}
function newSession(keepShoe){
  G={rules:RULES_V1,shoe:keepShoe&&G?G.shoe:newShoe(RULES_V1),chips:keepShoe&&G?G.chips:START_CHIPS,stake:keepShoe&&G?G.stake:STAKES[1],
    T:newTrainingSession("blackjack",{mode:MODE}),R:null,hands:0,handDecisions:[],firstEV:null,last:null,
    house:MODE_ID==="house",TB:newTrainingSession("blackjack-bets"),rc:0,showCount:false,bet:null,betEV:0,flatEV:0};
  if(G.house)G.stake=UNIT;
  G.startChips=G.chips;
}

/* ---- the table ----------------------------------------------------------------- */
function cardHTML(c,hidden){
  if(hidden)return`<span class="pc back" aria-label="face-down card"></span>`;
  const red=c.s===1||c.s===2;
  return`<span class="pc${red?" red":""}" aria-label="${RANK_NAME[c.r]} of ${["spades","hearts","diamonds","clubs"][c.s]}"><b>${RANK_NAME[c.r]}</b><i>${SUITS[c.s]}</i></span>`;
}
function totalText(cards){const v=handValue(cards);return v.total>21?`${v.total} · bust`:v.soft&&v.total<21?`soft ${v.total}`:String(v.total)}
function dealerHTML(R){
  const hide=R&&R.phase==="player";
  return`<div class="seat"><div class="who">DEALER${R?` <span class="tot">${hide?`shows ${cardValue(R.dealer[0])===1?"an ace":cardValue(R.dealer[0])}`:totalText(R.dealer)}</span>`:""}</div>
    <div class="cards">${R?R.dealer.map((c,i)=>cardHTML(c,hide&&i===1)).join(""):'<span class="pc ghost"></span><span class="pc ghost"></span>'}</div></div>`;
}
function handsHTML(R){
  if(!R)return`<div class="seat"><div class="who">YOU</div><div class="cards"><span class="pc ghost"></span><span class="pc ghost"></span></div></div>`;
  return R.hands.map((h,i)=>{const res=R.results&&R.results[i],on=R.phase==="player"&&R.active===i&&R.hands.length>1;
    return`<div class="seat${on?" on":""}"><div class="who">${R.hands.length>1?`HAND ${i+1}`:"YOU"} <span class="tot">${totalText(h.cards)}${h.doubled?" · doubled":""}</span>
      ${res?`<span class="out ${res.net>0?"up":res.net<0?"down":""}">${res.outcome==="blackjack"?"Blackjack":res.net>0?"Win":res.net<0?(res.outcome==="bust"?"Bust":"Lose"):"Push"} ${res.net?signed(res.net):""}</span>`:""}</div>
      <div class="cards">${h.cards.map(c=>cardHTML(c)).join("")}</div></div>`}).join("");
}
/* What you can afford to double or split with: those need a second stake. */
function affordable(R){const out=R.hands.reduce((a,h)=>a+h.bet,0);return legalActions(R).filter(a=>a==="hit"||a==="stand"||G.chips-out>=R.bet)}
function renderTable(){
  const R=G.R,playing=R&&R.phase==="player",legal=playing?affordable(R):[];
  const out=R?R.hands.reduce((a,h)=>a+h.bet,0):0;
  screen(`<div class="card table">
      ${dealerHTML(R)}
      ${handsHTML(R)}
      <div class="stakeline"><span>Stake <b>${fmt(playing?out:G.stake)}</b></span><span>Shark Chips <b>${fmt(G.chips)}</b></span></div>
      <div id="fb">${feedbackHTML()}</div>
      ${G.pending?button("gotit","Got it",G.pending.best?`${ACTION_NAME[G.pending.best]} on ${G.pending.situation}`:"",true)
        :playing?`<div class="acts">${["hit","stand","double","split"].map(a=>`<button class="act" id="a-${a}" ${legal.includes(a)?"":"disabled"}>${ACTION_NAME[a]}</button>`).join("")}</div>`
        :stakeHTML()}
    </div>
    ${G.hands&&!playing&&!G.pending?`<div class="endrow">${button("report","End session: your report",`${G.hands} hand${G.hands>1?"s":""} · ${G.T.decisions.length} decisions`)}</div>`:""}`);
  if(G.pending){$("gotit").onclick=()=>{G.pending=null;renderTable()};}
  else if(playing)["hit","stand","double","split"].forEach(a=>{const b=$("a-"+a);if(b)b.onclick=()=>{if(legal.includes(a))doAction(a)}});
  else wireStakes();
  const rep=$("report");if(rep)rep.onclick=renderReport;
}
function stakeHTML(){
  if(G.chips<STAKES[0])return`<p class="lede">Out of Shark Chips.</p>${button("refill",`Back to ${fmt(START_CHIPS)} Shark Chips`,"They're free and worth nothing: your Shark Score carries on",true)}`;
  const c=G.house?countNow():null;
  return`${G.house?`<div class="countbar">${G.showCount?`Running <b>${sgn(c.rc)}</b> · ${c.decks} decks left · true count <b>${sgn(c.tc)}</b>`:"Keep the count yourself"}
      <button class="linkbtn" id="toggleCount">${G.showCount?"Hide the count":"Show the count"}</button></div>`:""}
    <div class="datechip" style="margin:4px 0 6px">${G.R?"NEXT HAND · ":""}YOUR ${G.house?"BET IN UNITS OF "+fmt(UNIT):"STAKE"}</div>
    <div class="stakes${G.house?" five":""}">${STAKES.map(v=>`<button class="stk" id="s-${v}" aria-pressed="${G.stake===v}" ${v>G.chips?"disabled":""}>${G.house?`${v/UNIT}<small>${fmt(v)}</small>`:fmt(v)}</button>`).join("")}</div>
    ${button("deal",G.R?"Deal the next hand":"Deal","",true)}`;
}
function wireStakes(){
  if(G.chips<STAKES[0]){$("refill").onclick=()=>{G.chips=START_CHIPS;G.refills=(G.refills||0)+1;renderTable()};return}
  STAKES.forEach(v=>{const b=$("s-"+v);if(b)b.onclick=()=>{if(v<=G.chips){G.stake=v;renderTable()}}});
  if(G.house)$("toggleCount").onclick=()=>{G.showCount=!G.showCount;renderTable()};
  if(G.stake>G.chips)G.stake=STAKES.filter(v=>v<=G.chips).pop();
  $("deal").onclick=deal;
}
function edgeLabel(tc){const e=edgeAt(tc);return(e>0?"+":e<0?"−":"")+Math.abs(e*100).toFixed(1)+"%"}
const sgn=n=>(n>0?"+":"")+n;
function countNow(){const d=decksLeftShown(G.shoe);return{rc:G.rc,decks:d,exact:G.rc/d,tc:trueCountFor(G.rc,d)}}
/* Beat the house: the bet, judged against the ramp at the true count. */
function judgeBet(){
  const c=countNow(),units=G.stake/UNIT,rec=rampUnits(c.tc);
  const rec2=recordDecision(G.TB,{situation:`true count ${sgn(c.tc)}`,group:c.tc<=1?"True count +1 or less":c.tc>=5?"True count +5 or more":`True count +${c.tc}`,
    chosen:units,best:rec,stake:UNIT,tc:c.tc,rc:c.rc,decks:c.decks});
  G.bet=rec2;G.betEV+=units*UNIT*edgeAt(c.exact);G.flatEV+=UNIT*edgeAt(c.exact);
  btsTrack("bj_bet",{right:rec2.optimal?1:0,tc:c.tc});
}
function deal(){
  if(needsShuffle(G.shoe,G.rules)){G.shoe=newShoe(G.rules);G.shuffled=true;G.rc=0}else G.shuffled=false;
  if(G.house)judgeBet();
  G.R=newRound(G.shoe,G.rules,G.stake);G.handDecisions=[];G.firstEV=null;G.last=null;G.pending=null;
  if(G.R.phase==="done")return settle();
  renderTable();
}
/* A decision: judged against basic strategy and its expected value, then played. */
function doAction(a){
  const R=G.R,h=activeHand(R),legal=affordable(R),cards=h.cards.slice(),up=R.dealer[0],canSplit=legal.includes("split");
  const seen=R.hands.flatMap(x=>x.cards).concat([up]);
  const evs=evaluatePlays(cards,up,seen,G.rules,legal),best=bestAction(cards,up,G.rules,legal);
  if(G.firstEV==null)G.firstEV=evs[best];
  const rec=recordDecision(G.T,{situation:`${handLabel(cards,G.rules,canSplit)} v ${upText(up)}`,group:handGroup(cards,G.rules,canSplit),
    chosen:a,best,evChosen:evs[a],evBest:evs[best],stake:R.bet,evs,why:whyLine(cards,up,G.rules,best,canSplit),hand:G.hands+1,
    chart:chartCell(cards,up,G.rules,canSplit),col:chartColumn(up)});
  G.handDecisions.push(rec);G.last=rec;
  /* Learn mode: a mistake holds the table until it has been read. */
  if(!rec.optimal&&MODE_LEARN_HOLDS)G.pending=rec;
  act(R,G.shoe,a);
  if(R.phase==="done")return settle();
  renderTable();
}
function settle(){
  const R=G.R;G.chips+=R.net;G.hands++;
  if(G.house)G.rc+=runningCount(R.hands.flatMap(h=>h.cards).concat(R.dealer));
  const lost=G.handDecisions.reduce((s,d)=>s+d.evLoss*d.stake,0);
  const expected=G.handDecisions.length?G.firstEV*R.bet-lost:R.net;  // no decision: it was what it was
  recordOutcome(G.T,{net:R.net,expected,decisions:G.handDecisions.length});
  btsTrack("bj_hand",{outcome:R.net>0?"win":R.net<0?"lose":"push",decisions:G.handDecisions.length,optimal:G.handDecisions.filter(d=>d.optimal).length});
  renderTable();
}

/* ---- feedback: the lesson first, then the result -------------------------------- *
   A right play is a quiet tick. A mistake is a red band (a major one shakes
   once), the right play, why, what it costs on average, and the chart's row
   for the hand with the dealer's card marked; the table waits for "Got it". */
const MODE_LEARN_HOLDS=true;
const CODE_SHORT={H:"H",S:"S",D:"D",X:"Ds",P:"P"};
function chartRowHTML(d){
  const ch=STRATEGY_CHARTS[G.rules.id][d.chart.table][d.chart.row],c=d.chart;
  const label=c.table==="pairs"?(c.row===11?"A,A":`${c.row},${c.row}`):`${c.table} ${c.row}`;
  return`<div class="crow" role="img" aria-label="Basic strategy for ${label}: ${ACTION_NAME[d.best]} against the dealer's ${["2","3","4","5","6","7","8","9","10","ace"][d.col]}">
    <div class="ch"><span>${label}</span>${["2","3","4","5","6","7","8","9","10","A"].map((x,k)=>`<i class="${k===d.col?"on":""}">${x}</i>`).join("")}</div>
    <div class="cr"><span>play</span>${ch.split("").map((x,k)=>`<i class="c-${x}${k===d.col?" on":""}">${CODE_SHORT[x]}</i>`).join("")}</div>
    <div class="cl">H hit · S stand · D double (or hit) · Ds double (or stand) · P split</div></div>`;
}
function evListHTML(d){return Object.entries(d.evs).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${ACTION_NAME[k]} ${v>=0?"+":"−"}${pctTxt(Math.abs(v))}`).join(" · ")}
function okLine(d){return`<div class="okline">✓ <b>Right</b>: ${ACTION_NAME[d.chosen]} on ${d.situation}.</div>`}
function mistakeHTML(d){
  const sev=SEVERITY.find(s=>s.id===d.severity),cost=d.evLoss*d.stake;
  return`<div class="lesson sev-${d.severity}" role="alert">
    <div class="band">✗ ${sev.name.toUpperCase()} · ${ACTION_NAME[d.best]} was the play</div>
    <div class="lb">
      <p class="lt">You chose <b>${ACTION_NAME[d.chosen]}</b> on ${d.situation}.</p>
      ${d.why?`<p class="lw">${d.why}</p>`:""}
      ${chartRowHTML(d)}
      <p class="lc">Cost: about ${pctTxt(d.evLoss)} of your stake on average (${cost<1?"under 1 chip":fmt(cost)+" chips"}), whatever this hand does. Average return per chip: ${evListHTML(d)}</p>
    </div></div>`;
}
function feedbackHTML(){
  const R=G.R;if(!R)return`<p class="small" style="margin:8px 0">Pick a stake and deal. After every decision you'll see whether it was the basic-strategy play, separately from whether the hand won.</p>`;
  if(R.phase==="player"){const d=G.last;return(G.house&&!d?betHTML(G.bet,true):"")+(d?(d.optimal?okLine(d):mistakeHTML(d)):"")}
  const ds=G.handDecisions,clean=ds.every(d=>d.optimal),won=R.net>0,lost=R.net<0,bad=ds.filter(d=>!d.optimal);
  let head;
  if(!ds.length)head=R.playerBJ&&R.dealerBJ?"Both blackjack: a push. No decision to make.":R.playerBJ?"Blackjack! No decision to make.":"Dealer blackjack. No decision to make.";
  else if(won)head=clean?"You won — and played it right.":`You won the hand — but made the wrong decision${bad.length>1?"s":""}.`;
  else if(lost)head=clean?"You lost the hand — but played it correctly. That was variance, not a mistake.":"You lost the hand, and the decision cost you as well.";
  else head=clean?"A push — and played it right.":"A push — but not the right play.";
  /* the mistake that ended the hand is still on show until "Got it" */
  return`<div class="verdictbox">
      <div class="vb"><div class="k">RESULT</div><div class="v ${won?"up":lost?"down":""}">${R.net?`You ${won?"won":"lost"} ${fmt(Math.abs(R.net))} chips`:"Push: stake back"}</div></div>
      <div class="vb"><div class="k">DECISIONS</div><div class="v ${ds.length?(clean?"up":"down"):""}">${ds.length?`${ds.length-bad.length} of ${ds.length} right`:"None to make"}</div></div></div>
    <p class="headline">${head}</p>
    ${ds.map(d=>d.optimal?okLine(d):(G.pending===d?mistakeHTML(d):`<div class="okline bad">✗ <b>${SEVERITY.find(s=>s.id===d.severity).name}</b>: ${ACTION_NAME[d.chosen]} on ${d.situation}; ${ACTION_NAME[d.best]} was the play.</div>`)).join("")}
    ${G.house?betHTML(G.bet,false)+countAfterHTML():""}
    ${G.shuffled?`<p class="small">The shoe was reshuffled before this hand${G.house?": the count started again at 0":""}.</p>`:""}`;
}
/* The bet's verdict: the true count, the ramp's bet and the edge at that count. */
function betHTML(b,full){
  if(!b)return"";
  const units=b.chosen,rec=b.best,e=edgeLabel(b.tc);
  if(b.optimal)return`<div class="okline">✓ <b>Right bet</b>: true count ${sgn(b.tc)} → ${rec} unit${rec>1?"s":""} (edge about ${e}).</div>`;
  const over=units>rec;
  return full?`<div class="lesson sev-mistake betl" role="alert"><div class="band">✗ BET ${over?"TOO BIG":"TOO SMALL"} · ${rec} unit${rec>1?"s":""} was the bet</div><div class="lb">
      <p class="lt">The true count was ${sgn(b.tc)} (running ${sgn(b.rc)} ÷ ${b.decks} decks), so your edge was about ${e}. You bet ${units} unit${units>1?"s":""}.</p>
      <p class="lw">${over?(edgeAt(b.tc)<=0?"With the edge against you, a big bet just feeds the house: bet the minimum until the count says otherwise.":"More than the ramp: the count is good, but a bigger bet than this risks too much of your bankroll on one hand."):
        "The count was in your favour: this is when counters bet more. A small bet here leaves the edge unused."}</p></div></div>`
    :`<div class="okline bad">✗ <b>Bet</b>: true count ${sgn(b.tc)} → ${rec} unit${rec>1?"s":""}; you bet ${units}.</div>`;
}
function countAfterHTML(){const c=countNow();return`<p class="small">Count after this hand: running ${sgn(c.rc)} · about ${c.decks} decks left · true count ${sgn(c.tc)}.</p>`}

/* ---- the session report -------------------------------------------------------- */
const GROUP_ORDER=["Hard 8 or less","Hard 9–11","Hard 12–16","Hard 17+","Soft 13–18","Soft 19–21","Pairs"];
const LEAK_NOTE={
  "Hard 12–16":"The hardest hands to play well: stand against a weak dealer (2–6), hit against a strong one (7–ace). Winning some of them after the wrong play is common; over many hands those plays still cost.",
  "Hard 9–11":"Doubling chances. Missing them leaves money on the table in the hands where you are the favourite.",
  "Soft 13–18":"Soft hands can't bust with one card, so the right play is often to hit or double, not to stand.",
  "Pairs":"Split aces and eights; never tens or fives. The rest depend on the dealer's card.",
  "Hard 17+":"Seventeen or more: stand.","Hard 8 or less":"Eight or less: you can't bust, so take a card.","Soft 19–21":"Soft 19 or more: stand."};
function renderReport(){
  const S=summarise(G.T,8),V=verdictOf(S);
  btsTrack("bj_session_report",{hands:S.hands,decisions:S.decisions,score:S.score==null?-1:S.score});
  const acc=(o)=>o&&o.n?`${o.ok} of ${o.n} (${pctTxt(o.ok/o.n)})`:"—";
  const result=S.result;
  screen(`<div class="card"><div class="datechip">SESSION REPORT · ${S.hands} HAND${S.hands===1?"":"S"}</div>
    <div class="twin">
      <div class="tile"><div class="k">CHIPS</div><div class="big ${result>0?"up":result<0?"down":""}">${signed(result)}</div><div class="s">What happened</div></div>
      <div class="tile"><div class="k">SHARK SCORE</div><div class="big">${S.score==null?"—":S.score}<small>/100</small></div><div class="s">How you played</div></div>
    </div>
    ${G.house?(()=>{const B=summarise(G.TB,99);return`<div class="twin" style="margin-top:8px"><div class="tile"><div class="k">BET SCORE</div><div class="big">${B.score==null?"—":B.score}<small>/100</small></div><div class="s">Bets by the count</div></div>
      <div class="tile"><div class="k">YOUR BETS' EDGE</div><div class="big ${G.betEV>0?"up":"down"}">${signed(Math.round(G.betEV))}</div><div class="s">expected chips; flat betting ${signed(Math.round(G.flatEV))}</div></div></div>
      <p class="small">What your bets were worth on average at the counts you faced (about ${(EDGE_PER_COUNT*100).toFixed(1)}% per point of true count, from ${(EDGE_OFF_TOP*100).toFixed(1)}% off the top), against betting one unit every hand.</p>`})():""}
    ${V?`<div class="verdict ${V.skilled?"ok":"fail"}" style="font-size:28px;margin-top:10px">${V.label}</div>
      <p class="small">Skilled: a Shark Score of ${VERDICT_RULES.skilledFrom} or more. Lucky: the cards paid more than your decisions were worth.</p>`
      :`<p class="lede" style="margin-top:10px">${S.decisions} decision${S.decisions===1?"":"s"} so far: play ${VERDICT_RULES.minDecisions}+ for a verdict.</p>`}
    <div class="outcome">Your decisions were worth <b>${signed(Math.round(S.expected))}</b> chips on average; the cards paid <b>${signed(result)}</b>. The difference, <b>${signed(Math.round(S.luck))}</b>, was luck.</div>
    <table class="tbl"><tbody>
      <tr><td>Hands</td><td class="n">${S.hands}</td></tr>
      <tr><td>Decisions</td><td class="n">${S.decisions}</td></tr>
      <tr><td>Optimal</td><td class="n">${S.optimal}</td></tr>
      ${SEVERITY.slice(1).map(s=>`<tr><td>${s.name}s</td><td class="n">${S.severity[s.id]}</td></tr>`).join("")}
      <tr><td>Expected chips given away by mistakes</td><td class="n">${fmt(S.evLost)}</td></tr>
      <tr><td>Chips: start → now</td><td class="n">${fmt(G.startChips)} → ${fmt(G.chips)}${G.refills?` (topped up ${G.refills}×)`:""}</td></tr>
    </tbody></table>
    ${S.decisions?`<div class="datechip" style="margin-top:12px">WHEN THE RIGHT PLAY WAS…</div>
    <table class="tbl"><tbody>${["hit","stand","double","split"].map(a=>`<tr><td>${ACTION_NAME[a]}</td><td class="n">${acc(S.byBest[a])}</td></tr>`).join("")}</tbody></table>
    <div class="datechip" style="margin-top:12px">BY HAND</div>
    <table class="tbl"><tbody>${GROUP_ORDER.filter(g=>S.byGroup[g]).map(g=>`<tr><td>${g}</td><td class="n">${acc(S.byGroup[g])}</td></tr>`).join("")}</tbody></table>`:""}
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>Biggest leak: ${S.leak.group}</b> · ${pctTxt(S.leak.acc)} right over ${S.leak.n} decisions, about ${fmt(S.leak.evLost)} chips given away.<br>${LEAK_NOTE[S.leak.group]||""}</div>`
      :S.decisions>=20?`<p class="small" style="margin-top:10px">No leak: no kind of hand with 8 or more decisions under 85% right.</p>`
      :`<p class="small" style="margin-top:10px">Too few decisions to name a leak: that needs 8 or more of one kind of hand.</p>`}
    ${button("more","Keep playing","Same session",true)}${button("fresh","New session",`${fmt(START_CHIPS)} chips, a new shoe`)}
    </div>`);
  $("more").onclick=renderTable;
  $("fresh").onclick=()=>{newSession();renderTable()};
}

renderStart();
