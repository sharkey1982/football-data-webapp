/* ===========================================================================
   matchday.js — the vidiprinter, half time, the classified check and the Sports Centre.
   =========================================================================== */
/* --- matchweeks ----------------------------------------------------------- */
function playOthers(wk){const out=[];
  FIXTURES[wk].forEach(([h,a])=>{if(h===CLUB||a===CLUB)return;
    const[hg,ag]=simScore(strOf(h),strOf(a));award(TABLE,h,a,hg,ag);out.push({h,a,hg,ag})});return out}
function myFixture(wk){return FIXTURES[wk].find(([h,a])=>h===CLUB||a===CLUB)}
function resolveMine(hg,ag,home){
  const mg=home?hg:ag,tg=home?ag:hg;let fx,res;
  if(mg>tg){res='w';fx={fans:7,board:7,cash:rnd(16,30)}}
  else if(mg===tg){res='d';fx={fans:1,board:1,cash:rnd(10,19)}}
  else{res='l';fx={fans:-7,board:-6,cash:rnd(8,15)}}
  // Beginner: the wage bill is paid every week, so cash is a real
  // consideration by Gameweek 4 (gate money alone doesn't cover it).
  if(WEEKLY_WAGES)fx.cash-=S.wages;
  S.formArr.push(res);S.lastRes=res;S.matchBoost=0;
  /* Squad fatigue now RECOVERS between matches, settling around the mid-40s
     unless decisions push it. It used to climb 5-9 every match with nothing
     bringing it down (22 -> 85 over a season, measured), which double-counted
     tiredness once every player had his own condition -- a side that simply
     played its fixtures lost 12 strength points by May. */
  S.fatigue=clamp(S.fatigue+rnd(2,5)-Math.max(0,(S.fatigue-30)*.25));
  S.seasonLog.push({mw:S.mw+1,gf:mg,ga:tg,cs:tg===0?1:0,home});
  /* Only the players who PLAYED tire and risk injury; the bench recovers.
     That is what makes rotation a real decision rather than a readout.
     Every player also drifts by his trajectory: the young improve through
     the season, the veterans decline -- so the squad you finish with is not
     the one you started with. */
  const played=new Set(currentXI().map(s=>s.i));
  S.squadList.forEach((p,i)=>{
    if(p.gone)return;
    p.rtf=(p.rtf==null?p.rt:p.rtf)+(p.dev||0);
    p.rt=clamp(Math.round(p.rtf),30,85);
    if(p.sharp==null)p.sharp=90;
    if(p.out){p.out--;p.sharp=clamp(p.sharp-10);if(!p.out)p.fit=clamp(p.fit+18);return}   /* recovering, losing sharpness */
    /* Rested: condition comes back, sharpness slips. One or two weeks off
       costs nothing; any longer and he is rusty (see RUST_LINE). */
    if(!played.has(i)){p.fit=clamp(p.fit+rnd(4,8));p.sharp=clamp(p.sharp-7);return}
    p.sharp=clamp(p.sharp+8);
    p.fit=clamp(Math.round(p.fit-rnd(3,8)*(p.inj>1.2?1.3:1)),25,100);   /* whole numbers: it is displayed */
    /* The lower the condition, the likelier the match breaks him -- and
       some players break more easily than others. */
    const risk=(p.fit<55?.26:p.fit<70?.12:.04)*(p.inj||1);
    if(rng()<risk){p.out=rnd(1,3);p.fit=clamp(p.fit-10)}
  });
  if(ROLE.id==="player"){S.fitness=clamp(S.fitness-rnd(2,6));S.form=clamp(S.form+(mg>tg?5:mg===tg?0:-4))}
  return{fx,res};
}
/* Who you are playing, and whether they are better than you. This was the
   missing context: the vidiprinter named an opponent with no sense of where
   they sat or what the model made of the tie. */
/* Team Strength, in the site's own currency: an attack rating and a defence
   rating expressed as expected goals per match, not an opaque 0-100 score. */
/* Team Strength IS the model's rating: xGF and xGA per game against this
   league (ratingsNow). There used to be a second formula here, separate from
   the numbers behind every odds figure -- two definitions of strength is how
   screens came to contradict each other. */
function teamAtt(n){return ratingsNow()[n].xgf}
function teamDef(n){return ratingsNow()[n].xga}
function strengthTableHTML(){
  /* xGF and xGA rate each club over its whole season (its quality); xPts
     rates the games LEFT (its run-in), which is what the projection adds
     to points already won -- so the order and the xPts column agree. */
  const R=ratingsNow(0),RL=ratingsNow(S.mw),P=projectionNow();
  const rows=projOrder([CLUB].concat(RIVALS.map(r=>r.n)),P,RL).map(n=>({n,...R[n],xpts:RL[n].xpts,p:P[n],t:TABLE[n]}));
  const E=expectedFinal(RL);
  return `<table class="tbl"><thead><tr><th class="n">#</th><th>Club</th><th class="n">Pts</th><th class="n">xPts</th><th class="n">Proj</th><th class="n">xGF</th><th class="n">xGA</th>
    <th class="n">GF</th><th class="n">GA</th><th class="n">CS</th></tr></thead><tbody>
    ${rows.map((r,i)=>`<tr class="${r.n===CLUB?'me':''}"><td class="n">${i+1}</td><td>${r.n}${youTag(r.n)}</td><td class="n">${r.t.pts}</td><td class="n">${r.xpts.toFixed(2)}</td><td class="n"><b>${E[r.n].toFixed(1)}</b></td>
      <td class="n">${r.xgf.toFixed(2)}</td><td class="n">${r.xga.toFixed(2)}</td>
      <td class="n">${r.t.gf}</td><td class="n">${r.t.ga}</td><td class="n">${CLEAN[r.n]||0}</td></tr>`).join('')}
    </tbody></table>
  <div style="font-size:11px;color:var(--mute);margin-top:4px">Ordered by <b>Proj</b>, the projected final points: points won plus
    xPts (expected points per game) × games left. xGF and xGA rate each club over the whole season ·
    Your Team rated as you are running it · CS = clean sheets</div>`;
}
/* Fixture heat map: every remaining match rated by opponent strength and
   venue. Exactly the thing the site does, shown here as a row of squares. */
/* FIXTURE HEAT MAP, in the site's own language: GW numbers, a three-letter
   opponent code with H or A (the site shows "CHI - H"), a whole-number FDR
   from 1 (easiest) to 5 (hardest), and the site's legend wording. The game
   used to say "MW" and show a raw decimal, which nobody could read. */
function oppCode(n){return n.replace(/[^A-Za-z]/g,"").slice(0,3).toUpperCase()}
/* THE HEAT MAP, as two views, like the site's: GOALS FOR (xGF -- how many
   you should score) and CLEAN SHEET CHANCE (how likely you are to keep one),
   with the 1X2 odds underneath. Same labels and formats as the site's
   Fixture Heat Map: xGF to one decimal, clean sheet chance as a percentage,
   "Most goals expected" / "Highest clean sheet chance". The single FDR
   number it replaced blended both into one figure nobody could read. */
function heatScale(v,lo,hi){const t=clamp((v-lo)/(hi-lo),0,1);
  return["#a8322b","#c26a2a","#c9901a","#5d8f4e","#2d6b48"][Math.min(4,Math.floor(t*5))]}
