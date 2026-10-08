/* ===========================================================================
   world-cup/engine.js — the pool and the squad, shapes and slots, the
   five-a-side match, the tournament (groups, knockouts, extra time,
   penalties), incidents, money, and the Shark's forecast.

   No DOM in this file: the game (ui.js) and the checks drive the same code.
   =========================================================================== */

let S=null,SEED="";

/* ---- people (all invented) ------------------------------------------------ */
const GIVEN=["Mateo","Luka","Kofi","Arash","Diego","Jonas","Emre","Tomás","Yusuf","Nico","Rafael","Kenji","Oskar","Samir","Andrés",
  "Moussa","Iker","Pavel","Bruno","Ilias","Felipe","Dario","Hakim","Leon","Marco","Viktor","Elias","Joel","Omar","Santi"];
const FAMILY=["Ferreira","Okoro","Haddad","Lindqvist","Navarro","Kovač","Mensah","Petrescu","Alves","Demir","Ito","Moreau","Rossi",
  "Kowal","Benali","Sousa","Varga","Castillo","Nakamura","Brandt","Achterberg","Diallo","Ramírez","Novak","Silva","Torres","Yilmaz","Kader"];
const POS_NAME={GK:"Goalkeeper",DF:"Defender",MF:"Midfielder",FW:"Attacker"};

/* THE POOL OF TEN. Shaped so that the ten highest-rated are not the best
   seven: the second keeper is weaker but saves penalties, the star
   attacker is rusty and fragile, the versatile players cover two places.
   Ratings are relative to your nation's own strength. */
const POOL_SHAPE=[
  {pos:"GK",off:3,tag:"Number one"},
  {pos:"GK",off:-7,pen:.8,tag:"Saves penalties"},
  {pos:"DF",off:2,disc:.6,tag:"Hot-headed"},
  {pos:"DF",off:0,pos2:"MF",tag:"Plays midfield too"},
  {pos:"DF",off:-4},
  {pos:"MF",off:4,pens:.85,tag:"Penalty taker"},
  {pos:"MF",off:0,pos2:"FW",tag:"Plays up front too"},
  {pos:"FW",off:9,fragile:true,rusty:true,tag:"Star, short of games"},
  {pos:"FW",off:3},
  {pos:"FW",off:-3,young:true,tag:"Teenager"}
];
function makePool(base){
  const used=new Set();
  return POOL_SHAPE.map((sh,i)=>{
    let nm;do{nm=pick(GIVEN)+" "+pick(FAMILY)}while(used.has(nm));used.add(nm);
    return{id:i,nm,pos:sh.pos,pos2:sh.pos2||null,r:Math.round(base+sh.off+rnd(-2,2)),tag:sh.tag||"",
      disc:sh.disc||.15,pens:sh.pens||(sh.pos==="FW"?.75:.65),penSave:sh.pen||(sh.pos==="GK"?.25:0),
      fragile:!!sh.fragile,rusty:sh.rusty?2:0,cond:100,out:0,knock:false,yellows:0,ban:0,home:false,hurt:false};
  });
}
function ratingOfElo(elo){return 50+(elo-ELO_MID)/ELO_PER_POINT}
function eloOfRating(r){return ELO_MID+(r-50)*ELO_PER_POINT}

/* ---- the field --------------------------------------------------------------- */
function rankOf(n){return NATIONS.findIndex(x=>x.n===n)+1}
function eloOf(n){return n===S.me?S.myElo:(NATIONS.find(x=>x.n===n)||{elo:1700}).elo}
/* Beginner: eight nations. Your group: a stronger side, a similar one, a
   weaker one. The other group holds the favourite. Semi-finals, then the
   final, where the favourite is most likely waiting. */
