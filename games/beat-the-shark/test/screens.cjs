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
  appendChild(c){this.children.push(c)},querySelectorAll(){return[]}};return e}
const doc={getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],createElement:()=>mk("")};
const q=[];const ctx=vm.createContext({document:doc,setTimeout:f=>q.push(f),Math,JSON,Object,Array,String,Number,Date,Map,Set,console,location:{hash:"",pathname:"/"}});
const drain=()=>{let n=0;while(q.length&&n++<5000)q.shift()()};
for(const s of srcs)new vm.Script(fs.readFileSync(s,'utf8'),{filename:s}).runInContext(ctx);
const run=c=>vm.runInContext(c,ctx);
const app=()=>els.app.innerHTML;
const bad=h=>/undefined|NaN|\[object/.test(h);
let fails=0;const ok=(name,cond,info)=>{console.log(`${cond?"PASS":"FAIL"}  ${name}${info?"  ("+info+")":""}`);if(!cond)fails++};

run(`SEED="SCR";ROLE=ROLES.manager;pickRivals();S=newState();buildFixtures();TABLE=blankTable();PREDICT=monteCarlo(300);recalcSquadRating();cursor=0;`);
// 1. quick match -> 3pm kick-offs
run(`renderMatch(()=>{globalThis.__done=1},true)`);
const vp=app();
ok("vidiprinter: Your Team on the LEFT", /<div class="teams">\s*<span>YOUR TEAM/.test(vp));
drain();
const el=app();
ok("3pm kick-offs screen reached", /THE 3PM KICK-OFFS/.test(el));
ok("table shown 'as it stands' before other results", /AS IT STANDS|FULL TIME · ALL GAMES DONE/.test(el));
ok("result line puts Your Team first", /<b>Your Team<\/b> \d+–\d+/.test(el));
ok("Your Team tagged YOU in the table", /class="you">YOU/.test(el));
ok("gameweek advanced after all results", run("S.mw")===1, "S.mw="+run("S.mw"));
ok("no broken text on match screens", !bad(vp)&&!bad(el));
// 2. full match: team sheet first, then kick off
run(`renderMatch(()=>{},false)`);
const sheet=app();
ok("full match opens on the team sheet", /TEAM SHEET/.test(sheet)&&/class="pitch2"/.test(sheet));
ok("team sheet names the opponent's formation", /They are lining up <b>\d-\d-\d<\/b>/.test(sheet));
els.kick.onclick();drain();
ok("manager's match pauses at half time for the tactical call", /HALF TIME/.test(els.htBox.innerHTML)&&!!(els.goSecond&&els.goSecond.onclick));
els.goSecond.onclick();drain();
ok("full match plays through to 3pm results after half time", /THE 3PM KICK-OFFS/.test(app()));
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
ok("ending compares points with the Shark", /THE SHARK SAID/.test(app())&&/YOU TOOK/.test(app())&&/pts/.test(app()));
// 14. home advantage, made visible
run(`ROLE=ROLES.manager;S=newState();TABLE=blankTable();recalcSquadRating();S.mw=0;S.pendingOppFm=null;S._sheetShown=false;renderTeamSheet(()=>{})`);
ok("team sheet shows the same game the other way round", /Home advantage/.test(app())&&/The same game (away|at home) would be\s+\d+% to win/.test(app()));
run(`renderHeatmap()`);
ok("pre-season explains home advantage from the real model", /19% more goals/.test(app())&&/0\.175/.test(app())&&/points/.test(app()));
ok("heat map compares expected points home and away", /Home games:<\/b> [\d.]+ expected points each/.test(run("fixtureHeatHTML(0,10)")));
run(`S.seasonLog=[{gf:2,ga:0,home:true},{gf:0,ga:1,home:false},{gf:1,ga:1,home:false}];`);
ok("end of season reports home and away records", /<b>Home<\/b> W1 D0 L0 — 3 points/.test(run("seasonLessons()")));
console.log(fails?`${fails} FAILED`:"ALL SCREEN CHECKS PASSED");
process.exit(fails?1:0);
