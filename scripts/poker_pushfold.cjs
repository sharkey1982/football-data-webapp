/* ===========================================================================
   scripts/poker_pushfold.cjs — the heads-up push/fold Nash equilibrium for
   the Pre-flop trainer (games/beat-the-shark/poker/pushfold-data.js).

   The game: heads-up, no antes, effective stack S big blinds (before the
   blinds). The small blind (0.5) shoves all in or folds; the big blind (1)
   calls or folds. Nothing else, so the equilibrium can be solved exactly
   given each starting hand's equity against each other.

     1. The 169 starting hands (pairs, suited, offsuit) and their combos.
     2. Equity of every hand against every other, averaged over the combo
        pairs that can be dealt together (card removal), each by a seeded
        Monte Carlo of SAMPLES boards; and how many such combo pairs there
        are (the weight).
     3. For each stack from 1 to 25 big blinds in steps of 0.1: fictitious
        play (best responses, averaged) until the shove and call ranges
        settle. A hand's threshold is the largest stack it is shoved (or
        called) with: the published charts' form.
     4. For the game's stacks (every half big blind, 1.5–20): the value in big
        blinds of shoving and of calling each hand against the other side's
        equilibrium range.

   Checked in the poker checks against HoldemResources' published heads-up
   no-ante table (K2o shoved to 11.6, K9o called to 17.1, ...).

   Run (a few minutes):  node scripts/poker_pushfold.cjs [samples]
   =========================================================================== */
const fs=require('fs'),path=require('path'),vm=require('vm');
const DIR=path.join(__dirname,'..','games','beat-the-shark','poker');
const SAMPLES=+process.argv[2]||4000;
global.document={getElementById:()=>({style:{}}),querySelectorAll:()=>[]};
for(const f of['../shared/core.js','cards.js','quiz.js','outs.js','equity.js'])vm.runInThisContext(fs.readFileSync(path.join(DIR,f),'utf8'),{filename:f});

/* ---- 1. the 169 hands --------------------------------------------------------- */
const RK="..23456789TJQKA";
const HANDS=[];   // {name, hi, lo, suited, pair, combos:[[c1,c2]...]}
for(let hi=14;hi>=2;hi--)for(let lo=hi;lo>=2;lo--){
  if(hi===lo){const combos=[];for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)combos.push([{r:hi,s:a},{r:hi,s:b}]);HANDS.push({name:RK[hi]+RK[lo],hi,lo,pair:true,suited:false,combos});continue}
  const s=[],o=[];for(let a=0;a<4;a++)for(let b=0;b<4;b++)(a===b?s:o).push([{r:hi,s:a},{r:lo,s:b}]);
  HANDS.push({name:RK[hi]+RK[lo]+"s",hi,lo,pair:false,suited:true,combos:s});
  HANDS.push({name:RK[hi]+RK[lo]+"o",hi,lo,pair:false,suited:false,combos:o});
}
const N=HANDS.length;
const key=c=>c.r*4+c.s,overlap=(x,y)=>key(x[0])===key(y[0])||key(x[0])===key(y[1])||key(x[1])===key(y[0])||key(x[1])===key(y[1]);

/* ---- 2. equity and weights ----------------------------------------------------- */
let seed=0x9e3779b9;const rand=()=>{seed^=seed<<13;seed>>>=0;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;return seed/4294967296};
const DECK=pkDeck();
const E=Array.from({length:N},()=>new Float64Array(N)),W=Array.from({length:N},()=>new Float64Array(N));
const cache=path.join(require('os').tmpdir(),'pushfold-equity-'+SAMPLES+'.json');
if(fs.existsSync(cache)){const c=JSON.parse(fs.readFileSync(cache,'utf8'));for(let i=0;i<N;i++){E[i].set(c.E[i]);W[i].set(c.W[i])}console.log("equity from cache")}
else{
  const t0=Date.now();
  for(let i=0;i<N;i++){for(let j=i;j<N;j++){
    let w=0;for(const x of HANDS[i].combos)for(const y of HANDS[j].combos)if(!overlap(x,y))w++;
    W[i][j]=W[j][i]=w;
    let win=0,tie=0;
    for(let k=0;k<SAMPLES;k++){
      let x,y;do{x=HANDS[i].combos[Math.floor(rand()*HANDS[i].combos.length)];y=HANDS[j].combos[Math.floor(rand()*HANDS[j].combos.length)]}while(overlap(x,y));
      const used=new Set([key(x[0]),key(x[1]),key(y[0]),key(y[1])]),d=DECK.filter(c=>!used.has(key(c)));
      for(let m=0;m<5;m++){const n=m+Math.floor(rand()*(d.length-m));const t=d[m];d[m]=d[n];d[n]=t}
      const bd=d.slice(0,5),a=eval7(x.concat(bd)),b=eval7(y.concat(bd));if(a>b)win++;else if(a===b)tie++;
    }
    E[i][j]=(win+tie/2)/SAMPLES;E[j][i]=1-E[i][j];
  }if(i%20===0)console.log(`equity: ${i}/${N} hands, ${((Date.now()-t0)/1000).toFixed(0)}s`)}
  fs.writeFileSync(cache,JSON.stringify({E:E.map(r=>Array.from(r)),W:W.map(r=>Array.from(r))}));
}