function beginnerField(){
  const byRank=(a,b)=>NATIONS.slice(a-1,b).map(x=>x.n).filter(n=>n!==S.me);
  const used=new Set([S.me]);const take=(a,b)=>{const c=byRank(a,b).filter(n=>!used.has(n));const n=pick(c);used.add(n);return n};
  const weakA=take(33,48),simA=take(15,30),strongA=take(7,14);
  const fav=take(1,2),secondB=take(3,8),midB=take(15,30),weakB=take(33,48);
  return{groups:[[S.me,weakA,simA,strongA],[fav,secondB,midB,weakB]]};
}
/* Standard: 48 nations in four pots by Elo, hosts in pot 1, twelve groups. */
function fullField(){
  const names=NATIONS.map(x=>x.n);
  if(!names.includes(S.me))names[names.length-1]=S.me;
  const hosts=HOSTS.filter(h=>names.includes(h));
  const rest=names.filter(n=>!hosts.includes(n)).sort((a,b)=>eloOf(b)-eloOf(a));
  const ordered=hosts.concat(rest);
  const pots=[0,1,2,3].map(k=>ordered.slice(k*12,k*12+12));
  const groups=Array.from({length:12},()=>[]);
  pots.forEach(pot=>shuffle(pot).forEach((n,i)=>groups[i].push(n)));
  return{groups};
}

/* ---- slots, shapes and ratings ------------------------------------------------- */
function player(id){return S.pool[id]}
function effRating(p,slot){
  let r=p.r*(.7+.3*Math.max(CONDITION.floor,p.cond)/100)+S.morale*.3;
  if(p.hurt)r*=.85;
  if(p.rusty)r-=p.rusty*2;
  if(slot===p.pos)return r;
  if(slot==="GK")return r-OUT_OF_POSITION.inGoal;
  if(p.pos==="GK")return r-OUT_OF_POSITION.keeperOut;
  if(slot===p.pos2)return r-OUT_OF_POSITION.second;
  return r-OUT_OF_POSITION.other;
}
function oop(p,slot){return slot!==p.pos&&slot!==p.pos2}
/* The best way to put five players into a shape's slots (GK + four). */
function assign(ids,shape){
  const slots=["GK"].concat(SHAPES[shape].slots),ps=ids.map(player);
  let best=null,bv=-1e9;
  const perm=(arr,k,cur,used)=>{if(k===slots.length){
      const v=cur.reduce((s,p,i)=>s+(ATT_W[slots[i]]+DEF_W[slots[i]])*effRating(p,slots[i]),0);
      if(v>bv){bv=v;best=cur.slice()}return}
    for(let i=0;i<arr.length;i++)if(!used[i]){used[i]=true;cur.push(arr[i]);perm(arr,k+1,cur,used);cur.pop();used[i]=false}};
  perm(ps,0,[],[]);
  return best?best.map((p,i)=>({id:p.id,slot:slots[i]})):[];
}
function ratings(lineup){
  let att=0,def=0;
  lineup.forEach(({id,slot})=>{const e=effRating(player(id),slot);att+=ATT_W[slot]*e;def+=DEF_W[slot]*e});
  return{att:att/ATT_NORM,def:def/DEF_NORM};
}
function available(){return S.squad.map(player).filter(p=>!p.out&&!p.ban&&!p.home)}
/* Fewer than five fit to play: the FA flies in a stand-in (a weaker
   player, outfield; if there's no keeper someone goes in goal). */
function ensureFive(){const out=[];
  while(available().length<5){const id=S.pool.length,base=Math.round(ratingOfElo(S.myElo))-10;
    S.pool.push({id,nm:pick(GIVEN)+" "+pick(FAMILY),pos:"MF",pos2:null,r:base,tag:"Stand-in",disc:.15,pens:.6,penSave:0,fragile:false,rusty:0,
      cond:100,out:0,knock:false,yellows:0,ban:0,home:false,hurt:false,standIn:true});
    S.squad.push(id);out.push(S.pool[id])}
  return out}

