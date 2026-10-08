/* ===========================================================================
   poker/path.js — the poker path: every trainer in order, one place.

   The games' picker offers "Poker" once; it opens here. The trainers are
   listed in Chris's order, grouped, each with what it teaches and a tick
   once you've reached its report (this browser only: localStorage, and the
   path works without it). "Next" marks the first one not yet done.
   Each trainer links back here from its footer.
   =========================================================================== */
const PK_PATH=[
  {group:"The cards",steps:[
    {mode:"hands",t:"Hand strength",d:"Name the hand; say who wins"},
    {mode:"outs",t:"Outs & draws",d:"Count the cards that make your hand"},
    {mode:"pot",t:"Pot odds",d:"Is the price right to call?"},
    {mode:"equity",t:"Equity",d:"Both hands face up: how often do you win?"}]},
  {group:"Before the flop",steps:[
    {mode:"preflop",t:"Pre-flop",d:"Shove or fold, against the solved strategy"},
    {mode:"ranges",t:"Ranges",d:"Count the ways the Shark can hold a hand"}]},
  {group:"After the flop",steps:[
    {mode:"postflop",t:"Post-flop",d:"Call or fold against a whole range"},
    {mode:"bluff",t:"Bluff or value?",d:"Are there enough bluffs to call?"},
    {mode:"sizing",t:"Bet sizing",d:"The bet that wins the most"},
    {mode:"detective",t:"Range detective",d:"What the size of the bet says"}]},
  {group:"Play the Shark",steps:[
    {mode:"match",t:"Heads-up v the Shark",d:"A short-stack match, skill and luck scored apart"}]}];
const PK_DONE_KEY="bts-poker-done",PK_SCORE_KEY="bts-poker-scores",PK_MIN_SCORED=5;
function pkDoneSet(){try{return new Set(JSON.parse(localStorage.getItem(PK_DONE_KEY)||"[]"))}catch(e){return new Set()}}
/* The report card: each trainer's best and latest score (a report with at
   least PK_MIN_SCORED decisions), and how many decisions it was from. */
function pkScores(){try{return JSON.parse(localStorage.getItem(PK_SCORE_KEY)||"{}")||{}}catch(e){return{}}}
function pkRecord(mode,S){
  pkMarkDone(mode);
  if(!S||S.score==null||S.decisions<PK_MIN_SCORED)return;
  try{const all=pkScores(),o=all[mode]||{best:0,n:0};
    all[mode]={best:Math.max(o.best||0,S.score),last:S.score,n:S.decisions,when:new Date().toISOString().slice(0,10)};
    localStorage.setItem(PK_SCORE_KEY,JSON.stringify(all))}catch(e){}
}
function pkClear(){try{localStorage.removeItem(PK_DONE_KEY);localStorage.removeItem(PK_SCORE_KEY)}catch(e){}}
function pkMarkDone(mode){try{const s=pkDoneSet();if(!s.has(mode)){s.add(mode);localStorage.setItem(PK_DONE_KEY,JSON.stringify([...s]))}}catch(e){}}
function paintPathHeader(){
  const done=pkDoneSet(),total=PK_PATH.reduce((a,g)=>a+g.steps.length,0),n=PK_PATH.reduce((a,g)=>a+g.steps.filter(s=>done.has(s.mode)).length,0);
  $("hScore").innerHTML=`${n}<span class="sub">OF ${total} DONE</span>`;$("hTwo").innerHTML="";
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · THE PATH</span><span></span></div><div class="track"><i style="width:${n/total*100}%"></i></div>`;
}
/* The summary: average of best scores, strongest and weakest, what to work
   on (the weakest, below 80), decisions so far. */
function pkReportCardHTML(){
  const sc=pkScores(),all=PK_PATH.flatMap(g=>g.steps).filter(s=>sc[s.mode]);
  if(!all.length)return"";
  const avg=Math.round(all.reduce((a,s)=>a+sc[s.mode].best,0)/all.length),by=all.slice().sort((a,b)=>sc[b.mode].best-sc[a.mode].best);
  const top=by[0],low=by[by.length-1];
  return`<div class="card"><div class="datechip">YOUR REPORT CARD</div>
    <div class="twin"><div class="tile"><div class="k">AVERAGE BEST</div><div class="big">${avg}<small>/100</small></div><div class="s">${all.length} of ${PK_PATH.reduce((a,g)=>a+g.steps.length,0)} trainers scored</div></div>
      <div class="tile"><div class="k">STRONGEST</div><div class="big" style="font-size:22px">${top.t}</div><div class="s">best ${sc[top.mode].best}</div></div></div>
    ${all.length>1&&sc[low.mode].best<80?`<a class="choice" href="?mode=${low.mode}#play" style="display:block;margin-top:10px;text-decoration:none"><span class="t">Work on: ${low.t}</span><span class="d">Best ${sc[low.mode].best}: your lowest. Another go?</span></a>`
      :all.length>1?`<p class="small" style="margin-top:8px">Every trainer you've scored is 80 or better.</p>`:""}</div>`;
}
function renderPath(){
  paintPathHeader();
  const done=pkDoneSet(),sc=pkScores(),all=PK_PATH.flatMap(g=>g.steps),next=all.find(s=>!done.has(s.mode));let k=0;
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">BEAT THE SHARK · POKER</div>
    <div class="mission">Learn to beat the Shark</div>
    <p class="lede" style="margin-top:10px">Texas hold'em one idea at a time, from reading your cards to a match against the Shark. Every answer is checked against the maths; no money, no chips that matter.</p></div>
    ${pkReportCardHTML()}
    ${PK_PATH.map(g=>`<div class="card"><div class="datechip">${g.group.toUpperCase()}</div>
      ${g.steps.map(s=>{k++;const d=done.has(s.mode),nx=next&&next.mode===s.mode;
        return`<a class="choice pathstep${nx?" primary":""}" href="?mode=${s.mode}#play" style="display:flex;gap:12px;align-items:center;text-decoration:none">
          <span class="pathno${d?" done":""}">${d?"✓":k}</span><span style="flex:1"><span class="t">${s.t}${nx?" · next":""}</span><span class="d">${s.d}</span></span>
          ${sc[s.mode]?`<span class="pathsc"><b>${sc[s.mode].best}</b><i>best${sc[s.mode].last!==sc[s.mode].best?` · last ${sc[s.mode].last}`:""}</i></span>`:""}</a>`}).join("")}</div>`).join("")}
    <p class="small" style="text-align:center">Ticks and scores are kept in this browser. A score needs a report of ${PK_MIN_SCORED} or more answers. <a href="#" id="pkclear" style="color:inherit">Clear them</a></p>`;
  const c=$("pkclear");if(c)c.onclick=e=>{if(e&&e.preventDefault)e.preventDefault();pkClear();renderPath()};
}
