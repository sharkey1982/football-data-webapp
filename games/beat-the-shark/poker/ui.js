/* ===========================================================================
   poker/ui.js — the poker trainers' screens. First mode: Hand strength,
   in two parts: Name the hand, then Who wins?

   Each answer is judged at once: a quiet tick when right, a red band when
   wrong, and either way the best five cards lit up with the hand in words.
   Scored with the shared training framework (Hand Score). Last line starts.
   =========================================================================== */
/* No mode: the poker path (path.js), the list of every trainer. The games'
   picker has one Poker entry; on a trainer's page it starts that trainer. */
const PK_MODE=(()=>{try{const m=new URLSearchParams(location.search||"").get("mode");return m||"path"}catch(e){return"path"}})();
const PK_PICKER_ID="poker";
let Q=null;

function pkCardHTML(c,cls){const red=c.s===1||c.s===2;
  return`<span class="pc${red?" red":""}${cls?" "+cls:""}" aria-label="${PK_RANK_WORD[c.r]} of ${PK_SUIT_WORD[c.s]}"><b>${PK_RANK[c.r]}</b><i>${PK_SUIT[c.s]}</i></span>`}
/* Cards, lit if they are in the best five (after an answer). */
function rowHTML(cards,best,shown){return cards.map(c=>pkCardHTML(c,shown&&best?(best.five.some(x=>sameCard(x,c))?"in":"out"):"")).join("")}

function paintHeader(){
  if(PK_MODE==="path")return paintPathHeader();
  if(PK_MODE==="outs")return paintOutsHeader();
  if(PK_MODE==="pot")return paintPotHeader();
  if(PK_MODE==="equity")return paintEquityHeader();
  if(PK_MODE==="preflop")return paintPreflopHeader();
  if(PK_MODE==="ranges")return paintRangesHeader();
  if(PK_MODE==="match")return paintMatchHeader();
  if(PK_MODE==="postflop")return paintPostflopHeader();
  if(PK_MODE==="bluff")return paintBluffHeader();
  if(PK_MODE==="sizing")return paintSizingHeader();
  if(PK_MODE==="detective")return paintDetectiveHeader();
  const T=Q&&Q.T,sc=T?sharkScore(T):null,n=T?T.decisions.length:0,ok=T?T.decisions.filter(d=>d.optimal).length:0;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">HAND SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">Right</div><div class="v">${ok} / ${n}</div></div>
    <div class="two"><div class="k">Streak</div><div class="v">${Q?Q.streak:0}</div><div class="pts">best ${Q?Q.bestStreak:0}</div></div>`;
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · HAND STRENGTH${Q?` · ${Q.part==="who"?"WHO WINS?":"NAME THE HAND"}`:""}</span><span></span></div>`;
}
function screen(html){paintHeader();$("app").innerHTML=html}

/* ---- start ------------------------------------------------------------------------- */
function renderStart(){Q=null;
  const f=$("foot");if(f&&PK_MODE!=="path")f.innerHTML=`<a href="./">← All the poker trainers</a>`;
  renderGamePicker(PK_PICKER_ID,"../",PK_MODE==="path"?renderPath:PK_MODE==="outs"?renderOutsIntro:PK_MODE==="pot"?renderPotIntro:PK_MODE==="equity"?renderEquityIntro:PK_MODE==="preflop"?renderPreflopIntro:PK_MODE==="ranges"?renderRangesIntro:PK_MODE==="match"?renderMatchIntro:PK_MODE==="postflop"?renderPostflopIntro:PK_MODE==="bluff"?renderBluffIntro:PK_MODE==="sizing"?renderSizingIntro:PK_MODE==="detective"?renderDetectiveIntro:renderIntro)}