function fixtureHeatHTML(fromWk,count){
  const cells=[],to=Math.min(MW,fromWk+(count||5));
  for(let wk=fromWk;wk<to;wk++){
    const f=FIXTURES[wk].find(([h,a])=>h===CLUB||a===CLUB),home=f[0]===CLUB,opp=home?f[1]:f[0];
    cells.push({wk:wk+1,opp,home,...matchProbs(opp,home)});
  }
  if(!cells.length)return "";
  const cols=`display:grid;grid-template-columns:74px repeat(${cells.length},1fr);gap:3px;align-items:stretch`;
  const lab=t=>`<div style="font-size:10.5px;color:var(--ink2);display:flex;align-items:center;line-height:1.15">${t}</div>`;
  const cell=(bg,top,sub)=>`<div style="background:${bg};color:#f6f4ea;border-radius:5px;padding:6px 2px;text-align:center;min-width:0">
      <div style="font-family:var(--mono);font-size:13px;font-weight:600">${top}</div>${sub?`<div style="font-size:9px;opacity:.85">${sub}</div>`:''}</div>`;
  const bestG=cells.reduce((a,c)=>c.xgf>a.xgf?c:a),bestCS=cells.reduce((a,c)=>c.cs>a.cs?c:a),worst=cells.reduce((a,c)=>c.w<a.w?c:a);
  return `<div style="${cols};margin:6px 0 3px">
      <div></div>${cells.map(c=>`<div style="text-align:center;font-family:var(--mono);font-size:10px;color:var(--mute)">GW${c.wk}<br>
        <b style="color:var(--ink);font-size:11.5px">${oppCode(c.opp)} - ${c.home?"H":"A"}</b></div>`).join('')}
    </div>
    <div style="${cols};margin-bottom:3px">${lab("Goals for<br><small style='color:var(--mute)'>xGF</small>")}
      ${cells.map(c=>cell(heatScale(c.xgf,.6,2.2),c.xgf.toFixed(1))).join('')}</div>
    <div style="${cols};margin-bottom:3px">${lab("Clean sheet<br><small style='color:var(--mute)'>chance</small>")}
      ${cells.map(c=>cell(heatScale(c.cs,.08,.45),Math.round(c.cs*100)+"%")).join('')}</div>
    <div style="${cols};margin-bottom:6px">${lab("1X2<br><small style='color:var(--mute)'>win · draw · loss</small>")}
      ${cells.map(c=>`<div style="background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:4px 1px;text-align:center;font-family:var(--mono);font-size:10px;line-height:1.35">
        <span style="color:var(--good);font-weight:600">${c.w}</span><br>${c.d}<br><span style="color:var(--bad)">${c.l}</span></div>`).join('')}</div>
    <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--mute);margin:2px 0 6px">
      <span>Fewest goals expected · Lowest clean sheet chance</span>
      <span style="flex:1;height:6px;border-radius:3px;background:linear-gradient(90deg,#a8322b,#c26a2a,#c9901a,#5d8f4e,#2d6b48)"></span>
      <span>Most goals expected · Highest clean sheet chance</span></div>
    <p class="small" style="margin:0">Most goals expected: GW${bestG.wk} ${bestG.home?"home to":"away at"} ${bestG.opp} (${bestG.xgf.toFixed(1)} xGF).
      Best clean sheet chance: GW${bestCS.wk} (${Math.round(bestCS.cs*100)}%).
      Hardest to win: GW${worst.wk} ${worst.home?"home to":"away at"} ${worst.opp} (${worst.w}% win).
      ${(()=>{const H=cells.filter(c=>c.home),A=cells.filter(c=>!c.home),ep=c=>(3*c.w+c.d)/100;
        return H.length&&A.length?`<br><b>Home games:</b> ${(H.reduce((a,c)=>a+ep(c),0)/H.length).toFixed(1)} expected points each.
          <b>Away:</b> ${(A.reduce((a,c)=>a+ep(c),0)/A.length).toFixed(1)}.`:""})()}</p>`;
}
function posOf(n){return standings(TABLE).findIndex(r=>r.n===n)+1}
function formPips(n){const f=(FORM[n]||[]).slice(-5);
  return f.length?`<span class="form">${f.map(x=>`<i class="${x}"></i>`).join('')}</span>`:'<span style="color:var(--mute)">—</span>'}
/* Model odds for your next match -- exact Poisson, in the model's view.
   It used to run 500 random simulations, so the same fixture could show
   slightly different odds on different screens. */
function winProb(opp,home){const p=matchProbs(opp,home);return{w:p.w,d:p.d,l:p.l}}
function opponentPanel(opp,home){
  const myP=posOf(CLUB),oP=posOf(opp),t=TABLE[opp],mt=TABLE[CLUB];
  const oStr=strOf(opp),gap=Math.round(myStrength()-oStr);
  const pr=winProb(opp,home);
  const played=mt.p>0;
  return `<div style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:11px 12px;margin-bottom:11px">
    <div style="display:flex;gap:10px;align-items:stretch">
      <div style="flex:1;text-align:center">
        <div style="font-family:var(--mono);font-size:9px;letter-spacing:.09em;color:var(--mute);text-transform:uppercase">You${home?" (home)":""}</div>
        <div style="font-family:var(--disp);font-size:22px;font-weight:700;line-height:1.1">${played?ord(myP):"—"}</div>
        <div style="font-size:11.5px;color:var(--ink2)">${mt.pts} pts · rated ${Math.round(myStrength())}</div>
        <div style="margin-top:3px">${formPips(CLUB)}</div>
      </div>
      <div style="width:1px;background:var(--line)"></div>
      <div style="flex:1;text-align:center">
        <div style="font-family:var(--mono);font-size:9px;letter-spacing:.09em;color:var(--mute);text-transform:uppercase">${opp}${home?"":" (home)"}</div>
        <div style="font-family:var(--disp);font-size:22px;font-weight:700;line-height:1.1">${played?ord(oP):"—"}</div>
        <div style="font-size:11.5px;color:var(--ink2)">${t.pts} pts · rated ${oStr}</div>
        <div style="margin-top:3px">${formPips(opp)}</div>
      </div>
    </div>
    <div style="margin-top:9px;padding-top:9px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink2)">
      <b style="color:var(--ink)">Team Strength</b> — you ${teamAtt(CLUB).toFixed(2)} attack / ${teamDef(CLUB).toFixed(2)} defence,
      them ${teamAtt(opp).toFixed(2)} / ${teamDef(opp).toFixed(2)} expected goals.
      ${gap>4?"Well below you":gap>0?"Slightly below you":gap>-5?"Slightly above you":"Well above you"}. Model odds:
      <span style="font-family:var(--mono);color:var(--good)">W ${pr.w}%</span> ·
      <span style="font-family:var(--mono)">D ${pr.d}%</span> ·
      <span style="font-family:var(--mono);color:var(--bad)">L ${pr.l}%</span>
    </div></div>`;
}
/* CLASSIFIED CHECK: all three of the week's fixtures streamed together, in
   minute order, the way a results service actually reads. The old roundup
   printed final scores instantly, which threw away the one thing people
   liked about the match screen -- watching it happen, including to the
   clubs you are chasing. */
/* Is this a week where the table genuinely matters? Title race or relegation
   fight, in the run-in. The final day always counts. */
function inRace(){
  const st=standings(TABLE),me=st.findIndex(r=>r.n===CLUB),left=MW-S.mw;
  if(left>4||!TABLE[CLUB].p)return false;
  const top=st[0].pts-TABLE[CLUB].pts<=3&&me<=2;
  const safe=st[3]?st[3].pts:0;
  const bottom=me>=3&&TABLE[CLUB].pts-safe<=3;
  return top||bottom;
}
/* Every "live" week is now your own match, quickly, followed by the 3pm
   results -- the old classified check streamed all three fixtures at once,
   which was hard to follow. */
