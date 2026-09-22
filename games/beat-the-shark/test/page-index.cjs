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
// ============================================================================
// PAGE INDEX -- every page of a Beginner manager's season, in order,
// generated from the game's actual season plan (so it can't go stale).
//   node games/beat-the-shark/test/page-index.cjs > games/beat-the-shark/PAGES.md
// ============================================================================
run(`SEED="SOC-S07";ROLE=ROLES.manager;chooseRole();ROLE=ROLES.manager;boot()`);
const plan=run('PLAN');const out=[];let n=0,gw=0;
const add=(t)=>out.push(`${String(++n).padStart(2)}. ${t}`);
add('Opening — "Your mission: Win the league!"; level; Manager / Owner');
add('The league — predicted finishing positions; Begin');
add('Your team — expected finish, bank balance; goals-for rank, clean-sheet rank, team health, squad quality');
add('Pre-season — how it went (team health, squad quality, the Shark\'s prediction, opening day), then PAY DAY announced: wages out, cash before → after');
const NAME={bid:'A bid arrives — sell one of your players (money in, squad quality down) or keep him',sponsor:'The sponsor calls — a shirt deal (+£6k at the gate every game) or a players\' bonus (wages +£4k a week, the team lifted)',knock:'The physio — one named player has a knock: rest him for the next game, or risk him',window:'BEFORE THE FINAL: THE BIG WINDOW — a marquee striker (goals) or centre-back (clean sheets), or no signing; each with fee, wages, cash left and its 1X2 v the final boss; the risk: the bank sells your best player, or 3 points deducted',bank:'The bank calls — cash is now the issue: sell a player, or ride it out',special1:'A bid arrives — keep or sell your best player',heatmap:'Your next five fixtures (heat map)',presser:'Press conference (story)',
  crisis:'Cash crisis — sell a striker or a defender',physio:'The physio room',papers:'The Sunday papers',event:'A story decision',podcast:'The podcast clip',
  special2:'January window, then the winter break',stats:'Halfway: the numbers',luck:'A stroke of luck (or not)',call:'A phone call'};
const PRE=["Shape: read the opponent — go for it or stay compact","Shape v an evenly matched side","Selection on health — the better player or the fresher one","Shape — three options: go for it, balanced, stay compact","THE FINAL BOSS — 1. selection on health, 2. shape (three options)"];
const HT=["none — the first game is kept simple","Win it or protect it (on the score)","Keep the tiring star on (he plays through it, but misses the next game) or bring on a fresher player","Win it or protect it (on the score)","TWO changes — a sub at half time, then at 70': win it or protect it"];
for(const b of plan){
  if(b==='match'){
    gw++;const k=gw-1,[h,a]=run(`myFixture(${k})`),opp=h==='Your Team'?a:h;
    if(gw>1)add(`Gameweek ${gw} — match-day summary: position, cash, team health, expected goals, clean sheets; PAY DAY announced (wages out, cash before → after)`);
    add(`Gameweek ${gw} — preview v ${opp}: them v you; ${PRE[k]} (one 1X2 line under the title, moving with your choices; each option shows xG both ways); Kick off; the pitch`);
    add(`Gameweek ${gw} — your 12:30 kick-off${gw===1?' (opening day)':gw===5?' (final day)':''}: "You should win / lose / Too close to call", them v you, commentary; half time: ${HT[k]}; "An upset!" if it goes against the odds`);
    add(`Gameweek ${gw} — the table; GATE RECEIPTS (cash in)`);
    add(`Gameweek ${gw} — the 3pm kick-offs, live; then the table now`);
  }
  else if(b==='end')add('The end — champions or your position; the final table');
  else add(NAME[b]||b);
}
console.log(`# Beat the Shark — pages (Beginner, Manager: five games)\n\nGenerated from the season plan by \`test/page-index.cjs\`. Refer to pages by number.\n\n${out.join('\n')}`);
