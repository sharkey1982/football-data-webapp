/* ===========================================================================
   ui.js — screen flow, the season plan, the ending and the start screens. Loaded last:
   its final lines start the game.
   =========================================================================== */
/* --- runner --------------------------------------------------------------- */
/* Ten matchweeks, every one of them watched: five as your own match with a
   half-time decision, five as a live classified check across all fixtures. */
/* Three "luck" beats: things that happen TO the season, for and against
   you and your rivals -- added after playtesting asked for more spread in
   where Your Team finishes, and for chance alongside decisions. */
/* One luck beat per season, mid-season: an incident, not a recurring coin
   flip. The two slots it gave up now hold the cash crisis -- randomness that
   hands you a DECISION rather than simply deciding the outcome. */
const PLAN=["special1","heatmap","presser","match","live","crisis","physio","match","papers","event","live","podcast",
            "match","special2","stats","luck","event","live","physio","match","call","live","crisis","event","match","papers","event","live","end"];
let cursor=0,pendingReveal=null,RECENT=new Set(),RECENT_Q=[];
function remember(s){RECENT.add(s);RECENT_Q.push(s);if(RECENT_Q.length>18)RECENT.delete(RECENT_Q.shift())}
function drawEvent(){let best=null;
  for(let t=0;t<9;t++){const c=SHAPES[pick(ROLE.pool)]();if(!RECENT.has(c.sig)){best=c;break}best=c}
  remember(best.sig);return best}
function next(){cursor++;showPending()}
function showPending(){
  const due=drainPending();
  if(!due.length)return step();
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card"><div class="datechip">IT CATCHES UP</div>
    ${due.map(p=>`<div class="outcome" style="border-left-color:var(--blue)">${p.text||"An earlier choice has caught up with you."}</div><div class="delta">${apply(p.fx)}</div>`).join('')}
    <button class="choice primary" id="pn" style="margin-top:11px"><span class="t">Continue</span></button></div>`;
  paintHeader();document.getElementById('pn').onclick=step;
}
/* EASY DECISIONS FIRST for Beginners (Chris): a story decision -- the press
   conference -- comes before the data-heavy ones (pre-season planning, the
   fixture heat map, the first team sheet). Derived afresh each season from
   the untouched base order, so switching level can't leave it scrambled. */
const PLAN_BASE=PLAN.slice();
/* THE BEGINNER SEASON (agreed with Chris, 2026-09-21): five games, each
   with a summary, a preview, one pre-match and one half-time decision, and
   a story between games that builds -- cash a real issue by Gameweek 4. */
const BEGINNER_PLAN=["match","presser","match","knock","match","window","bank","match","papers","match","end"];
// The owner's five games: his own decisions around them (he doesn't pick the team).
const BEGINNER_OWNER_PLAN=["special1","match","call","match","crisis","match","special2","match","papers","match","end"];
function planFor(level,role){
  if(level==="beginner")return (role==="manager"?BEGINNER_PLAN:BEGINNER_OWNER_PLAN).slice();
  const p=PLAN_BASE.slice();
  // The manager's season starts with the opening match (Chris); everything
  // else keeps its order after it.
  if(role==="manager"){
    const i=p.indexOf("match");if(i>0){p.splice(i,1);p.unshift("match")}
    // ...and straight on to the second (Chris): a harder side, with a
    // half-time decision about a player change.
    // Gameweek 2 is a full match too (Chris): the shape choice against the
    // strongest side, then the half-time dilemma. A later full match becomes
    // a quick week, so the season keeps five of each.
    const j=p.indexOf("live");if(j>1){p.splice(j,1);p.splice(1,0,"match")}
    const k=p.indexOf("match",2);if(k>0)p[k]="live";
  }
  return p;
}
function step(){
  if(!S.alive)return renderEnding();
  if(cursor>=PLAN.length)return renderEnding();
  const b=PLAN[cursor];
  if(b==="end")return renderEnding();
  if(b==="special1"){
    if(ROLE.id==="owner")return renderWindow("summer",next);
    if(ROLE.id==="manager")return renderSpec(preseasonSpec(),"A BID ARRIVES",next);
    return renderSpec(playerSummerSpec(),"JULY · YOUR SUMMER",next);
  }
  if(b==="special2"){
    if(ROLE.id==="owner")return renderWindow("january",next);
    /* The manager never had a window, which mattered once squad balance
       started deciding seasons: a lopsided squad could not be fixed.
       He gets January on a budget the owner sets, then the winter break. */
    if(ROLE.id==="manager"){S.janBudget=Math.min(Math.max(S.cash,0),160);
      return renderWindow("january",()=>renderSpec(winterSpec(),"DECEMBER · THE WINTER BREAK",next))}
    return renderSpec(playerWinterSpec(),"DECEMBER · MIDWINTER",next);
  }
  if((b==="match"||b==="live")&&ROLE.id==="manager"){
    // Before every game (Chris): the match-day summary (from Gameweek 2 --
    // Gameweek 1 has the Your Team page), then the preview.
    if(S.mw>0&&!S._summaryShown){S._summaryShown=true;return renderMatchdaySummary(step)}
    S._summaryShown=false;
    if(b==="live")return renderQuickPreview();
  }
  if(b==="match")return renderMatch(next);
  if(b==="round")return renderRoundup();
  if(b==="live")return renderLiveWeek();
  if(b==="luck")return renderLuck();
  if(b==="crisis")return renderSpec(crisisSpec(),ROLE.id==="owner"?"THE BANK HAS CALLED":"THE OWNER HAS CALLED",next);
  if(b==="heatmap")return renderHeatmap();
  if(b==="stats")return renderStats();
  if(b==="knock")return renderSpec(knockSpec(),"THE PHYSIO ROOM",next);
  if(b==="window"){S.janBudget=null;return renderWindow("freshen",next)}
  if(b==="bank")return renderSpec(bankSpec(),"THE BANK HAS CALLED",next);
  if(b==="physio")return renderPhysio();
  if(b==="presser")return renderSpec(presserSpec(),"FRIDAY · PRESS CONFERENCE",next);
  if(b==="papers")return renderPapers();
  if(b==="podcast")return renderPodcast();
  if(b==="call")return renderSpec(callSpec(),"TUESDAY NIGHT",next);
  return renderSpec(drawEvent(),"THIS WEEK",next);
}
/* The late-night call, rewritten. It used to be "answer the phone or don't",
   which is not a decision. Each of these has a named person wanting a
   specific thing you can give or refuse. */
const CALLS={
owner:[
 ()=>{const r=pick(RIVALS).n;return{title:`Half eleven, and it is the ${r} chairman`,
   lede:`"Your goalkeeper. Sixty thousand, tomorrow morning, and I will not tell anyone it was cheap."`,
   body:`<p>You are ${ord(posOf(CLUB))} and he is above you. Sixty thousand is roughly a fortnight of wages, and your goalkeeper is the only reason some of these scorelines are respectable.</p>`,
   choices:[
     {t:"Take the sixty",d:"A fortnight of breathing room",fx:{cash:60,squad:-7,fans:-9},
       out:`Done at midnight, to a club above you, for the price of two weeks' wages. You will hear about this one.`},
     {t:"Tell him a hundred and twenty",d:"He might just pay it",fx:{},
       delayed:rng()<.45?{cash:120,squad:-7,fans:-9}:{board:2},
       delayedText:rng()<.45?"He paid the hundred and twenty. Your goalkeeper left on Thursday and the money is in.":"He never called back. You still have your goalkeeper.",
       out:`"Double it and we will talk in the morning." A long pause, then a laugh, then nothing.`},
     {t:"Hang up",d:"Not at any price, not to them",fx:{fans:7,board:-3},
       out:`You put the phone down mid-sentence. It is enormously satisfying and solves nothing.`}]}},
 ()=>({title:"Half eleven, and it is the finance director",
   lede:`"I have run Friday's payroll three times. It does not clear unless something changes tomorrow."`,
   body:`<p>He is sixty-three, he has worked here for nineteen years, and this is the first time you have heard him sound frightened.</p>`,
   choices:[
     {t:"Authorise the overdraft extension tonight",d:"Solved, and expensive",fx:{cash:90,debt:130,board:-4},
       out:`Signed by email at midnight at a rate you would not accept in daylight.`},
     {t:"Tell him to delay the non-playing staff",d:"The people with least leverage",fx:{cash:40,fans:-8,board:-3},
       delayed:{fans:-9},delayedText:"The story that the tea ladies were paid late while the squad was paid on time has done more damage than any result.",
       out:`He goes very quiet and says, "Right. I will tell them." It is the worst moment of your week.`},
     {t:"Ask him what he would do",d:"He has been here longer than you",fx:{board:8,cash:35,squad:2},
       out:`He has a plan. He has had a plan for a fortnight and nobody has asked him for it.`}]}),
 ()=>({title:"Half eleven, and it is a journalist",
   lede:`"I am running a piece on the club's finances tomorrow. I wanted to give you the chance to comment."`,
   body:`<p>He has the accounts, he has two sources inside the building, and he is being considerably more courteous than he needs to be.</p>`,
   choices:[
     {t:"Give him twenty minutes on the record",d:"Shape it, or be shaped by it",fx:{fans:9,board:-5},
       delayed:{fans:6},delayedText:"The piece ran, and it was fair. Being the person who picked up the phone turned out to matter.",
       out:`You talk him through it properly. He writes a better article than he was going to.`},
     {t:"No comment",d:"Safe, and it reads as guilt",fx:{board:2,fans:-7},
       out:`"No comment." He thanks you sincerely, which somehow makes it worse.`},
     {t:"Threaten his accreditation",d:"A very bad idea at midnight",fx:{fans:-13,board:-6},
       delayed:{fans:-8},delayedText:"The threat became a paragraph in the piece, and then a story in its own right.",
       out:`You say something you will regret before breakfast.`}]})],