function renderLiveWeek(){return renderMatch(next,true)}
function renderRoundup(){
  const wk=S.mw,[h,a]=myFixture(wk),home=h===CLUB;
  const[hg,ag]=playFixture(h,a);
  award(TABLE,h,a,hg,ag);const others=playOthers(wk);
  const{fx}=resolveMine(hg,ag,home);S.mw++;
  const d=apply(fx,true);myPos();paintHeader();
  const mid=S.mw===5,run=S.mw===8;
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">GAMEWEEK ${S.mw} OF ${MW} · RESULTS</div>
    <h1>${mid?"Halfway":run?"The run-in begins":"Saturday's results"}</h1>
    ${mid?`<p class="lede">Five played, five to go. ${ord(S.pos)} of six.</p>`:''}
    ${run?`<p class="lede">Three matches left. Whatever you are going to do, do it now.</p>`:''}
    <div class="res mine"><span>${h} v ${a}</span><span class="sc">${hg}–${ag}</span></div>
    ${others.map(o=>`<div class="res"><span>${o.h} v ${o.a}</span><span class="sc">${o.hg}–${o.ag}</span></div>`).join('')}
    <div class="delta" style="margin-bottom:10px">${d}</div>${tableHTML()}
    <button class="choice primary" id="nx" style="margin-top:11px"><span class="t">Continue</span></button></div>`;
  document.getElementById('nx').onclick=next;
}
/* THE TEAM SHEET, before every match you watch in full. The opponent's
   shape is decided HERE and carried into the match, so what you pick
   against is what you play against (re-rolling it at kickoff would also
   shift the seeded random sequence). The manager picks the formation and
   the XI; other roles see the manager's choice. */
/* What the team sheet teaches, beneath the pitch:
   - the next three fixtures, so resting a key player for an easy game is a
     decision you can actually plan;
   - who takes the set pieces, and why it matters;
   - when anyone is playing out of position, what that means -- including the
     Fantasy angle, and a link to the site's own Starting Lineups. */
function sheetLessons(wk,mgr){
  const next=[];for(let w=wk;w<Math.min(MW,wk+3);w++){const f=myFixture(w),h=f[0]===CLUB,o=h?f[1]:f[0];next.push({w:w+1,o,h,p:matchProbs(o,h)})}
  const word=w=>w>=48?"Easier":w<=28?"Hard":"Even";
  const strip=`<div class="strip">${next.map((n,k)=>`<div style="background:${heatScale(n.p.w,15,65)}">
      <b>${k===0?"THIS WEEK":"GW"+n.w}</b>${oppCode(n.o)} - ${n.h?"H":"A"}<br>${n.p.w}% win · ${word(n.p.w)}</div>`).join('')}</div>`;
  const xi=currentXI(),tk=setPieceTaker(xi);
  const cands=xi.filter(s=>s.slot!=="GK").map(s=>({p:S.squadList[s.i],i:s.i})).sort((a,b)=>(b.p.sp||0)-(a.p.sp||0)).slice(0,4);
  const adv=xi.map(s=>({p:S.squadList[s.i],s})).filter(x=>roleSignal(x.p,x.s.slot)==="advanced");
  const posWord={DF:"defender",MF:"midfielder",FW:"forward"};
  const oopTip=adv.length
    ?`<div class="tip"><b>▲ Out of position — and why it can be smart</b>
       ${adv.map(x=>`<b style="display:inline;text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink)">${x.p.nm}</b> is a ${posWord[x.p.pos]} playing ${x.s.slot==="MF"?"midfield":"up front"}`).join("; ")}.
       He still defends like a ${posWord[adv[0].p.pos]}, so your defensive shape holds — a defensive move —
       while he gets the chances of the role he is playing. That is the sweet spot in Fantasy: an out-of-position
       player keeps his registered position's points (a defender scores 6 for a goal and 4 for a clean sheet)
       while playing further forward. The site's <a href="${SITE}/fpl/line-ups">Starting Lineups</a> marks these players ▲ too.</div>`
    :mgr&&can("oop")?`<div class="tip" style="border-left-color:var(--line);background:var(--panel2)"><b>Try it</b>
       A defender moved into midfield keeps your defensive shape <i>and</i> gets more chances to score.
       Tap a midfielder on the pitch, then a defender on the bench.</div>`:"";
  if(!tips())return `${strip}${mgr&&can("setpieces")?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0">${cands.map(c=>`<button class="choice" data-sp="${c.i}"
        style="margin:0;padding:5px 8px;width:auto;flex:1;min-width:120px;${c.p===tk?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
        <span class="t" style="font-size:12.5px">${c.p===tk?"✓ ":""}${c.p.nm}</span><span class="d">set pieces ${c.p.sp||0}/3</span></button>`).join('')}</div>`:""}`;
  return `${can("rotation")||!mgr?`<div class="tip" style="border-left-color:var(--amber);background:var(--panel2)"><b>Rest and rotation</b>
      Rest tired or key players in the easier weeks so they are fresh for the hard ones — but leave a player out
      for more than two weeks and he goes <span style="color:#7cb9e8">rusty</span>.${strip}</div>`:""}
    <div class="tip" style="border-left-color:var(--amber);background:var(--panel2)"><b>Set pieces</b>
      About a quarter of goals at this level come from set pieces. The taker scores penalties and free kicks
      wherever he plays, and your best in the air score from corners — defenders included. It is why set-piece
      duty is one of the biggest inputs to the site's FPL projections.
      ${mgr&&can("setpieces")?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${cands.map(c=>`<button class="choice" data-sp="${c.i}"
        style="margin:0;padding:5px 8px;width:auto;flex:1;min-width:120px;${c.p===tk?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
        <span class="t" style="font-size:12.5px">${c.p===tk?"✓ ":""}${c.p.nm}</span><span class="d">set pieces ${c.p.sp||0}/3</span></button>`).join('')}</div>`
      :`<div style="margin-top:4px">Taker: <b>${tk?tk.nm:"—"}</b></div>`}</div>
    ${oopTip}`;
}
/* What is unlocked right now, and what is new this match. */
function can(f){return ROLE.id!=="manager"||(S.fullMatches||0)>=LEVELS[LEVEL].unlock[f]}
function tips(){return!LEVELS[LEVEL].guru}
const NEW_IDEA={
  formation:["Formations","Each shape trades attack for defence. Pick one that suits this opponent — the numbers below move as you do."],
  rotation:["Rest and rotation","You can now pick your own XI. Tap a player on the pitch, then one on the bench. Rest tired players in the easier weeks — but more than two weeks out and they go rusty."],
  setpieces:["Set pieces","About a quarter of goals come from set pieces. You now choose who takes them."],
  oop:["Out of position","You can now play someone out of position. A defender moved into midfield still defends like a defender — and gets a midfielder's chances."]};
function newThisMatch(){if(ROLE.id!=="manager"||LEVEL!=="beginner")return null;
  const n=S.fullMatches||0;return Object.keys(NEW_IDEA).find(f=>LEVELS.beginner.unlock[f]===n)||null}
/* ===========================================================================
   BEGINNER TEAM SHEET (Chris: cut the cognitive load but keep similar
   items). One decision between TWO options per match, each showing its win
   chance; the pitch is a picture, not a puzzle. Across the season a Beginner
   still meets shape, selection, set pieces and out of position -- one at a
   time, as a simple either/or. Anything that can't arise this week (nobody
   tired, no spare defender) falls back to the shape decision.
   =========================================================================== */
// Gameweek 2 is shape again (compact v the strongest side); the selection
// lesson now lives in its half-time dilemma.
const BEGINNER_DECISION_ORDER=["formation","formation","setpieces","selection","formation"];
// ...and one half-time decision every game, alternating.
// Gameweek 1 has NO half-time decision (Chris: the first game should be simple).
const BEGINNER_HT=[null,"sub","shape","sub","shape"];
const BEGINNER_IDEA={
  formation:["Pick your shape","Each shape trades attack for defence. Pick the one that suits this opponent."],
  selection:["One place in the side","The better player, or the fresher one? Tired players play worse and get injured more."],
  setpieces:["Who takes the set pieces?","About a quarter of goals come from set pieces."],
  oop:["Try something different?","A defender moved into midfield still defends like a defender, and gets a midfielder's chances."]};
function beginnerDecision(opp,home){
  const snap={f:S.formation,xi:S.manualXI?S.manualXI.map(x=>({...x})):null,sp:S.spTaker};
  const restore=()=>{S.formation=snap.f;S.manualXI=snap.xi?snap.xi.map(x=>({...x})):null;S.spTaker=snap.sp};
  const shape=f=>{const v=FORMATIONS[f];return v.att-v.def>=2?"attacking":v.def-v.att>=2?"defensive":"balanced"};
  const build={
    formation(){
      // Read the opponent (Chris): attack a side that scores little but
      // defends only OK; stay compact against a dangerous attack.
      const R=ratingsNow(0),clubs=Object.keys(R),avg=k=>clubs.reduce((a,c)=>a+R[c][k],0)/clubs.length;
      const att=R[opp].xgf>avg("xgf")+.15?"a dangerous attack":R[opp].xgf<avg("xgf")-.15?"a weak attack":"an average attack";
      const def=R[opp].xga<avg("xga")-.15?"a solid defence":R[opp].xga>avg("xga")+.15?"a leaky defence":"an OK defence";
      const fs=Object.keys(FORMATIONS);
      const bold=fs.slice().sort((a,b)=>(FORMATIONS[b].att-FORMATIONS[b].def)-(FORMATIONS[a].att-FORMATIONS[a].def))[0];
      const safe=fs.slice().sort((a,b)=>(FORMATIONS[b].def-FORMATIONS[b].att)-(FORMATIONS[a].def-FORMATIONS[a].att))[0];
      return{scout:`${opp}: ${att}, ${def}.`,options:[
        {title:`Go for it (${bold})`,sub:"More goals for you, more at the other end",set(){S.formation=bold;S.manualXI=null}},
        {title:`Stay compact (${safe})`,sub:"Harder to break down, fewer chances",set(){S.formation=safe;S.manualXI=null}}]};
    },
    selection(){
      S.manualXI=null;const xi=currentXI(),inXI=new Set(xi.map(x=>x.i));
      let bestPair=null;
      for(const x of xi){const s=S.squadList[x.i];if(!s||s.fit>=85)continue;
        for(const b of available()){const j=S.squadList.indexOf(b);
          if(inXI.has(j)||b.pos!==s.pos||b.fit<=s.fit+8)continue;
          const gain=b.fit-s.fit;if(!bestPair||gain>bestPair.gain)bestPair={slot:x.slot,si:x.i,bi:j,s,b,gain}}}
      if(!bestPair)return null;
      const{si,bi,s,b}=bestPair;
      return{options:[
        {title:`Start ${s.nm}`,sub:`Better player (quality ${s.rt}), but ${s.fit}% fit`,set(){S.manualXI=null}},
        {title:`Start ${b.nm}`,sub:`Fresher (${b.fit}% fit), quality ${b.rt}`,set(){S.manualXI=null;const x=currentXI().map(y=>({...y}));
          const k=x.findIndex(y=>y.i===si);if(k>=0){x[k].i=bi;S.manualXI=x;S.manualFm=S.formation}}}]};
    },
    setpieces(){
      S.manualXI=null;const xi=currentXI().map(x=>({p:S.squadList[x.i],i:x.i})).filter(x=>x.p);
      const top=xi.sort((a,b)=>(b.p.sp||0)-(a.p.sp||0)||b.p.rt-a.p.rt).slice(0,2);
      if(top.length<2)return null;
      return{options:top.map(({p,i})=>({title:`${p.nm} takes them`,sub:`Set pieces ${p.sp||0}/3 · quality ${p.rt}`,set(){S.spTaker=i}}))};
    },
    oop(){
      S.manualXI=null;const xi=currentXI(),inXI=new Set(xi.map(x=>x.i));
      const mids=xi.filter(x=>x.slot==="MF").map(x=>({x,p:S.squadList[x.i]})).sort((a,b)=>a.p.rt-b.p.rt);
      const spareDF=available().filter(p=>p.pos==="DF"&&!inXI.has(S.squadList.indexOf(p))).sort((a,b)=>b.rt-a.rt)[0];
      if(!mids.length||!spareDF)return null;
      const m=mids[0],di=S.squadList.indexOf(spareDF);
      return{options:[
        {title:`Keep ${m.p.nm} in midfield`,sub:`Your usual midfielder, quality ${m.p.rt}`,set(){S.manualXI=null}},
        {title:`Move ${spareDF.nm} into midfield`,sub:`A defender, quality ${spareDF.rt}: tighter, fewer chances`,set(){S.manualXI=null;
          const x=currentXI().map(y=>({...y}));const k=x.findIndex(y=>y.i===m.x.i);if(k>=0){x[k].i=di;S.manualXI=x;S.manualFm=S.formation}}}]};
    }};
  let kind=BEGINNER_DECISION_ORDER[Math.min(S.mw,BEGINNER_DECISION_ORDER.length-1)];
  let dec=build[kind]();restore();
  if(!dec){kind="formation";dec=build.formation();restore()}
  for(const o of dec.options){o.set();recalcSquadRating();o.p=matchProbs(opp,home);restore()}
  recalcSquadRating();
  return{kind,...dec};
}
/* Your game is the early kick-off every week; Gameweek 1 is opening day. */
function kickoffChip(wk){return `GAMEWEEK ${wk+1} OF ${MW} · ${wk===0?"OPENING DAY · ":wk===MW-1?"FINAL DAY · ":""}12:30 KICK-OFF`}
/* Them v you, before the shape question: the same model numbers as
   everywhere else, better figure on each row highlighted. */