/* ---- the match model ---------------------------------------------------------------- */
const pois=l=>{let L=Math.exp(-l),k=0,p=1;do{k++;p*=rng()}while(p>L);return k-1};
function lambdas(eloA,eloB,homeA,homeB){
  const base=IP1.mu+IP1.k_tournament,dA=ELO_SCALE*(eloA-eloB)/400;
  return[Math.exp(base+IP1.e*Math.abs(dA)+IP1.b*dA+(homeA?IP1.home:0))*FIVE_A_SIDE_GOALS,
         Math.exp(base+IP1.e*Math.abs(dA)-IP1.b*dA+(homeB?IP1.home:0))*FIVE_A_SIDE_GOALS];
}
/* Your rates against an opponent: your attack against their whole side for
   your goals, your defence for theirs. */
/* Your side's Elo for attack and for defence: your nation's Elo, plus the
   golden generation, plus how far the five on the pitch (in their slots,
   on their legs) sit above or below the squad's base rating. */
function myElo(r){return S.myElo+GOLDEN*ELO_PER_POINT+(r-S.base-GOLDEN)*MY_ELO_PER_POINT}
function myRates(lineup,opp){
  const r=ratings(lineup),oe=eloOf(opp),homeMe=HOSTS.includes(S.me),homeOpp=HOSTS.includes(opp);
  const[mine]=lambdas(myElo(r.att),oe,homeMe,homeOpp);
  const[,theirs]=lambdas(myElo(r.def),oe,homeMe,homeOpp);
  return[mine,theirs];
}
/* Win / draw / lose over the 40 minutes (knockouts: draws go on). */
function outcomeProbs(mine,theirs){
  const pm=k=>Math.exp(-mine)*Math.pow(mine,k)/fact(k),pt=k=>Math.exp(-theirs)*Math.pow(theirs,k)/fact(k);
  let w=0,d=0,l=0;for(let a=0;a<12;a++)for(let b=0;b<12;b++){const p=pm(a)*pt(b);if(a>b)w+=p;else if(a===b)d+=p;else l+=p}
  return{w,d,l};
}
const FACT=[1];function fact(k){while(FACT.length<=k)FACT.push(FACT[FACT.length-1]*FACT.length);return FACT[k]}
function simOther(a,b,ko){
  const[la,lb]=lambdas(eloOf(a),eloOf(b),HOSTS.includes(a),HOSTS.includes(b));
  let x=pois(la),y=pois(lb),pens=null;
  if(ko&&x===y){x+=pois(la*.25);y+=pois(lb*.25);if(x===y)pens=rng()<.5?a:b}
  return{a,b,x,y,pens};
}

/* ---- the competent manager (the Shark's assumption, and every default) ---- */
function bestShapeFor(ids,opp){
  let best="balanced",bv=-1e9;
  for(const k of Object.keys(SHAPES)){const[m,t]=myRates(assign(ids,k),opp);const p=outcomeProbs(m,t);const v=3*p.w+p.d;if(v>bv){bv=v;best=k}}
  return best;
}
/* Starters: the best five available (a keeper first), resting anyone worn
   out or carrying a knock when the bench has someone fit. */
function autoStarters(shape){
  const av=available().filter(p=>!p.knock||available().length<=5);
  const gks=av.filter(p=>p.pos==="GK").sort((a,b)=>effRating(b,"GK")-effRating(a,"GK"));
  const gk=gks[0]||av.slice().sort((a,b)=>a.r-b.r)[0];
  const rest=av.filter(p=>p!==gk).sort((a,b)=>effRating(b,b.pos)-effRating(a,a.pos));
  const out=rest.filter(p=>p.pos!=="GK").concat(rest.filter(p=>p.pos==="GK"));
  return[gk].concat(out.slice(0,4)).filter(Boolean).map(p=>p.id);
}

/* ---- the squad: the Shark's choice -------------------------------------------- *
   The best seven from the ten: every combination with a keeper, scored on
   the best shape's strength plus cover (a second keeper, a spare in each
   line) -- what a sensible manager weighs before a tournament. */
