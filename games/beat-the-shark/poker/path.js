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
const PK_DONE_KEY="bts-poker-done";
function pkDoneSet(){try{return new Set(JSON.parse(localStorage.getItem(PK_DONE_KEY)||"[]"))}catch(e){return new Set()}}
function pkMarkDone(mode){try{const s=pkDoneSet();if(!s.has(mode)){s.add(mode);localStorage.setItem(PK_DONE_KEY,JSON.stringify([...s]))}}catch(e){}}
function paintPathHeader(){
  const done=pkDoneSet(),total=PK_PATH.reduce((a,g)=>a+g.steps.length,0),n=PK_PATH.reduce((a,g)=>a+g.steps.filter(s=>done.has(s.mode)).length,0);
  $("hScore").innerHTML=`${n}<span class="sub">OF ${total} DONE</span>`;$("hTwo").innerHTML="";
  $("hSeason").innerHTML=`<div class="lbl"><span>POKER · THE PATH</span><span></span></div><div class="track"><i style="width:${n/total*100}%"></i></div>`;
}
function renderPath(){
  paintPathHeader();
  const done=pkDoneSet(),all=PK_PATH.flatMap(g=>g.steps),next=all.find(s=>!done.has(s.mode));let k=0;
  $("app").innerHTML=`<div class="card hero"><div class="hero-kicker">BEAT THE SHARK · POKER</div>
    <div class="mission">Learn to beat the Shark</div>
    <p class="lede" style="margin-top:10px">Texas hold'em one idea at a time, from reading your cards to a match against the Shark. Every answer is checked against the maths; no money, no chips that matter.</p></div>
    ${PK_PATH.map(g=>`<div class="card"><div class="datechip">${g.group.toUpperCase()}</div>
      ${g.steps.map(s=>{k++;const d=done.has(s.mode),nx=next&&next.mode===s.mode;
        return`<a class="choice pathstep${nx?" primary":""}" href="?mode=${s.mode}#play" style="display:flex;gap:12px;align-items:center;text-decoration:none">
          <span class="pathno${d?" done":""}">${d?"✓":k}</span><span><span class="t">${s.t}${nx?" · next":""}</span><span class="d">${s.d}</span></span></a>`}).join("")}</div>`).join("")}
    <p class="small" style="text-align:center">Ticks are kept in this browser.</p>`;
}
