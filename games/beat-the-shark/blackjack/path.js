/* ===========================================================================
   blackjack/path.js — the blackjack page: the three games in order, as the
   poker path (poker/path.js).

   The games' picker offers "Blackjack" once; it opens here (no ?mode).
   Basic strategy, then the count, then betting by the count: each builds
   on the one before. Each has a tick once you've reached its report and
   its best and latest score (reports of BJ_MIN_SCORED+ decisions), kept in
   this browser (localStorage; the page works without it). "Next" marks
   the first not yet done. Each game's footer links back here.
   =========================================================================== */
const BJ_PATH=[
  {mode:"basic",t:"Basic strategy",d:"Hit, stand, double or split: play every hand right"},
  {mode:"count",t:"What's the count?",d:"Keep the Hi-Lo count as the cards come out"},
  {mode:"house",t:"Beat the house",d:"Basic strategy plus the count: bet more when the deck is good"}];
const BJ_DONE_KEY="bts-blackjack-done",BJ_SCORE_KEY="bts-blackjack-scores",BJ_MIN_SCORED=5;
function bjDoneSet(){try{return new Set(JSON.parse(localStorage.getItem(BJ_DONE_KEY)||"[]"))}catch(e){return new Set()}}
function bjScores(){try{return JSON.parse(localStorage.getItem(BJ_SCORE_KEY)||"{}")||{}}catch(e){return{}}}
function bjMarkDone(mode){try{const s=bjDoneSet();if(!s.has(mode)){s.add(mode);localStorage.setItem(BJ_DONE_KEY,JSON.stringify([...s]))}}catch(e){}}
function bjRecord(mode,S){
  bjMarkDone(mode);
  if(!S||S.score==null||S.decisions<BJ_MIN_SCORED)return;
  try{const all=bjScores(),o=all[mode]||{best:0};
    all[mode]={best:Math.max(o.best||0,S.score),last:S.score,n:S.decisions,when:new Date().toISOString().slice(0,10)};
    localStorage.setItem(BJ_SCORE_KEY,JSON.stringify(all))}catch(e){}
}
function bjClear(){try{localStorage.removeItem(BJ_DONE_KEY);localStorage.removeItem(BJ_SCORE_KEY)}catch(e){}}
function paintBjPathHeader(){
  const done=bjDoneSet(),n=BJ_PATH.filter(s=>done.has(s.mode)).length;
  $("hScore").innerHTML=`${n}<span class="sub">OF ${BJ_PATH.length} DONE</span>`;$("hTwo").innerHTML="";
  $("hSeason").innerHTML=`<div class="lbl"><span>BLACKJACK · THE PATH</span><span></span></div><div class="track"><i style="width:${n/BJ_PATH.length*100}%"></i></div>`;
}
function renderBjPath(){
  paintBjPathHeader();
  const done=bjDoneSet(),sc=bjScores(),next=BJ_PATH.find(s=>!done.has(s.mode));
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">BEAT THE SHARK · BLACKJACK</div>
    <div class="mission">Beat the house</div>
    <p class="lede" style="margin-top:10px">Three steps, each building on the last: play every hand right, keep the count, then bet by it. Fictional chips; every decision judged against the maths.</p></div>
    <div class="card">${BJ_PATH.map((s,i)=>{const d=done.has(s.mode),nx=next&&next.mode===s.mode;
      return`<a class="choice pathstep${nx?" primary":""}" href="?mode=${s.mode}#play" style="display:flex;gap:12px;align-items:center;text-decoration:none">
        <span class="pathno${d?" done":""}">${d?"✓":i+1}</span><span style="flex:1"><span class="t">${s.t}${nx?" · next":""}</span><span class="d">${s.d}</span></span>
        ${sc[s.mode]?`<span class="pathsc"><b>${sc[s.mode].best}</b><i>best${sc[s.mode].last!==sc[s.mode].best?` · last ${sc[s.mode].last}`:""}</i></span>`:""}</a>`}).join("")}</div>
    <p class="small" style="text-align:center">Ticks and scores are kept in this browser. A score needs a report of ${BJ_MIN_SCORED} or more decisions. <a href="#" id="bjclear" style="color:inherit">Clear them</a></p>`;
  const c=$("bjclear");if(c)c.onclick=e=>{if(e&&e.preventDefault)e.preventDefault();bjClear();renderBjPath()};
}