function oppCompareHTML(opp){
  const R=ratingsNow(0),cs=n=>Math.exp(-R[n].xga),q=n=>n===CLUB?S.squad:strOf(n);
  const rows=[
    ["Goals for (a game)",R[opp].xgf,R[CLUB].xgf,v=>v.toFixed(1),true],
    ["Goals against (a game)",R[opp].xga,R[CLUB].xga,v=>v.toFixed(1),false],
    ["Clean sheets",cs(opp),cs(CLUB),v=>Math.round(v*100)+"%",true],
    ["Squad quality",q(opp),q(CLUB),v=>Math.round(v),true]];
  const cell=(v,other,fmt,hi)=>{const better=hi?v>other+1e-9:v<other-1e-9;
    return `<td class="n" style="${better?'color:var(--good);font-weight:700':''}">${fmt(v)}</td>`};
  return `<table class="tbl" style="margin:8px 0"><thead><tr><th></th><th class="n">${opp}</th><th class="n">You</th></tr></thead><tbody>
    ${rows.map(([l,t,y,f,hi])=>`<tr><td>${l}</td>${cell(t,y,f,hi)}${cell(y,t,f,hi)}</tr>`).join('')}</tbody></table>`;
}
/* What an option does to THIS match, next to the other option: your
   expected goals and theirs (Chris: show the decision's impact, as the
   half-time cards do). Goals, not win % -- Chris found win % unhelpful. */
function impactHTML(o,other){
  const arrow=(v,w,goodUp)=>{const d=v-w;if(Math.abs(d)<.05)return"";const good=goodUp?d>0:d<0;
    return ` <span style="color:${good?'var(--good)':'var(--bad)'}">${d>0?'\u25b2':'\u25bc'}</span>`};
  return `<span style="display:flex;gap:14px;margin-top:6px;font-family:var(--mono);font-size:12px">
    <span>You ${o.p.xgf.toFixed(1)} xG${arrow(o.p.xgf,other.p.xgf,true)}</span>
    <span>Them ${o.p.xga.toFixed(1)} xG${arrow(o.p.xga,other.p.xga,false)}</span></span>`;
}
function renderBeginnerSheet(done){
  const wk=S.mw,[hT,aT]=myFixture(wk),home=hT===CLUB,opp=home?aT:hT;
  if(!S.pendingOppFm)S.pendingOppFm=oppFormation(opp);
  const dec=beginnerDecision(opp,home);
  let chosen=0;dec.options[0].set();
  function draw(){
    recalcSquadRating();paintHeader();
    const [title,idea]=BEGINNER_IDEA[dec.kind];
    document.getElementById('app').innerHTML=`<div class="card">
      <div class="datechip">${kickoffChip(wk)}</div>
      <h1>${venueTitle(opp,home)}</h1>
      ${oppCompareHTML(opp)}
      <h2 style="margin-top:6px">${title}</h2>
      <p class="small">${dec.scout||idea}</p>
      ${dec.options.map((o,i)=>`<button class="choice" data-bc="${i}" aria-pressed="${i===chosen}"
        style="${i===chosen?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
        <span class="t">${i===chosen?"\u2713 ":""}${o.title}</span><span class="d">${o.sub}</span>
        ${impactHTML(o,dec.options[1-i])}</button>`).join('')}
      <button class="choice primary" id="kick" style="margin-top:8px"><span class="t">Kick off</span></button>
      ${squadHTML({noBench:true})}</div>`;
    document.querySelectorAll('[data-bc]').forEach(b=>b.onclick=()=>{chosen=+b.dataset.bc;dec.options[chosen].set();draw()});
    document.getElementById('kick').onclick=()=>{S.fullMatches=(S.fullMatches||0)+1;done()};
  }
  draw();
}
function renderTeamSheet(done){
  if(ROLE.id==="manager"&&LEVEL==="beginner")return renderBeginnerSheet(done);
  const wk=S.mw,[hT,aT]=myFixture(wk),home=hT===CLUB,opp=home?aT:hT;
  if(!S.pendingOppFm)S.pendingOppFm=oppFormation(opp);
  const mgr=ROLE.id==="manager";
  let sel=null,flash="";
  function draw(){
    recalcSquadRating();paintHeader();
    const x=xiStats(),[bA,bD]=balanceAdj();
    const lean=v=>`<span style="color:${v>0.4?'var(--good)':v<-0.4?'var(--bad)':'var(--mute)'}">${v>0?'+':''}${v.toFixed(1)}</span>`;
    document.getElementById('app').innerHTML=`<div class="card">
      <div class="datechip">${kickoffChip(wk)}</div>
      <h1>${NEUTRAL?`v ${opp}`:home?`${opp}, at ${STADIUM}`:`Away at ${opp}`}</h1>
      ${oppCompareHTML(opp)}
      <p class="small">They are lining up <b>${S.pendingOppFm}</b>. ${mgr?(can("rotation")?"Pick your shape and your eleven.":"Pick your shape; the game picks your best eleven for it."):"The manager has picked the side."}</p>
      ${(()=>{const f=newThisMatch();return f?`<div class="tip" style="border-left-color:var(--amber)"><b>New this match · ${NEW_IDEA[f][0]}</b>${NEW_IDEA[f][1]}</div>`:""})()}
      ${flash?`<div class="outcome" style="border-left-color:var(--amber)">${flash}</div>`:""}
      ${mgr&&can("formation")?`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:6px 0 10px">
        ${Object.entries(FORMATIONS).map(([k,v])=>`<button class="choice" data-fm="${k}" style="margin:0;padding:7px 2px;text-align:center;
          ${k===S.formation?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
          <span class="t" style="font-size:13px">${k}</span><span class="d" style="font-size:10px">${v.att>0?'+':''}${v.att}/${v.def>0?'+':''}${v.def}</span></button>`).join('')}
      </div>`:''}
      <div class="xibar">XI quality <b>${Math.round(x.q)}</b> · condition <b>${Math.round(x.fit)}</b>
        · attack lean ${lean(bA)} · defence lean ${lean(bD)}</div>
      ${(()=>{const p=matchProbs(opp,home);return `<div class="xibar" style="border-color:var(--amber)">
        <b>This match, as the model sees it:</b> xGF <b>${p.xgf.toFixed(2)}</b> · clean sheet <b>${Math.round(p.cs*100)}%</b>
        · win <b>${p.w}%</b> <span style="color:var(--mute)">— changes as you pick the side</span></div>
        ${(()=>{const q=matchProbs(opp,!home);const tip=`<div class="tip" style="border-left-color:#7cb9e8;background:var(--panel2)"><b>Home advantage</b>
          ${home?`You are at home: that is worth <b>${p.w-q.w} points of win chance</b>. The same game away would be
            ${q.w}% to win, with ${q.xgf.toFixed(2)} xGF instead of ${p.xgf.toFixed(2)}.`
          :`You are away: that costs <b>${q.w-p.w} points of win chance</b>. The same game at home would be
            ${q.w}% to win, with ${q.xgf.toFixed(2)} xGF instead of ${p.xgf.toFixed(2)}.`}
          Home sides score about 19% more — the same edge FixtureShark's real model measures.</div>`;
          // Beginners: folded away, so the sheet is the essentials plus this match's one new idea.
          return LEVEL==="beginner"?why(tip,"Why does home or away matter?"):tip})()}`})()}
      ${squadHTML({pick:mgr&&can("rotation"),sel})}
      ${(()=>{
        // Beginners see a lesson in full in the match it is introduced; after
        // that it folds behind "Why?" rather than piling up on every sheet
        // (a beginner's 4th sheet had grown heavier than a Data guru's).
        const lessons=sheetLessons(wk,mgr);
        if(LEVEL!=="beginner"||!lessons)return lessons;
        const nw=newThisMatch();
        return nw==="rotation"||nw==="setpieces"?lessons:why(lessons,"Rest, rotation and set pieces");
      })()}
      ${mgr&&can("rotation")?`<button class="choice" id="bestXI" style="margin-top:9px"><span class="t">Pick my best XI</span>
        <span class="d">Let the game choose the strongest available side for this shape</span></button>`:''}
      <button class="choice primary" id="kick" style="margin-top:6px"><span class="t">Kick off</span></button></div>`;
    if(mgr){
      document.querySelectorAll('[data-fm]').forEach(b=>b.onclick=()=>{S.formation=b.dataset.fm;S.manualXI=null;sel=null;draw()});
      document.querySelectorAll('[data-xi]').forEach(b=>b.onclick=()=>{const i=+b.dataset.xi;sel=sel===i?null:i;draw()});
      document.querySelectorAll('[data-bench]').forEach(b=>b.onclick=()=>{
        if(sel==null)return;
        const j=+b.dataset.bench,xi=currentXI().map(s=>({...s}));
        const k=xi.findIndex(s=>s.i===sel);if(k<0)return;
        /* before out-of-position is unlocked, swaps are like for like */
        if(!can("oop")&&S.squadList[j].pos!==xi[k].slot){flash=`${S.squadList[j].nm} is a ${S.squadList[j].pos} — playing out of position unlocks in a later match.`;sel=null;return draw()}
        flash="";xi[k].i=j;S.manualXI=xi;S.manualFm=S.formation;sel=null;draw()});
      const bx=document.getElementById('bestXI');if(bx)bx.onclick=()=>{S.manualXI=null;sel=null;flash="";draw()};
      document.querySelectorAll('[data-sp]').forEach(b=>b.onclick=()=>{S.spTaker=+b.dataset.sp;draw()});
    }
    document.getElementById('kick').onclick=()=>{S.fullMatches=(S.fullMatches||0)+1;done()};
  }
  draw();
}
/* RED CARDS -- luck, not decisions. Drawn at kickoff for either side. A red
   before half time changes the second half; the Hot Head in your XI makes
   your own far likelier. The same odds are used in the quick simulation
   (playFixture), so the balance checks measure the game as it is played. */
