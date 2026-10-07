/* ===========================================================================
   blackjack/ui.js — screens: start, the table (dealer, your hand, stake,
   HIT | STAND | DOUBLE | SPLIT, then the result and the verdict on your
   decisions), and the session report. Last line starts the game.

   Learn mode (V1): every decision is judged the moment you make it.
   =========================================================================== */
const START_CHIPS=10000;
const STAKES=[100,250,500,1000];
const MODE="learn"; // later: "practice" (judged at the end of the hand), "session", "challenge"
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
    <div class="two"><div class="k">Decisions</div><div class="v">${opt} / ${n}</div><div class="pts">optimal</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>LEARN MODE · HAND ${G.hands+(G.R&&G.R.phase==="player"?1:0)}</span><span>CHIPS: RESULTS · SCORE: DECISIONS</span></div>`;
}
function screen(html){paintHeader();$("app").innerHTML=html}

/* ---- start --------------------------------------------------------------------- */
function renderStart(){G=null;renderGamePicker("blackjack","../",renderIntro)}
function renderIntro(){
  $("hScore").innerHTML=`—<span class="sub">SHARK SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Shark Chips</div><div class="v">${fmt(START_CHIPS)}</div></div><div class="two"><div class="k">Decisions</div><div class="v">0</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>LEARN MODE</span><span>CHIPS: RESULTS · SCORE: DECISIONS</span></div>`;
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">BLACKJACK TRAINER</div>
    <div class="mission">Did you win?<br>Did you play it right?</div>
    <p class="lede" style="margin-top:10px">Two different questions. Your chips answer the first. Your Shark Score answers the second, decision by decision, against basic strategy.</p></div>
    <div class="card"><div class="datechip">THE TABLE</div>
      <ul class="rules">${rulesText(RULES_V1).map(t=>`<li>${t}</li>`).join("")}</ul>
      <p class="small">You start with ${fmt(START_CHIPS)} Shark Chips. They are fictional: they can't be bought, won, cashed or swapped for anything.</p>
      ${button("go","Take a seat","Learn mode: every decision judged as you make it",true)}</div>`;
  $("go").onclick=()=>{newSession();btsTrack("bj_session_start",{mode:MODE});renderTable()};
}
function newSession(keepShoe){
  G={rules:RULES_V1,shoe:keepShoe&&G?G.shoe:newShoe(RULES_V1),chips:keepShoe&&G?G.chips:START_CHIPS,stake:keepShoe&&G?G.stake:STAKES[1],
    T:newTrainingSession("blackjack",{mode:MODE}),R:null,hands:0,handDecisions:[],firstEV:null,last:null};
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
      ${playing?`<div class="acts">${["hit","stand","double","split"].map(a=>`<button class="act" id="a-${a}" ${legal.includes(a)?"":"disabled"}>${ACTION_NAME[a]}</button>`).join("")}</div>`
        :stakeHTML()}
      <div id="fb">${feedbackHTML()}</div>
    </div>
    ${G.hands&&!playing?`<div class="endrow">${button("report","End session: your report",`${G.hands} hand${G.hands>1?"s":""} · ${G.T.decisions.length} decisions`)}</div>`:""}`);
  if(playing)["hit","stand","double","split"].forEach(a=>{const b=$("a-"+a);if(b)b.onclick=()=>{if(legal.includes(a))doAction(a)}});
  else wireStakes();
  const rep=$("report");if(rep)rep.onclick=renderReport;
}
function stakeHTML(){
  if(G.chips<STAKES[0])return`<p class="lede">Out of Shark Chips.</p>${button("refill",`Back to ${fmt(START_CHIPS)} Shark Chips`,"They're free and worth nothing: your Shark Score carries on",true)}`;
  return`<div class="datechip" style="margin:4px 0 6px">${G.R?"NEXT HAND · ":""}YOUR STAKE</div>
    <div class="stakes">${STAKES.map(v=>`<button class="stk" id="s-${v}" aria-pressed="${G.stake===v}" ${v>G.chips?"disabled":""}>${fmt(v)}</button>`).join("")}</div>
    ${button("deal",G.R?"Deal the next hand":"Deal","",true)}`;
}
function wireStakes(){
  if(G.chips<STAKES[0]){$("refill").onclick=()=>{G.chips=START_CHIPS;G.refills=(G.refills||0)+1;renderTable()};return}
  STAKES.forEach(v=>{const b=$("s-"+v);if(b)b.onclick=()=>{if(v<=G.chips){G.stake=v;renderTable()}}});
  if(G.stake>G.chips)G.stake=STAKES.filter(v=>v<=G.chips).pop();
  $("deal").onclick=deal;
}
function deal(){
  if(needsShuffle(G.shoe,G.rules)){G.shoe=newShoe(G.rules);G.shuffled=true}else G.shuffled=false;
  G.R=newRound(G.shoe,G.rules,G.stake);G.handDecisions=[];G.firstEV=null;G.last=null;
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
    chosen:a,best,evChosen:evs[a],evBest:evs[best],stake:R.bet,evs,why:whyLine(cards,up,G.rules,best,canSplit),hand:G.hands+1});
  G.handDecisions.push(rec);G.last=rec;
  act(R,G.shoe,a);
  if(R.phase==="done")return settle();
  renderTable();
}
function settle(){
  const R=G.R;G.chips+=R.net;G.hands++;
  const lost=G.handDecisions.reduce((s,d)=>s+d.evLoss*d.stake,0);
  const expected=G.handDecisions.length?G.firstEV*R.bet-lost:R.net;  // no decision: it was what it was
  recordOutcome(G.T,{net:R.net,expected,decisions:G.handDecisions.length});
  btsTrack("bj_hand",{outcome:R.net>0?"win":R.net<0?"lose":"push",decisions:G.handDecisions.length,optimal:G.handDecisions.filter(d=>d.optimal).length});
  renderTable();
}

/* ---- feedback: the decision, then the result ------------------------------------ */
function decisionLine(d,full){
  const sev=SEVERITY.find(s=>s.id===d.severity),cost=d.evLoss*d.stake;
  const evList=Object.entries(d.evs).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${ACTION_NAME[k]} ${v>=0?"+":"−"}${pctTxt(Math.abs(v))}`).join(" · ");
  return`<div class="dec ${d.optimal?"ok":"bad"}"><div class="dh">${d.optimal?"✓":"✗"} <b>${sev.name}</b>: ${d.optimal?`${ACTION_NAME[d.chosen]} on ${d.situation}.`:
      `you chose ${ACTION_NAME[d.chosen]} on ${d.situation}. ${ACTION_NAME[d.best]} was the basic-strategy play.`}</div>
    ${full?`${d.optimal?"":`<div class="dd">Cost: about ${pctTxt(d.evLoss)} of your stake on average (${fmt(cost)} chips), whatever this hand did.</div>`}
    ${d.why?`<div class="dd">${d.why}</div>`:""}
    <div class="dd ev">Average return per chip staked: ${evList}</div>`:""}</div>`;
}
function feedbackHTML(){
  const R=G.R;if(!R)return`<p class="small" style="margin-top:10px">Pick a stake and deal. After every decision you'll see whether it was the basic-strategy play, separately from whether the hand won.</p>`;
  if(R.phase==="player")return G.last?decisionLine(G.last,true):"";
  const ds=G.handDecisions,clean=ds.every(d=>d.optimal),won=R.net>0,lost=R.net<0;
  let head;
  if(!ds.length)head=R.playerBJ&&R.dealerBJ?"Both blackjack: a push. No decision to make.":R.playerBJ?"Blackjack! No decision to make.":"Dealer blackjack. No decision to make.";
  else if(won)head=clean?"You won — and played it right.":`You won the hand — but made the wrong decision${ds.filter(d=>!d.optimal).length>1?"s":""}.`;
  else if(lost)head=clean?"You lost the hand — but played it correctly. That was variance, not a mistake.":"You lost the hand, and the decision cost you as well.";
  else head=clean?"A push — and played it right.":"A push — but not the right play.";
  return`<div class="verdictbox">
      <div class="vb"><div class="k">RESULT</div><div class="v ${won?"up":lost?"down":""}">${R.net?`You ${won?"won":"lost"} ${fmt(Math.abs(R.net))} chips`:"Push: stake back"}</div></div>
      <div class="vb"><div class="k">DECISIONS</div><div class="v ${ds.length?(clean?"up":"down"):""}">${ds.length?`${ds.filter(d=>d.optimal).length} of ${ds.length} optimal`:"None to make"}</div></div></div>
    <p class="headline">${head}</p>
    ${ds.map(d=>decisionLine(d,ds.length===1||!d.optimal)).join("")}
    ${G.shuffled?`<p class="small">The shoe was reshuffled before this hand.</p>`:""}`;
}

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
