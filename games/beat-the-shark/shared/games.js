/* ===========================================================================
   shared/games.js — the list of Beat the Shark games, and the opening screen
   that offers them (Chris, 6 Oct 2026: the start screen shows the sports,
   not levels and roles).

   Loaded first by every game, the football game included. Each game passes
   its own id and the path back to the games' root ("" from the football
   game at the root, "../" from a game in a folder), so the links work both
   proxied at /play/beat-the-shark/ and on the game site itself.

   Choosing (Chris, 7 Oct 2026: "click the game you want twice is not that
   obvious"): tap a sport to pick it, then one big "Let's go" button. A sport
   in another folder is opened with #play, and its own picker starts it
   straight away, so it is never chosen twice.
   =========================================================================== */
const BTS_GAMES=[
  {id:"football",group:"sports",name:"Football",mission:"Win the league",path:""},
  {id:"nfl",group:"sports",name:"NFL",mission:"Win the division",path:"nfl/"},
  {id:"world-cup",group:"sports",name:"World Cup",mission:"Win the World Cup",path:"world-cup/"},
  {id:"nations-cup",group:"sports",name:"Tennis: Nations Cup",mission:"Win the Nations Cup",path:"nations-cup/"},
  {id:"blackjack",group:"casino",name:"Blackjack: basic strategy",mission:"Play every hand right",path:"blackjack/"},
  {id:"blackjack-count",group:"casino",name:"Blackjack: what's the count?",mission:"Keep the Hi-Lo count",path:"blackjack/?mode=count"},
  {id:"blackjack-house",group:"casino",name:"Blackjack: beat the house",mission:"Bet by the count",path:"blackjack/?mode=house"},
  {id:"poker-hands",group:"casino",name:"Poker: hand strength",mission:"Read the cards",path:"poker/"},
  {id:"poker-outs",group:"casino",name:"Poker: outs & draws",mission:"Count your outs",path:"poker/?mode=outs"},
  {id:"poker-pot",group:"casino",name:"Poker: pot odds",mission:"Call or fold at the price",path:"poker/?mode=pot"},
  {id:"poker-equity",group:"casino",name:"Poker: equity",mission:"Estimate your chance",path:"poker/?mode=equity"},
  {id:"poker-preflop",group:"casino",name:"Poker: pre-flop",mission:"Shove or fold",path:"poker/?mode=preflop"},
  {id:"poker-ranges",group:"casino",name:"Poker: ranges",mission:"What could the Shark have?",path:"poker/?mode=ranges"},
  {id:"poker-postflop",group:"casino",name:"Poker: post-flop",mission:"Call or fold v a range",path:"poker/?mode=postflop"},
  {id:"poker-bluff",group:"casino",name:"Poker: bluff or value?",mission:"Catch the bluff",path:"poker/?mode=bluff"},
  {id:"poker-sizing",group:"casino",name:"Poker: bet sizing",mission:"Bet the right amount",path:"poker/?mode=sizing"},
  {id:"poker-detective",group:"casino",name:"Poker: range detective",mission:"Read the bet",path:"poker/?mode=detective"},
  {id:"poker-match",group:"casino",name:"Poker: heads-up v the Shark",mission:"Short stacks: a match",path:"poker/?mode=match"}
];
/* Two groups on one screen (Chris, 7 Oct 2026: casino games to come), as
   headings rather than a sub-menu, so every game is still two taps away. */
const BTS_GROUPS=[{id:"sports",name:"Sports"},{id:"casino",name:"Casino & probability"}];
let BTS_PICK=null,BTS_CTX=null;
/* Pick a sport (the card lights up and the button wakes). Nothing starts
   until "Let's go". */
function pickSport(id){
  BTS_PICK=id;
  const go=document.getElementById('playThis');
  if(go){go.disabled=false;if(go.style)go.style.opacity=1;
    const g=BTS_GAMES.find(x=>x.id===id),t=go.querySelector&&go.querySelector('.d');if(t)t.textContent=g?g.name:""}
  if(document.querySelectorAll)document.querySelectorAll('[data-game]').forEach(b=>{const on=b.dataset.game===id;
    b.setAttribute('aria-pressed',on);b.style.borderColor=on?'var(--amber)':'';b.style.background=on?'color-mix(in srgb,var(--amber) 14%,var(--panel2))':''});
}
function letsGo(){
  if(!BTS_PICK||!BTS_CTX)return;
  const{current,root,onStart,show}=BTS_CTX;
  if(BTS_PICK===current){show(true);onStart();return}
  const g=BTS_GAMES.find(x=>x.id===BTS_PICK);location.href=root+g.path+"#play";
}
/* The picker. onStart starts this page's own game. */
function renderGamePicker(current,root,onStart){
  const app=document.getElementById('app');
  ["hScore","hTwo","hSeason"].forEach(id=>{const e=document.getElementById(id);if(e)e.innerHTML=id==="hScore"?`—<span class="sub">POSITION</span>`:""});
  const tr=document.getElementById('hTrend');if(tr)tr.textContent="";
  /* Just the sports (Chris): the game's scoreboard is hidden until a game starts. */
  const hm=document.querySelector&&document.querySelector('header .hmain'),hs=document.getElementById('hSeason');
  const show=on=>{if(hm&&hm.style)hm.style.display=on?"":"none";if(hs&&hs.style)hs.style.display=on?"":"none"};
  BTS_CTX={current,root,onStart,show};BTS_PICK=null;
  /* Arrived from the picker with this sport chosen: start it. */
  if(typeof location!=="undefined"&&location.hash==="#play"){
    try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}
    show(true);onStart();return;
  }
  show(false);
  app.innerHTML=`<div class="card hero">
    <div class="hero-kicker">BEAT THE SHARK</div>
    <div class="mission">Pick a game</div>
    ${BTS_GROUPS.map(gr=>`<div class="hero-kicker" style="margin:16px 0 6px;text-align:left">${gr.name.toUpperCase()}</div>
      ${BTS_GAMES.filter(g=>g.group===gr.id).map(g=>`<button class="choice" data-game="${g.id}" aria-pressed="false"><span class="t">${g.name}</span><span class="d">${g.mission}</span></button>`).join("")}`).join("")}
    <button class="choice primary" id="playThis" disabled style="opacity:.5;margin-top:6px;padding:16px 15px;text-align:center">
      <span class="t" style="font-family:var(--disp);font-size:24px;letter-spacing:.04em;text-transform:uppercase">Let's go</span><span class="d">Pick a game above</span></button></div>`;
  if(document.querySelectorAll)document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>pickSport(b.dataset.game));
  document.getElementById('playThis').onclick=letsGo;
}