const EXAMPLES=[[[14,0],[14,1],[14,2],[14,3],[13,0]],[[13,2],[13,3],[13,1],[9,0],[9,2]]];
function renderIntro(){
  paintHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · HAND STRENGTH</div>
    <div class="mission">What have you got?</div>
    <p class="lede" style="margin-top:10px">Texas hold'em: your two cards and the five on the table. Your hand is the best five of the seven, using any mix of them, even none of yours.</p></div>
    <div class="card"><div class="datechip">THE HANDS, BEST FIRST</div>
      <table class="tbl"><tbody>${CATEGORIES.slice().reverse().map((c,i)=>`<tr><td><b>${c}</b></td><td class="small">${HAND_HINT[8-i]}</td></tr>`).join("")}</tbody></table>
      <div class="datechip" style="margin:12px 0 6px">PICK A PART</div><div id="ch"></div></div>`;
  choiceCards($("ch"),[{id:"name",t:"Name the hand",d:"Your cards and the board: what's your hand?"},{id:"who",t:"Who wins?",d:"Two players, one board: who takes the pot?"}],"Deal",id=>{newQuiz(id);next()});
}
const HAND_HINT=["The highest card plays","Two of the same rank","Two different pairs","Three of the same rank","Five in a row (A-2-3-4-5 counts)","Five of one suit","Three of a kind and a pair","Four of the same rank","Five in a row, one suit"];
function newQuiz(part){Q={part,T:newTrainingSession("poker-hands",{part}),streak:0,bestStreak:0,q:null,answered:false,n:0};btsTrack("pk_hands_start",{part})}

/* ---- a question ------------------------------------------------------------------- */
function next(){Q.q=Q.part==="who"?whoQuestion():nameQuestion();Q.answered=false;Q.n++;renderQuestion()}
function renderQuestion(){
  const q=Q.q,shown=Q.answered;
  if(q.kind==="name"){
    screen(`<div class="card"><div class="datechip">NAME THE HAND · ${Q.n} · ${q.street.toUpperCase()}</div>
      <div class="seat"><div class="who">THE BOARD</div><div class="cards">${rowHTML(q.board,q.best,shown)}</div></div>
      <div class="seat"><div class="who">YOUR CARDS</div><div class="cards">${rowHTML(q.hole,q.best,shown)}</div></div>
      <div id="fb">${shown?feedbackHTML():""}</div>
      ${shown?nextButtons():`<div class="answers">${CATEGORIES.map((c,i)=>`<button class="ans" id="c-${i}">${c}</button>`).join("")}</div>`}</div>`);
    if(!shown)CATEGORIES.forEach((c,i)=>$("c-"+i).onclick=()=>answer(i));
  }else{
    screen(`<div class="card"><div class="datechip">WHO WINS? · ${Q.n}</div>
      <div class="seat"><div class="who">PLAYER A${shown?` <span class="tot">${describeHand(q.A)}</span>`:""}</div><div class="cards">${rowHTML(q.a,q.A,shown)}</div></div>
      <div class="seat"><div class="who">THE BOARD</div><div class="cards">${rowHTML(q.board,q.answer==="B"?q.B:q.A,shown)}</div></div>
      ${shown?`<p class="small" style="margin:-4px 0 8px">Lit on the board: ${q.answer==="split"?"the five both players share":`the winner's best five`}.</p>`:""}
      <div class="seat"><div class="who">PLAYER B${shown?` <span class="tot">${describeHand(q.B)}</span>`:""}</div><div class="cards">${rowHTML(q.b,q.B,shown)}</div></div>
      <div id="fb">${shown?feedbackHTML():""}</div>
      ${shown?nextButtons():`<div class="answers three">${[["A","Player A"],["split","Split pot"],["B","Player B"]].map(([k,t])=>`<button class="ans" id="w-${k}">${t}</button>`).join("")}</div>`}</div>`);
    if(!shown)["A","split","B"].forEach(k=>$("w-"+k).onclick=()=>answer(k));
  }
  const nb=$("next");if(shown&&nb)nb.onclick=next;const rp=$("report");if(shown&&rp)rp.onclick=renderReport;
  const sw=$("switch");if(shown&&sw)sw.onclick=()=>{Q.part=Q.part==="who"?"name":"who";next()};
}
function nextButtons(){return`${button("next","Next hand","",true)}<div class="endrow2">${Q.T.decisions.length>=5?button("report","Finish: your report",`${Q.T.decisions.length} answered`):""}
  ${button("switch",Q.part==="who"?"Switch to Name the hand":"Switch to Who wins?","")}</div>`}
function answer(a){
  const q=Q.q;Q.answered=true;
  const best=q.kind==="name"?q.best.cat:q.answer;
  const rec=recordDecision(Q.T,{situation:q.kind==="name"?describeHand(q.best):q.type,group:q.kind==="name"?(q.trap?TRAPS[q.trap].name:CATEGORIES[q.best.cat]):WHO_GROUP[q.type],
    chosen:a,best,stake:1,trap:q.trap||null});
  Q.last=rec;if(rec.optimal){Q.streak++;Q.bestStreak=Math.max(Q.bestStreak,Q.streak)}else Q.streak=0;
  btsTrack("pk_hands_answer",{part:Q.part,right:rec.optimal?1:0});
  renderQuestion();
}
const WHO_GROUP={kicker:"Same kind of hand",category:"Different hands",split:"Split pots"};
function feedbackHTML(){
  const q=Q.q,d=Q.last;
  if(q.kind==="name"){
    const words=describeHand(q.best),mine=q.best.five.filter(c=>q.hole.some(x=>sameCard(x,c))).length;
    const plays=mine===0?"Neither of your cards plays: the board is your hand.":mine===1?"One of your cards plays.":"Both your cards play.";
    const trapNote=q.trap?TRAP_NOTE[q.trap]:"";
    return d.optimal?`<div class="okline">✓ <b>Right</b>: ${words}. <span class="small">${plays}</span></div>${trapNote?`<p class="small">${trapNote}</p>`:""}`
      :`<div class="lesson sev-mistake" role="alert"><div class="band">✗ ${CATEGORIES[q.best.cat].toUpperCase()}, NOT ${CATEGORIES[d.chosen].toUpperCase()}</div><div class="lb">
        <p class="lt"><b>${words}.</b> ${plays} The lit cards are your best five.</p>${trapNote?`<p class="lw">${trapNote}</p>`:""}</div></div>`;
  }
  const why=compareText(q.A,q.B,"A","B");
  const ans=q.answer==="split"?"A SPLIT POT":`PLAYER ${q.answer} WINS`;
  return d.optimal?`<div class="okline">✓ <b>Right</b>: ${why}</div>`
    :`<div class="lesson sev-mistake" role="alert"><div class="band">✗ ${ans}</div><div class="lb"><p class="lt">${why}</p>
      ${q.type==="kicker"?`<p class="lw">When both have the same kind of hand, compare the cards that make up the five, highest first: the first one that differs decides it.</p>`:""}
      ${q.type==="split"?`<p class="lw">Each player's hand is only their best five. If those five are the same, the pot is shared, even when the other cards differ.</p>`:""}</div></div>`;
}
const TRAP_NOTE={
  boardPlays:"The five on the board are better than anything your cards add: you play the board.",
  wheel:"Ace-two-three-four-five is a straight: the ace plays low, and it is the lowest straight (five high).",
  threePairs:"Seven cards can hold three pairs, but a hand is five cards: the two best pairs and the best card left.",
  twoTrips:"Two sets of three: the higher three and two of the others make a full house.",
  flushOverStraight:"A flush beats a straight: when you have both, the flush is your hand.",
  sixSuited:"With six of a suit, your flush is the best five of them: the lowest one doesn't count.",
  playsOneCard:"Only one of your two cards is in your best five; the other is too low to matter."};

/* ---- the report ----------------------------------------------------------------- */
function renderReport(){
  const S=summarise(Q.T,3);btsTrack("pk_hands_report",{answered:S.decisions,score:S.score==null?-1:S.score});
  pkRecord("hands",S);
  const groups=Object.entries(S.byGroup).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n);
  screen(`<div class="card"><div class="datechip">HAND STRENGTH · ${S.decisions} ANSWERED</div>
    <div class="twin"><div class="tile"><div class="k">HAND SCORE</div><div class="big">${S.score}<small>/100</small></div><div class="s">Answers right</div></div>
      <div class="tile"><div class="k">BEST STREAK</div><div class="big">${Q.bestStreak}</div><div class="s">in a row</div></div></div>
    <div class="datechip" style="margin-top:12px">BY KIND OF QUESTION</div>
    <table class="tbl"><tbody>${groups.map(([g,o])=>`<tr><td>${g}</td><td class="n">${o.ok} of ${o.n}</td></tr>`).join("")}</tbody></table>
    ${S.leak?`<div class="outcome" style="border-left-color:var(--bad);margin-top:10px"><b>To work on: ${S.leak.group}</b> · ${S.leak.ok} of ${S.leak.n} right.</div>`:`<p class="small" style="margin-top:8px">No weak spot yet: that needs three or more of one kind of question with some wrong.</p>`}
    <p class="small">${S.score>=90&&S.decisions>=15?"Ready for the next step: outs and draws, where the question becomes what you might make.":"Reading hands fast and right is the base of everything that follows: keep going."}</p>
    ${button("next","Keep going","Same part",true)}${button("switch",Q.part==="who"?"Switch to Name the hand":"Switch to Who wins?","")}</div>`);
  $("next").onclick=next;$("switch").onclick=()=>{Q.part=Q.part==="who"?"name":"who";next()};
}

renderStart();