function squadScore(ids){
  const save=S.squad;S.squad=ids;
  const ps=ids.map(player);
  if(!ps.some(p=>p.pos==="GK")){S.squad=save;return-1e9}
  let top=-1e9;for(const k of Object.keys(SHAPES)){const r=ratings(assign(autoStartersFrom(ids,k),k));top=Math.max(top,r.att+r.def)}
  const cover=(ps.filter(p=>p.pos==="GK").length>1?3:0)+["DF","MF","FW"].reduce((s,pos)=>s+(ps.filter(p=>p.pos===pos||p.pos2===pos).length>1?1.5:0),0)
    -ps.filter(p=>p.fragile).length*1.5;
  S.squad=save;return top+cover;
}
function autoStartersFrom(ids,shape){const save=S.squad;S.squad=ids;const r=autoStarters(shape);S.squad=save;return r}
function combos(n,k){const out=[];const go=(s,cur)=>{if(cur.length===k){out.push(cur.slice());return}for(let i=s;i<n;i++){cur.push(i);go(i+1,cur);cur.pop()}};go(0,[]);return out}
/* The shortlist by that score, then the best of it by simulation. */
function sharkSquad(){
  const ranked=combos(10,7).map(c=>({c,v:squadScore(c)})).filter(x=>x.v>-1e8).sort((a,b)=>b.v-a.v).slice(0,6);
  const runs=typeof SHARK_PICK_RUNS==="number"?SHARK_PICK_RUNS:80;
  let best=ranked[0].c,bv=-1;
  for(const{c}of ranked){const fc=forecast(c,runs);const v=STAGES.reduce((s,k,i)=>s+i*(fc[k]||0),0);if(v>bv){bv=v;best=c}}
  return best;
}
function topRatedSquad(){return S.pool.slice().sort((a,b)=>b.r-a.r).slice(0,7).map(p=>p.id)}

/* ---- the tournament -------------------------------------------------------------------- */
function groupTable(g,res){
  const t={};g.forEach(n=>t[n]={n,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0});
  res.forEach(m=>{const A=t[m.a],B=t[m.b];if(!A||!B)return;A.p++;B.p++;A.gf+=m.x;A.ga+=m.y;B.gf+=m.y;B.ga+=m.x;
    if(m.x>m.y){A.w++;B.l++;A.pts+=3}else if(m.x<m.y){B.w++;A.l++;B.pts+=3}else{A.d++;B.d++;A.pts++;B.pts++}});
  return Object.values(t).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||eloOf(b.n)-eloOf(a.n));
}
/* Group fixtures in three rounds; your own in order weakest, similar, strongest. */
function groupRounds(g){
  if(g.includes(S.me)){const o=g.filter(n=>n!==S.me).sort((a,b)=>eloOf(a)-eloOf(b));const others=k=>o.filter((_,i)=>i!==k);
    return[0,1,2].map(k=>[[S.me,o[k]],others(k)])}
  return[[[g[0],g[3]],[g[1],g[2]]],[[g[0],g[2]],[g[1],g[3]]],[[g[0],g[1]],[g[2],g[3]]]];
}
function newTournament(){
  const f=S.field;
  return{groups:f.groups.map(g=>g.slice()),res:[],stage:"group",round:0,ko:[],koRound:0,koNames:[],exit:null,champion:null,koRes:[]};
}
const KO_NAMES={32:"Round of 32",16:"Round of 16",8:"Quarter-final",4:"Semi-final",2:"Final"};
function myGroup(){return S.t.groups.find(g=>g.includes(S.me))}
/* Your next opponent, or null when your tournament is over. */
function nextOpponent(){
  const t=S.t;if(t.exit||t.champion)return null;
  if(t.stage==="group"){const r=groupRounds(myGroup())[t.round];return r[0].find(n=>n!==S.me)}
  const pair=t.ko.find(p=>p.includes(S.me));return pair?pair.find(n=>n!==S.me):null;
}
function stageName(){const t=S.t;return t.stage==="group"?`Group match ${t.round+1} of 3`:KO_NAMES[t.ko.length*2]}
function isKnockout(){return S.t.stage==="ko"}
/* Everything else in this round, then the round moves on. */
function playRoundOthers(myRes){
  const t=S.t,out=[];
  if(t.stage==="group"){
    t.groups.forEach(g=>{const rr=groupRounds(g)[t.round];
      (g.includes(S.me)?[rr[1]]:rr).forEach(pair=>{if(pair.length<2)return;const[a,b]=pair;const m=simOther(a,b,false);t.res.push(m);out.push(m)})});
    t.res.push(myRes);t.round++;
    if(t.round===3){S.pool.forEach(p=>p.yellows=0);startKnockouts()}
  }else{
    const winners=[];
    t.ko.forEach(([a,b])=>{if(a===S.me||b===S.me){winners.push(myRes.winner);t.koRes.push(myRes);return}
      const m=simOther(a,b,true);m.winner=m.x>m.y?a:m.x<m.y?b:m.pens;t.koRes.push(m);out.push(m);winners.push(m.winner)});
    if(!winners.includes(S.me)&&!t.exit)t.exit=KO_NAMES[t.ko.length*2];
    if(winners.length===1){t.champion=winners[0];t.ko=[]}
    else t.ko=reseed(winners);
  }
  return out;
}
/* Knockouts are reseeded each round, best against worst, so the strongest
   sides meet late and the final boss tends to be waiting at the end. */