function drawReds(){
  const hot=currentXI().some(s=>S.squadList[s.i].nm==="Hot Head");
  const r=[];
  if(rng()<RED_THEM)r.push({m:rnd(15,85),us:0});
  if(rng()<(hot?RED_US_HOTHEAD:RED_US)){
    const xi=currentXI().filter(s=>s.slot!=="GK").map(s=>S.squadList[s.i]);
    const who=hot?"Hot Head":(pick(xi)||{nm:"a defender"}).nm;
    r.push({m:rnd(15,85),us:1,who});
  }
  return r;
}
/* YOUR MATCH. Your Team is always on the left and the score is always
   yours first -- it used to follow home/away convention, which made your
   own result hard to follow. quick=true is the lighter version: no team
   sheet, no half-time call, a faster vidiprinter. */
/* Speed and skip controls, shown while commentary or results are running.
   The speed is one session-wide setting (SPEED in config.js). */
function paceControlsHTML(skipLabel){
  return `<div class="pace" role="group" aria-label="Playback speed" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin:8px 0">
    <span style="font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--mute)">SPEED</span>
    ${["slow","normal","fast"].map(k=>`<button class="choice" data-speed="${k}" aria-pressed="${speedName()===k}"
      style="margin:0;padding:4px 9px;width:auto;font-size:12px;${speedName()===k?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}
    <button class="choice" data-skip="1" style="margin:0 0 0 auto;padding:4px 9px;width:auto;font-size:12px">${skipLabel} ⏭</button>
  </div>`;
}
function wirePaceControls(root,onSkip){
  root.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{
    SPEED=b.dataset.speed;
    root.querySelectorAll('[data-speed]').forEach(x=>{const on=x.dataset.speed===SPEED;x.setAttribute('aria-pressed',on);
      x.style.borderColor=on?'var(--amber)':'';x.style.background=on?'color-mix(in srgb,var(--amber) 14%,transparent)':''})});
  const sk=root.querySelector('[data-skip]');if(sk)sk.onclick=onSkip;
}
function renderMatch(done,quick){
  if(!quick&&!S._sheetShown){S._sheetShown=true;return renderTeamSheet(()=>renderMatch(done,false))}
  S._sheetShown=false;
  const wk=S.mw,[hT,aT]=myFixture(wk),home=hT===CLUB,opp=home?aT:hT,final=wk===MW-1;
  const oFm=S.pendingOppFm||oppFormation(opp);S.pendingOppFm=null;S.nextOppFm=oFm;
  S.matchBoost=0;S.matchAtt=0;S.matchDef=0;
  const startPos=TABLE[CLUB].p?posOf(CLUB):null;
  const reds=drawReds();
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">${kickoffChip(wk)}</div>
    <h1>${NEUTRAL?`v ${opp}`:home?`${opp}, at ${STADIUM}`:`Away at ${opp}`}</h1>
    ${quick?"":opponentPanel(opp,home)}
    <div class="vp"><div class="teams">
      <span>${CLUB.toUpperCase()} <small style="opacity:.7">(${home?"H":"A"})</small><br><span style="font-family:var(--mono);font-size:11px;color:var(--mute)">${S.formation}</span></span>
      <span style="text-align:right">${opp.toUpperCase()}<br><span style="font-family:var(--mono);font-size:11px;color:var(--mute)">${oFm}</span></span></div>
      <div id="vpl"></div></div>
    <div id="paceBox">${paceControlsHTML("Skip to full time")}</div>
    <div id="htBox"></div></div>`;
  const lines=document.getElementById('vpl');let mine=0,theirs=0;
  const add=(m,t,cls,sc2)=>{const d=document.createElement('div');d.className='ln'+(cls?' '+cls:'');
    d.innerHTML=`<span class="min">${m}</span><span class="tx">${t}</span>${sc2?`<span class="sc">${sc2}</span>`:''}`;lines.appendChild(d)};
  const sc=()=>`${mine}–${theirs}`;
  // Read afresh for every line, so a speed change takes effect at once.
  // Skipping runs straight on -- but stops at the half-time decision.
  let skipping=false;
  const lineDelay=()=>skipping?0:((quick?PACE.quickCommentaryMs:PACE.commentaryMs)*speedFactor()*(0.9+Math.random()*0.2));
  wirePaceControls(document.getElementById('paceBox'),()=>{skipping=true});
  function half(from,to,cb){
    let[mr,tr]=clubRates(opp,home,.62,oFm);
    /* a first-half red card shapes the second half */
    for(const r of reds)if(from>45&&r.m<=45){if(r.us){mr*=.72;tr*=1.25}else{tr*=.72;mr*=1.25}}
    const mg=Math.min(3,pois(mr)),tg=Math.min(3,pois(tr)),ev=[];
    const mins=n=>{const r=[];for(let i=0;i<n;i++)r.push(rnd(from,to));return r.sort((x,y)=>x-y)};
    for(const m of mins(mg))ev.push({m,mine:1,g:pickGoal()});
    for(const m of mins(tg))ev.push({m,mine:0});
    for(const r of reds)if(r.m>=from&&r.m<=to)ev.push({m:r.m,red:r});
    if(rng()<.4)ev.push({m:rnd(from,to),card:1});
    ev.sort((x,y)=>x.m-y.m);let i=0;
    (function go(){if(i>=ev.length)return setTimeout(cb,skipping?0:(quick?260:460));const e=ev[i++];
      if(e.card)add(e.m+"'","Yellow card","");
      else if(e.red)add(e.m+"'",e.red.us?`RED CARD — ${e.red.who.toUpperCase()} (YOURS)`:`RED CARD — ${opp.toUpperCase()}`,e.red.us?"against":"goal");
      else if(e.mine){mine++;
        add(e.m+"'",(e.g?e.g.p.nm:"TRIALIST").toUpperCase()+(e.g&&e.g.how?` <small style="opacity:.75">(${e.g.how})</small>`:"")
          +(e.g&&roleSignal(e.g.p,e.g.slot)==="advanced"?` <small style="color:var(--good)">▲</small>`:""),"goal",sc())}
      else{theirs++;add(e.m+"'",opp.toUpperCase()+" GOAL","against",sc())}
      setTimeout(go,lineDelay())})();
  }
  half(4,45,()=>{
    add("HT","Half time","ft",sc());
    /* The owner used to get a half-time "decision" (concourse or boardroom)
       that changed nothing that mattered. He now watches, like an owner. */
    const second=()=>{add("46'","— second half —","");half(46,92,finish)};
    if(ROLE.id==="owner")return second();
    // A decision is never skipped: stop skipping here, and resume at the chosen speed.
    // Weeks with no pre-match decision get ONE simple half-time choice: a sub.
    if(ROLE.id==="manager"&&LEVEL==="beginner"){skipping=false;
      const ht=BEGINNER_HT[Math.min(S.mw,BEGINNER_HT.length-1)];
      return !ht?second():ht==="sub"?subHalfTime(second,true):shapeHalfTime(second,mine,theirs)}
    if(ROLE.id==="manager"&&(quick||S.mw===1)){skipping=false;return subHalfTime(second)}
    // Beginners made their pre-match decision; no half-time one on top.
    if(ROLE.id==="manager"&&LEVEL==="beginner")return second();
    if(ROLE.id==="manager"){skipping=false;return tacticalHalfTime(mine,theirs,oFm,second)}
    const losing=mine<theirs,level=mine===theirs;
    const spec=ROLE.id==="player"
      ?{title:losing?"You are losing. Forty-five minutes left.":level?"Level at the break.":"You are ahead.",
        choices:[{t:"Play safe, keep the rating up",d:"Protect the body",fx:{form:-1},att:-2,def:1},
          {t:"Take it on yourself",d:"Shoot on sight",fx:{fitness:-6,form:3},att:4,def:-1}]}
      :{title:"Half time in the directors' box",
        choices:[{t:"Go down to the concourse",d:"Be seen among the supporters",fx:{fans:6}},
          {t:"Work the room upstairs",d:"Sponsors and contacts",fx:{cash:18,fans:-2}},
          {t:"Stay in your seat",d:"You are a fan too",fx:{fans:2}}]};
    const box=document.getElementById('htBox');
    box.innerHTML=`<div style="margin-top:12px"><div class="datechip">HALF TIME</div>
      <h2 style="margin-top:5px">${spec.title}</h2><div id="htCh"></div></div>`;
    spec.choices.forEach(c=>{const b=document.createElement('button');b.className='choice';
      b.innerHTML=`<span class="t">${c.t}</span><span class="d">${c.d}</span>`;
      b.onclick=()=>{box.innerHTML=`<div style="margin-top:10px" class="outcome">${c.t}.</div>`;
        apply(c.fx,true);S.matchAtt=c.att||0;S.matchDef=c.def||0;add("46'","— second half —","");half(46,92,finish)};
      document.getElementById('htCh').appendChild(b)});
  });
  function finish(){
    add("FT","Full time","ft",sc());
    const hg=home?mine:theirs,ag=home?theirs:mine;
    award(TABLE,hT,aT,hg,ag);
    const{fx,res}=resolveMine(hg,ag,home);
    S.matchAtt=0;S.matchDef=0;
    if(S._subXI){S.manualXI=null;S._subXI=false} // a half-time sub is for this match only
    // Kept a tiring star on at half time: he breaks down, out for the next game.
    // (Set after resolveMine's weekly update, so it isn't counted down at once.)
    if(S._knockRisk!=null){const p=S.squadList[S._knockRisk];S._knockRisk=null;
      if(p&&rng()<.5){p.out=Math.max(p.out||0,2);add("FT",`${p.nm}'s knock flares up: out for the rest of the season.`,"")}}
    if(S._injureAfter!=null){const p=S.squadList[S._injureAfter];S._injureAfter=null;
      if(p){p.out=Math.max(p.out||0,1);add("FT",`${p.nm} limps off at the whistle: out for the next game.`,"")}}
    // Full time WAITS for the player (Chris: the game, the other games and
    // the table shouldn't all happen on one page, on a timer). Next: the table.
    const pb=document.getElementById('paceBox');
    if(pb)pb.innerHTML=`<button class="choice primary" id="toTable" style="margin-top:10px"><span class="t">See the league table</span>
      <span class="d">${home?`${CLUB} ${mine}–${theirs} ${opp}`:`${opp} ${theirs}–${mine} ${CLUB}`}</span></button>`;
    const tt=document.getElementById('toTable');
    if(tt)tt.onclick=()=>renderTableAfterMatch({wk,fx,res,mine,theirs,opp,home,startPos,final},done);
  }
}
/* AFTER THE MATCH -- two calm screens, no timers (Chris's playtest: the
   game, the other games and the table all on one page, running on a timer,
   was too fast to follow).
   1. THE TABLE: your result is in, everyone else still to play.
   2. THE OTHER RESULTS: all at once, and what they did to the table --
      arrows for every move since your result went in. */