manager:[
 ()=>{const p=pick(alive()).nm;return{title:`Half eleven, and it is ${p}`,
   lede:`"Gaffer. I am not in a good way. I do not want to play Saturday."`,
   body:`<p>He is not injured. He has not said what it is. He has never rung you at night before.</p>`,
   choices:[
     {t:"Tell him to take as long as he needs",d:"The right call, and it costs you on Saturday",
       fx:{squad:9,fans:-2},delayed:{squad:5},
       delayedText:`${p} came back two weeks later and has been the best player at the club since. He has not forgotten who answered the phone.`,
       out:`"Do not think about Saturday. Come in Monday, or do not. We will sort it."`},
     {t:"Ask him to travel and decide there",d:"Half a commitment",fx:{squad:2},
       out:`He agrees, flatly. You are not sure you have helped.`},
     {t:"Tell him the team needs him",d:"True, and it is not what this call is about",
       fx:{squad:-9,board:3},delayed:{squad:-6},
       delayedText:`${p} played, was substituted at half time, and has not been the same since. You know exactly why.`,
       out:`He says "Yeah. Okay, gaffer." and hangs up first.`}]}},
 ()=>({title:"Half eleven, and it is the owner",
   lede:`"I have been looking at the table. Talk me out of making a change."`,
   body:`<p>He has had a drink. He does this. It has never before come with the word 'change'.</p>`,
   choices:[
     {t:"Fight your corner with the numbers",d:"Make the case",fx:{board:9,squad:-2},
       out:`You take him through expected goals, injuries and the fixture list. He listens, grudgingly, and rings off calmer.`},
     {t:"Tell him to do what he likes",d:"Call the bluff",fx:{board:-7,squad:6,fans:4},
       delayed:{board:7},delayedText:"He respected the refusal to grovel more than he would have respected the grovelling.",
       out:`"That is your decision to make, not mine to argue with." The silence lasts eight seconds.`},
     {t:"Promise him a result on Saturday",d:"A promise you cannot keep",fx:{board:6,squad:-4},
       delayed:{board:-12},delayedText:"The result did not come, and the promise was remembered word for word.",
       out:`You hear yourself guaranteeing three points and cannot think of a way to stop.`}]})],