function seedOf(n){return S.t.seeds?S.t.seeds.indexOf(n):0}
function reseed(list){const s=list.slice().sort((a,b)=>seedOf(a)-seedOf(b));const out=[];while(s.length)out.push([s.shift(),s.pop()]);return out}
function startKnockouts(){
  const t=S.t,tables=t.groups.map(g=>groupTable(g,t.res));
  let q;
  if(S.level==="beginner"){q=[tables[0][0].n,tables[1][0].n,tables[1][1].n,tables[0][1].n];
    t.seeds=q;t.ko=[[q[0],q[2]],[q[1],q[3]]]}
  else{const firsts=tables.map(x=>x[0]),seconds=tables.map(x=>x[1]),
      thirds=tables.map(x=>x[2]).sort((a,b)=>b.pts-a.pts||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf).slice(0,8);
    const rank=a=>a.slice().sort((x,y)=>y.pts-x.pts||(y.gf-y.ga)-(x.gf-x.ga)||y.gf-x.gf||eloOf(y.n)-eloOf(x.n)).map(x=>x.n);
    q=rank(firsts).concat(rank(seconds),rank(thirds));t.seeds=q;t.ko=reseed(q)}
  t.stage="ko";
  if(!q.includes(S.me))t.exit="Group stage";
}
/* Play out the rest of the tournament without you (after an exit or a sacking). */
function finishTournament(){
  let guard=0;while(!S.t.champion&&guard++<20){
    if(S.t.stage==="group"&&nextOpponent()){const opp=nextOpponent(),m=simOther(S.me,opp,false);playRoundOthers(m);continue}
    if(S.t.stage==="ko"&&S.t.ko.some(p=>p.includes(S.me))){const opp=nextOpponent(),m=simOther(S.me,opp,true);m.winner=m.x>m.y?S.me:m.x<m.y?opp:m.pens;playRoundOthers(m);continue}
    playRoundOthers(null);
  }
}

/* ---- your match ---------------------------------------------------------------------- *
   Built step by step so the game can stop for decisions: half time, extra
   time, the shootout. Events have minutes for the vidiprinter. */
