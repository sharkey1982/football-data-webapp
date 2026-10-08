/* ===========================================================================
   poker/matchui.js — "Heads-up: short stacks": the match screens.

   Each hand: the blinds and the stacks, your cards, the Shark's move when
   it acts first; Shove / Call / Fold. Then the hand plays out (the Shark's
   cards shown when it goes all in), and two verdicts side by side: what the
   cards paid, and what your decision was worth, from the Shark's model.
   When they disagree the Shark says so: "You won the pot. The Shark says it
   was a bad call." The end: who won, then skill and luck apart (Shark
   Score, big blinds given away, result against what the decisions were
   worth), the biggest mistakes, too tight or too loose.
   =========================================================================== */
let MT=null;
const MT_BB_SCALE=5; // severity as the Pre-flop trainer: big blinds lost ÷ 5
/* A session of games: each game is played until one side has every chip
   (often only a handful of hands at these stacks); the decisions build up
   across games, and the session report reads them all. */
function newMatchGame(){MT={M:newMatchState(),T:newTrainingSession("poker-match"),h:null,rec:null,chips:[],games:[],gameStart:0};btsTrack("pk_match_start",{})}
function nextGame(){MT.M=newMatchState();MT.gameStart=MT.T.decisions.length;nextMatchHand()}
const mtScore=()=>({you:MT.games.filter(g=>g==="you").length,shark:MT.games.filter(g=>g==="shark").length});
const mtChips=n=>Math.round(n).toLocaleString("en-GB"),mtSigned=n=>`${n>0?"+":n<0?"−":""}${mtChips(Math.abs(n))}`;
function paintMatchHeader(){
  const T=MT&&MT.T,sc=T?sharkScore(T):null,M=MT&&MT.M;
  $("hScore").innerHTML=`${sc==null?"—":sc}<span class="sub">SHARK SCORE</span>`;
  $("hTwo").innerHTML=`<div class="two"><div class="k">You</div><div class="v">${M?mtChips(M.you):mtChips(MT_START)}</div></div>
    <div class="two"><div class="k">The Shark</div><div class="v">${M?mtChips(M.shark):mtChips(MT_START)}</div></div>`;
  const b=M?mtBlinds(M):MT_LEVELS[0];
  $("hSeason").innerHTML=`<div class="lbl"><span>HEADS-UP · ${M&&M.hand?`HAND ${M.hand} · `:""}BLINDS ${b[0]}/${b[1]}</span><span></span></div>
    ${M?`<div class="track"><i style="width:${(M.you/(2*MT_START))*100}%"></i></div>`:""}`;
}
function renderMatchIntro(){
  MT=null;paintMatchHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">POKER · HEADS-UP: SHORT STACKS</div>
    <div class="mission">Beat the Shark</div>
    <p class="lede" style="margin-top:10px">A match, you against the Shark: ${mtChips(MT_START)} chips each, the blinds going up every ${MT_PER_LEVEL} hands. Every hand is all in or fold, before the flop. Win or lose, the Shark scores your <b>decisions</b>, not your luck.</p>
    <p class="small" style="margin-top:8px">The Shark plays the solved strategy: no one can beat it over time. Play perfectly and you break even; every mistake hands it chips.</p></div>
    <div class="card"><div class="datechip">HOW IT WORKS</div>
      <table class="tbl"><tbody>
        <tr><td>The stacks</td><td class="n">20 big blinds, then shorter</td></tr>
        <tr><td>Small blind</td><td class="n">shove or fold</td></tr>
        <tr><td>Big blind, facing a shove</td><td class="n">call or fold</td></tr>
        <tr><td>The Shark</td><td class="n">the solved strategy</td></tr></tbody></table>
      <p class="small">This is short-stack poker, as at the end of a tournament: there's no betting after the flop. The Pre-flop trainer teaches every decision in it.</p>
      ${button("go","Start playing","",true)}</div>`;
  $("go").onclick=()=>{newMatchGame();nextMatchHand()};
}
function nextMatchHand(){
  const M=MT.M;if(M.over)return renderGameEnd();
  MT.h=mtDeal(M);MT.rec=null;
  if(!mtYourChoice(MT.h)){mtPlay(M,MT.h,null);mtRecordOutcome(null)}
  renderMatchHand();
}
function mtRecordOutcome(choice){
  /* expected: what your decision was worth; with no decision, a fold's sure
     chips, or for the blinds' all in, your share of the pot (no skill in it) */
  const h=MT.h,expected=choice?(h.yourMove==="fold"?choice.foldV:choice.playV)*h.BB
    :h.auto?h.E*(2*sandbox(()=>equity(h.you,h.shark,[],4000).eq,"MT|"+h.no)-1):h.net;
  recordOutcome(MT.T,{net:h.net,expected,hand:h.no});MT.chips.push(MT.M.you);
}
function matchAnswer(move){
  const h=MT.h,c=mtYourChoice(h),val=x=>x==="fold"?c.foldV:c.playV,best=c.playV>c.foldV?c.play:"fold",gain=c.playV-c.foldV;
  const lost=Math.max(0,Math.max(c.playV,c.foldV)-val(move)),close=Math.abs(gain)<PF_CLOSE;
  const rec=recordDecision(MT.T,{situation:`${h.youName} at ${h.S.toFixed(1)} bb (${h.sb==="you"?"small blind":"big blind"})`,group:`${h.sb==="you"?"Small blind":"Big blind"}, ${pfStackGroup(Math.round(h.S))}`,
    chosen:move,best,optimal:move===best||close,evChosen:-lost/MT_BB_SCALE,evBest:0,stake:1,lostBB:lost,gain,hand:h.no});
  MT.rec=rec;MT.choice=c;
  mtPlay(MT.M,h,move);mtRecordOutcome(c);
  btsTrack("pk_match_hand",{right:rec.optimal?1:0});renderMatchHand();
}
function renderMatchHand(){
  const h=MT.h,M=MT.M,c=mtYourChoice(h),done=h.net!=null;paintMatchHeader();
  const showShark=done&&h.show,sbYou=h.sb==="you";
  const sharkBox=!done&&h.sb==="shark"&&h.sharkMove==="shove"?`<div class="outcome" style="margin:4px 0 0;border-left-color:var(--bad)"><b>The Shark shoves all in: ${mtChips(h.E)} (${h.S.toFixed(1)} big blinds).</b></div>`:"";
  const board=done&&h.show?`<div class="seat"><div class="who">THE BOARD</div><div class="cards">${h.board.map(c=>pkCardHTML(c)).join("")}</div></div>`:"";
  const desc=cs=>describeHand(bestHand(cs.concat(h.board)));
  $("app").innerHTML=`<div class="card"><div class="datechip">HAND ${h.no} · BLINDS ${h.SB}/${h.BB} · ${h.S.toFixed(1)} BIG BLINDS EFFECTIVE</div>
    <div class="seat"><div class="who">THE SHARK · ${sbYou?"BIG BLIND":"SMALL BLIND"}${showShark?` <span class="tot">${desc(h.shark)}</span>`:""}</div>
      <div class="cards">${showShark?h.shark.map(c=>pkCardHTML(c)).join(""):`<span class="pc back"></span><span class="pc back"></span>`}</div>${sharkBox}</div>
    ${board}
    <div class="seat"><div class="who">YOU · ${sbYou?"SMALL BLIND":"BIG BLIND"} <span class="tot">${done&&h.show?desc(h.you):h.youName}</span></div><div class="cards">${h.you.map(c=>pkCardHTML(c)).join("")}</div></div>
    ${!done&&c?`<p class="small" style="margin:6px 0 0">${sbYou?`You're in the small blind (${h.SB}). Shove all ${mtChips(h.E)}, or fold?`:`You're in the big blind (${h.BB}). Call ${mtChips(h.E-h.BB)} more, or fold?`}</p>`:""}</div>
    <div class="card">${done?matchResultHTML()+button("next",M.over?"The game's result":"Next hand","",true)
      :`<div class="answers"><button class="ans big fold" id="mt-fold">Fold</button><button class="ans big call" id="mt-play">${c.play==="shove"?"Shove":"Call"}</button></div>`}</div>`;
  if(!done){$("mt-fold").onclick=()=>matchAnswer("fold");$("mt-play").onclick=()=>matchAnswer(c.play)}
  else $("next").onclick=nextMatchHand;
}
const MT_MOVE={shove:"shove",call:"call",fold:"fold"},MT_ING={shove:"Shoving",call:"Calling",fold:"Folding"};
function matchResultHTML(){
  const h=MT.h,r=MT.rec;
  const result=h.what==="sharkfold"?`The Shark folds: you win ${mtChips(h.net)}.`:h.what==="youfold"?`You fold: the Shark wins ${mtChips(-h.net)}.`
    :h.split?"A split pot.":h.net>0?`You win ${mtChips(h.net)}.`:`The Shark wins ${mtChips(-h.net)}.`;
  const auto=h.auto?`<p class="small">The blinds put the short stack all in: no decision this hand, just the cards.</p>`:"";
  const resLine=`<div class="outcome" style="border-left-color:${h.net>0?"var(--good)":h.net<0?"var(--bad)":"var(--line)"}"><b>${result}</b></div>`;
  if(!r)return resLine+auto;
  const c=MT.choice,gainBB=c.playV-c.foldV,worth=(r.chosen==="fold"?c.foldV:c.playV),chipsWorth=worth*h.BB;
  const table=`<table class="tbl" style="margin-top:6px"><tbody>
    <tr><td>${MT_ING[c.play]} ${h.youName}</td><td class="n" style="color:${gainBB>0?"var(--good)":"var(--bad)"}">${bbText(c.playV)}</td></tr>
    <tr><td>Folding</td><td class="n">${bbText(c.foldV)}</td></tr></tbody></table>
    <p class="small">On average, against the hands the Shark ${c.play==="shove"?"calls":"shoves"} with at ${h.S.toFixed(1)} big blinds. This hand paid ${mtSigned(h.net)}; your decision was worth ${mtSigned(chipsWorth)} on average, so the cards gave you ${mtSigned(h.net-chipsWorth)}.</p>`;
  const won=h.net>0,lostPot=h.net<0&&h.show;
  if(r.optimal){
    const note=lostPot?`<p class="small"><b>You lost the pot, but it was the right ${MT_MOVE[r.chosen]}.</b> Make it every time and it wins over time.</p>`:"";
    return resLine+`<div class="okline">✓ <b>The Shark agrees</b>: ${MT_MOVE[r.chosen]}${r.chosen!==r.best?" (a coin flip: either is fine)":""}.</div>${note}${table}`;
  }
  const sev=SEVERITY.find(s=>s.id===r.severity);
  const headline=won&&r.chosen!=="fold"?`You won the pot. The Shark says it was a bad ${MT_MOVE[r.chosen]}.`:r.chosen==="fold"?`${MT_ING[c.play]} was right: folding gave away ${r.lostBB.toFixed(2)} big blinds on average.`:`A bad ${MT_MOVE[r.chosen]}: it gives away ${r.lostBB.toFixed(2)} big blinds on average.`;
  return resLine+`<div class="lesson sev-${r.severity}" role="alert"><div class="band">✗ ${sev.name.toUpperCase()} · ${r.best.toUpperCase()} WAS RIGHT</div><div class="lb">
    <p class="lt">${headline}</p>${table}</div></div>`;
}
function renderGameEnd(){
  pkMarkDone("match");
  const M=MT.M;if(!M.counted){M.counted=true;MT.games.push(M.winner)}
  const sc=mtScore(),youWon=M.winner==="you",ds=MT.T.decisions.slice(MT.gameStart),ok=ds.filter(d=>d.optimal).length;
  btsTrack("pk_match_game",{won:youWon?1:0,hands:M.hand});paintMatchHeader();
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">GAME ${MT.games.length} · ${M.hand} HANDS</div>
    <div class="mission">${youWon?"You win the game":"The Shark wins the game"}</div>
    <p class="lede" style="margin-top:8px">Games: you ${sc.you}, the Shark ${sc.shark}. This game, the Shark agreed with ${ok} of your ${ds.length} decision${ds.length===1?"":"s"}.</p></div>
    <div class="card"><p class="small">At these stacks one all in can decide a game, so the cards swing it. The Shark judges the decisions across the whole session: ${MT.T.decisions.length} so far${MT.T.decisions.length<VERDICT_RULES.minDecisions?`, ${VERDICT_RULES.minDecisions} for a verdict`:""}.</p>
    ${button("again","Next game","",true)}${button("report","Session report",`${MT.games.length} game${MT.games.length===1?"":"s"}, ${MT.T.decisions.length} decisions`)}</div>`;
  $("again").onclick=nextGame;$("report").onclick=renderMatchEnd;
}
function renderMatchEnd(){
  const M=MT.M,S=summarise(MT.T,3),V=verdictOf(S),sc=mtScore(),youWon=sc.you>sc.shark;
  pkRecord("match",S);
  btsTrack("pk_match_end",{games:MT.games.length,won:sc.you,score:S.score==null?-1:S.score});
  paintMatchHeader();
  const lostBB=MT.T.decisions.reduce((a,d)=>a+(d.optimal?0:d.lostBB),0);
  const worst=MT.T.decisions.filter(d=>!d.optimal).sort((a,b)=>b.lostBB-a.lostBB).slice(0,3);
  const ds=MT.T.decisions.filter(d=>!d.optimal),tight=ds.filter(d=>d.chosen==="fold").length,loose=ds.length-tight;
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">HEADS-UP · SESSION · ${MT.games.length} GAME${MT.games.length===1?"":"S"}</div>
    <div class="mission">Games: you ${sc.you}, the Shark ${sc.shark}</div>
    ${V?`<div class="verdict ${V.skilled?"ok":"fail"}" style="font-size:26px;margin-top:8px">${V.label}</div>`
      :`<p class="lede" style="margin-top:8px">${S.decisions} decision${S.decisions===1?"":"s"}: a verdict needs ${VERDICT_RULES.minDecisions}. Here's how they went.</p>`}</div>
    <div class="card"><div class="twin"><div class="tile"><div class="k">SHARK SCORE</div><div class="big">${S.score==null?"—":S.score}<small>/100</small></div><div class="s">Decisions right</div></div>
      <div class="tile"><div class="k">GIVEN AWAY</div><div class="big ${lostBB>0?"down":""}">${lostBB.toFixed(1)}</div><div class="s">big blinds, on average</div></div></div>
    <div class="outcome" style="margin-top:10px">Your decisions were worth <b>${mtSigned(S.expected)}</b> chips on average; the cards paid <b>${mtSigned(S.result)}</b>. The difference, <b>${mtSigned(S.luck)}</b>, was luck.</div>
    ${worst.length?`<div class="datechip" style="margin:12px 0 6px">YOUR BIGGEST MISTAKES</div><table class="tbl"><tbody>${worst.map(d=>`<tr><td>Hand ${d.hand}: ${d.chosen} ${d.situation}</td><td class="n">−${d.lostBB.toFixed(2)} bb</td></tr>`).join("")}</tbody></table>`:`<p class="small" style="margin-top:8px">Not one decision the Shark would change.</p>`}
    ${ds.length>=2&&tight!==loose?`<p class="small" style="margin-top:8px">Your mistakes lean <b>${tight>loose?"too tight":"too loose"}</b>: ${tight>loose?"short-stacked, the blinds are worth fighting for.":"you put chips in with hands that lose against the Shark's range."}</p>`:""}
    ${button("again","Next game","",true)}${button("fresh","Start a new session","")}</div>`;
  $("again").onclick=nextGame;$("fresh").onclick=()=>{newMatchGame();nextMatchHand()};
}