player:[
 ()=>({title:"Half eleven, and it is your agent",
   lede:`"I can get you out in January. But I need you to be unhappy in public for about three weeks."`,
   body:`<div class="shark"><div><b>FixtureShark</b>Players who agitate publicly move roughly <b>${rnd(55,70)}%</b> of the time,
     at an average fee <b>${rnd(12,25)}% below</b> their model valuation. The club loses money; the player usually gets the move.</div></div>`,
   choices:[
     {t:"Do exactly what he says",d:"Likely move, smaller fee, ruined relationship",
       fx:{interest:16,fans:-16,squad:-8},delayed:{fans:-8},
       delayedText:"Three weeks of visible sulking worked. It also means there is a section of that ground that will boo you for the rest of your career.",
       out:`You start with body language and work up to a cryptic post. It is transparent and it is effective.`},
     {t:"Tell him to get you out without the theatre",d:"Harder, cleaner",fx:{interest:6,fans:3},
       out:`"Do your job properly." He sighs the sigh of a man who will now have to do some work.`},
     {t:"Sack him",d:"At half past eleven, on the phone",fx:{interest:-9,fans:8,form:4},
       delayed:{interest:7},delayedText:"Your new agent is less famous and considerably better. Three clubs have made proper enquiries.",
       out:`It is abrupt and it is the first decision in months that has felt like yours.`}]}),
 ()=>({title:"Half eleven, and it is your father",
   lede:`"I have read what they are saying about you. Do you want me to stop reading it?"`,
   body:`<p>He has been to every match since you were eight. He does not usually ring after a game.</p>`,
   choices:[
     {t:"Talk it through with him properly",d:"An hour on the phone",fx:{form:6,fitness:2},
       out:`You talk until half past midnight about nothing much. You sleep better than you have in a fortnight.`},
     {t:"Tell him you are fine",d:"You are not fine",fx:{form:-3},
       delayed:{form:-4},delayedText:"You have not rung him back. It has been sitting there for a fortnight.",
       out:`"I am fine, Dad." He knows. He lets it go anyway.`},
     {t:"Ask him to stop coming for a bit",d:"Protect him from it",fx:{form:-2,fans:2},
       out:`He says of course, and you can hear precisely how much it costs him to say it.`}]})]
};
/* THE PHYSIO ROOM. Role-specific, because availability is a different
   problem depending on which chair you sit in. */
function physioSpec(){
  const out=S.squadList.filter(p=>!p.gone&&p.out);
  const fragile=available().filter(p=>p.fit<70).sort((a,b)=>a.fit-b.fit);
  const body=`<div class="shark"><div><b>The Physio Room</b>
      ${out.length?`<b>${out.length}</b> unavailable: ${out.map(p=>`${p.nm} (${p.out}w)`).join(", ")}. `:"Nobody is ruled out. "}
      ${fragile.length?`<b>${fragile.length}</b> below 70% condition and carrying real risk: ${fragile.slice(0,3).map(p=>p.nm).join(", ")}.`
        :"The squad is in decent order."}
      Squad fatigue is <b>${S.fatigue}%</b>.</div></div>${squadHTML()}`;
  if(ROLE.id==="owner")return{title:"The Physio Room is a cupboard with a bench in it",
    lede:"Your physio is part-time and shares a car park with the ice machine that has not worked since March.",
    body,
    choices:[
      {t:"Fund it properly",d:`${fmtMoney(70)} — full-time physio, working ice bath`,
        fx:{cash:-70,condition:12,board:3},delayed:{condition:8},
        delayedText:"The upgraded medical setup is showing. Two players who would have missed a month did not.",
        after(){S.physioLevel++},out:`A full-time physio, a functioning ice bath, and a room that no longer smells of the ice machine.`},
      {t:"Split the cost with the rugby club",d:`${fmtMoney(28)}, shared facility`,
        fx:{cash:-28,condition:6},out:`Two clubs, one physio, a fixture list that occasionally collides.`},
      {t:"Leave it",d:"The bench is fine",fx:{},delayed:{condition:-7},
        delayedText:"Three soft-tissue injuries in a fortnight. The part-time physio saw every one of them coming.",
        out:`It has lasted this long.`}]};
  if(ROLE.id==="player")return{title:"You are in the Physio Room more than the gym",
    lede:`Your own condition is ${Math.round(S.fitness)}%, and the table in there is always occupied.`,
    body,
    choices:[
      {t:"Pay for your own specialist",d:"Out of your wages, and it works",fx:{fitness:16,form:3,fans:-1},
        out:`Two sessions a week in a private clinic, paid for out of your own pocket. Nobody at the club asks how.`},
      {t:"Do the club programme properly",d:"Free, slower, fine",fx:{fitness:9},out:`Every exercise, every day, for once.`},
      {t:"Ignore it and play",d:"You feel alright",fx:{form:3,fitness:-6},
        delayed:{fitness:-14,form:-6},delayedText:"The thing you ignored has become the thing you cannot ignore.",
        out:`You feel alright. You have felt alright before.`}]};
  return{title:"The Physio Room, Thursday morning",
    lede:out.length?`${out.length} ruled out and a team to pick from what is left.`:"Everyone is available, which will not last.",
    body,
    choices:[
      {t:"Rest everyone under 70%",d:"Availability later, weaker on Saturday",
        fx:{squad:-4,condition:15,fatigue:-12},out:`Bikes and pool work for half the squad. Saturday will be thin.`},
      {t:"Strap them up and play them",d:"Strongest side now, more breakages later",
        fx:{squad:4,condition:-6,fatigue:5},delayed:{condition:-10},
        delayedText:"Playing the walking wounded has cost you. Two of them are now genuinely unavailable.",
        out:`Everyone who can walk, plays.`},
      {t:"Ask the owner to fund the treatment properly",d:"Not your budget, and it is the actual fix",
        fx:{board:-3,condition:9},after(){S.physioLevel++},
        out:`He grumbles, and he signs it off, and the ice bath works by Tuesday.`}]};
}
function renderPhysio(){
  renderSpec(Object.assign(physioSpec(),{keepFull:true}),"THURSDAY · THE PHYSIO ROOM",next);
}
/* "WHY?" -- detail folded away until asked for (ten-minute season, 2026-09-21).
   A native <details>, so it works with keyboards and screen readers with no
   extra code. The reading budget counts only what is VISIBLE: text behind a
   closed "Why?" isn't read unless someone chooses to. */