function newMatch(opp,shape,starters){
  const m={opp,shape,starters:starters.slice(),lineup:assign(starters,shape),my:0,th:0,ev:[],half:1,ko:isKnockout(),over:false,et:false,pens:null};
  return m;
}
function playPeriod(m,from,to,share){
  const[lm,lt]=myRates(m.lineup,m.opp);
  const g1=pois(lm*share),g2=pois(lt*share),evs=[];
  for(let i=0;i<g1;i++)evs.push({min:rnd(from,to),type:"goal",mine:true,who:scorer(m)});
  for(let i=0;i<g2;i++)evs.push({min:rnd(from,to),type:"goal",mine:false});
  // cards: each starter, once per half
  m.lineup.forEach(({id})=>{const p=player(id);if(rng()<(INCIDENTS.yellow+p.disc*INCIDENTS.disciplineYellow)*share){
      evs.push({min:rnd(from,to),type:"yellow",id})}});
  evs.sort((a,b)=>a.min-b.min);
  evs.forEach(e=>{if(e.type==="goal"){if(e.mine)m.my++;else m.th++}
    if(e.type==="yellow"){const p=player(e.id);p.yellows++;e.second=p.yellows>=2}});
  m.ev.push(...evs);
  return evs;
}
function scorer(m){
  const ws=m.lineup.map(({id,slot})=>({id,w:ATT_W[slot]*Math.max(1,effRating(player(id),slot))}));
  const tot=ws.reduce((s,x)=>s+x.w,0);let x=rng()*tot;for(const o of ws){x-=o.w;if(x<=0)return o.id}return ws[0].id;
}
function changeShape(m,shape,starters){m.shape=shape;if(starters)m.starters=starters.slice();m.lineup=assign(m.starters,shape)}
/* Half-time options: the three shapes with the same five, and fresh legs
   (the best bench player for the most tired starter). */
function halfOptions(m){
  const o=Object.keys(SHAPES).map(k=>({id:"shape:"+k,t:SHAPES[k].name,d:k===m.shape?"Same shape":SHAPES[k].d,shape:k,starters:m.starters}));
  const bench=available().filter(p=>!m.starters.includes(p.id)&&p.pos!=="GK");
  if(bench.length){const tired=m.starters.map(player).filter(p=>p.pos!=="GK").sort((a,b)=>a.cond-b.cond)[0];
    const fresh=bench.sort((a,b)=>effRating(b,b.pos)-effRating(a,a.pos))[0];
    if(tired&&fresh)o.push({id:"sub",t:`Bring on ${fresh.nm}`,d:`For ${tired.nm}`,shape:m.shape,starters:m.starters.map(x=>x===tired.id?fresh.id:x)})}
  return o;
}
/* Win chance from here: the second half (and in a knockout, extra time and
   penalties) played out many times. Sandboxed: looking changes nothing. */
function winFromHalf(m,opt,n=MC){
  return sandbox(()=>{const save=m.lineup;const lu=assign(opt.starters,opt.shape);const[lm,lt]=myRates(lu,m.opp);
    let w=0;for(let k=0;k<n;k++){let a=m.my+pois(lm/2),b=m.th+pois(lt/2);
      if(m.ko&&a===b){a+=pois(lm*.25);b+=pois(lt*.25);if(a===b){w+=.5;continue}}
      w+=a>b?1:a===b?.5:0}
    m.lineup=save;return w/n},SEED+"|ht|"+S.played);
}
const MC=typeof MC_SIMS==="number"?MC_SIMS:500;
/* Penalties: three each, then sudden death. A taker scores at his penalty
   skill, less when tired; the keeper saves at his penalty-saving skill. */