function renderTableAfterMatch(info,done){
  const{wk,fx,res,mine,theirs,opp,home,final}=info;
  const d=apply(fx,true);myPos();paintHeader();
  const left=FIXTURES[wk].filter(([h,a])=>h!==CLUB&&a!==CLUB).length;
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">GAMEWEEK ${wk+1} OF ${MW} · ${final?"FINAL DAY · ":""}THE TABLE</div>
    <h1>${res==='w'?"Job done.":res==='d'?"A point on the board.":"Beaten."}</h1>
    <div class="res mine" style="font-size:15px;padding:10px">
      <span><b>${CLUB}</b> ${mine}–${theirs} ${opp} <small style="color:var(--mute)">(${home?"H":"A"})</small></span></div>
    <div class="delta" style="margin:6px 0 8px">${d}</div>
    <div class="datechip" style="margin:8px 0 5px">AS IT STANDS · ${left} ${left===1?"GAME":"GAMES"} STILL TO PLAY</div>
    ${tableRowsHTML(null)}
    <button class="choice primary" id="toOthers" style="margin-top:11px"><span class="t">${left?"The 3pm kick-offs":"Continue"}</span>
      <span class="d"></span></button></div>`;
  document.getElementById('toOthers').onclick=()=>renderElsewhere(info,done);
}
/* THE 3PM KICK-OFFS, LIVE (Chris: make it feel like a real match day).
   A clock runs 0'-90'; each game has a scoreboard; goals flash in at a
   readable pace, with your live position "as it stands". The full table
   stays put until full time (it used to reshuffle after every result),
   then shows every move. Speed control and a "Full time" skip. */
function renderElsewhere(info,done){
  const{wk,final}=info;
  const posMap=()=>{const m={};standings(TABLE).forEach((r,i)=>m[r.n]=i+1);return m};
  const before=posMap(),myBefore=posOf(CLUB);
  const games=FIXTURES[wk].filter(([h,a])=>h!==CLUB&&a!==CLUB).map(([h,a])=>{
    const[hg,ag]=simScore(strOf(h),strOf(a));
    const goals=[...Array(hg).fill(h),...Array(ag).fill(a)].map(t=>({t,min:rnd(2,90)})).sort((x,y)=>x.min-y.min);
    return{h,a,hg,ag,goals,sh:0,sa:0}});
  const events=games.flatMap((g,gi)=>g.goals.map(x=>({...x,gi}))).sort((x,y)=>x.min-y.min);
  let minute=0,next=0,skipping=false,timer=null;
  // a live position: the table as it stands, with these scores counted
  const liveTable=()=>{const T=JSON.parse(JSON.stringify(TABLE));for(const g of games)award(T,g.h,g.a,g.sh,g.sa);
    return standings(T).findIndex(r=>r.n===CLUB)+1};
  const board=()=>games.map(g=>`<div class="res" style="margin-top:6px;font-size:15px"><span>${g.h} v ${g.a}</span><span class="sc">${g.sh}–${g.sa}</span></div>`).join('');
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">GAMEWEEK ${wk+1} OF ${MW} · ${final?"FINAL DAY · ":""}THE 3PM KICK-OFFS</div>
    <div style="display:flex;justify-content:space-between;align-items:baseline"><h1 style="margin:4px 0">Live</h1>
      <span id="clock" style="font-family:var(--disp);font-size:34px;font-weight:700">0'</span></div>
    <div id="boards">${board()}</div>
    <div id="flash" aria-live="polite" style="min-height:44px;margin:10px 0;font-family:var(--disp);font-size:22px;font-weight:700;color:var(--amber)"></div>
    <div id="asit" class="outcome">As it stands: ${ord(myBefore)}</div>
    <div id="lpace">${paceControlsHTML("Full time")}</div>
    <div id="lend"></div></div>`;
  paintHeader();
  wirePaceControls(document.getElementById('lpace'),()=>{skipping=true;if(timer){clearTimeout(timer);timer=null}tick()});
  function tick(){
    if(next<events.length&&(skipping||events[next].min<=minute+1)){
      const e=events[next++],g=games[e.gi];
      if(e.t===g.h)g.sh++;else g.sa++;
      minute=Math.max(minute,e.min);
      document.getElementById('boards').innerHTML=board();
      document.getElementById('flash').textContent=`GOAL! ${e.min}' ${e.t}  ·  ${g.h} ${g.sh}–${g.sa} ${g.a}`;
      document.getElementById('asit').textContent=`As it stands: ${ord(liveTable())}`;
    }else if(minute<90)minute=Math.min(90,minute+(next<events.length?Math.max(1,events[next].min-minute-1):6));
    document.getElementById('clock').textContent=minute>=90&&next>=events.length?"FT":`${minute}'`;
    if(minute>=90&&next>=events.length)return fullTime();
    const goalNext=next<events.length&&events[next].min<=minute+1;
    timer=setTimeout(()=>{timer=null;tick()},skipping?0:(goalNext?PACE.commentaryMs*1.1:PACE.commentaryMs*.35)*speedFactor());
  }
  function fullTime(){
    for(const g of games)award(TABLE,g.h,g.a,g.hg,g.ag);
    S.mw++;
    const money=cashConsequences();
    myPos();paintHeader();kpiRecord();
    const endPos=posOf(CLUB),moved=myBefore-endPos;
    const line=final?(endPos===1?"Champions.":endPos>=5?"Relegated.":`${ord(endPos)}, and safe.`)
      :moved>0?`Up to ${ord(endPos)}.`:moved<0?`Down to ${ord(endPos)}.`:`${ord(endPos)}.`;
    document.getElementById('lpace').innerHTML="";
    document.getElementById('flash').textContent="Full time.";
    document.getElementById('asit').textContent=line;
    document.getElementById('lend').innerHTML=`${money.map(ev=>ev.type==="deduction"
      ?`<div class="outcome" style="border-left-color:var(--bad)"><b>Points deduction: −${ev.pts}.</b> The club went too far into the red.</div>`
      :`<div class="outcome" style="border-left-color:var(--bad)"><b>The bank forced a sale.</b> ${ev.nm} (${ev.pos}, quality ${ev.rt}) sold for ${fmtMoney(ev.fee)}. Your team is weaker.</div>`).join('')}
      <div class="datechip" style="margin:10px 0 5px">THE TABLE NOW</div>${tableRowsHTML(before)}
      <button class="choice primary" id="mn" style="margin-top:10px"><span class="t">${final?"To the final whistle":"Continue"}</span></button>`;
    document.getElementById('mn').onclick=done;
  }
  timer=setTimeout(()=>{timer=null;tick()},600);
}
/* WHO SCORES, AND HOW. About a quarter of goals come from set pieces: the
   taker scores penalties and free kicks wherever he plays, and corners are
   headed in by the XI's aerial threats -- defenders included. Open-play
   goals are weighted by the SLOT a player is in, so a defender playing
   further forward gets a forward's chances: out of position is how a
   defender's goal record improves. Each goal is recorded against the
   player, including whether it came from an advanced role or a set piece,
   because the end of season reports both. */
