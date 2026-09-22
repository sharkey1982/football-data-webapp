/* games/beat-the-shark/test/screens.cjs
   Run: node games/beat-the-shark/test/screens.cjs

   Drive the real screens end to end with a minimal DOM: elements persist by
   id, appendChild accumulates, and timers run immediately, so a whole match
   plays through to the 3pm results. */
const fs=require('fs'),vm=require('vm'),path=require('path');
process.chdir(path.join(__dirname,'..'));
const html=fs.readFileSync('index.html','utf8');
const srcs=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]);
const els={};
function mk(id){const e={id,_h:"",children:[],onclick:null,style:{},dataset:{},className:"",classList:{add(){}},
  set innerHTML(v){this._h=v;this.children=[]},get innerHTML(){return this._h+this.children.map(c=>c.innerHTML).join("")},
  appendChild(c){this.children.push(c)},querySelectorAll(){return[]},querySelector(){return null},setAttribute(){}};return e}
const doc={getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,createElement:()=>mk("")};
const q=[];const ctx=vm.createContext({document:doc,setTimeout:f=>q.push(f),clearTimeout:()=>{},Math,JSON,Object,Array,String,Number,Date,Map,Set,console,location:{hash:"",pathname:"/"}});
const drain=()=>{let n=0;while(q.length&&n++<5000)q.shift()()};
for(const s of srcs)new vm.Script(fs.readFileSync(s,'utf8'),{filename:s}).runInContext(ctx);
const run=c=>vm.runInContext(c,ctx);
const app=()=>els.app.innerHTML;
const bad=h=>/undefined|NaN|\[object/.test(h);
let fails=0;const ok=(name,cond,info)=>{console.log(`${cond?"PASS":"FAIL"}  ${name}${info?"  ("+info+")":""}`);if(!cond)fails++};

run(`LEVEL="intermediate";SEED="SCR";ROLE=ROLES.manager;pickRivals();S=newState();buildFixtures();TABLE=blankTable();PREDICT=monteCarlo(300);recalcSquadRating();cursor=0;`);
// 1. quick match -> 3pm kick-offs
run(`renderMatch(()=>{globalThis.__done=1},true)`);
const vp=app();
ok("vidiprinter: Your Team on the LEFT", /<div class="teams">\s*<span>YOUR TEAM/.test(vp));
drain();
// A week with no pre-match decision gets one simple half-time choice: a sub.
if(/is tiring/.test((els.htBox&&els.htBox.innerHTML)||"")){
  ok("a quick week with no pre-match decision offers the half-time dilemma: keep him on, or bring someone on", /Keep .+ on/.test(els.htBox.innerHTML)&&/Bring on /.test(els.htBox.innerHTML));
  els.subYes.onclick();els.htGo.onclick();drain();
}
// After the whistle: three calm screens, no timers (Chris's playtest).
ok("full time WAITS for the player -- no automatic jump to the results", /See the league table/.test(els.paceBox.innerHTML)&&q.length===0);
els.toTable.onclick();
const el=app();
ok("then the league table, as it stands", /THE TABLE/.test(el)&&/AS IT STANDS/.test(el));
ok("result line puts Your Team first", /<b>Your Team<\/b> \d+–\d+/.test(el));
ok("Your Team tagged YOU in the table", /class="you">YOU/.test(el));
ok("the gameweek is not over until the other results are in", run("S.mw")===0, "S.mw="+run("S.mw"));
els.toOthers.onclick();
ok("then the 3pm kick-offs, live: a clock, a scoreboard per game, your position as it stands", /THE 3PM KICK-OFFS/.test(app())&&/id="clock"/.test(app())&&/As it stands: \d/.test(app()));
drain();
// (the live screen updates its parts in place: read them directly)
const el2=app()+els.lend.innerHTML;
ok("...and at full time: the clock shows FT, real scores, the table now, and it waits for Continue",
  els.clock.textContent==="FT"&&/Full time\./.test(els.flash.textContent)&&/\d–\d/.test(els.boards.innerHTML)&&/THE TABLE NOW/.test(els.lend.innerHTML)&&/>Continue</.test(els.lend.innerHTML)&&q.length===0);
ok("gameweek advanced after all results", run("S.mw")===1, "S.mw="+run("S.mw"));
ok("no broken text on match screens", !bad(vp)&&!bad(el)&&!bad(el2));
// 2. full match: team sheet first, then kick off (a normal week: Gameweek 3 --
// Gameweek 2 has the keep-or-sub dilemma instead of the tactical call)
run(`S.mw=2;S._sheetShown=false;renderMatch(()=>{},false)`);
const sheet=app();
ok("full match opens on the team sheet (billed as the 12:30 kick-off)", /12:30 KICK-OFF/.test(sheet)&&/class="pitch2"/.test(sheet));
ok("team sheet names the opponent's formation", /They are lining up <b>\d-\d-\d<\/b>/.test(sheet));
els.kick.onclick();drain();
ok("manager's match pauses at half time for the tactical call", /HALF TIME/.test(els.htBox.innerHTML)&&!!(els.goSecond&&els.goSecond.onclick));
els.goSecond.onclick();drain();
ok("full match plays through to full time after half time, then waits", /See the league table/.test(els.paceBox.innerHTML));
// 3. heat map in site language
const hm=run("fixtureHeatHTML(2,5)");
ok("heat map: GW, H/A codes, and no MW", /GW\d/.test(hm)&&/[A-Z]{3} - [HA]/.test(hm)&&!/MW/.test(hm));
ok("heat map shows goals for (xGF) and clean sheet chance as separate rows", /Goals for/.test(hm)&&/xGF/.test(hm)&&/Clean sheet/.test(hm)&&/\d+%/.test(hm));
ok("heat map shows 1X2 odds underneath", /1X2/.test(hm));
ok("heat map uses the site's legend wording", /Most goals expected/.test(hm)&&/Highest clean sheet chance/.test(hm));
ok("heat map has a plain-English summary", /Most goals expected: GW\d+/.test(hm));
// 4. luck
let luckBad=0;for(let i=0;i<60;i++){run("renderLuck()");if(bad(app())||!/A STROKE OF LUCK|ROUGH LUCK|ELSEWHERE IN THE LEAGUE/.test(app()))luckBad++}
ok("luck screens render cleanly (60 draws)", luckBad===0, luckBad+" bad");
// 5. manager's January window, on a budget
run(`S.cash=400;S.janBudget=160;renderWindow("january",()=>{})`);
ok("manager's window states the owner's budget", /The owner has given you <b>£160k<\/b>/.test(app()));
// 6. keepers
run(`S=newState();recalcSquadRating();S.squadList.filter(p=>p.pos==="GK").forEach(p=>p.out=2);`);
const d0=run("(()=>{const x=xiStats();return x.def})()");
run(`S=newState();recalcSquadRating();`);const d1=run("xiStats().def");
ok("no keeper = heavy defensive penalty", d1-d0>=10, `defence lean ${d1} with a keeper, ${d0} without`);
// 8. the pitch mirrors the site, and the team sheet teaches
run(`S=newState();TABLE=blankTable();recalcSquadRating();S.formation="4-4-2";S.pendingOppFm=null;S.manualXI=null;S._sheetShown=false;renderTeamSheet(()=>{})`);
let ts=app();
ok("pitch shows 11 role-placed markers with position letters", (ts.match(/class="pm/g)||[]).length===11&&/<span class="dot [a-z]*">[GDMF]<\/span>/.test(ts));
ok("pitch uses the site's role names", /\bLCB\b/.test(ts)&&/\bCF\b/.test(ts));
ok("pitch shows set-piece duties in the site's format", /P1 FK1 C1/.test(ts));
ok("pitch legend matches the site", /Advanced role \(▲\)/.test(ts)&&/Deeper role \(▼\)/.test(ts));
ok("team sheet plans rest with the next three fixtures", /Rest and rotation/.test(ts)&&/THIS WEEK/.test(ts));
ok("team sheet explains set pieces", /quarter of goals/.test(ts));
// put a defender into midfield and the out-of-position lesson appears
run(`(()=>{const xi=currentXI().map(s=>({...s}));const k=xi.findIndex(s=>s.slot==="MF");
  const d=S.squadList.findIndex((p,i)=>p.pos==="DF"&&!xi.some(s=>s.i===i));xi[k].i=d;S.manualXI=xi;S.manualFm=S.formation;
  S.pendingOppFm=null;S._sheetShown=false;renderTeamSheet(()=>{})})()`);
ts=app();
ok("a defender in midfield gets the green ▲ ring", /class="dot advanced">D</.test(ts));
ok("…and the lesson explains it, with the FPL angle and a link", /Out of position — and why it can be smart/.test(ts)&&/6 for a goal and 4 for a clean sheet/.test(ts)&&/fpl\/line-ups/.test(ts));
// 9. the season's lessons are reported at the end
run(`S.seasonLog=[{gf:10}];S.squadList.find(p=>p.pos==="DF").goalsAdv=2;S.squadList.find(p=>p.pos==="MF").spGoals=3;`);
const sl=run("seasonLessons()");
ok("end of season reports set-piece share and out-of-position goals in FPL points", /3<\/b> of your <b>10<\/b> goals came from set pieces/.test(sl)&&/12 points/.test(sl));
// 7. a decision says what it did to the next result
run(`S=newState();TABLE=blankTable();recalcSquadRating();renderSpec({title:"T",lede:"L",choices:[{t:"Big morale boost",d:"",fx:{squad:30},out:"Done."}]},"TEST",()=>{})`);
els.ch.children[0].onclick();
// Consequences: CASH ONLY (Chris: fans and board were pointless; cash and
// league position are what matter). No next-match line below Advanced.
delete els.ch; // a fresh choice area: the harness keeps old buttons between tests
run(`LEVEL="intermediate";S=newState();TABLE=blankTable();recalcSquadRating();renderSpec({title:"T",lede:"L",choices:[{t:"Spend and lift them",d:"",fx:{cash:-40,squad:30,fans:5,board:-4},out:"Done."}]},"TEST",()=>{})`);
els.ch.children[0].onclick();
ok("a decision shows only its cash effect -- no team, fans or board tags", /class="tag down">Cash −£\d+k/.test(app())&&!/>Team |>Fans |>Board /.test(app()), (app().match(/<div class="delta">[\s\S]*?<\/div>/)||["no delta"])[0]);
ok("...and no next-match line below Advanced", !/Next match/.test(app())&&!/Win chance/.test(app()));
// ...and the Data guru still gets the site's measures.
delete els.ch;
run(`LEVEL="guru";S=newState();TABLE=blankTable();recalcSquadRating();renderSpec({title:"T",lede:"L",choices:[{t:"Big morale boost",d:"",fx:{squad:30},out:"Done."}]},"TEST",()=>{})`); // Advanced
els.ch.children[0].onclick();
ok("the Data guru still sees xGF, clean sheet and win chance", /xGF [\s\S]+?→[\s\S]+?clean sheet [\s\S]+?→/.test(app())&&/Morale \+/.test(app()));
run(`LEVEL="intermediate"`);
// 10. the cash crisis: two players, the model's numbers, and the heat map
run(`ROLE=ROLES.owner;S=newState();TABLE=blankTable();recalcSquadRating();S.mw=3;renderSpec(crisisSpec(),"THE BANK HAS CALLED",()=>{})`);
const cr=app();
ok("cash crisis offers a striker or a defender", /Sell .+\(\d+, FW\)/.test(cr)&&/Sell .+\(\d+, DF\)/.test(cr));
ok("cash crisis shows xGF and clean sheets for each option", /Keep both/.test(cr)&&/xGF/.test(cr)&&/Clean sheets/.test(cr));
ok("cash crisis puts the heat map beside the decision", /Goals for/.test(cr)&&/Clean sheet/.test(cr));
// 11. the owner's header shows cash; the score is in points
run(`paintHeader()`);
// (this once "passed" by matching the CSS class "pts", not visible text)
ok("the header shows cash, big", /Cash/.test(els.hTwo.innerHTML)&&/class="v cashv/.test(els.hTwo.innerHTML));
// 12. the team sheet shows this match's numbers live
run(`ROLE=ROLES.manager;S=newState();TABLE=blankTable();recalcSquadRating();S.mw=0;S.pendingOppFm=null;S._sheetShown=false;renderTeamSheet(()=>{})`);
ok("team sheet shows this match's xGF, clean sheet and win chance", /This match, as the model sees it/.test(app()));
// 13. the ending speaks in points
run(`S.mw=MW;TABLE[CLUB].pts=20;renderEnding()`);
ok("the ending: CHAMPIONS or your position, the Shark's prediction, and the table -- no score", /CHAMPIONS|\d(ST|ND|RD|TH)/.test(app())&&/FixtureShark predicted \d/.test(app())&&/class="tbl"/.test(app())&&!/\/100/.test(app()));
// 14. home advantage, made visible (the ten-game level: Beginner is neutral)
run(`configureLevel("intermediate");buildFixtures();LEVEL="intermediate";ROLE=ROLES.manager;S=newState();TABLE=blankTable();recalcSquadRating();S.mw=0;S.pendingOppFm=null;S._sheetShown=false;renderTeamSheet(()=>{})`);
ok("team sheet shows the same game the other way round", /Home advantage/.test(app())&&/The same game (away|at home) would be\s+\d+% to win/.test(app()));
run(`configureLevel("intermediate");buildFixtures()`); // home and away: the ten-game level
run(`renderHeatmap()`);
ok("pre-season explains home advantage from the real model", /19% more goals/.test(app())&&/0\.175/.test(app())&&/points/.test(app()));
ok("heat map compares expected points home and away", /Home games:<\/b> [\d.]+ expected points each/.test(run("fixtureHeatHTML(0,10)")));
run(`S.seasonLog=[{gf:2,ga:0,home:true},{gf:0,ga:1,home:false},{gf:1,ga:1,home:false}];`);
ok("end of season reports home and away records", /<b>Home<\/b> W1 D0 L0 — 3 points/.test(run("seasonLessons()")));
// 15. one consistent view: dashboard, table, labelled players
run(`ROLE=ROLES.manager;S=newState();TABLE=blankTable();recalcSquadRating();S.mw=0;S.kpi=[];kpiRecord();S.mw=1;TABLE[CLUB].p=1;TABLE[CLUB].pts=3;kpiRecord();`);
const kp=run("kpiHTML()");
ok("dashboard shows position, points v FixtureShark, attack xGF and defence xGA", /League position/.test(kp)&&/Points v FixtureShark/.test(kp)&&/Attack · xGF\/game/.test(kp)&&/Defence · xGA\/game/.test(kp));
ok("dashboard draws a sparkline for each of the four", (kp.match(/<polyline/g)||[]).length===4);
const st=run("strengthTableHTML()");
ok("Team Strength shows xPts and projected points, ordered by them", /<th class="n">xPts<\/th>/.test(st)&&/<th class="n">Proj<\/th>/.test(st));
const sq=run("squadHTML({})");
ok("players show quality (Q) and condition (%) explicitly, with a legend", /<b>Q\d+<\/b> · <span[^>]*>\d+%<\/span>/.test(sq)&&/quality · <b>%<\/b> condition/.test(sq));
run(`paintHeader()`);
ok("the header shows league position and cash, and nothing else", /POSITION/.test(els.hScore.innerHTML)&&/Cash/.test(els.hTwo.innerHTML)&&!/Shark|SCORE|pts/.test((els.hScore.innerHTML+els.hTwo.innerHTML).replace(/<[^>]+>/g," "))); // visible text only (the cash box's CSS class is "pts")
ok("the manager can see the club's cash (money now has football consequences)", run("ROLE.id")!=="manager"||/Cash/.test(els.hTwo.innerHTML));
// 16. levels: progressive disclosure for beginners, everything for the rest
const sheetAt=(lvl,played)=>{run(`LEVEL="${lvl}";ROLE=ROLES.manager;S=newState();TABLE=blankTable();recalcSquadRating();configureLevel("${lvl}");buildFixtures();S.mw=${played};S.fullMatches=${played};S.pendingOppFm=null;S._sheetShown=false;renderTeamSheet(()=>{})`);return app()};
// Beginners: ONE either/or per match, each with a win chance (Chris: cut
// the cognitive load, keep similar items).
const bc=h=>(h.match(/data-bc="/g)||[]).length;
const kinds=[];
for(let n=0;n<5;n++){
  const h=sheetAt("beginner",n);
  kinds.push(run(`beginnerDecision(...(()=>{const[hT,aT]=myFixture(S.mw);return[hT===CLUB?aT:hT,hT===CLUB]})()).kind`));
  // two options for the first three games; from Gameweek 4, a selection call (2) THEN three shapes
  // ONE 1X2 line under the title; the options stay simple (Chris: don't bombard them)
  // GW1-3 two options; GW4 three shapes; GW5 (the boss) selection then three shapes
  ok(`beginner match ${n+1}: ${n<3?'two options':n===3?'three shapes':'selection then three shapes'}, one 1X2 line under the title, simple options`,
    bc(h)===(n<3?2:n===3?3:5)&&(h.match(/The model: win \d+% · draw \d+% · lose \d+%/g)||[]).length===1&&!/Win \d+% · Draw/.test(h)&&!/Clean sheet \d+%/.test(h)&&!/data-fm=/.test(h)&&!/data-xi=/.test(h)&&!/data-sp=/.test(h), `${bc(h)} options, kind ${kinds[n]}`);
  if(kinds[n]==="formation")ok(`beginner match ${n+1}: the shape choice reads the opponent (their attack and defence)`, /(attack)[\s\S]*(defence)/.test(h)&&/Go for it/.test(h)&&/Stay compact/.test(h));
}
ok("the Beginner order: shape, shape, selection, three shapes, three shapes -- no set pieces",
  kinds.join()==="formation,formation,selection,formation3,formation3", kinds.join(" → "));
// choosing the second option actually changes the side
sheetAt("beginner",0);
const fmBefore=run("S.formation");
run(`document.querySelectorAll=()=>[]`); // the harness can't click; apply the option directly, as the button does
run(`(()=>{const[hT,aT]=myFixture(S.mw);const d=beginnerDecision(hT===CLUB?aT:hT,hT===CLUB);d.options[1].set();globalThis.__alt=d.options[1].title})()`);
ok("picking the other shape really changes the formation", run("S.formation")===String(run("__alt")).match(/\(([^)]+)\)/)[1]&&run("S.formation")!==fmBefore);
ok("intermediate has every lever from the first match, no 'new' banner", (()=>{const h=sheetAt("intermediate",0);return /data-xi=/.test(h)&&/data-sp=/.test(h)&&!/New this match/.test(h)})());
ok("data guru has every lever but not the long explanations", (()=>{const h=sheetAt("guru",0);return /data-sp=/.test(h)&&!/quarter of goals/.test(h)})());
// a beginner cannot play someone out of position before it unlocks
sheetAt("beginner",1);ok("beginner: out of position locked in match 2, open from match 4", run(`can("oop")`)===false&&(sheetAt("beginner",3),run(`can("oop")`)===true));
ok("the opening screen offers the three levels, plainly named", (()=>{run("chooseRole()");const h=app();return /data-level="beginner"/.test(h)&&/>Beginner</.test(h)&&/>Intermediate</.test(h)&&/>Advanced</.test(h)&&!/Data guru/.test(h)})());
run(`LEVEL="intermediate"`);
// 17. PACING (Chris's playtest: "too fast to follow")
run(`LEVEL="beginner";SPEED=null`);
ok("every level starts on normal speed (Chris: fine, with the skip option)", run(`speedName()`)==="normal");
run(`LEVEL="intermediate";SPEED=null`);
ok("other levels start on normal: over 2s a line (was 0.8s)", run(`speedName()`)==="normal"&&run(`PACE.commentaryMs*speedFactor()`)>=2000);
run(`SPEED="fast"`);
ok("the player's speed choice overrides the level default", run(`speedName()`)==="fast");
run(`SPEED=null;LEVEL="beginner";ROLE=ROLES.manager;boot();S.mw=0;S.pendingOppFm=null;S._sheetShown=true;renderMatch(()=>{},false)`); // past the team sheet, into the commentary
ok("live commentary shows speed controls and Skip to full time", /data-speed="slow"/.test(app())&&/Skip to full time/.test(app()));
// 17b. Beginners: an easy story decision before the data-heavy ones
run(`LEVEL="beginner";ROLE=ROLES.manager;boot()`);
ok("the manager's season opens with the first match (after the league and your-team pages)", run(`PLAN[0]`)==="match");
run(`LEVEL="intermediate";ROLE=ROLES.owner;boot()`);
ok("the owner keeps the original order (the summer window first)", run(`PLAN[0]`)==="special1");
run(`ROLE=ROLES.manager`);
// 18. READING BUDGET -- a ratchet. Measured 2026-09-21: a beginner's season
// is ~4,900 words (~19 min of reading) for a game billed as "a season in
// five minutes". These caps stop any screen, or the season, growing from
// here; lower them as screens are trimmed toward the chosen target.
// VISIBLE text only: a closed "Why?" shows just its one-line label, and
// nobody reads what's folded inside unless they choose to open it.
const visible=h=>h.replace(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>[\s\S]*?<\/details>/g,' $1 ');
const text=h=>visible(h).replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/g,' ').replace(/\s+/g,' ').trim();
const words=h=>text(h).split(' ').filter(w=>/[A-Za-z0-9]/.test(w)).length;
// Reading TIME, the honest measure: prose at 250 words a minute, plus ~6s
// per table or pitch (glanced at, not read word by word). Folded "Why?"
// text isn't counted -- it's only read if opened.
const visuals=h=>(visible(h).match(/<table|<!--SQ-->/g)||[]).length;
const prose=h=>visible(h).replace(/<!--SQ-->[\s\S]*?<!--\/SQ-->/g,' ').replace(/<table[\s\S]*?<\/table>/g,' ')
  .replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(w=>/[A-Za-z]/.test(w)).length;
const readSecs=h=>prose(h)/250*60+visuals(h)*6;
// RATCHETED DOWN 2026-09-21 after the ten-minute work: largest screen
// ~575 -> 258 words; pre-season 360 -> 56; a beginner's 4th team sheet 457
// -> 274; season reading time ~22 -> ~15 min. Target: ~7 min of reading (+
// ~3 min of commentary) for a ten-minute season. Lower these as it gets there.
// screen/team sheet +25 (2026-09-21): the them-v-you table on the team
// sheet, requested by Chris -- a small table, glanced at.
const BUDGET={screen:230,beginnerTeamSheet:225,opening:40,preseason:55,minutes:12}; // now counting choice text too (it was missed before)
run(`LEVEL="beginner";SPEED=null;chooseRole()`);
ok(`reading budget: opening screen <= ${BUDGET.opening} words`, words(app())<=BUDGET.opening, `${words(app())} words`);
run(`ROLE=ROLES.manager;boot()`);
ok(`reading budget: pre-season <= ${BUDGET.preseason} words`, words(app())<=BUDGET.preseason, `${words(app())} words`);
run(`S.fullMatches=3;S.mw=0;S.pendingOppFm=null;S._sheetShown=false;renderTeamSheet(()=>{})`);
ok(`reading budget: a beginner's team sheet <= ${BUDGET.beginnerTeamSheet} words`, words(app())<=BUDGET.beginnerTeamSheet, `${words(app())} words`);
{
  const plan=run('PLAN');let total=0,worst=0,worstAt='',secs=0;
  for(let i=0;i<plan.length;i++){
    delete els.ch; // a fresh choice area per screen, as a real browser creates
    try{run(`cursor=${i};S.mw=Math.min(MW-1,${Math.floor(i/3)});S.pendingOppFm=null;S._sheetShown=false;step()`)}catch(e){continue}
    const settle=()=>{for(let k=0;k<400&&q.length;k++){try{q.shift()()}catch(e){}}};
    // Include the choice buttons: decision screens add them to #ch, a separate
    // element the harness doesn't fold into the page's HTML.
    // (Only when THIS screen has a choice area: the harness keeps old
    // elements between screens, so stale buttons would otherwise count.)
    const count=()=>{const a=app(),h=a+(/id="ch"/.test(a)&&els.ch?els.ch.children.map(c=>c.innerHTML||'').join(' '):''),w=words(h);total+=w;secs+=readSecs(h);if(w>worst){worst=w;worstAt=plan[i]}};
    settle();count();
    // A match is several screens now: follow it through and count each one
    // (a full match's commentary page once, after the second half).
    const full=plan[i]==='match';
    for(const btn of ['kick','goSecond','toTable','toOthers']){
      const b=els[btn];if(!b||typeof b.onclick!=='function')continue;
      try{b.onclick();settle();if(!(full&&btn==='kick'))count()}catch(e){}
      els[btn]=undefined;
    }
  }
  ok(`reading budget: no screen over ${BUDGET.screen} words`, worst<=BUDGET.screen, `largest ${worst} (${worstAt})`);
  ok(`reading budget: a beginner's season takes <= ${BUDGET.minutes} minutes to read`, secs/60<=BUDGET.minutes, `~${(secs/60).toFixed(1)} min (prose at 250 wpm + ~6s per table or pitch), before commentary playback`);
}
run(`LEVEL="intermediate";SPEED=null`);
// 19. money with football consequences, shown plainly
run(`LEVEL="beginner";ROLE=ROLES.manager;boot();S.cash=-50;const before=alive().length;globalThis.__before=before;
  renderElsewhere({wk:0,final:false},()=>{})`);
drain(); // the 3pm kick-offs run live; money is settled at full time
ok("in the red at the end of a gameweek, the bank forces a sale -- and the results screen says so", /The bank forced a sale/.test(els.lend.innerHTML)&&run("alive().length")===run("__before")-1);
run(`boot();S.cash=-400;S.deducted=false;const p0=TABLE[CLUB].pts;globalThis.__p0=p0;renderElsewhere({wk:0,final:false},()=>{})`);
drain();
ok("deep in the red: a 3-point deduction, once", /Points deduction: −3/.test(els.lend.innerHTML)&&run("S.deducted")===true);
run(`LEVEL="intermediate"`);
// 20. THE NEW OPENING SEQUENCE (Chris): mission; the league on zero; your
// team's key numbers; the opening match v the weakest club with them-v-you.
run(`SEED="SOC-S07";LEVEL="beginner";chooseRole()`);
ok("opening: 'Your mission: Win the league!', and Manager / Owner side by side", /Your mission:<br>Win the league!/.test(app())&&/grid-template-columns:1fr 1fr/.test(app())&&/data-r="manager"/.test(app()));
ok("the Owner is greyed out for now: shown, 'Coming soon', not selectable", /The Owner/.test(app())&&!/data-r="owner"/.test(app())&&(app().match(/Coming soon/g)||[]).length===3);
run(`ROLE=ROLES.manager;boot()`);
ok("then the league, every club on zero, and Begin", /THE LEAGUE/.test(app())&&/class="tbl"/.test(app())&&!/<td class="n">[1-9]\d*<\/td><\/tr>/.test(app())&&/>Begin</.test(app()));
els.go.onclick();
const ti=app();
ok("then your team: expected finish and bank balance, big", new RegExp(`<div class="bigstat">${run("ord(sharkPos())")}</div>`).test(ti)&&ti.includes(run("fmtMoney(S.cash)"))&&/Expected finish/.test(ti)&&/In the bank/.test(ti));
ok("...and, smaller, goals-for and clean-sheet ranks, team health and squad quality", /Goals for/.test(ti)&&/Clean sheets/.test(ti)&&/Team health/.test(ti)&&/Squad quality/.test(ti));
const weakest=run("RIVALS.slice().sort((a,b)=>a.str-b.str)[0].n");
ok("...and the first match is against the weakest club", ti.includes(`First match: ${weakest}`));
els.go.onclick();
ok("then pre-season: how it went, and the first PAY DAY announced -- cash before and after",
  /Pre-season is done/.test(app())&&/PAY DAY/.test(app())&&/Cash £\d+k → <b>£\d+k/.test(app())&&/First match:/.test(app()));
els.go.onclick();
ok("the first match shows their stats against yours, then the shape question", /<th class="n">You<\/th>/.test(app())&&app().includes(weakest)&&/Goals for \(a game\)/.test(app())&&/Go for it|Pick your shape|One place/.test(app()));
// 21. Chris's page-by-page feedback (2026-09-21)
run(`SEED="SOC-S07";LEVEL="beginner";ROLE=ROLES.manager;boot()`);
ok("page 2: the league as predicted finishing positions, Your Team where the Shark puts it",
  /PREDICTED FINISH/.test(app())&&(app().match(/<tr class="me"><td class="n">(\d)<\/td>/)||[])[1]===String(run("sharkPos()")));
els.go.onclick();els.go.onclick();els.go.onclick(); // your team, pre-season, then the first match
const p4=app();
ok("page 4: Kick off sits right under the choice, the pitch below it, and no bench",
  p4.indexOf('id="kick"')<p4.indexOf('<!--SQ-->')&&p4.indexOf('data-bc=')<p4.indexOf('id="kick"')&&!/class="benchh"/.test(p4));
delete els.htBox;delete els.toTable; // fresh: the harness keeps elements between tests (a stale box once faked a pass here)
els.kick.onclick();drain();
ok("Gameweek 1 has NO half-time decision: straight through to full time", !(els.htBox&&els.htBox.innerHTML)&&!!(els.toTable&&els.toTable.onclick));
els.toTable.onclick();
ok("page 6: the position at the top updates once your result is in", /\d(st|nd|rd|th)<span class="sub">POSITION/.test(els.hScore.innerHTML));
els.toOthers.onclick();drain();
ok("page 7: a plain headline at full time -- never 'No change for you'", !/No change for you/.test(els.asit.textContent)&&/^(Up to |Down to )?\d(st|nd|rd|th)\.$/.test(els.asit.textContent), els.asit.textContent);
ok("the agreed Beginner season: five games, a story between each, the window and the bank before Gameweek 4",
  run("PLAN.join()")==="match,presser,match,knock,match,sponsor,match,window,bank,match,end"&&run("MW")===5&&run("FIXTURES.length")===5, run("PLAN.join()"));
ok("Gameweek 2 is an even game now; the strongest club is saved for last -- the final boss",
  (()=>{const st=run("RIVALS.slice().sort((a,b)=>b.str-a.str)[0].n");const f=w=>{const[h,a]=run(`myFixture(${w})`);return h===CLUB?a:h};const CLUB="Your Team";return f(1)!==st&&f(4)===st})());
run(`S.mw=1`);els.htBox=undefined;run(`subHalfTime(()=>{})`);
ok("page 8: ...with a half-time decision about a player change", /is tiring/.test(els.htBox.innerHTML)&&/Keep .+ on/.test(els.htBox.innerHTML)&&/Bring on /.test(els.htBox.innerHTML));
// 22. MATCH DAY (Chris, 2026-09-21)
{ // a fresh season on every visit: load the engine twice, compare the starting seeds
  const src=fs.readFileSync('engine.js','utf8');
  const seedOf=()=>{const c=vm.createContext({Math,document:doc,setTimeout:()=>{},console,JSON,Object,Array,String,Number,Date,Map,Set,location:{hash:"",pathname:"/"}});
    for(const f of srcs.slice(0,srcs.indexOf('engine.js')+1))new vm.Script(fs.readFileSync(f,'utf8')).runInContext(c);return vm.runInContext('SEED',c)};
  const a=seedOf(),b=seedOf();
  ok("a fresh season on every visit (no fixed seed replaying the same 6-0)", a!==b&&/^SOC-/.test(a)&&!/SOC-S01/.test(src), `${a} / ${b}`);
}
// Gameweek 2, the hard game: summary -> team sheet -> the half-time dilemma
function toGW2HalfTime(seed){ // (now Gameweek 3: the health game carries the keep-or-sub dilemma)
  delete els.htBox;
  run(`SEED="${seed}";LEVEL="beginner";ROLE=ROLES.manager;boot();S.mw=2;cursor=PLAN.indexOf("match",PLAN.indexOf("match",PLAN.indexOf("match")+1)+1);S._summaryShown=false;S._sheetShown=false;step()`);
  const summary=app();
  els.go.onclick();
  const sheet=app();
  els.kick.onclick();drain();
  return{summary,sheet,ht:(els.htBox&&els.htBox.innerHTML)||""};
}
const g2=toGW2HalfTime("MD-1");
ok("before every game: a match-day summary -- position, cash, team health, expected goals, clean sheets",
  /MATCHDAY 3 OF 5/.test(g2.summary)&&/Position/.test(g2.summary)&&/In the bank/.test(g2.summary)&&/Team health/.test(g2.summary)&&/Expected goals/.test(g2.summary)&&/Clean sheets/.test(g2.summary));
const strongest=run("RIVALS.slice().sort((a,b)=>b.str-a.str)[0].n");
ok("then the Gameweek 3 preview: them v you against an even side, with the selection call on health", !g2.sheet.includes(strongest)&&/<th class="n">You<\/th>/.test(g2.sheet)&&/One place in the side/.test(g2.sheet));
ok("at half time: the dilemma, with health and goal-threat bars for this half and next game",
  /is tiring/.test(g2.ht)&&/GOAL THREAT, 2ND HALF/.test(g2.ht)&&/GOAL THREAT, NEXT GAME/.test(g2.ht)&&/% health/.test(g2.ht)&&/Injured for the next game/.test(g2.ht));
const xg=[...g2.ht.matchAll(/(\d+\.\d) xG/g)].map(m=>+m[1]); // keep: now, next; sub: now, next
// STRICT: a tie means the preview isn't seeing the substitution (it once didn't).
ok("the trade-off is real: keeping him gives MORE threat now and LESS next game", xg.length===4&&xg[0]>xg[2]&&xg[1]<xg[3], xg.join(" / "));
const star=(g2.ht.match(/<h2>(.+?) is tiring<\/h2>/)||[])[1];
els.subNo.onclick();els.htGo.onclick();drain(); // keep him on
ok("keep him on: he breaks down, out for the next game", run(`S.squadList.find(p=>p.nm===${JSON.stringify(star)}).out`)===1&&!run(`currentXI().some(x=>S.squadList[x.i].nm===${JSON.stringify(star)})`));
const g2b=toGW2HalfTime("MD-1");
els.subYes.onclick();els.htGo.onclick();drain(); // bring the fresher man on
ok("bring on the fresher man: the star is fit for the next game", run(`S.squadList.find(p=>p.nm===${JSON.stringify(star)}).out`)===0&&!run("S.manualXI"));
// a quick week: the preview, then kick off
// (quick weeks are the ten-game level's; every Beginner game has its decisions)
run(`SEED="MD-1";LEVEL="intermediate";ROLE=ROLES.manager;boot();const i=PLAN.indexOf("live");cursor=i;S.mw=2;S._summaryShown=true;step()`);
ok("a week with no pre-match decision: them v you, then Kick off", /<th class="n">You<\/th>/.test(app())&&/id="kick"/.test(app())&&/12:30 KICK-OFF/.test(app()));
// 23. THE BEGINNER SEASON (agreed 2026-09-21)
run(`SEED="BG-1";chooseRole()`);
ok("levels: Beginner only for now -- Intermediate and Advanced marked 'Coming soon' and not selectable",
  /data-level="beginner"/.test(app())&&!/data-level="intermediate"/.test(app())&&!/data-level="guru"/.test(app())&&(app().match(/Coming soon/g)||[]).length===3); // + the owner
run(`ROLE=ROLES.manager;boot()`);els.go.onclick();els.go.onclick();els.go.onclick();
ok("neutral venues: no home or away anywhere, and no home advantage in the model",
  !/at home|Away at|At home/.test(app())&&/<h1>v /.test(app())&&run("homeMult()")===1);
ok("Shark Scout are stronger at Beginner only (they win the league most of the time)",
  // (through the model's view, which excludes the hidden season swing)
  run(`modelView(()=>strOf("Shark Scout United"))`)===run(`RIVALS.find(r=>r.n==="Shark Scout United").str`)+run("BEGINNER_SHARK_BOOST"));
// weekly wages: the result's cash is gate money minus the wage bill
run(`S.cash=100`);const wages=run("S.wages");
run(`(()=>{const r=resolveMine(1,0,true);globalThis.__fx=r.fx})()`);
ok("at Beginner the match result carries no cash -- it moves in the two weekly moments (pay day, gate receipts)", run("__fx.cash")===undefined);
// the knock
delete els.ch;run(`renderSpec(knockSpec(),"T",()=>{})`);
const knockName=(app().match(/<h1>(.+?) has a knock<\/h1>/)||[])[1];
els.ch.children[0].onclick();
ok("the knock: one named player -- resting him means he misses the next game", !!knockName&&run(`S.squadList.find(p=>p.nm===${JSON.stringify(knockName)}).out`)===1);
// the window: sell, then that money is spendable; the price shown is the price paid
run(`S.cash=10;S.janBudget=null;renderWindow("freshen",()=>{})`);
const before=run("S.cash"),first=run(`alive().filter(p=>!p.gone).sort((a,b)=>b.rt-a.rt)[0]`),shown=run(`saleFee(alive().filter(p=>!p.gone).sort((a,b)=>b.rt-a.rt)[0])`);
ok("the window is billed as freshening up after Gameweek 3", /Freshen up the squad/.test(app())&&/AFTER GAMEWEEK 3/.test(app()));
run(`(()=>{const p=alive().filter(p=>!p.gone).sort((a,b)=>b.rt-a.rt)[0];const i=S.squadList.indexOf(p);S.cash+=saleFee(p);p.gone=true})()`);
ok("sale money is spendable (it used to be stuck outside the manager's budget)", run("spendable()")===before+shown&&run("S.janBudget")===null);
ok("one sale price per player, the same every time it's asked", run(`saleFee(S.squadList[0])`)===run(`saleFee(S.squadList[0])`));
// the bank
delete els.ch;run(`renderSpec(bankSpec(),"T",()=>{})`);
ok("the bank's call: sell a named player at his one price, or ride it out", /The bank has called/.test(app())&&/Sell .+ for £\d+k/.test(els.ch.children[0].innerHTML)&&/Ride it out/.test(els.ch.children[1].innerHTML));
// 24. Chris's feedback on the Beginner build (2026-09-21)
run(`SEED="FB-1";ROLE=ROLES.manager;chooseRole();ROLE=ROLES.manager;boot();S.cash=100;S._cashSeen=100;S._cashDelta=0;paintHeader()`);
run(`S.cash=77;paintHeader()`);
ok("cash at the top: big, with its latest change in red", /£77k/.test(els.hTwo.innerHTML)&&/class="cashd down">▼ −£23k/.test(els.hTwo.innerHTML));
run(`paintHeader()`);
ok("...and the change stays visible until cash moves again", /▼ −£23k/.test(els.hTwo.innerHTML));
run(`S.cash=90;paintHeader()`);
ok("...then shows the next change, in green when it's up", /class="cashd up">▲ \+£13k/.test(els.hTwo.innerHTML));
// pre-match decisions show their impact on this match
els.go.onclick();els.go.onclick();els.go.onclick();
ok("pre-match options show their impact: your xG and theirs for this match, compared with the other option",
  (app().match(/You \d\.\d xG/g)||[]).length===2&&(app().match(/Them \d\.\d xG/g)||[]).length===2&&/[▲▼]/.test(app())&&!/win chance/i.test(app()));
// the window: a simple choice between two players
delete els.ch;run(`S.cash=97;renderSpec(Object.assign(signingSpec(),{keepFull:true,fullChoices:true}),"T",()=>{})`);
const opts=els.ch.children.map(c=>c.innerHTML.replace(/<[^>]+>/g,' '));
const num=(t,re)=>+((t.match(re)||[])[1]);
ok("the window: two players and 'No signing' -- simple: fee, wages, cash left, squad quality", opts.length===3&&/No signing: keep your money/.test(opts[2])&&!opts.some(t=>/next game v|win \d+%/.test(t))&&opts.slice(0,2).every(t=>/£\d+k now/.test(t)&&/wages \+£\d+k a week/.test(t)&&/£-?\d+k left/.test(t)&&/squad quality [\d.]+ → [\d.]+/.test(t)));
ok("...one better, one with the cash advantage",
  num(opts[0],/→ ([\d.]+)/)>num(opts[1],/→ ([\d.]+)/)&&num(opts[1],/£(-?\d+)k left/)>num(opts[0],/£(-?\d+)k left/), opts.map(t=>t.replace(/\s+/g,' ').trim()).join(' | '));
// 25. Round 3 of Beginner feedback: no set pieces; three shapes from GW4; GW5 two changes
run(`SEED="R3-1";ROLE=ROLES.manager;chooseRole();ROLE=ROLES.manager;boot();S.mw=3;cursor=PLAN.indexOf("match");S._summaryShown=true;S._sheetShown=false;step()`);
ok("Gameweek 4: three shapes -- go for it, balanced, stay compact -- each with its impact",
  /Go for it/.test(app())&&/Balanced \(/.test(app())&&/Stay compact/.test(app())&&!/One place in the side/.test(app())&&(app().match(/You \d\.\d xG/g)||[]).length===3);
run(`S.mw=2;S._sheetShown=false;renderTeamSheet(()=>{})`);
ok("Gameweek 3: selection, not set pieces", /One place in the side/.test(app())&&!/set pieces/i.test(app()));
delete els.htBox;delete els.toTable;
run(`S.mw=4;cursor=PLAN.lastIndexOf("match");S._summaryShown=true;S._sheetShown=false;step()`);
els.kick.onclick();drain();
ok("Gameweek 5, change one: the half-time sub", /is tiring/.test(els.htBox.innerHTML));
els.subYes.onclick();els.htGo.onclick();drain();
ok("Gameweek 5, change two: at 70 minutes, a call on the score -- win it or protect it", /70 MINUTES/.test(els.htBox.innerHTML)&&/Kill it off, or protect the lead\?|Go for the win, or settle for a point\?|Chase it, or keep it respectable\?/.test(els.htBox.innerHTML));
els.htHold.onclick();els.htGo.onclick();drain();
ok("...and then on to full time", !!(els.toTable&&els.toTable.onclick));
// splitting the second half keeps the same goals on average
{ const f=run(`(()=>{const[h,a]=myFixture(4),home=h===CLUB,opp=home?a:h;const r1=clubRates(opp,home,.62,"4-4-2"),r2=clubRates(opp,home,.62*24/46,"4-4-2"),r3=clubRates(opp,home,.62*22/46,"4-4-2");return[r1[0],r2[0]+r3[0]]})()`);
  ok("splitting the second half at 70' keeps the same expected goals", Math.abs(f[0]-f[1])<1e-9, `${f[0].toFixed(3)} vs ${f[1].toFixed(3)}`); }
// 26. Should we win? Upsets. Two cash moments. (Chris, 2026-09-22)
run(`SEED="CM-1";ROLE=ROLES.manager;chooseRole();ROLE=ROLES.manager;boot()`);
const c0=run("S.cash"),w0=run("S.wages");els.go.onclick();
ok("the Your Team page no longer hides the pay day in its stats", !/PAY DAY|Pay day/.test(app()));
els.go.onclick();
ok("pay day: announced on its own, the wage bill out before the game, the page and the header alike",
  run("S.cash")===c0-w0&&/PAY DAY/.test(app())&&app().includes(`−£${w0}k`)&&app().includes(`Cash £${c0}k → <b>£${c0-w0}k`)&&els.hTwo.innerHTML.includes(`▼ −£${w0}k`));
run(`renderPreseasonUpdate()`);
ok("...charged once, however often the page is drawn", run("S.cash")===c0-w0&&app().includes(`Cash £${c0}k → <b>£${c0-w0}k`));
els.go.onclick();delete els.htBox;delete els.toTable;els.kick.onclick();
ok("the live match headlines what should happen, then them v you -- not the old ratings block",
  /Heavy favourites|The favourites|Nobody gives you a chance|The underdogs|On a knife-edge/.test(app())&&/The model: win \d+% · draw \d+% · lose \d+%/.test(app())&&/<th class="n">You<\/th>/.test(app())&&!/rated \d+|Model odds|Team Strength<\/b>/.test(app()));
drain();const c1=run("S.cash");els.toTable.onclick();const g=run("S.cash")-c1;
ok("gate receipts: after the game, the exact amount in the page and the header", g>0&&app().includes(`Gate receipts: <b style="color:var(--good)">+£${g}k`)&&els.hTwo.innerHTML.includes(`▲ +£${g}k`), `+£${g}k`);
ok("pay day and receipts happen once each a week, however often the page is drawn", run("payDay()")===null&&run("gateReceipts('w')")===null);
ok("an upset: 'should win' but lost, or 'should lose' but won", /upset/i.test(run(`upsetLine("l",{call:"win"})`))&&/upset/i.test(run(`upsetLine("w",{call:"lose"})`))&&run(`upsetLine("w",{call:"win"})`)===null);
// tags show what was ACTUALLY applied (noise included)
delete els.ch;run(`S.cash=100;renderSpec({title:"T",lede:"L",choices:[{t:"Spend",d:"",fx:{cash:-40},out:"Done."}]},"T",()=>{})`);els.ch.children[0].onclick();
{ const spent=100-run("S.cash"); ok("a decision's cash tag matches the cash that actually moved (it once showed the pre-variation figure)", app().includes(`Cash −£${spent}k`), `moved £${spent}k`); }
// team health joins the header from Gameweek 3
run(`S.mw=1;paintHeader()`);const noHealth=!/>Health</.test(els.hTwo.innerHTML);
run(`S.mw=2;paintHeader()`);
ok("team health joins the header from Gameweek 3 (for rotation decisions)", noHealth&&/>Health</.test(els.hTwo.innerHTML)&&/\d+%/.test(els.hTwo.innerHTML));
// the sponsor moves the weekly cash moments
run(`S.gateBonus=0;S.gates={};S.mw=3;globalThis.__g1=gateReceipts("w");S.gates={};apply({gate:6});globalThis.__g2=gateReceipts("w")`);
ok("the sponsor's shirt deal raises every game's gate receipts", run("__g2")===run("__g1")+6);
run(`S.paid={};const w=S.wages;apply({wages:4});globalThis.__p=payDay()-w`);
ok("the players' bonus raises the weekly wage bill", run("__p")===4);
ok("the Beginner plan: the big window and the bank straight before the final", run("BEGINNER_PLAN.join()").endsWith("window,bank,match,end"));
// 27. Round 5 of Beginner feedback (2026-09-22)
run(`SEED="R5-1";ROLE=ROLES.manager;chooseRole();ROLE=ROLES.manager;boot()`);
// (how OFTEN you're predicted 3rd is the engine check's job, over 40 seasons;
// this checks what must hold in EVERY season)
ok("page 2's predicted table and page 3's expected finish always agree (rank, not a rounded average)",
  run(`[CLUB].concat(RIVALS.map(r=>r.n)).sort((a,b)=>PREDICT[a].avg-PREDICT[b].avg).indexOf(CLUB)+1`)===run("sharkPos()"));
ok("the opponents: the weakest first, three evenly matched, and the strongest LAST -- the final boss",
  run(`(()=>{const o=[0,1,2,3,4].map(w=>{const[h,a]=myFixture(w);return h===CLUB?a:h});const by=RIVALS.slice().sort((a,b)=>b.str-a.str).map(r=>r.n);
    return o[0]===by[by.length-1]&&o[4]===by[0]&&o.slice(1,4).every(n=>{const p=matchProbs(n,true);return p.w>=25&&p.w<=50})})()`));
// choosing an option moves the odds on the OTHER decision too (they're worked out together)
run(`S.mw=4;S._sheetShown=false;renderTeamSheet(()=>{})`);
ok("Gameweek 5 (the boss): the sheet holds two decisions -- selection, then shape -- with one 1X2 line above them", /id="onex2"/.test(app())&&/1\. One place in the side/.test(app()));
// half-time cards: choose, then Send them out
delete els.htBox;run(`S.mw=1;subHalfTime(()=>{globalThis.__resumed=1},true,0,0)`);
ok("half time: one 1X2 line at the top (it moves with the card you pick), none on the cards", /id="htOdds"/.test(els.htBox.innerHTML)&&!/Win \d+% · Draw/.test(els.htBox.innerHTML));
run(`globalThis.__resumed=0`);els.subYes.onclick();
ok("tapping a card only selects it -- nothing happens until 'Send them out'", run("__resumed")===0&&/Send them out/.test(els.htBox.innerHTML));
els.htGo.onclick();
ok("...then 'Send them out' plays on with that choice", run("__resumed")===1&&run("S._subXI")===true);
ok("the odds from a half-time score: 1-0 up is better than 0-0, with the same chances to come",
  run("outcomeProbs(1,0,.6,.6).w")>run("outcomeProbs(0,0,.6,.6).w")&&run("outcomeProbs(0,0,.6,.6).w")===run("outcomeProbs(0,0,.6,.6).l"));
ok("the headlines are theatrical, not matter of fact", /Heavy favourites|The favourites|On a knife-edge|The underdogs|Nobody gives/.test(run(`expectationHTML(RIVALS[0].n,true)`)));
// 28. One 1X2 line that moves; the opener won 9 times in 10 (Chris, 2026-09-22)
run(`SEED="OX-1";ROLE=ROLES.manager;chooseRole();ROLE=ROLES.manager;boot();S.mw=0;S._sheetShown=false;renderTeamSheet(()=>{})`);
{ const line=()=>(app().match(/The model: win (\d+)% · draw (\d+)% · lose (\d+)%/)||[]).slice(1).join('/');
  const a=line();
  // pick the other shape, as the button does
  run(`document.querySelectorAll=sel=>sel==='[data-bc]'?[{dataset:{bc:"0-1"},set onclick(f){globalThis.__pick=f}}]:[]`);
  run(`S._sheetShown=false;renderTeamSheet(()=>{})`);run(`__pick()`);
  const b=line();
  ok("the 1X2 line under the title moves when you pick a different option", !!a&&!!b&&a!==b, `${a} → ${b}`);
  run(`document.querySelectorAll=()=>[]`); }
delete els.htBox;delete els.htOdds;run(`S.mw=1;subHalfTime(()=>{},true,0,0)`);
{ const t0=els.htOdds.textContent;els.subYes.onclick();const t1=els.htOdds.textContent;els.subNo.onclick();const t2=els.htOdds.textContent;
  ok("at half time the 1X2 line moves with the card you pick", /The model: win \d+%/.test(t1)&&t1!==t2, `${t1} | ${t2}`); }
{ // the opener: at least 9 wins in 10 (measured 94% over 300); 200 replays in the real match engine
  run(`SEED="OPEN";ROLE=ROLES.manager;chooseRole();ROLE=ROLES.manager;boot();globalThis.__S=JSON.stringify(S);globalThis.__T=JSON.stringify(TABLE)`);
  let w=0;const N=200;
  for(let k=0;k<N;k++){run(`S=JSON.parse(__S);TABLE=JSON.parse(__T);S.mw=0;S._sheetShown=true`);delete els.paceBox;
    run(`renderMatch(()=>{},false)`);drain();const m=((els.paceBox&&els.paceBox.innerHTML)||'').match(/Your Team (\d+)–(\d+)/);if(m&&+m[1]>+m[2])w++}
  ok("the opening game is won at least 9 times in 10 (real match engine)", w/N>=0.88, `${Math.round(w/N*100)}% of ${N}`); }
// 29. The final boss (Chris, 2026-09-22)
run(`SEED="FB-9";ROLE=ROLES.manager;chooseRole();ROLE=ROLES.manager;boot()`);
ok("the boss is Shark Scout United (Chris preferred it)", run(`RIVALS.some(r=>r.n==="Shark Scout United")`));
els.go.onclick();els.go.onclick();
ok("predictions come from FixtureShark, not 'the Shark'", /FixtureShark says/.test(app())&&!/The Shark (says|predict)/.test(app()));
// the big window: marquee signings that make the final an even contest -- or no signing
run(`S.mw=3;S.cash=55`);delete els.ch;run(`renderSpec(Object.assign(bigSigningSpec(),{keepFull:true,fullChoices:true}),"T",()=>{})`);
{ const o=els.ch.children.map(c=>c.innerHTML.replace(/<[^>]+>/g,' '));const x2=t=>(t.match(/win (\d+)% · draw (\d+)% · lose (\d+)%/)||[]).slice(1).map(Number);
  const [st,cb,none]=o.map(x2);
  ok("the big window: a star striker, a commanding centre-back, or no signing -- each with its 1X2 v the boss",
    o.length===3&&/The Finisher — goals/.test(o[0])&&/The Wall — clean sheets/.test(o[1])&&/No big signing/.test(o[2])&&st.length===3&&none.length===3);
  ok("a marquee signing makes the final an even contest; without one it's a likely defeat",
    st[0]>=st[2]-5&&cb[0]>=cb[2]-5&&none[2]>=55, `striker ${st.join('/')} · centre-back ${cb.join('/')} · none ${none.join('/')}`);
  ok("the risk is spelt out: the bank sells your best player; deep in the red, 3 points", /the bank sells your best player/.test(app())&&/docked 3 points/.test(app()));
  const promised=st.join('/');els.ch.children[0].onclick();
  const[h,a]=run('myFixture(4)');const now=run(`(()=>{const p=matchProbs(${JSON.stringify(h==='Your Team'?a:h)},${h==='Your Team'});return p.w+'/'+p.d+'/'+p.l})()`);
  ok("...and the signing delivers what it promised (the star AND the lift he brings)", now===promised, `${promised} → ${now}`); }
ok("deep in the red at Beginner is below -£60k (sized to its economy)", run("deductLine()")===-60);
// Gameweek 2's half time: about the score -- win it or protect it
delete els.htBox;run(`S.mw=1;shapeHalfTime(()=>{},1,0)`);
ok("Gameweek 2's half time is about the score: 1-0 up -- kill it off, or protect the lead", /Kill it off, or protect the lead\?/.test(els.htBox.innerHTML)&&/Protect the lead/.test(els.htBox.innerHTML)&&/Go for the second/.test(els.htBox.innerHTML));
delete els.htBox;run(`shapeHalfTime(()=>{},0,0)`);
ok("...and level at the break: go for the win, or settle for a point", /Go for the win, or settle for a point\?/.test(els.htBox.innerHTML));
// keep the tiring star on: full threat now, his real fitness back at full time, injured next game
// (a fresh season, with the best forward explicitly tired: earlier tests leave state behind)
delete els.htBox;run(`SEED="FB-KEEP";ROLE=ROLES.manager;chooseRole();ROLE=ROLES.manager;boot();S.mw=2;
  (()=>{const f=currentXI().map(x=>S.squadList[x.i]).filter(p=>p.pos==="FW").sort((a,b)=>b.rt-a.rt)[0];f.fit=70})();subHalfTime(()=>{},true,0,0)`);
{ const nm=(els.htBox.innerHTML.match(/<h2>(.+?) is tiring<\/h2>/)||[])[1];const fit0=run(`S.squadList.find(p=>p.nm===${JSON.stringify(nm)}).fit`);
  els.subNo.onclick();els.htGo.onclick();
  const during=run(`S.squadList.find(p=>p.nm===${JSON.stringify(nm)}).fit`);
  ok("keep him on: he plays through it -- full strength for the second half", during>=95&&fit0<95, `${fit0}% → plays at ${during}%`);
  ok("the star in the dilemma is an attacker (the choice is about goal threat)", /^(FW|MF)$/.test(run(`S.squadList.find(p=>p.nm===${JSON.stringify(nm)}).pos`))); }
console.log(fails?`${fails} FAILED`:"ALL SCREEN CHECKS PASSED");
process.exit(fails?1:0);