function shootoutOptions(m){
  const on=m.starters.map(player).filter(p=>p.pos!=="GK"||m.starters.length<2),gk=m.starters.map(player).find(p=>p.pos==="GK");
  const best=on.slice().sort((a,b)=>b.pens-a.pens).slice(0,3).map(p=>p.id);
  const fresh=on.slice().sort((a,b)=>b.cond-a.cond).slice(0,3).map(p=>p.id);
  const opts=[{id:"best",t:"Your best penalty takers",d:best.map(i=>player(i).nm).join(", "),takers:best,keeper:gk&&gk.id}];
  if(fresh.join()!==best.join())opts.push({id:"fresh",t:"Your freshest legs",d:fresh.map(i=>player(i).nm).join(", "),takers:fresh,keeper:gk&&gk.id});
  const saver=available().find(p=>p.pos==="GK"&&!m.starters.includes(p.id)&&gk&&p.penSave>gk.penSave);
  if(saver)opts.push({id:"saver",t:`Bring on ${saver.nm} for the shootout`,d:"He saves penalties",takers:best,keeper:saver.id});
  return opts;
}
function penScore(id){const p=player(id);return clamp(p.pens-(100-p.cond)/400,.4,.95)}
function shootout(opt,oppElo){
  const kp=opt.keeper!=null?player(opt.keeper).penSave:.2,theirP=clamp(.74+(oppElo-1850)/4000,.6,.85);
  let a=0,b=0,i=0;
  const ours=i=>rng()<penScore(opt.takers[i%opt.takers.length])*(1-.25*.35),theirs=()=>rng()<theirP*(1-kp*.35);
  for(;i<3;i++){if(ours(i))a++;if(theirs())b++}
  while(a===b&&i<20){if(ours(i))a++;if(theirs())b++;i++}
  return{a,b,won:a>b};
}
function shootoutWin(opt,oppElo,n=MC){return sandbox(()=>{let w=0;for(let k=0;k<n;k++)if(shootout(opt,oppElo).won)w++;return w/n},SEED+"|pens|"+S.played)}

/* After your match: condition, bans, injuries, knocks. Returns the news. */
function afterMatch(m){
  const news=[],played=new Set(m.starters);
  S.squad.forEach(id=>{const p=player(id);
    if(p.ban>0&&!played.has(id))p.ban--;
    if(p.out>0)p.out--;
    p.hurt=false;
    if(played.has(id)){const k=p.pos==="GK"?.4:1;p.cond=Math.max(CONDITION.floor,p.cond-k*(CONDITION.match+(m.et?CONDITION.extra:0))+S.recovery);if(p.rusty)p.rusty--;}
    else p.cond=Math.min(100,p.cond+CONDITION.rest+S.recovery);
    p.knock=false});
  m.ev.filter(e=>e.type==="yellow"&&e.second).forEach(e=>{const p=player(e.id);if(!p.ban){p.ban=1;p.yellows=0;news.push({type:"ban",id:p.id})}});
  const starters=m.starters.map(player);
  if(rng()<INCIDENTS.injury){const p=pick(starters);const fr=p.fragile?2:1;p.out=Math.min(2,rnd(1,fr+1));news.push({type:"injury",id:p.id,games:p.out})}
  if(rng()<INCIDENTS.knock){const c=starters.filter(p=>!p.out);if(c.length){const p=pick(c);p.knock=true;news.push({type:"knock",id:p.id})}}
  return news;
}

/* ---- money (GBP m) -------------------------------------------------------------- */
function money(v,signed){const a=Math.abs(Math.round(v*10)/10);return(v<0?"−":signed?"+":"")+"£"+a+"m"}
function payCamp(){S.bills=S.bills||{};if(S.bills[S.played])return S.bills[S.played];
  const before=S.cash,card=BILL_CARDS[Math.floor(rng()*BILL_CARDS.length)];S.cash+=card.v-S.camp;
  return S.bills[S.played]={before,camp:S.camp,card,after:S.cash}}
function prizeMoney(res,newRound){const p=MONEY.prize[res]+S.bonusPerWin*(res==="w"?-1:0)+(newRound?MONEY.round:0);S.cash+=p;return p}
function cashCheck(){if(S.cash<MONEY.sackedBelow){S.alive=false;S.sacked=true;return"sacked"}return S.cash<0&&S.squad.filter(id=>!player(id).home).length>5?"home":null}
function sendHome(id){const p=player(id);p.home=true;S.camp=Math.max(1,S.camp-.15);S.cash+=MONEY.sendHomeSaving;S.sentHome.push(p.nm);return p}