function why(inner,summary,open){
  return `<details class="why"${open?" open":""}><summary>${summary||"Why?"}</summary><div class="whybody">${inner}</div></details>`;
}
function renderHeatmap(){
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">PRE-SEASON · FIXTURE HEAT MAP</div>
    <h1>Your next five fixtures</h1>
    <p class="lede">Green is good for you. <b>H</b> means at home, where sides score about 19% more.</p>
    ${fixtureHeatHTML(S.mw,5)}
    ${why(`<div class="tip" style="border-left-color:#7cb9e8;background:var(--panel2)"><b>Home advantage is real, and measurable</b>
      FixtureShark's real model finds that home sides score about <b>19% more goals</b> (a home-advantage parameter of 0.175
      in its latest fit). This game uses the same number. Over your season it is worth about
      <b>${homeValue().toFixed(1)} points</b>.
      <a href="${SITE}/football/model-accuracy" style="color:var(--pitch2)">How the real model performs</a></div>
    <h2 style="margin-top:10px">Team Strength</h2>
    <p class="small">Attack and defence in expected goals. Results come from this; the table is what it looks like afterwards.</p>
    ${strengthTableHTML()}`,"Why? Home advantage and Team Strength")}
    <button class="choice primary" id="nx" style="margin-top:12px"><span class="t">Get on with it</span></button></div>`;
  document.getElementById('nx').onclick=next;
}
/* ===========================================================================
   THE SEASON DASHBOARD: one consistent view, the same everywhere it appears.
   Position (and where the model projects you), points against the Shark's
   pace, attack (xGF per game) and defence (xGA per game) -- the same
   ratings as Team Strength -- each with a sparkline of the season so far
   and an arrow against the last gameweek. Green means better for you:
   for defence and position that means LOWER numbers.
   =========================================================================== */
function kpiRecord(){
  if(!S.kpi)S.kpi=[];
  const r=ratingsNow(0)[CLUB],t=TABLE[CLUB];
  S.kpi.push({gw:S.mw,pos:t.p?posOf(CLUB):null,proj:projectedPlace(CLUB),projPts:expectedFinal()[CLUB],pts:t.pts,par:sharkPts()*S.mw/MW,xgf:r.xgf,xga:r.xga});
}
function spark(vals,lowerIsBetter){
  const v=vals.filter(x=>x!=null&&isFinite(x)),W=84,H=22;
  if(v.length<2)return `<svg width="${W}" height="${H}"></svg>`;
  const lo=Math.min(...v),hi=Math.max(...v),span=(hi-lo)||1;
  const pts=v.map((x,i)=>[2+i/(v.length-1)*(W-4),lowerIsBetter?2+(x-lo)/span*(H-4):H-2-(x-lo)/span*(H-4)]);
  const good=lowerIsBetter?v[v.length-1]<=v[0]:v[v.length-1]>=v[0],col=good?"#34d399":"#dc5a4f",[lx,ly]=pts[pts.length-1];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block"><polyline fill="none" stroke="${col}" stroke-width="1.7" stroke-linejoin="round" points="${pts.map(p=>p.map(n=>n.toFixed(1)).join(",")).join(" ")}"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.2" fill="${col}"/></svg>`;
}
function kpiHTML(){
  if(!S.kpi||!S.kpi.length)return "";
  const k=S.kpi,cur=k[k.length-1],prev=k.length>1?k[k.length-2]:k[0],base=k[0];
  const arrow=(d,lowerIsBetter,fmt)=>{if(Math.abs(d)<.005)return `<span style="color:var(--mute)">—</span>`;
    const good=lowerIsBetter?d<0:d>0;return `<span style="color:${good?'var(--good)':'var(--bad)'}">${d>0?'▲':'▼'} ${fmt(Math.abs(d))}</span>`};
  const t=TABLE[CLUB],n=Math.max(1,t.p),gap=cur.pts-cur.par;
  const tile=(label,big,sub,svg)=>`<div class="kpi"><div class="kl">${label}</div><div class="kb">${big}</div><div class="ks">${sub}</div>${svg}</div>`;
  return `<div class="kpis">
    ${tile("League position",cur.pos?ord(cur.pos):"—",`projected ${ord(cur.proj)} · ${cur.projPts.toFixed(1)} pts ${arrow(cur.projPts-prev.projPts,false,v=>v.toFixed(1))}`,spark(k.map(x=>x.projPts),false))}
    ${tile("Points v the Shark",`${cur.pts} pts`,`<span style="color:${gap>0?'var(--good)':gap<0?'var(--bad)':'var(--mute)'}">${gap>=0?'+':''}${gap.toFixed(1)} v target pace</span>`,spark(k.map(x=>x.pts-x.par),false))}
    ${tile("Attack · xGF/game",cur.xgf.toFixed(2),`${arrow(cur.xgf-prev.xgf,false,v=>v.toFixed(2))} · actual ${t.p?(t.gf/n).toFixed(1):"—"}`,spark(k.map(x=>x.xgf),false))}
    ${tile("Defence · xGA/game",cur.xga.toFixed(2),`${arrow(cur.xga-prev.xga,true,v=>v.toFixed(2))} · actual ${t.p?(t.ga/n).toFixed(1):"—"} · CS ${CLEAN[CLUB]||0}`,spark(k.map(x=>x.xga),true))}
  </div>`;
}
/* One line after each week's results: the full four-tile dashboard now
   appears only on the key screens (pre-season, halfway, the ending), rather
   than after all ten gameweeks -- it had become the biggest repetition. */