const SP_SHARE=.26;
function pickGoal(){
  const xi=currentXI().filter(s=>s.slot!=="GK");
  if(!xi.length)return null;
  const P=xi.map(s=>({p:S.squadList[s.i],slot:s.slot}));
  const weighted=(arr,w)=>{let r=rng()*arr.reduce((a,x)=>a+w(x),0);for(const x of arr){r-=w(x);if(r<=0)return x}return arr[arr.length-1]};
  let pick,how="";
  if(rng()<SP_SHARE){
    const tk=setPieceTaker();
    if(tk&&rng()<.4){pick=P.find(x=>x.p===tk)||P[0];how=rng()<.5?"pen":"free kick"}
    else{pick=weighted(P,x=>.3+(x.p.aer||0));how="header from a corner"}
  }else{
    pick=weighted(P,({p,slot})=>{let x=(slot==="FW"?3:slot==="MF"?2:1)*(1+Math.max(0,p.att)*.25);
      if(S.bonuses.some(b=>b.type==="goals"&&b.nm===p.nm))x*=2.2;return x});
  }
  const p=pick.p;p.goals=(p.goals||0)+1;
  if(roleSignal(p,pick.slot)==="advanced")p.goalsAdv=(p.goalsAdv||0)+1;
  if(how)p.spGoals=(p.spGoals||0)+1;
  return{p,how,slot:pick.slot};
}
/* kept for callers that only need the player */
function pickScorer(){const g=pickGoal();return g?g.p:null}
/* HALF TIME: KEEP THE STAR, OR SAVE HIM (Chris). A better player who is
   tiring, against a fresher, weaker one in the same position:
   - keep him on: the second half's goal threat stays -- but he breaks down,
     out for the next game, so next week's goal threat drops;
   - bring the fresher man on: less goal threat now -- the star is fit next week.
   Shown as bars for this half and next week, with each player's health.
   Always asked in Gameweek 2; in other weeks only when someone is tiring. */
function subHalfTime(resume,force){
  const always=force||S.mw===1,xi=currentXI(),inXI=new Set(xi.map(x=>x.i));
  let pair=null;
  for(const x of xi){const s=S.squadList[x.i];if(!s||(!always&&s.fit>=80))continue;
    for(const b of available()){const j=S.squadList.indexOf(b);
      if(inXI.has(j)||b.pos!==s.pos||b.fit<=s.fit+(always?0:9))continue;
      // the dilemma needs a BETTER player tiring and a weaker, fresher one
      if(always&&b.rt>=s.rt)continue;
      const score=always?s.rt-s.fit/10:-s.fit;
      if(!pair||score>pair.score)pair={si:x.i,bi:j,s,b,score}}}
  if(!pair)return resume();
  const[hT,aT]=myFixture(S.mw),home=hT===CLUB,opp=home?aT:hT;
  const threat=()=>{recalcSquadRating();return matchProbs(opp,home).xgf/2};
  const nextThreat=()=>{if(S.mw+1>=MW)return null;const[h2,a2]=myFixture(S.mw+1),hm=h2===CLUB;recalcSquadRating();return matchProbs(hm?a2:h2,hm).xgf};
  // (a manual XI only counts when tagged with the current formation -- untagged,
  // currentXI() silently discards it, which made both options preview the same)
  const was=S.manualXI?S.manualXI.map(y=>({...y})):null,wasFm=S.manualFm;
  const swapped=()=>{const x=currentXI().map(y=>({...y}));const k=x.findIndex(y=>y.i===pair.si);if(k>=0)x[k].i=pair.bi;return x};
  const keepNow=threat(),keepNext=(()=>{pair.s.out=1;const v=nextThreat();pair.s.out=0;return v})();
  S.manualXI=swapped();S.manualFm=S.formation;const subNow=threat();S.manualXI=was;S.manualFm=wasFm;const subNext=nextThreat();recalcSquadRating();
  const max=Math.max(keepNow,subNow,keepNext||0,subNext||0,.1);
  const bar=(v,good)=>v==null?"":`<div style="height:9px;border-radius:5px;background:var(--line);margin:3px 0 1px"><div style="height:9px;border-radius:5px;width:${Math.round(v/max*100)}%;background:${good?'var(--good)':'var(--amber)'}"></div></div><div style="font-family:var(--mono);font-size:11px">${v.toFixed(1)} xG</div>`;
  const health=p=>`<div style="font-size:12px;margin-top:2px">${p.nm} · Q${p.rt}</div><div style="height:6px;border-radius:3px;background:var(--line)"><div style="height:6px;border-radius:3px;width:${p.fit}%;background:${p.fit<75?'var(--bad)':p.fit<85?'var(--amber)':'var(--good)'}"></div></div><div style="font-size:11px;color:var(--mute)">${p.fit}% health</div>`;
  const card=(id,title,who,now,next,nextNote,nowBetter,nextBetter)=>`<button class="choice" id="${id}" style="margin:0;height:100%;text-align:left">
    <span class="t">${title}</span>${who}
    <div style="font-size:11px;letter-spacing:.08em;color:var(--mute);margin-top:8px">GOAL THREAT, 2ND HALF</div>${bar(now,nowBetter)}
    <div style="font-size:11px;letter-spacing:.08em;color:var(--mute);margin-top:6px">GOAL THREAT, NEXT GAME</div>${bar(next,nextBetter)}
    <div style="font-size:12px;margin-top:4px">${nextNote}</div></button>`;
  const box=document.getElementById('htBox');
  box.innerHTML=`<div class="card" style="margin-top:10px"><div class="datechip">HALF TIME</div>
    <h2>${pair.s.nm} is tiring</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:stretch">
      ${card("subNo",`Keep ${pair.s.nm} on`,health(pair.s),keepNow,keepNext,`<b style="color:var(--bad)">✗ Injured for the next game</b>`,keepNow>=subNow,false)}
      ${card("subYes",`Bring on ${pair.b.nm}`,health(pair.b),subNow,subNext,`<b style="color:var(--good)">✓ ${pair.s.nm} fit next game</b>`,subNow>keepNow,true)}
    </div></div>`;
  document.getElementById('subYes').onclick=()=>{
    const x=swapped();S.manualXI=x;S.manualFm=S.formation;S._subXI=true;box.innerHTML="";resume()};
  document.getElementById('subNo').onclick=()=>{S._injureAfter=pair.si;box.innerHTML="";resume()};
}
/* HALF TIME: PUSH ON OR HOLD? The same card style as the sub dilemma:
   goal-threat bars for BOTH ends in the second half, for each shape. */
