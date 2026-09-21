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
ok("full match opens on the team sheet", /TEAM SHEET/.test(sheet)&&/class="pitch"/.test(sheet));
ok("team sheet names the opponent's formation", /They are lining up <b>\d-\d-\d<\/b>/.test(sheet));
els.kick.onclick();drain();
ok("manager's match pauses at half time for the tactical call", /HALF TIME/.test(els.htBox.innerHTML)&&!!(els.goSecond&&els.goSecond.onclick));
els.goSecond.onclick();drain();
ok("full match plays through to 3pm results after half time", /THE 3PM KICK-OFFS/.test(app()));
// 3. heat map in site language
const hm=run("fixtureHeatHTML(2,5)");
ok("heat map uses GW, H/A codes and FDR", /GW\d/.test(hm)&&/[A-Z]{3} - [HA]/.test(hm)&&/FDR \d/.test(hm)&&!/MW/.test(hm));
ok("heat map has the site's legend wording", /Easiest fixtures \(FDR\)/.test(hm)&&/Hardest fixtures \(FDR\)/.test(hm));
ok("heat map has a plain-English summary", /Toughest: GW\d+/.test(hm));
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
// 7. a decision says what it did to the next result
run(`S=newState();TABLE=blankTable();recalcSquadRating();renderSpec({title:"T",lede:"L",choices:[{t:"Big morale boost",d:"",fx:{squad:30},out:"Done."}]},"TEST",()=>{})`);
els.ch.children[0].onclick();
ok("a decision shows its effect on next match's win chance", /Win chance (at home to|away at) .+: \d+% → <b>\d+%<\/b>/.test(app()));
console.log(fails?`${fails} FAILED`:"ALL SCREEN CHECKS PASSED");
process.exit(fails?1:0);
