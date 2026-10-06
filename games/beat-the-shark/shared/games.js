/* ===========================================================================
   shared/games.js — the list of Beat the Shark games, and the opening screen
   that offers them (Chris, 6 Oct 2026: the start screen shows the sports,
   not levels and roles).

   Loaded first by every game, the football game included. Each game passes
   its own id and the path back to the games' root ("" from the football
   game at the root, "../" from a game in a folder), so the links work both
   proxied at /play/beat-the-shark/ and on the game site itself.
   =========================================================================== */
const BTS_GAMES=[
  {id:"football",name:"Football",mission:"Win the league",path:""},
  {id:"nfl",name:"NFL",mission:"Win the division",path:"nfl/"}
];
/* The picker. The current game's button starts it (onStart); the others
   are plain links to their own folders. */
function renderGamePicker(current,root,onStart){
  const app=document.getElementById('app');
  ["hScore","hTwo","hSeason"].forEach(id=>{const e=document.getElementById(id);if(e)e.innerHTML=id==="hScore"?`—<span class="sub">POSITION</span>`:""});
  const tr=document.getElementById('hTrend');if(tr)tr.textContent="";
  /* Just the sports (Chris): the game's scoreboard is hidden until a game starts. */
  const hm=document.querySelector&&document.querySelector('header .hmain'),hs=document.getElementById('hSeason');
  const show=on=>{if(hm&&hm.style)hm.style.display=on?"":"none";if(hs&&hs.style)hs.style.display=on?"":"none"};
  show(false);
  app.innerHTML=`<div class="card hero">
    <div class="hero-kicker">BEAT THE SHARK</div>
    <div class="mission">Pick a sport</div>
    <div style="margin-top:14px">${BTS_GAMES.map(g=>g.id===current
      ?`<button class="choice primary" id="playThis" data-game="${g.id}"><span class="t">${g.name}</span><span class="d">${g.mission}</span></button>`
      :`<a class="choice" data-game="${g.id}" href="${root}${g.path}" style="text-decoration:none"><span class="t">${g.name}</span><span class="d">${g.mission}</span></a>`).join("")}</div></div>`;
  document.getElementById('playThis').onclick=()=>{show(true);onStart()};
}
