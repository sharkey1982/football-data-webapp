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
run(`SEED="SOC-S07";LEVEL="beginner";ROLE=ROLES.manager;boot()`);
const plan=run('PLAN');const out=[];let n=0,gw=0;
const add=(t)=>out.push(`${String(++n).padStart(2)}. ${t}`);
add('Opening — "Your mission: Win the league!"; level; Manager / Owner');
add('The league — predicted finishing positions; Begin');
add('Your team — expected finish, bank balance; goals-for rank, clean-sheet rank, team health, squad quality');
const NAME={special1:'A bid arrives — keep or sell your best player',heatmap:'Your next five fixtures (heat map)',presser:'Press conference (story)',
  crisis:'Cash crisis — sell a striker or a defender',physio:'The physio room',papers:'The Sunday papers',event:'A story decision',podcast:'The podcast clip',
  special2:'January window, then the winter break',stats:'Halfway: the numbers',luck:'A stroke of luck (or not)',call:'A phone call'};
for(const b of plan){
  if(b==='match'||b==='live'){
    gw++;
    if(gw>1)add(`Gameweek ${gw} — match-day summary: position, cash, team health, expected goals, clean sheets`);
    if(b==='match')add(`Gameweek ${gw} — preview: them v you, ${gw===2?'the shape choice (compact is right v the strongest club)':'one decision'}, Kick off, the pitch`);
    else add(`Gameweek ${gw} — preview: them v you, Kick off`);
    add(`Gameweek ${gw} — your 12:30 kick-off${gw===1?' (opening day)':''}: commentary${gw===2?'; half time: keep your tiring star, or bring on a fresher player':b==='live'?"; half-time dilemma if someone's tiring":''}`);
    add(`Gameweek ${gw} — the table`);
    add(`Gameweek ${gw} — the 3pm kick-offs, live; then the table now`);
  }
  else if(b==='end')add('The end — champions or your position; the final table');
  else add(NAME[b]||b);
}
console.log(`# Beat the Shark — pages (Beginner, Manager)\n\nGenerated from the season plan by \`test/page-index.cjs\`. Refer to pages by number.\n\n${out.join('\n')}`);