/* ---- effects: only money is shown (as in the football and NFL games) ------- */
function apply(fx){
  if(!fx)return[];const tags=[];
  if(fx.morale)S.morale=clamp(S.morale+fx.morale,-10,10);
  if(fx.cond)S.squad.forEach(id=>{const p=player(id);p.cond=clamp(p.cond+fx.cond,CONDITION.floor,100)});
  if(fx.recovery)S.recovery+=fx.recovery;
  if(fx.cash){S.cash+=fx.cash;tags.push([fx.cash>0,`Cash ${money(fx.cash,true)}`])}
  if(fx.camp){S.camp+=fx.camp;tags.push([fx.camp<0,`Camp costs ${money(fx.camp,true)} a match`])}
  if(fx.bonus){S.bonusPerWin+=fx.bonus;tags.push([false,`Win bonus ${money(fx.bonus)} a win`])}
  if(fx.heal)S.squad.forEach(id=>{const p=player(id);p.out=0;p.knock=false});
  return tags;
}

/* ---- the season's state --------------------------------------------------------------- */
/* nation: the one you chose (Chris, 7 Oct 2026: its real strength is the
   difficulty). Without one (the checks, a shared tournament code), one is
   drawn from MY_RANKS. */
function newSeason(level,seed,nation){
  SEED=seed||("WC-"+Math.random().toString(36).slice(2,7).toUpperCase());
  R.s=hashSeed(SEED);
  const pool=NATIONS.slice(MY_RANKS[0]-1,MY_RANKS[1]);const drawn=pick(pool),me=NATIONS.find(x=>x.n===nation)||drawn;
  S={level,me:me.n,myElo:me.elo,pool:null,squad:[],cash:MONEY.start,camp:MONEY.camp,bonusPerWin:0,morale:0,recovery:0,
    played:0,alive:true,sacked:false,sentHome:[],t:null,record:{w:0,d:0,l:0},calls:{shape:[]},shark:null};
  S.base=Math.round(ratingOfElo(me.elo));S.pool=makePool(S.base+GOLDEN);
  S.field=S.level==="beginner"?beginnerField():fullField();
  S.t=newTournament();
  return S;
}
/* The Shark's forecast for a squad: many tournaments with a competent
   manager. Sandboxed. Returns the chance of each finish. */
const STAGES=["Group stage","Round of 32","Round of 16","Quarter-final","Semi-final","Final","Champions"];
function forecast(squad,runs){
  return sandbox(()=>{
    const snap=JSON.stringify(S),out={};STAGES.forEach(s=>out[s]=0);let favWins=0;
    for(let r=0;r<runs;r++){S=JSON.parse(snap);S.squad=squad.slice();S.t=newTournament();
      while(!S.t.champion&&S.t.stage!=="done"){const opp=nextOpponent();
        if(!opp){finishTournament();break}
        ensureFive();
        const shape=bestShapeFor(autoStarters("balanced"),opp),st=autoStarters(shape),m=newMatch(opp,shape,st);
        playPeriod(m,1,40,1);
        let res;if(m.ko&&m.my===m.th){m.et=true;playPeriod(m,41,50,.25);
          if(m.my===m.th){const o=shootoutOptions(m)[0];res=shootout(o,eloOf(opp)).won?S.me:opp}}
        const winner=res||(m.my>m.th?S.me:m.my<m.th?opp:null);
        afterMatch(m);
        playRoundOthers({a:S.me,b:opp,x:m.my,y:m.th,winner});
      }
      const st=S.t.champion===S.me?"Champions":S.t.exit==="Final"?"Final":S.t.exit||"Champions";
      out[st]=(out[st]||0)+1;if(S.t.champion===NATIONS[0].n)favWins++;
    }
    S=JSON.parse(snap);
    for(const k in out)out[k]/=runs;out.fav=favWins/runs;return out;
  },SEED+"|forecast");
}
/* The likeliest finish, as a phrase. */
function likeliest(fc){return STAGES.reduce((a,b)=>fc[b]>fc[a]?b:a)}
function reachChance(fc,stage){const i=STAGES.indexOf(stage);return STAGES.slice(i).reduce((s,k)=>s+(fc[k]||0),0)}
function unlocked(f){return S.played>=LEVELS[S.level].unlock[f]}