function shapeHalfTime(resume,mine,theirs){
  const[hT,aT]=myFixture(S.mw),home=hT===CLUB,opp=home?aT:hT;
  const fs=Object.keys(FORMATIONS);
  const bold=fs.slice().sort((a,b)=>(FORMATIONS[b].att-FORMATIONS[b].def)-(FORMATIONS[a].att-FORMATIONS[a].def))[0];
  const safe=fs.slice().sort((a,b)=>(FORMATIONS[b].def-FORMATIONS[b].att)-(FORMATIONS[a].def-FORMATIONS[a].att))[0];
  const was=S.formation,wasXI=S.manualXI;
  const view=f=>{S.formation=f;S.manualXI=null;recalcSquadRating();const p=matchProbs(opp,home);return{us:p.xgf/2,them:p.xga/2}};
  const P=view(bold),H=view(safe);S.formation=was;S.manualXI=wasXI;recalcSquadRating();
  const max=Math.max(P.us,P.them,H.us,H.them,.1);
  const bar=(v,col)=>`<div style="height:9px;border-radius:5px;background:var(--line);margin:3px 0 1px"><div style="height:9px;border-radius:5px;width:${Math.round(v/max*100)}%;background:${col}"></div></div><div style="font-family:var(--mono);font-size:11px">${v.toFixed(1)} xG</div>`;
  const card=(id,title,sub,v)=>`<button class="choice" id="${id}" style="margin:0;height:100%;text-align:left">
    <span class="t">${title}</span><span class="d">${sub}</span>
    <div style="font-size:11px;letter-spacing:.08em;color:var(--mute);margin-top:8px">YOUR GOAL THREAT</div>${bar(v.us,'var(--good)')}
    <div style="font-size:11px;letter-spacing:.08em;color:var(--mute);margin-top:6px">THEIR GOAL THREAT</div>${bar(v.them,'var(--bad)')}</button>`;
  const state=mine>theirs?`You lead ${mine}–${theirs}.`:mine<theirs?`You trail ${mine}–${theirs}.`:`${mine}–${theirs} at the break.`;
  const box=document.getElementById('htBox');
  box.innerHTML=`<div class="card" style="margin-top:10px"><div class="datechip">HALF TIME</div>
    <h2>${state} Push on or hold?</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:stretch">
      ${card("htPush",`Push on (${bold})`,"More chances, both ends",P)}
      ${card("htHold",`Hold (${safe})`,"Tighter, fewer chances",H)}
    </div></div>`;
  document.getElementById('htPush').onclick=()=>{S.formation=bold;S.manualXI=null;box.innerHTML="";resume()};
  document.getElementById('htHold').onclick=()=>{S.formation=safe;S.manualXI=null;box.innerHTML="";resume()};
}
function tacticalHalfTime(mg,tg,oFm,resume){
  const box=document.getElementById('htBox');
  let fm=S.formation,subs=[],oop=null;
  const tired=can("rotation")?currentXI().map(s=>S.squadList[s.i]).filter(p=>p.fit<72).sort((a,b)=>a.fit-b.fit).slice(0,3):[];
  const defenders=can("oop")?available().filter(p=>p.pos==="DF"):[];
  function effect(){
    const f=FORMATIONS[fm],fb=FORMATIONS[S.formation];
    let at=f.att-fb.att,de=f.def-fb.def;
    at+=subs.length*2;de+=subs.length*1;
    /* Out of position, both ways round -- and both are defenders moving
       FORWARD, which keeps defensive shape. Protecting a lead: a defender
       into midfield. Chasing a game: a defender up front as a target man. */
    if(oop){if(mg>tg){de+=3}else{at+=4;de-=1}}
    return{at,de};
  }
  function draw(){
    const e=effect();
    box.innerHTML=`<div style="margin-top:12px">
      <div class="datechip">HALF TIME · ${mg}–${tg} · THEY ARE IN ${oFm}</div>
      <h2 style="margin-top:5px">${mg<tg?"Losing. Change something.":mg===tg?"Level. Chase it or hold it?":"Ahead. Protect it or kill it?"}</h2>
      <div style="font-family:var(--mono);font-size:10px;letter-spacing:.09em;color:var(--mute);margin:8px 0 5px">FORMATION</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px">
        ${Object.entries(FORMATIONS).map(([k,v])=>`<button class="choice" data-fm="${k}" style="margin:0;padding:8px 2px;text-align:center;
          ${k===fm?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
          <span class="t" style="font-size:13px">${k}</span>
          <span class="d" style="font-size:10px">${v.att>0?'+':''}${v.att}/${v.def>0?'+':''}${v.def}</span></button>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--mute);margin-top:4px">${FORMATIONS[fm].d} · attack/defence</div>
      ${tired.length?`<div style="font-family:var(--mono);font-size:10px;letter-spacing:.09em;color:var(--mute);margin:12px 0 5px">SUBSTITUTIONS · FRESH LEGS FOR TIRED ONES</div>
        ${tired.map(p=>`<button class="choice" data-sub="${p.nm}" style="margin:0 0 5px;padding:8px 11px;
          ${subs.includes(p.nm)?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
          <span class="t" style="font-size:14px">${subs.includes(p.nm)?"✓ ":""}Take off ${p.nm}</span>
          <span class="d">${p.pos}, condition ${p.fit} · +2 attack, +1 defence</span></button>`).join('')}`:''}
      ${defenders.length?`<div style="font-family:var(--mono);font-size:10px;letter-spacing:.09em;color:var(--mute);margin:12px 0 5px">OUT OF POSITION ▲</div>
        <button class="choice" data-oop="1" style="margin:0 0 5px;padding:8px 11px;
          ${oop?'border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)':''}">
          <span class="t" style="font-size:14px">${oop?"✓ ":""}${mg>tg?`Move ${defenders[0].nm} into midfield`:`Push ${defenders[0].nm} up front`}</span>
          <span class="d">${mg>tg?"A defender in midfield protects a lead: he still defends like a defender · defence +3"
            :"A defender as target man: he wins headers and still presses like a defender · attack +4, defence −1"}</span></button>`:''}
      <div style="margin-top:10px;padding:8px 11px;border-radius:8px;background:var(--panel2);font-family:var(--mono);font-size:12.5px">
        Second-half change: <span style="color:${e.at>=0?'var(--good)':'var(--bad)'}">attack ${e.at>0?'+':''}${e.at}</span>
        · <span style="color:${e.de>=0?'var(--good)':'var(--bad)'}">defence ${e.de>0?'+':''}${e.de}</span></div>
      <button class="choice primary" id="goSecond" style="margin-top:9px"><span class="t">Send them back out</span></button></div>`;
    box.querySelectorAll('[data-fm]').forEach(b=>b.onclick=()=>{fm=b.dataset.fm;draw()});
    box.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>{const n=b.dataset.sub;
      subs=subs.includes(n)?subs.filter(x=>x!==n):(subs.length<3?subs.concat(n):subs);draw()});
    box.querySelectorAll('[data-oop]').forEach(b=>b.onclick=()=>{oop=!oop;draw()});
    document.getElementById('goSecond').onclick=()=>{
      const e=effect(),was=S.formation;
      /* The formation takes effect through S.formation, which clubRates
         reads. matchAtt/matchDef carry ONLY the subs and out-of-position
         parts -- otherwise the shape change would be counted twice. */
      const fAt=FORMATIONS[fm].att-FORMATIONS[was].att,fDe=FORMATIONS[fm].def-FORMATIONS[was].def;
      S.formation=fm;S.matchAtt=e.at-fAt;S.matchDef=e.de-fDe;
      /* subs: fresh legs now, and the tired man recovers a little */
      subs.forEach(n=>{const p=S.squadList.find(x=>x.nm===n);if(p)p.fit=clamp(p.fit+6)});
      S.fatigue=clamp(S.fatigue-subs.length*2);
      const bits=[fm!==was?`Switched from ${was} to ${fm}`:`Stayed in ${fm}`];
      if(subs.length)bits.push(`${subs.length} ${subs.length===1?"change":"changes"}: ${subs.join(", ")} off`);
      if(oop)bits.push(mg>tg?`${defenders[0].nm} into midfield to protect the lead`:`${defenders[0].nm} pushed up front`);
      box.innerHTML=`<div style="margin-top:10px" class="outcome">${bits.join(". ")}.</div>`;
      resume();
    };
  }
  draw();
}
