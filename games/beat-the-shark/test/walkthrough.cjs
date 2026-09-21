// ============================================================================
// FULL WALKTHROUGH -- the game as a player meets it.
//
// Added after a player-facing error slipped through (2026-09-21): the Shark's
// prediction said 1st on the pre-season screen while the opening said 3rd.
// Every other check tested pieces in isolation, or the simulator's own
// start-up -- which runs in a different order from the game's. This plays
// every level and both roles through whole seasons, screen by screen, via
// the game's own start-up, and fails on:
//   - any crash;
//   - broken text on any screen (undefined, NaN, [object..., null, "0th"...);
//   - contradictions ACROSS pages (opening vs pre-season vs the model);
//   - the Shark predicting anything but 3rd (the design).
// Proven to catch the original bug: run against the unfixed code it
// reported "opening says 3rd, pre-season says 1st" 18 times.
// ============================================================================
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
const txt=h=>String(h||'').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/g,' ').replace(/\s+/g,' ').trim();
const BAD=/\bundefined\b|\bNaN\b|\[object|\bnull\b|Infinity|\b0th\b|\b-?\d+th\b(?<!1[123]th)(?=)|£NaN|\$\{/;
const problems=[];const crashes=[];
const scan=(where,h)=>{const t=txt(h);
  for(const re of [/\bundefined\b/,/\bNaN\b/,/\[object/,/\bnull\b/,/Infinity/,/\b0th\b/,/\$\{/])if(re.test(t)){const i=t.search(re);problems.push(`${where}: "…${t.slice(Math.max(0,i-50),i+40)}…"`)}
  const preds=[...t.matchAll(/The Shark predict(?:s|ed) (\w+)/g)].map(m=>m[1]);if(new Set(preds).size>1)problems.push(`${where}: two different predictions (${preds.join(', ')})`)};
for(const lvl of ['beginner','intermediate','guru'])for(const role of ['manager','owner']){
  for(const seed of ['SOC-S07','SOC-S21','SOC-S42']){
  try{run(`SEED="${seed}";LEVEL="${lvl}";chooseRole()`);scan(`${lvl}/${role} opening`,els.app.innerHTML);
      const openClaim=(txt(els.app.innerHTML).match(/The Shark predicts (\w+)/)||[])[1];
      run(`ROLE=ROLES.${role};boot()`);scan(`${lvl}/${role} pre-season`,els.app.innerHTML+els.hScore.innerHTML+els.hTwo.innerHTML);
      // ACROSS PAGES: what the opening promises, what pre-season shows, and what the model says must agree.
      // The prediction is shown on the Your Team page (after the league page).
      if(els.go&&typeof els.go.onclick==='function'&&/THE LEAGUE/.test(els.app.innerHTML)){els.go.onclick();scan(`${lvl}/${role} your team`,els.app.innerHTML)}
      const preClaim=(txt(els.app.innerHTML).match(/(\d+(?:st|nd|rd|th)) Expected finish/)||[])[1],model=run('ord(sharkPos())');
      // The design: the Shark predicts 3rd (Chris). Close to the top, but 3rd.
      if(model!=="3rd")problems.push(`${lvl}/${role}/${seed}: the Shark predicts ${model}, not 3rd`);
      if(!preClaim)problems.push(`${lvl}/${role}/${seed}: the Your Team page shows no expected finish`);
      if((openClaim&&openClaim!==preClaim)||(preClaim&&preClaim!==model))problems.push(`${lvl}/${role}/${seed}: opening says ${openClaim}, pre-season says ${preClaim}, model says ${model}`);}
  catch(e){crashes.push(`${lvl}/${role}/${seed} start: ${e.message}`);continue}
  const plan=run('PLAN');
  for(let i=0;i<plan.length;i++){
    delete els.ch;
    try{run(`cursor=${i};S.pendingOppFm=null;S._sheetShown=false;step()`)}catch(e){crashes.push(`${lvl}/${role}/${seed} step ${i} ${plan[i]}: ${e.message}`);continue}
    const settle=()=>{for(let k=0;k<400&&q.length;k++){try{q.shift()()}catch(e){crashes.push(`${lvl}/${role}/${seed} ${plan[i]} (timer): ${e.message}`)}}};
    settle();scan(`${lvl}/${role} ${plan[i]}`,els.app.innerHTML+els.hScore.innerHTML+els.hTwo.innerHTML+(els.ch?els.ch.children.map(c=>c.innerHTML||'').join(' '):''));
    // take the first choice on decision screens, so outcome screens are checked too
    if(els.ch&&els.ch.children.length&&typeof els.ch.children[0].onclick==='function'){try{els.ch.children[0].onclick();settle();scan(`${lvl}/${role} ${plan[i]} (outcome)`,els.app.innerHTML)}catch(e){crashes.push(`${lvl}/${role}/${seed} ${plan[i]} choice: ${e.message}`)}}
    for(const b of ['kick','subNo','goSecond','toTable','toOthers']){const e=els[b];if(!e||typeof e.onclick!=='function')continue;
      try{e.onclick();settle();scan(`${lvl}/${role} ${plan[i]} → ${b}`,els.app.innerHTML+els.hScore.innerHTML+els.hTwo.innerHTML)}catch(x){crashes.push(`${lvl}/${role}/${seed} ${plan[i]} → ${b}: ${x.message}`)};els[b]=undefined}
  }
  try{run('S.mw=MW;renderEnding()');scan(`${lvl}/${role} ending`,els.app.innerHTML)}catch(e){crashes.push(`${lvl}/${role}/${seed} ending: ${e.message}`)}
  }
}
const uniq=a=>[...new Set(a)];
console.log(`CRASHES: ${uniq(crashes).length}`);uniq(crashes).slice(0,15).forEach(c=>console.log('  ',c));
console.log(`BROKEN TEXT / CONTRADICTIONS: ${uniq(problems).length}`);uniq(problems).slice(0,25).forEach(p=>console.log('  ',p));
const ok=!crashes.length&&!problems.length;
console.log(ok?"WALKTHROUGH PASSED":"WALKTHROUGH FAILED");
process.exit(ok?0:1);
