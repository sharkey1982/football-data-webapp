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
// After the whistle: three calm screens, no timers (Chris's playtest).
ok("full time WAITS for the player -- no automatic jump to the results", /See the league table/.test(els.paceBox.innerHTML)&&q.length===0);
els.toTable.onclick();
const el=app();
ok("then the league table, as it stands", /THE TABLE/.test(el)&&/AS IT STANDS/.test(el));
ok("result line puts Your Team first", /<b>Your Team<\/b> \d+–\d+/.test(el));
ok("Your Team tagged YOU in the table", /class="you">YOU/.test(el));
ok("the gameweek is not over until the other results are in", run("S.mw")===0, "S.mw="+run("S.mw"));
els.toOthers.onclick();
const el2=app();
ok("then the other results, all at once, and what they did to the table", /THE OTHER RESULTS/.test(el2)&&/WHAT THAT DID TO THE TABLE/.test(el2));
ok("no timers after the whistle -- nothing runs on its own", q.length===0);
ok("gameweek advanced after all results", run("S.mw")===1, "S.mw="+run("S.mw"));
ok("no broken text on match screens", !bad(vp)&&!bad(el)&&!bad(el2));
// 2. full match: team sheet first, then kick off
run(`renderMatch(()=>{},false)`);
const sheet=app();
ok("full match opens on the team sheet", /TEAM SHEET/.test(sheet)&&/class="pitch2"/.test(sheet));
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
ok("a decision shows its effect on xGF, clean sheet and win chance", /xGF [\s\S]+?→[\s\S]+?clean sheet [\s\S]+?→[\s\S]+?win [\s\S]+?→/.test(app()));
// 10. the cash crisis: two players, the model's numbers, and the heat map
run(`ROLE=ROLES.owner;S=newState();TABLE=blankTable();recalcSquadRating();S.mw=3;renderSpec(crisisSpec(),"THE BANK HAS CALLED",()=>{})`);
const cr=app();
ok("cash crisis offers a striker or a defender", /Sell .+\(\d+, FW\)/.test(cr)&&/Sell .+\(\d+, DF\)/.test(cr));
ok("cash crisis shows xGF and clean sheets for each option", /Keep both/.test(cr)&&/xGF/.test(cr)&&/Clean sheets/.test(cr));
ok("cash crisis puts the heat map beside the decision", /Goals for/.test(cr)&&/Clean sheet/.test(cr));
// 11. the owner's header shows cash; the score is in points
run(`paintHeader()`);
ok("owner's header shows cash and the Shark's points", /Cash/.test(els.hTwo.innerHTML)&&/pts/.test(els.hTwo.innerHTML));
// 12. the team sheet shows this match's numbers live
run(`ROLE=ROLES.manager;S=newState();TABLE=blankTable();recalcSquadRating();S.mw=0;S.pendingOppFm=null;S._sheetShown=false;renderTeamSheet(()=>{})`);
ok("team sheet shows this match's xGF, clean sheet and win chance", /This match, as the model sees it/.test(app()));
// 13. the ending speaks in points
run(`S.mw=MW;TABLE[CLUB].pts=20;renderEnding()`);
ok("ending compares points with the Shark's target", /THE SHARK'S TARGET/.test(app())&&/YOU TOOK/.test(app())&&/pts/.test(app()));
// 14. home advantage, made visible
run(`ROLE=ROLES.manager;S=newState();TABLE=blankTable();recalcSquadRating();S.mw=0;S.pendingOppFm=null;S._sheetShown=false;renderTeamSheet(()=>{})`);
ok("team sheet shows the same game the other way round", /Home advantage/.test(app())&&/The same game (away|at home) would be\s+\d+% to win/.test(app()));
run(`renderHeatmap()`);
ok("pre-season explains home advantage from the real model", /19% more goals/.test(app())&&/0\.175/.test(app())&&/points/.test(app()));
ok("heat map compares expected points home and away", /Home games:<\/b> [\d.]+ expected points each/.test(run("fixtureHeatHTML(0,10)")));
run(`S.seasonLog=[{gf:2,ga:0,home:true},{gf:0,ga:1,home:false},{gf:1,ga:1,home:false}];`);
ok("end of season reports home and away records", /<b>Home<\/b> W1 D0 L0 — 3 points/.test(run("seasonLessons()")));
// 15. one consistent view: dashboard, table, labelled players
run(`ROLE=ROLES.manager;S=newState();TABLE=blankTable();recalcSquadRating();S.mw=0;S.kpi=[];kpiRecord();S.mw=1;TABLE[CLUB].p=1;TABLE[CLUB].pts=3;kpiRecord();`);
const kp=run("kpiHTML()");
ok("dashboard shows position, points v Shark, attack xGF and defence xGA", /League position/.test(kp)&&/Points v the Shark/.test(kp)&&/Attack · xGF\/game/.test(kp)&&/Defence · xGA\/game/.test(kp));
ok("dashboard draws a sparkline for each of the four", (kp.match(/<polyline/g)||[]).length===4);
const st=run("strengthTableHTML()");
ok("Team Strength shows xPts and projected points, ordered by them", /<th class="n">xPts<\/th>/.test(st)&&/<th class="n">Proj<\/th>/.test(st));
const sq=run("squadHTML({})");
ok("players show quality (Q) and condition (%) explicitly, with a legend", /<b>Q\d+<\/b> · <span[^>]*>\d+%<\/span>/.test(sq)&&/quality · <b>%<\/b> condition/.test(sq));
run(`paintHeader()`);
ok("header calls the Shark's number a target, in points", /The Shark's target/.test(els.hTwo.innerHTML)&&/pts/.test(els.hTwo.innerHTML));
// 16. levels: progressive disclosure for beginners, everything for the rest
const sheetAt=(lvl,played)=>{run(`LEVEL="${lvl}";ROLE=ROLES.manager;S=newState();TABLE=blankTable();recalcSquadRating();S.mw=0;S.fullMatches=${played};S.pendingOppFm=null;S._sheetShown=false;renderTeamSheet(()=>{})`);return app()};
let b0=sheetAt("beginner",0);
ok("beginner, first match: formations only, flagged as new", /New this match · Formations/.test(b0)&&/data-fm=/.test(b0)&&!/data-xi=/.test(b0)&&!/data-sp=/.test(b0));
let b1=sheetAt("beginner",1);
ok("beginner, second match: rotation unlocks, flagged as new", /New this match · Rest and rotation/.test(b1)&&/data-xi=/.test(b1)&&!/data-sp=/.test(b1));
ok("beginner, third match: set pieces unlock", /New this match · Set pieces/.test(sheetAt("beginner",2))&&/data-sp=/.test(app()));
ok("beginner, fourth match: out of position unlocks", /New this match · Out of position/.test(sheetAt("beginner",3)));
ok("intermediate has every lever from the first match, no 'new' banner", (()=>{const h=sheetAt("intermediate",0);return /data-xi=/.test(h)&&/data-sp=/.test(h)&&!/New this match/.test(h)})());
ok("data guru has every lever but not the long explanations", (()=>{const h=sheetAt("guru",0);return /data-sp=/.test(h)&&!/quarter of goals/.test(h)})());
// a beginner cannot play someone out of position before it unlocks
sheetAt("beginner",1);ok("beginner: out of position locked in match 2, open from match 4", run(`can("oop")`)===false&&(sheetAt("beginner",3),run(`can("oop")`)===true));
ok("the opening screen offers the three levels", (()=>{run("chooseRole()");const h=app();return /data-level="beginner"/.test(h)&&/data-level="guru"/.test(h)&&/same Shark/.test(h)})());
run(`LEVEL="intermediate"`);
// 17. PACING (Chris's playtest: "too fast to follow")
run(`LEVEL="beginner";SPEED=null`);
ok("beginners start on slow; commentary gives about 3s a line", run(`speedName()`)==="slow"&&run(`PACE.commentaryMs*speedFactor()`)>=2900);
run(`LEVEL="intermediate";SPEED=null`);
ok("other levels start on normal: over 2s a line (was 0.8s)", run(`speedName()`)==="normal"&&run(`PACE.commentaryMs*speedFactor()`)>=2000);
run(`SPEED="fast"`);
ok("the player's speed choice overrides the level default", run(`speedName()`)==="fast");
run(`SPEED=null;LEVEL="beginner";ROLE=ROLES.manager;boot();S.mw=0;S.pendingOppFm=null;S._sheetShown=true;renderMatch(()=>{},false)`); // past the team sheet, into the commentary
ok("live commentary shows speed controls and Skip to full time", /data-speed="slow"/.test(app())&&/Skip to full time/.test(app()));
// 17b. Beginners: an easy story decision before the data-heavy ones
run(`LEVEL="beginner";ROLE=ROLES.manager;boot()`);
ok("Beginner season opens with the press conference (a story decision)", run(`PLAN[0]`)==="presser");
run(`LEVEL="intermediate";ROLE=ROLES.manager;boot()`);
ok("other levels keep the original order", run(`PLAN[0]`)==="special1");
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
const BUDGET={screen:270,beginnerTeamSheet:285,opening:200,preseason:70,minutes:15.5};
run(`LEVEL="beginner";SPEED=null;chooseRole()`);
ok(`reading budget: opening screen <= ${BUDGET.opening} words`, words(app())<=BUDGET.opening, `${words(app())} words`);
run(`ROLE=ROLES.manager;boot()`);
ok(`reading budget: pre-season <= ${BUDGET.preseason} words`, words(app())<=BUDGET.preseason, `${words(app())} words`);
run(`S.fullMatches=3;S.mw=0;S.pendingOppFm=null;S._sheetShown=false;renderTeamSheet(()=>{})`);
ok(`reading budget: a beginner's team sheet <= ${BUDGET.beginnerTeamSheet} words`, words(app())<=BUDGET.beginnerTeamSheet, `${words(app())} words`);
{
  const plan=run('PLAN');let total=0,worst=0,worstAt='',secs=0;
  for(let i=0;i<plan.length;i++){
    try{run(`cursor=${i};S.mw=Math.min(MW-1,${Math.floor(i/3)});S.pendingOppFm=null;S._sheetShown=false;step()`)}catch(e){continue}
    const settle=()=>{for(let k=0;k<400&&q.length;k++){try{q.shift()()}catch(e){}}};
    const count=()=>{const h=app(),w=words(h);total+=w;secs+=readSecs(h);if(w>worst){worst=w;worstAt=plan[i]}};
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
console.log(fails?`${fails} FAILED`:"ALL SCREEN CHECKS PASSED");
process.exit(fails?1:0);