function kpiLineHTML(){
  if(!S.kpi||!S.kpi.length)return "";
  const cur=S.kpi[S.kpi.length-1],gap=cur.pts-cur.par;
  return `<div class="outcome" style="margin-top:10px">Points v the Shark: <b>${cur.pts}</b>
    <span style="color:${gap>0?'var(--good)':gap<0?'var(--bad)':'var(--mute)'}">(${gap>=0?'+':''}${gap.toFixed(1)} v target pace)</span>
    · projected <b>${ord(cur.proj)}</b></div>`;
}
function nextWinChance(){
  if(!S||S.mw>=MW)return null;
  const[h,a]=myFixture(S.mw),home=h===CLUB,opp=home?a:h;
  return{opp,home,...matchProbs(opp,home)};
}
function renderLuck(){
  const L=drawLuck();
  if(!L){cursor++;return step()}
  const fx=L.apply()||"";
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">${L.good===1?"A STROKE OF LUCK":L.good===0?"ROUGH LUCK":"ELSEWHERE IN THE LEAGUE"}</div>
    <h1>${L.title}</h1><p class="lede">${L.lede}</p>
    <div class="outcome">${L.text}</div><div class="delta">${fx}</div>
    <button class="choice primary" id="nx" style="margin-top:11px"><span class="t">Continue</span></button></div>`;
  document.getElementById('nx').onclick=next;
}
function renderStats(){
  paintHeader();
  const log=S.seasonLog,gf=log.reduce((a,x)=>a+x.gf,0),ga=log.reduce((a,x)=>a+x.ga,0),cs=log.reduce((a,x)=>a+x.cs,0);
  const maxg=Math.max(2,...log.map(x=>Math.max(x.gf,x.ga)));
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">GAMEWEEK ${S.mw} · THE NUMBERS</div>
    <h1>Where the season actually is</h1>
    ${kpiHTML()}
    <p class="lede">${gf} scored, ${ga} conceded, ${cs} clean ${cs===1?"sheet":"sheets"} in ${log.length}.</p>
    <div style="display:flex;gap:3px;align-items:flex-end;height:64px;margin:10px 0 4px">
      ${log.map(x=>`<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:2px" title="GW${x.mw}: ${x.gf}-${x.ga}">
        <div style="height:${(x.gf/maxg)*28}px;background:var(--good);border-radius:2px 2px 0 0;min-height:2px"></div>
        <div style="height:${(x.ga/maxg)*28}px;background:var(--bad);border-radius:0 0 2px 2px;min-height:2px"></div></div>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--mute);margin-bottom:12px">
      <span style="color:var(--good)">■</span> scored · <span style="color:var(--bad)">■</span> conceded, by gameweek</div>
    ${why(`<h2>Team Strength now</h2>${strengthTableHTML()}<h2 style="margin-top:14px">The last five</h2>${fixtureHeatHTML(5,5)}`,"Team Strength and the last five fixtures")}
    <button class="choice primary" id="nx" style="margin-top:12px"><span class="t">Continue</span></button></div>`;
  document.getElementById('nx').onclick=next;
}
function callSpec(){
  const pool=CALLS[ROLE.id]||CALLS.owner;
  return pick(pool)();
}
function renderPapers(){
  const{paper,h,shark}=papersSpec();paintHeader();
  document.getElementById('app').innerHTML=`<div class="card"><div class="datechip">SUNDAY MORNING</div>
    <div class="paper" style="margin-top:8px"><div class="masthead"><span>${paper}</span><span>60p</span></div>
      <div class="hl">${h[0]}</div><p class="standfirst">${h[1]}</p><div class="byline">${shark}</div></div>
    <div class="beat">· · ·</div>
    <p class="small">${CLUB}: ${ord(S.pos)} of six, ${MW-S.mw} to play.</p>
    <button class="choice primary" id="nx"><span class="t">Read on</span></button></div>`;
  document.getElementById('nx').onclick=next;
}
function renderPodcast(){
  const{lines,shark}=podcastSpec();paintHeader();
  document.getElementById('app').innerHTML=`<div class="card"><div class="datechip">WEDNESDAY · SOMEONE SENDS YOU A CLIP</div>
    <div class="pod" style="margin-top:8px"><div class="show">${PODCAST} — EPISODE 214</div>
      ${lines.map(([w,s])=>`<div class="quote"><div class="who">${w}</div><div class="said">“${s}”</div></div>`).join('')}
      <div class="quote"><div class="who">—</div><div class="said" style="font-style:normal;color:var(--ink2);font-size:13px">${shark}</div></div></div>

    <button class="choice primary" id="nx"><span class="t">Continue</span></button></div>`;
  document.getElementById('nx').onclick=next;
}
function tighten(html){
  if(!html)return html;
  html=html.replace(/<!--SQ-->[\s\S]*?<!--\/SQ-->/g,"");
  return html.replace(/<p([^>]*)>([\s\S]*?)<\/p>/g,(m,attrs,inner)=>{
    const first=inner.split(/(?<=[.!?])\s+(?=[A-Z"“])/)[0];
    return `<p${attrs}>${first}</p>`;
  });
}
/* Beginners: each option's description as a short phrase (the first clause,
   at most ~9 words); the full text sits under "More about these options".
   Decision screens were the heaviest reading in a Beginner's season. */
function briefChoice(d){
  const t=String(d||"").replace(/<[^>]+>/g,"").trim();
  const first=t.split(/ · |[.;:!?]\s| — /)[0].trim().replace(/[.,;:]$/,"");
  const w=first.split(/\s+/);
  return w.length>9?w.slice(0,9).join(" ")+"…":first;
}
function renderSpec(spec,chip,after){
  const beginner=LEVEL==="beginner";
  if(!spec.keepFull||beginner)spec=Object.assign({},spec,{body:tighten(spec.body)});
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">${chip}</div><h1>${spec.title}</h1>
    ${spec.lede?`<p class="lede">${spec.lede}</p>`:''}
    ${pendingReveal?`<div class="outcome" style="border-left-color:var(--amber)">${pendingReveal}</div>`:''}
    ${spec.body||''}<div id="ch"></div></div>`;
  const box=document.getElementById('ch');
  spec.choices.forEach(c=>{
    const b=document.createElement('button');b.className='choice';
    b.innerHTML=`<span class="t">${c.t}</span>${c.d?`<span class="d">${beginner?briefChoice(c.d):c.d}</span>`:''}`;
    b.onclick=()=>{
      if(c.ask){pendingReveal=c.reveal();return renderSpec(spec,chip,after)}
      pendingReveal=null;if(c.after)c.after();
      const wBefore=nextWinChance();
      const d=c.fx?apply(c.fx,true):'';
      if(c.delayed)later(2,c.delayed,c.delayedText);
      /* Attack and defence numbers moved, but did it matter? Say so in the
         one number anybody understands: the chance of winning next time. */
      recalcSquadRating();
      const wAfter=nextWinChance();
      /* What the decision did, in the site's own measures: goals you should
         score (xGF), chance of a clean sheet, and chance of winning. */
      const ch=wBefore&&wAfter&&(Math.abs(wAfter.xgf-wBefore.xgf)>=.05||Math.abs(wAfter.cs-wBefore.cs)>=.01||wAfter.w!==wBefore.w);
      const arrow=(a,b,f)=>`${f(a)} → <b style="color:${b>a?'var(--good)':b<a?'var(--bad)':'inherit'}">${f(b)}</b>`;
      // Simple by default: attack and defence as tags, and the one number
      // anybody understands -- the chance of winning. The Data guru also
      // gets the site's measures (xGF, clean sheet chance).
      const dirTag=(label,d,goodWhenUp)=>Math.abs(d)<.02?"":`<span class="tag ${(d>0)===goodWhenUp?'up':'down'}">${label} ${d>0?'\u25b2':'\u25bc'}</span>`;
      const winLine=ch&&LEVELS[LEVEL].guru?`<div class="later" style="border-left-color:var(--amber)"><b>Next match, ${wAfter.home?"at home to":"away at"} ${wAfter.opp}</b>
           <div style="margin-top:4px">${dirTag("Attack",wAfter.xgf-wBefore.xgf,true)}${dirTag("Defence",wAfter.cs-wBefore.cs,true)}
           <span class="tag ${wAfter.w>wBefore.w?'up':wAfter.w<wBefore.w?'down':''}">Win chance ${arrow(wBefore.w,wAfter.w,v=>v+"%")}</span></div>
           ${LEVELS[LEVEL].guru?`<div class="small" style="margin-top:4px">xGF ${arrow(wBefore.xgf,wAfter.xgf,v=>v.toFixed(2))} · clean sheet ${arrow(wBefore.cs,wAfter.cs,v=>Math.round(v*100)+"%")}</div>`:""}</div>`:"";
      recalcSquadRating();paintHeader();
      const outTxt=c.out&&c.out.length>120?c.out.split(/(?<=[.!?])\s+(?=[A-Z"“])/)[0]:c.out;
      document.getElementById('app').innerHTML=`<div class="card"><div class="datechip">${chip}</div>
        <h2>${spec.title}</h2>${outTxt?`<div class="outcome">${outTxt}</div>`:''}${d?`<div class="delta">${d}</div>`:''}${winLine}
        <button class="choice primary" id="nx" style="margin-top:11px"><span class="t">Continue</span></button></div>`;
      document.getElementById('nx').onclick=after;
    };box.appendChild(b);
  });
  // The full descriptions, one tap away, for anyone who wants them.
  if(beginner&&spec.choices.some(c=>c.d&&briefChoice(c.d)!==String(c.d).replace(/<[^>]+>/g,"").trim())){
    const more=document.createElement('div');
    more.innerHTML=why(spec.choices.filter(c=>c.d).map(c=>`<p class="small"><b>${c.t}</b> — ${c.d}</p>`).join(''),"More about these options");
    box.appendChild(more);
  }
}
/* THE SPORTS CENTRE. Your match finishes first; the table is shown AS IT
   STANDS, with everyone else still to play; then their results come in one
   at a time and the table re-sorts under you. This is the Saturday-teatime
   feeling, and it only works because the other clubs are really playing. */
function tableRowsHTML(prevPos){
  const st=standings(TABLE),N=st.length;
  return `<table class="tbl"><thead><tr><th class="n">#</th><th>Club</th><th class="n">P</th><th class="n">GD</th><th class="n">Pts</th><th></th></tr></thead><tbody>
  ${st.map((r,i)=>{const was=prevPos?prevPos[r.n]:i+1,mv=was-(i+1);
    return `<tr class="${r.n===CLUB?'me':''} ${i>=N-2?'rel':''}" style="${mv?'background:color-mix(in srgb,var(--amber) 10%,transparent)':''}">
      <td class="n">${i+1}</td><td>${r.n}${youTag(r.n)}</td><td class="n">${r.p}</td><td class="n">${r.gd>0?'+':''}${r.gd}</td><td class="n">${r.pts}</td>
      <td style="font-family:var(--mono);font-size:11px;color:${mv>0?'var(--good)':mv<0?'var(--bad)':'var(--mute)'};width:26px">
        ${mv>0?'▲'+mv:mv<0?'▼'+Math.abs(mv):''}</td></tr>`}).join('')}</tbody></table>`;
}
/* The favourite usually wins. Usually. Saying so out loud, against what
   actually happened, is the whole educational point of the Monte Carlo. */
function probabilityLesson(){
  const P0=S.proj0||PREDICT;
  const fav=RIVALS.slice().sort((a,b)=>P0[b.n].title-P0[a.n].title)[0];
  const odds=P0[fav.n].title;
  const champ=standings(TABLE)[0].n;
  const held=champ===fav.n;
  const cOdds=P0[champ]?P0[champ].title:0;
  return `<div class="shark" style="margin-top:12px"><div><b>How often the favourite wins</b>
    ${fav.n} were given a <b>${odds}%</b> chance of the title.
    ${held?`They won it. That is the usual outcome, and it is still not a certainty — replay this season and roughly one time in ${Math.max(2,Math.round(100/(100-odds)))} they do not.`
      :`<b>${champ}</b> won it instead, from ${cOdds}% odds. That happens roughly one season in ${Math.max(2,Math.round(100/Math.max(1,100-odds)))} — a ${odds}% favourite is not a sure thing.`}
    </div></div>`;
}
/* The end of a season is the best moment to send a player into the real
   site: they have just watched the model predict, simulate and be beaten
   (or not). Each link says which part of the game it is the real version of.
   Absolute URLs -- see SITE in config.js. */
/* The season's two lessons, measured on what actually happened: how many
   goals came from set pieces, and what out-of-position players scored --
   priced in FPL points, because that is where the idea pays off for real. */
function homeAwayLine(){
  const L=S.seasonLog,pts=x=>x.gf>x.ga?3:x.gf===x.ga?1:0;
  const H=L.filter(x=>x.home),A=L.filter(x=>!x.home);if(!H.length||!A.length)return "";
  const rec=a=>`W${a.filter(x=>x.gf>x.ga).length} D${a.filter(x=>x.gf===x.ga).length} L${a.filter(x=>x.gf<x.ga).length}`;
  const hp=H.reduce((a,x)=>a+pts(x),0),ap=A.reduce((a,x)=>a+pts(x),0);
  return `<div style="margin-top:4px"><b>Home</b> ${rec(H)} — ${hp} points. <b>Away</b> ${rec(A)} — ${ap} points.
    The model valued home advantage at about ${homeValue().toFixed(1)} points to a club like yours this season.</div>`;
}
function seasonLessons(){
  const tot=S.seasonLog.reduce((a,x)=>a+x.gf,0);
  const sp=alive().reduce((a,p)=>a+(p.spGoals||0),0);
  const FPL={DF:6,MF:5,FW:4};
  const adv=alive().filter(p=>(p.goalsAdv||0)>0);
  const lines=[];
  if(tot)lines.push(`<b>${sp}</b> of your <b>${tot}</b> goals came from set pieces (${Math.round(sp/tot*100)}%).`);
  for(const p of adv){
    const pts=p.goalsAdv*FPL[p.pos];
    lines.push(`<b>${p.nm}</b>, a registered ${p.pos==="DF"?"defender":"midfielder"}, scored <b>${p.goalsAdv}</b>
      playing further forward (▲). In FPL those are worth ${FPL[p.pos]} each — <b>${pts} points</b> — because he keeps his
      registered position's scoring wherever he plays.`);
  }
  const ha=homeAwayLine();
  if(!lines.length&&!ha)return "";
  return `<div class="tip" style="margin-top:12px"><b>Home and away, out of position and set pieces</b>${ha}${lines.map(l=>`<div style="margin-top:4px">${l}</div>`).join('')}
    <div style="margin-top:6px">See who is doing it for real on <a href="${SITE}/fpl/line-ups">Starting Lineups</a>.</div></div>`;
}
function realThingLinks(){
  const L=[
    ["/team-strength","Team Strength","the attack and defence ratings you just played against, for every real club"],
    ["/fpl/line-ups","Starting Lineups","the XI the model expects real clubs to field this week"],
    ["/football/model-accuracy","Model Accuracy","how often the Shark's real predictions come true"],
    ["/fantasy","Fixture Heat Map","the heat map, with real fixtures"]];
  return `<div class="shark" style="margin-top:12px"><div><b>The real thing</b>
    The Shark in this game is FixtureShark's actual model. See it on real football:
    <ul style="margin:6px 0 0;padding-left:18px">${L.map(([u,t,d])=>
      `<li style="margin-bottom:3px"><a href="${SITE}${u}" style="color:var(--pitch2)">${t}</a> — ${d}</li>`).join('')}</ul></div></div>`;
}
/* --- ending --------------------------------------------------------------- */
function endingDetailHTML(){
  return `${S._bonusLines&&S._bonusLines.length?`<div class="shark"><div><b>Bonuses settled</b>
      ${S._bonusLines.join("<br>")}<br><b>Total: ${fmtMoney(S._bonusOwed)}</b></div></div>`:''}
    ${probabilityLesson()}
    ${seasonLessons()}`;
}
function renderEnding(){
  while(S.mw<MW){const wk=S.mw,[h,a]=myFixture(wk),home=h===CLUB;
    const[hg,ag]=playFixture(h,a,true);
    award(TABLE,h,a,hg,ag);playOthers(wk);resolveMine(hg,ag,home);S.mw++}
  const st=standings(TABLE);myPos();
  const rel=S.pos>=st.length-1;
  /* Bonuses are paid on what actually happened, not on the promise. */
  let owed=0;const lines=[];
  (S.bonuses||[]).forEach(b=>{
    const p=S.squadList.find(x=>x.nm===b.nm);
    if(b.type==="goals"){const g=Math.max(0,((p&&p.goals)||0)-b.from),c=g*b.rate;owed+=c;
      lines.push(`${b.nm}: ${g} ${g===1?"goal":"goals"} × ${fmtMoney(b.rate)} = ${fmtMoney(c)}`)}
    else if(b.type==="finish"){const c=S.pos<=3?b.amt:0;owed+=c;
      lines.push(`${b.nm}: top-three bonus ${S.pos<=3?"triggered":"not triggered"} = ${fmtMoney(c)}`)}
    else if(b.type==="apps"){const n=Math.max(0,MW-b.from),c=n*b.rate;owed+=c;
      lines.push(`${b.nm}: ${n} appearances × ${fmtMoney(b.rate)} = ${fmtMoney(c)}`)}
  });
  if(owed&&!S.bonusesSettled){S.cash-=owed;S.bonusesSettled=true}
  S._bonusLines=lines;S._bonusOwed=owed;
  const{total,red}=scoreParts();
  const pred=PREDICT[CLUB],predPos=Math.round(pred.avg),pts=TABLE[CLUB].pts,beat=Math.round((pts-pred.pts)*10)/10;
  // One aim: win the league.
  const target=sharkPos(),place=S.pos;
  let v,b;
  if(!S.alive){v="ADMINISTRATION";b="The club went under."}
  else if(place===1){v="CHAMPIONS";b=`The Shark predicted ${ord(target)}.`}
  else{v=ord(place).toUpperCase();b=rel?"Relegated.":`The Shark predicted ${ord(target)}.`}
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">FINAL DAY · ${ROLE.name.toUpperCase()}</div>
    <div class="verdict ${place===1&&S.alive?'ok':'fail'}">${v}</div><p class="lede">${b}</p>
    <div style="margin:8px 0">${tableHTML()}</div>
    ${realThingLinks()}
    ${why(endingDetailHTML(),"The season in detail")}
    <button class="choice primary" id="again" style="margin-top:11px"><span class="t">Same season, different decisions</span><span class="d">Identical seed — beat your own score</span></button>
    <button class="choice" id="role"><span class="t">Same season, different role</span><span class="d">The same club from another chair</span></button>
    <button class="choice" id="rand"><span class="t">A new season</span><span class="d">New seed</span></button>
    <div class="seed">seed ${SEED} · ${ROLE.id}</div></div>`;
  document.getElementById('again').onclick=()=>boot();
  document.getElementById('role').onclick=chooseRole;
  document.getElementById('rand').onclick=()=>{SEED="SOC-S"+String(rnd(2,99)).padStart(2,'0');chooseRole()};
}
/* --- start ---------------------------------------------------------------- */
function chooseRole(){
  S=null;LEVEL="beginner"; // Intermediate and Advanced: coming soon
  configureLevel(LEVEL);
  /* Build the fixture list and run the model now, so the opening screen can
     state the real prediction instead of asserting a league position that
     nothing has yet produced. */
  pickRivals();
  R.s=hashSeed(SEED+"|preview");
  buildFixtures();TABLE=blankTable();
  document.getElementById('hScore').innerHTML=`—<span class="sub">POSITION</span>`;
  document.getElementById('hTwo').innerHTML="";document.getElementById('hTrend').textContent="";
  document.getElementById('hSeason').innerHTML="";
  const sel='border-color:var(--amber);background:color-mix(in srgb,var(--amber) 14%,transparent)';
  document.getElementById('app').innerHTML=`<div class="card hero">
    <div class="hero-kicker">BEAT THE SHARK</div>
    <div class="mission">Your mission:<br>Win the league!</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:16px 0 8px">
      ${Object.entries(LEVELS).map(([k,v])=>k==="beginner"
        ?`<button class="choice" data-level="${k}" aria-pressed="true" style="margin:0;padding:9px 6px;text-align:center;${sel}"><span class="t" style="font-size:13.5px">${v.name}</span></button>`
        :`<div class="choice" aria-disabled="true" style="margin:0;padding:9px 6px;text-align:center;opacity:.5"><span class="t" style="font-size:13.5px">${v.name}</span><span class="d" style="font-size:11px">Coming soon</span></div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:stretch">
      ${["manager","owner"].map(k=>ROLES[k]).map(r=>`<button class="choice primary" data-r="${r.id}" style="margin:0;height:100%">
        <span class="t">${r.name}</span><span class="d">${r.tag}</span></button>`).join('')}
    </div></div>`;
  document.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{LEVEL=b.dataset.level;chooseRole()});
  document.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{ROLE=ROLES[b.dataset.r];boot()});
}
/* THE OPENING SEQUENCE (Chris): the league, all on zero; your team's key
   numbers; then straight into the opening match against the weakest club. */
function renderLeagueIntro(){
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card hero">
    <div class="hero-kicker">THE LEAGUE</div>
    <div class="mission">Six clubs. Ten games.<br>One title.</div>
    <div class="datechip" style="margin:12px 0 4px">PREDICTED FINISH</div>
    <table class="tbl" style="text-align:left"><tbody>
      ${[CLUB].concat(RIVALS.map(r=>r.n)).sort((a,b)=>PREDICT[a].avg-PREDICT[b].avg)
        .map((n,i)=>`<tr class="${n===CLUB?'me':''}"><td class="n">${i+1}</td><td>${n}${youTag(n)}</td></tr>`).join('')}
    </tbody></table>
    <button class="choice primary" id="go"><span class="t">Begin</span></button></div>`;
  document.getElementById('go').onclick=renderTeamIntro;
}
/* Rank of Your Team among all six clubs on a measure (1 = best). */
function clubRank(valueOf,higherIsBetter){
  const clubs=[CLUB].concat(RIVALS.map(r=>r.n));
  const v=clubs.map(n=>({n,v:valueOf(n)})).sort((a,b)=>higherIsBetter?b.v-a.v:a.v-b.v);
  return v.findIndex(x=>x.n===CLUB)+1;
}
/* Before every game: where you stand, and the side you're sending out. */
function renderMatchdaySummary(then){
  const R=ratingsNow(S.mw),mine=R[CLUB],health=Math.round(xiStats().fit);
  const[h,a]=myFixture(S.mw),opp=h===CLUB?a:h;
  const small=(label,big,sub)=>`<div class="kpi"><div class="kl">${label}</div><div class="kb">${big}</div><div class="ks">${sub}</div></div>`;
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card hero">
    <div class="hero-kicker">MATCHDAY ${S.mw+1} OF ${MW}</div>
    <div class="bigstats">
      <div><div class="bigstat">${ord(S.pos)}</div><div class="biglabel">Position</div></div>
      <div><div class="bigstat${S.cash<0?' neg':''}">${fmtMoney(S.cash)}</div><div class="biglabel">In the bank</div></div>
    </div>
    <div class="kpis" style="text-align:left">
      ${small("Team health",`${health}%`,health>=85?"fit and ready":health>=70?"a few knocks":"struggling")}
      ${small("Expected goals",mine.xgf.toFixed(1),"a game")}
      ${small("Clean sheets",`${Math.round(Math.exp(-mine.xga)*100)}%`,"of games")}
      ${small("Next",opp,venueNote(h===CLUB).toLowerCase()||"next up")}
    </div>
    <button class="choice primary" id="go"><span class="t">Team news: ${opp}</span></button></div>`;
  document.getElementById('go').onclick=then;
}
/* A week with no pre-match decision: them v you, then kick off. */
function renderQuickPreview(){
  const[h,a]=myFixture(S.mw),home=h===CLUB,opp=home?a:h;
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card">
    <div class="datechip">${kickoffChip(S.mw)}</div>
    <h1>${venueTitle(opp,home)}</h1>
    ${oppCompareHTML(opp)}
    <button class="choice primary" id="kick" style="margin-top:8px"><span class="t">Kick off</span></button></div>`;
  document.getElementById('kick').onclick=()=>renderMatch(next,true);
}
function renderTeamIntro(){
  const R=ratingsNow(0),mine=R[CLUB],cs=n=>Math.exp(-R[n].xga);
  const quality=n=>n===CLUB?S.squad:RIVALS.find(r=>r.n===n).str;
  const health=Math.round(xiStats().fit);
  const[h,a]=myFixture(0),opp=h===CLUB?a:h;
  const small=(label,big,sub)=>`<div class="kpi"><div class="kl">${label}</div><div class="kb">${big}</div><div class="ks">${sub}</div></div>`;
  paintHeader();
  document.getElementById('app').innerHTML=`<div class="card hero">
    <div class="hero-kicker">YOUR TEAM</div>
    <div class="bigstats">
      <div><div class="bigstat">${ord(sharkPos())}</div><div class="biglabel">Expected finish</div></div>
      <div><div class="bigstat${S.cash<0?' neg':''}">${fmtMoney(S.cash)}</div><div class="biglabel">In the bank</div></div>
    </div>
    <div class="kpis" style="text-align:left">
      ${small("Goals for",ord(clubRank(n=>R[n].xgf,true)),`${mine.xgf.toFixed(1)} a game`)}
      ${small("Clean sheets",ord(clubRank(cs,true)),`${Math.round(cs(CLUB)*100)}% of games`)}
      ${small("Team health",`${health}%`,health>=85?"fit and ready":health>=70?"a few knocks":"struggling")}
      ${small("Squad quality",ord(clubRank(quality,true)),"of six")}
    </div>
    <button class="choice primary" id="go"><span class="t">First match: ${opp}</span><span class="d">${venueNote(h===CLUB)||"Opening day"}</span></button></div>`;
  document.getElementById('go').onclick=()=>{cursor=0;step()};
}
function boot(){
  pickRivals();
  R.s=hashSeed(SEED+"|"+ROLE.id);RECENT=new Set();RECENT_Q=[];
  S=newState();cursor=0;pendingReveal=null;
  configureLevel(LEVEL);
  PLAN.splice(0,PLAN.length,...planFor(LEVEL,ROLE.id));
  // The squad's strength must be worked out BEFORE the Shark predicts: the
  // other way round, the prediction used the wrong squad and said 1st.
  buildFixtures();TABLE=blankTable();recalcSquadRating();PREDICT=monteCarlo();
  myPos();
  S.proj0=projectionNow();S.kpi=[];kpiRecord();
  paintHeader();
  renderLeagueIntro();
}
document.getElementById('foot').innerHTML="FixtureShark · Beat the Shark · fictional clubs, players, papers and pundits";
chooseRole();