/* ---- 3. the equilibrium at a stack ------------------------------------------------ */
/* Values in big blinds, relative to the stack before the blinds. */
function pushValue(i,S,call){let num=0,den=0;for(let j=0;j<N;j++){const w=W[i][j];den+=w;num+=w*((1-call[j])*1+call[j]*(E[i][j]*2*S-S))}return num/den}
function callValue(j,S,push){let num=0,den=0;for(let i=0;i<N;i++){const w=W[j][i]*push[i];den+=w;num+=w*(E[j][i]*2*S-S)}return den?num/den:-1}
function solve(S,iters){
  const push=new Float64Array(N).fill(1),call=new Float64Array(N).fill(.5);
  for(let t=1;t<=iters;t++){
    const a=1/(t+1);
    for(let i=0;i<N;i++){const br=pushValue(i,S,call)>-.5?1:0;push[i]+=a*(br-push[i])}
    for(let j=0;j<N;j++){const br=callValue(j,S,push)>-1?1:0;call[j]+=a*(br-call[j])}
  }
  return{push,call};
}
const STEP=.1,MAXS=25;
const pushTo=new Float64Array(N),callTo=new Float64Array(N);
const t1=Date.now();
for(let k=Math.round(1/STEP);k<=Math.round(MAXS/STEP);k++){const S=k*STEP,{push,call}=solve(S,400);
  for(let i=0;i<N;i++){if(push[i]>=.5)pushTo[i]=S;if(call[i]>=.5)callTo[i]=S}
  if(k%50===0)console.log(`equilibrium: ${S.toFixed(1)} bb, ${((Date.now()-t1)/1000).toFixed(0)}s`)}

/* ---- 4. the game's stacks: the value of each choice ------------------------------- */
const STACKS=[];for(let S=1.5;S<=20;S+=.5)STACKS.push(S);   // half big blinds, for the match (preflop/ranges questions use the whole ones)
const EV={};
for(const S of STACKS){const{push,call}=solve(S,600);
  EV[S]={shove:HANDS.map((_,i)=>+pushValue(i,S,call).toFixed(3)),call:HANDS.map((_,j)=>+callValue(j,S,push).toFixed(3)),
    shoveShare:+(HANDS.reduce((a,h,i)=>a+h.combos.length*push[i],0)/1326).toFixed(3),callShare:+(HANDS.reduce((a,h,j)=>a+h.combos.length*call[j],0)/1326).toFixed(3)}}

const r1=x=>Math.round(x*10)/10;
const out=`/* Generated by scripts/poker_pushfold.cjs (${SAMPLES} boards per matchup) -- do not edit by hand.
   Heads-up push/fold, no antes, the Nash equilibrium.
   PF_HANDS: the 169 starting hands, strongest pairs first, then by ranks.
   PF_SHOVE_TO / PF_CALL_TO: the largest stack (big blinds, before the
   blinds) at which the small blind shoves / the big blind calls; 25 = 25+.
   PF_EV[S]: at a stack of S big blinds (1.5 to 20 in halves), the value (big blinds) of shoving
   each hand from the small blind against the equilibrium calling range
   (folding is worth -0.5), and of calling each hand in the big blind
   against the equilibrium shoving range (folding is worth -1); and the
   share of all hands shoved / called. */
const PF_HANDS=${JSON.stringify(HANDS.map(h=>h.name))};
const PF_SHOVE_TO=${JSON.stringify(Array.from(pushTo,r1))};
const PF_CALL_TO=${JSON.stringify(Array.from(callTo,r1))};
const PF_EV=${JSON.stringify(EV)};
`;
fs.writeFileSync(path.join(DIR,'pushfold-data.js'),out);
console.log(`wrote pushfold-data.js (${(out.length/1024).toFixed(0)} KB)`);
const show=n=>{const i=HANDS.findIndex(h=>h.name===n);return`${n} shove ${r1(pushTo[i])} call ${r1(callTo[i])}`};
console.log(["72o","32o","K2o","Q2o","J2o","T2o","T5o","J5o","K2s","Q2s","A2o","22","K9o","Q9o","J9o","T9o"].map(show).join("\n"));
