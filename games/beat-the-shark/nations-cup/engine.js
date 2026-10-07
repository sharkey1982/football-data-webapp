/* ===========================================================================
   nations-cup/engine.js — the players, the line-up, the match model (game by
   game, set by set), the tie, the draw, incidents, money and the Shark's
   forecast.

   No DOM in this file: the game (ui.js) and the checks drive the same code.
   =========================================================================== */

let S=null,SEED="";

/* ---- people (all invented) -------------------------------------------------- */
const GIVEN_M=["Mateo","Luka","Kofi","Arash","Diego","Jonas","Emre","Tomás","Yusuf","Nico","Rafael","Kenji","Oskar","Samir",
  "Andrés","Pavel","Bruno","Ilias","Felipe","Dario","Leon","Marco","Viktor","Elias","Joel","Hugo","Matteo","Lars","Anton","Miguel"];
const GIVEN_W=["Elena","Sofia","Mia","Nadia","Lucia","Hana","Ines","Freya","Amara","Zoe","Marta","Yuki","Clara","Lena",
  "Daria","Ana","Leila","Greta","Nina","Iris","Maya","Petra","Rosa","Alba","Tessa","Vera","Sara","Mei","Olga","Emma"];
const FAMILY=["Ferreira","Okoro","Haddad","Lindqvist","Navarro","Kovač","Mensah","Petrescu","Alves","Demir","Ito","Moreau","Rossi",
  "Kowal","Benali","Sousa","Varga","Castillo","Nakamura","Brandt","Achterberg","Diallo","Ramírez","Novak","Silva","Torres","Yilmaz",
  "Kader","Lund","Weber","Costa","Horvat","Berg","Marin","Duarte","Popescu","Janssen","Kim","Ortega","Bauer"];

/* THE POOL OF TWELVE. Shaped so that nobody is best at everything: the
   star singles player is poor at doubles and dislikes left-handers, the
   specialists are only good on their surface, the doubles specialist is
   ordinary in singles. o = offsets on hard, clay, grass (Elo, against your
   nation's real strength); dbl = doubles skill; with = a partner from
   before (index into the whole pool of twelve, men 0-5, women 6-11). */
const POOL_SHAPE={
  m:[{o:[70,60,0],dbl:-110,style:"base",hand:"R",vsL:70,fee:.35,tag:"Star · struggles against left-handers"},
     {o:[25,-90,85],dbl:40,style:"serve",hand:"R",vsL:15,fee:.2,tag:"Grass-court specialist",with:3},
     {o:[5,25,0],dbl:30,style:"all",hand:"L",vsL:25,fee:.15,tag:"Left-handed"},
     {o:[-140,-150,-110],dbl:240,style:"serve",hand:"R",vsL:10,fee:.08,tag:"Doubles specialist"},
     {o:[-40,80,-140],dbl:-40,style:"base",hand:"R",vsL:30,fee:.12,tag:"Clay-court specialist"},
     {o:[-30,-30,-30],dbl:0,style:"all",hand:"R",vsL:30,fee:.05,tag:"Teenager · improves with every tie",improve:15}],
  w:[{o:[60,40,30],dbl:-50,style:"base",hand:"R",vsL:50,fee:.3,tag:"Star · struggles against left-handers"},
     {o:[0,-40,70],dbl:40,style:"all",hand:"L",vsL:15,fee:.15,tag:"Left-handed · grass-court player"},
     {o:[-30,75,-100],dbl:-30,style:"base",hand:"R",vsL:30,fee:.12,tag:"Clay-court specialist"},
     {o:[-130,-120,-110],dbl:230,style:"all",hand:"R",vsL:10,fee:.08,tag:"Doubles specialist",with:3},
     {o:[25,15,20],dbl:60,style:"all",hand:"R",vsL:25,fee:.15,tag:"A fine doubles player"},
     {o:[40,30,30],dbl:0,style:"base",hand:"R",vsL:30,fee:.1,tag:"Back from injury · short of matches",cond:72}]
};
const SURFS=["hard","clay","grass"];
const baseSurf=s=>s==="indoor"?"hard":s;
/* A nation's level for one side on one surface: the real number, drawn
   towards the average (STRENGTH_SCALE). */
const MID={};for(const g of["m","w"])for(const s of["hard","clay","grass"])MID[g+s]=TEAMS.reduce((a,t)=>a+t[g][s],0)/TEAMS.length;
const LEVEL={};TEAMS.forEach(t=>{const o={m:{},w:{}};for(const g of["m","w"])for(const s of["hard","clay","grass"])o[g][s]=MID[g+s]+STRENGTH_SCALE*(t[g][s]-MID[g+s]);LEVEL[t.n]=o});
function team(n){return LEVEL[n]}
function strength(n){const t=team(n);return SURFS.reduce((a,s)=>a+t.m[s]+t.w[s],0)/6}
function seedList(){return TEAMS.slice().sort((a,b)=>strength(b.n)-strength(a.n)).map(t=>t.n)}

/* Full names never repeat; surnames never repeat within your squad, and an
   opponent never shares a surname with one of yours (the rubber lines use
   surnames). */
function uniqueName(g,used,surnames){let nm,sn;do{sn=pick(FAMILY);nm=pick(g==="m"?GIVEN_M:GIVEN_W)+" "+sn}while(used.has(nm)||surnames.has(sn));used.add(nm);return nm}
const surnameOf=nm=>nm.split(" ").slice(-1)[0];
function makePool(n){
  const t=team(n),used=new Set(),sn=new Set(),out=[],links=[];
  for(const g of["m","w"])POOL_SHAPE[g].forEach(sh=>{
    const surf={};SURFS.forEach((s,k)=>surf[s]=Math.round(t[g][s]+sh.o[k]+POOL_SHIFT+rnd(-8,8)));
    const id=out.length;if(sh.with!=null)links.push([id,sh.with]);
    const nm=uniqueName(g,used,sn);sn.add(surnameOf(nm));
    out.push({id,g,mine:true,nm,surf,dbl:sh.dbl+rnd(-10,10),style:sh.style,hand:sh.hand,vsL:sh.vsL,
      fee:sh.fee,tag:sh.tag,partners:[],improve:sh.improve||0,cond:sh.cond||100,out:0,knock:false,home:false,standIn:false})});
  links.forEach(([a,b])=>{const A=out[a],B=out[b],kind=A.g===B.g?"doubles":"mixed";A.partners.push(b);B.partners.push(a);
    A.tag+=` · has played ${kind} with ${B.nm}`;B.tag+=` · has played ${kind} with ${A.nm}`});
  return out;
}
/* Opponents: two men and two women around each nation's real strength. */
function makeOpp(n,used){
  const t=team(n),ids={m:[],w:[]},mineSn=new Set(S.pool.map(p=>surnameOf(p.nm)));
  for(const g of["m","w"])[45,-45].forEach(off=>{
    const surf={};SURFS.forEach(s=>surf[s]=Math.round(t[g][s]+off+rnd(-20,20)));
    const p={id:1000+S.oppP.length,g,mine:false,nm:uniqueName(g,used,mineSn),surf,dbl:rnd(-60,90),style:pick(["base","base","all","serve"]),
      hand:rng()<.15?"L":"R",vsL:rnd(10,40),cond:100,knock:false,partners:[]};
    S.oppP.push(p);ids[g].push(p.id)});
  if(rng()<.3){const[a,b]=ids.m;P(a).partners.push(b);P(b).partners.push(a)}
  return ids;
}
function P(id){return id>=1000?S.oppP[id-1000]:S.pool[id]}

/* ---- ratings ----------------------------------------------------------------- */
function vsL(p){return p.vsL*(p.mine&&S.hitting?.5:1)}
function sr(p,s){
  let r=p.surf[baseSurf(s)]-(100-p.cond)*FATIGUE_ELO;
  if(s==="indoor")r+=INDOOR[p.style]||0;
  if(p.knock)r-=KNOCK_ELO;
  if(p.mine){r+=S.morale*MORALE_ELO;if(S.practice===s)r+=PRACTICE_ELO}
  return r;
}
function avgRating(p){return SURFS.reduce((a,s)=>a+p.surf[s],0)/3}
function compat(a,b){const net=x=>x.style!=="base";
  return(a.hand!==b.hand?COMPAT.lr:0)+(net(a)&&net(b)?COMPAT.net:0)+(a.style==="base"&&b.style==="base"?COMPAT.baseBase:0)+(a.partners.includes(b.id)?COMPAT.history:0)}
function single(a,b,s){return sr(a,s)-(b.hand==="L"?vsL(a):0)}
function pairR(ids,vsIds,s){const[a,b]=ids.map(P),lefty=vsIds.map(P).some(x=>x.hand==="L");
  return(sr(a,s)+a.dbl+sr(b,s)+b.dbl)/2+compat(a,b)-(lefty?(vsL(a)+vsL(b))/4:0)}
/* The gap in a rubber, yours minus theirs (Elo). */
function rubberD(ev,mine,theirs,s,bonus){
  const d=ev==="MS"||ev==="WS"?single(P(mine[0]),P(theirs[0]),s)-single(P(theirs[0]),P(mine[0]),s):pairR(mine,theirs,s)-pairR(theirs,mine,s);
  return d+(bonus||0);
}

/* ---- the match model: exact chances --------------------------------------------- */
function holds(ev,d){const h=HOLD[ev],x=h.s*d/200;return[clamp(h.b+x,.25,.98),clamp(h.b-x,.25,.98)]}
function tbP(d){return 1/(1+Math.pow(10,-d*TIEBREAK_K/400))}
const SETP=new Map();
function setProb(ev,d){
  const key=ev+"|"+Math.round(d);if(SETP.has(key))return SETP.get(key);
  const[hA,hB]=holds(ev,Math.round(d)),t=tbP(Math.round(d));
  const one=aFirst=>{const memo=new Map();
    const f=(a,b,aServe)=>{if(a===6&&b<=4||a===7)return 1;if(b===6&&a<=4||b===7)return 0;if(a===6&&b===6)return t;
      const k=a*100+b*10+(aServe?1:0);if(memo.has(k))return memo.get(k);
      const pA=aServe?hA:1-hB;const v=pA*f(a+1,b,!aServe)+(1-pA)*f(a,b+1,!aServe);memo.set(k,v);return v};
    return f(0,0,aFirst)};
  const v=(one(true)+one(false))/2;SETP.set(key,v);return v;
}
/* Your chance of winning a best-of-three rubber from a sets score. */
function rubberProb(ev,d,sa=0,sb=0){
  if(sa>=2)return 1;if(sb>=2)return 0;const s=setProb(ev,d);
  if(sa===1&&sb===1)return s;if(sa===1)return s+(1-s)*s;if(sb===1)return s*s;return s*s*(3-2*s);
}
/* Your chance of winning the tie, from a score and the chances of the
   rubbers still to play (first to three). */
function tieProb(a,b,ps){if(a>=3)return 1;if(b>=3)return 0;if(!ps.length)return 0;
  const p=ps[0],rest=ps.slice(1);return p*tieProb(a+1,b,rest)+(1-p)*tieProb(a,b+1,rest)}

/* ---- the match model: playing it ------------------------------------------------- */
function playSet(r){
  const d=rubberD(r.ev,r.mine,r.theirs,r.s,r.bonus);
  const[ha,hb]=holds(r.ev,d);let a=0,b=0,aServe=r.aServe;
  for(;;){
    if(a===6&&b===6){if(rng()<tbP(d))a++;else b++;break}
    if((a>=6||b>=6)&&Math.abs(a-b)>=2)break;
    if(rng()<(aServe?ha:1-hb))a++;else b++;aServe=!aServe;
  }
  r.aServe=aServe;r.sets.push([a,b]);if(a>b)r.sa++;else r.sb++;
  if(r.sa===2||r.sb===2)r.done=true;
  return[a,b];
}
function newRubber(ev,mine,theirs,s){return{ev,mine:mine.slice(),theirs:theirs.slice(),s,sa:0,sb:0,sets:[],aServe:rng()<.5,bonus:0,done:false}}
function setsText(r,mineFirst){return r.sets.map(([a,b])=>mineFirst?`${a}–${b}`:`${b}–${a}`).join(" ")}

/* ---- your players -------------------------------------------------------------------- */
function available(g){return S.squad.map(P).filter(p=>!p.out&&!p.home&&(!g||p.g===g))}
/* Fewer than two of a side fit to play: the federation flies in a stand-in. */
function ensureTwo(){const out=[];
  for(const g of["m","w"])while(available(g).length<2){const t=team(S.me),used=new Set(S.pool.map(p=>p.nm)),sn=new Set(S.pool.map(p=>surnameOf(p.nm)).concat(S.oppP.map(p=>surnameOf(p.nm))));
    const surf={};SURFS.forEach(s=>surf[s]=t[g][s]-160);
    const p={id:S.pool.length,g,mine:true,nm:uniqueName(g,used,sn.size<FAMILY.length?sn:new Set()),surf,dbl:0,style:"all",hand:"R",vsL:30,fee:.04,tag:"Stand-in",
      partners:[],improve:0,cond:100,out:0,knock:false,home:false,standIn:true};
    S.pool.push(p);S.squad.push(p.id);out.push(p)}
  return out}

/* ---- the line-up ------------------------------------------------------------------------- *
   A line-up is who plays the singles and who plays the mixed, for each side:
   {m:[singles,mixed], w:[singles,mixed]}. Both men play the men's doubles,
   both women the women's. */
function rubbersOf(lu){return{MS:[lu.m[0]],WS:[lu.w[0]],MD:[lu.m[0],lu.m[1]],WD:[lu.w[0],lu.w[1]],XD:[lu.m[1],lu.w[1]]}}
function lineups(){
  const pairs=g=>{const av=available(g).map(p=>p.id),o=[];av.forEach(a=>av.forEach(b=>{if(a!==b)o.push([a,b])}));return o};
  const out=[];pairs("m").forEach(m=>pairs("w").forEach(w=>out.push({m,w})));return out;
}
/* Their line-up: the better singles player on this surface plays singles. */
function oppLineup(n,s){const t=S.oppTeams[n],by=g=>t[g].slice().sort((a,b)=>sr(P(b),s)-sr(P(a),s));return{m:by("m"),w:by("w")}}
function tieChance(lu,olu,s,from){
  const R=rubbersOf(lu),O=rubbersOf(olu),f=from||{a:0,b:0,i:0,cur:null};
  const ps=EVENTS.slice(f.i).map((ev,k)=>k===0&&f.cur?rubberProb(ev,rubberD(ev,f.cur.mine,f.cur.theirs,s,f.cur.bonus),f.cur.sa,f.cur.sb)
    :rubberProb(ev,rubberD(ev,R[ev],O[ev],s)));
  return tieProb(f.a,f.b,ps);
}
function rubberChances(lu,olu,s){const R=rubbersOf(lu),O=rubbersOf(olu);return EVENTS.map(ev=>rubberProb(ev,rubberD(ev,R[ev],O[ev],s)))}
/* The competent captain: the line-up with the best chance of winning the tie. */
function bestLineup(olu,s){let best=null,bv=-1;for(const lu of lineups()){const v=tieChance(lu,olu,s);if(v>bv){bv=v;best=lu}}return best}

/* ---- the draw ------------------------------------------------------------------------------ */
function makeDraw(){
  const order=seedList(),field=order.filter(n=>n!==S.me).slice(0,FIELD-1).concat([S.me]).sort((a,b)=>strength(b)-strength(a));
  const pos=Array(FIELD).fill(null);
  pos[0]=field[0];pos[FIELD-1]=field[1];
  const q=shuffle([4,11]);pos[q[0]]=field[2];pos[q[1]]=field[3];
  const rest=shuffle(field.slice(4)),free=pos.map((x,i)=>x?null:i).filter(i=>i!=null);
  free.forEach((i,k)=>pos[i]=rest[k]);
  return pos;
}
function seedOf(n){return S.field.slice().sort((a,b)=>strength(b)-strength(a)).indexOf(n)+1}
function myPos(r){return S.bracket[r].indexOf(S.me)}
function nextOpponent(){if(S.exit||S.champion)return null;const b=S.bracket[S.round],i=b.indexOf(S.me);return i<0?null:b[i^1]}
/* The strongest nation in the block your round-r opponent comes from. */
function likelyOpp(r){const pos=S.field.indexOf(S.me),size=1<<r,start=((pos>>r)^1)<<r;
  return S.field.slice(start,start+size).sort((a,b)=>strength(b)-strength(a))[0]}

/* Ties between other nations: their own line-ups, rubber by rubber. */
function otherTie(a,b,s){
  const la=oppLineup(a,s),lb=oppLineup(b,s),A=rubbersOf(la),B=rubbersOf(lb);let x=0,y=0;
  for(const ev of EVENTS){if(x===3||y===3)break;const p=rubberProb(ev,rubberD(ev,A[ev],B[ev],s));if(rng()<p)x++;else y++}
  return{a,b,x,y,winner:x>y?a:b};
}
function playRoundOthers(myWon,myScore){
  const r=S.round,s=ROUNDS[r].surface,b=S.bracket[r],next=[],out=[];
  for(let k=0;k<b.length;k+=2){const a=b[k],c=b[k+1];
    if(a===S.me||c===S.me){const opp=a===S.me?c:a,w=myWon?S.me:opp;next.push(w);S.record[myWon?"w":"l"]++;out.push({a:S.me,b:opp,x:myScore[0],y:myScore[1],winner:w,mine:true});continue}
    const m=otherTie(a,c,s);next.push(m.winner);out.push(m)}
  S.results.push(out);
  if(!myWon&&!S.exit&&b.includes(S.me))S.exit=ROUNDS[r].name;
  if(next.length===1)S.champion=next[0];else S.bracket.push(next);
  S.round++;
  return out;
}
function finishTournament(){let g=0;while(!S.champion&&g++<10){
  if(S.bracket[S.round].includes(S.me)&&!S.exit){autoTie();continue}
  playRoundOthers(false,[0,0])}}

/* ---- a tie ----------------------------------------------------------------------------------- */
function newTie(){
  const opp=nextOpponent(),s=ROUNDS[S.round].surface;
  return{opp,s,round:S.round,a:0,b:0,i:0,lu:null,olu:oppLineup(opp,s),R:null,O:null,res:[],news:[],cur:null,played:new Set(),dead:null,swaps:[]};
}
function startTie(t,lu){t.lu=lu;t.R=rubbersOf(lu);t.O=rubbersOf(t.olu)}
function tieOver(t){return t.a>=3||t.b>=3}
function nextRubber(t){const ev=EVENTS[t.i];t.cur=newRubber(ev,t.R[ev],t.O[ev],t.s);return t.cur}
/* After a rubber: condition, incidents, the score. */
function endRubber(t){
  const r=t.cur,won=r.sa>r.sb,sets=r.sets.length,single=r.ev==="MS"||r.ev==="WS";
  r.mine.forEach(id=>{const p=P(id);t.played.add(id);p.cond=Math.max(COND.floor,p.cond-sets*(single?COND.setSingles:COND.setDoubles));
    if(rng()<INCIDENTS.injury)t.news.push({type:"injury",id});else if(rng()<INCIDENTS.knock)t.news.push({type:"knock",id})});
  if(won)t.a++;else t.b++;
  t.res.push({ev:r.ev,mine:r.mine,theirs:r.theirs,won,sets:r.sets.slice()});t.i++;t.cur=null;
  return won;
}
/* Dead rubbers: the tie is won or lost with rubbers still to play. Play
   them out (the crowd has paid for five) or concede them and rest. */
function playDead(t){const g=MONEY.gate*(EVENTS.length-t.i);S.cash+=g;return g}
function concedeRest(t){while(t.i<EVENTS.length){t.res.push({ev:EVENTS[t.i],conceded:true});t.i++}}

/* After the singles (as team events allow): bring a rested player into the
   doubles, now that the score is known. */
function afterSinglesOptions(t){
  const opts=[{id:"keep",t:"Keep the pairs",d:pairsText(t.R),R:t.R}];
  for(const g of["m","w"]){const rest=available(g).find(p=>!t.lu[g].includes(p.id));if(!rest)continue;
    const[sg,mx]=t.lu[g],D=g==="m"?"MD":"WD";
    const R1=JSON.parse(JSON.stringify(t.R));R1[D]=[rest.id,mx];
    opts.push({id:g+"-d",t:`${rest.nm} into the ${g==="m"?"men's":"women's"} doubles`,d:`for ${P(sg).nm}, after the singles`,R:R1});
    const R2=JSON.parse(JSON.stringify(t.R));R2.XD=g==="m"?[rest.id,R2.XD[1]]:[R2.XD[0],rest.id];
    opts.push({id:g+"-x",t:`${rest.nm} into the mixed`,d:`for ${P(mx).nm}`,R:R2});
  }
  return opts.map(o=>({...o,win:remainingChance(t,o.R)}));
}
function pairsText(R){return["MD","WD","XD"].map(ev=>R[ev].map(id=>P(id).nm.split(" ").slice(-1)[0]).join("/")).join(" · ")}
function remainingChance(t,R,bonus){
  const ps=EVENTS.slice(t.i).map(ev=>rubberProb(ev,rubberD(ev,R[ev],t.O[ev],t.s)));return tieProb(t.a,t.b,ps)}
function useOption(t,o){t.R=o.R;if(o.id!=="keep")t.swaps.push(o.id)}

/* One set all in a doubles rubber: the captain's word at the change of ends. */
function setBreakOptions(t){
  const r=t.cur,my=r.mine.map(P),th=r.theirs.map(P),s=t.s;
  const lv=p=>sr(p,s)+p.dbl,gap=Math.abs(lv(th[0])-lv(th[1]));
  const net=my.every(p=>p.style!=="base");
  const o=[{id:"own",t:"Play your own game",d:"No change",bonus:0},
    {id:"target",t:`Target ${th.slice().sort((a,b)=>lv(a)-lv(b))[0].nm}`,d:"Their weaker player",bonus:clamp(.45*gap-20,-25,50)},
    {id:"net",t:"Attack the net",d:net?"Two net players":"A baseliner up at the net",bonus:(net?30:-30)+(baseSurf(s)==="grass"?10:baseSurf(s)==="clay"?-15:0)}];
  return o.map(x=>({...x,win:tieProbFromSet(t,x.bonus)}));
}
function tieProbFromSet(t,bonus){const r=t.cur;
  const p=setProb(r.ev,rubberD(r.ev,r.mine,r.theirs,t.s,bonus));
  const rest=EVENTS.slice(t.i+1).map(ev=>rubberProb(ev,rubberD(ev,t.R[ev],t.O[ev],t.s)));
  return p*tieProb(t.a+1,t.b,rest)+(1-p)*tieProb(t.a,t.b+1,rest);
}

/* After the tie: the week's recovery, incidents, the teenager's progress. */
function afterTie(t){
  S.squad.forEach(id=>{const p=P(id);p.out=Math.max(0,p.out-1);p.knock=false;
    p.cond=Math.min(100,p.cond+COND.rest+S.recovery+(t.played.has(id)?0:COND.bench));
    if(p.improve&&t.played.has(id))SURFS.forEach(s=>p.surf[s]+=p.improve)});
  t.news.forEach(n=>{const p=P(n.id);if(n.type==="injury")p.out=1;else p.knock=true});
  S.practice=null;S.hitting=false;S.played++;
}

/* ---- the whole tie, played by a competent captain (the Shark's assumption) ---------------- *
   The best line-up, and each later lever only once the level has unlocked
   it, as you meet them. */
function autoTie(){
  ensureTwo();
  const t=newTie();startTie(t,bestLineup(t.olu,t.s));
  while(t.i<EVENTS.length){
    if(tieOver(t)&&t.dead==null){const c=unlocked("deadRubber")&&S.round<ROUNDS.length-1;t.dead=c?"concede":"play";
      if(c){concedeRest(t);break}playDead(t)}
    if(t.i===2&&!tieOver(t)&&unlocked("afterSingles")){const o=afterSinglesOptions(t);useOption(t,o.reduce((a,b)=>b.win>a.win?b:a))}
    const r=nextRubber(t);
    while(!r.done){if(r.sa===1&&r.sb===1&&r.ev[1]==="D"&&unlocked("setBreak")){const o=setBreakOptions(t);r.bonus=o.reduce((a,b)=>b.win>a.win?b:a).bonus}
      playSet(r)}
    endRubber(t);
  }
  const won=t.a>t.b;afterTie(t);playRoundOthers(won,[t.a,t.b]);return t;
}

/* ---- money (GBP m) ------------------------------------------------------------------------- */
function money(v,signed){const a=Math.abs(Math.round(v*100)/100);return(v<0?"−":signed?"+":"")+"£"+a+"m"}
function feesNow(){return S.squad.map(P).filter(p=>!p.home).reduce((a,p)=>a+p.fee,0)}
function payTie(){S.bills=S.bills||{};if(S.bills[S.round])return S.bills[S.round];
  const before=S.cash,card=BILL_CARDS[Math.floor(rng()*BILL_CARDS.length)],fees=feesNow();
  S.cash+=card.v-MONEY.travel-fees;
  return S.bills[S.round]={before,travel:MONEY.travel,fees,card,after:S.cash}}
function prizeMoney(won,champion){const p=(won?MONEY.prize.w:MONEY.prize.l)+(champion?MONEY.title:0);S.cash+=p;return p}
function cashCheck(){if(S.cash<MONEY.sackedBelow){S.alive=false;S.sacked=true;return"sacked"}
  return S.cash<0&&S.squad.filter(id=>!P(id).home).length>4?"home":null}
function sendHome(id){const p=P(id);p.home=true;S.sentHome.push(p.nm);return p}

/* ---- effects: only money is shown (as in the other games) ---------------------------------- */
function apply(fx){
  if(!fx)return[];const tags=[];
  if(fx.morale)S.morale=clamp(S.morale+fx.morale,-5,5);
  if(fx.cond)S.squad.forEach(id=>{const p=P(id);p.cond=clamp(p.cond+fx.cond,COND.floor,100)});
  if(fx.starCond){const p=star();if(p)p.cond=clamp(p.cond+fx.starCond,COND.floor,100)}
  if(fx.recovery)S.recovery+=fx.recovery;
  if(fx.practice)S.practice=ROUNDS[Math.min(S.round,ROUNDS.length-1)].surface;
  if(fx.hitting)S.hitting=true;
  if(fx.heal)S.squad.forEach(id=>{const p=P(id);p.out=0;p.knock=false});
  if(fx.cash){S.cash+=fx.cash;tags.push([fx.cash>0,`Cash ${money(fx.cash,true)}`])}
  if(fx.fee){const p=star();if(p){p.fee+=fx.fee;tags.push([false,`${p.nm}'s fee ${money(fx.fee,true)} a tie`])}}
  return tags;
}
/* Your best-paid player in the squad (the one with demands). */
function star(){return S.squad.map(P).filter(p=>!p.home&&!p.standIn).sort((a,b)=>b.fee-a.fee)[0]}

/* ---- the event's state ------------------------------------------------------------------- */
function newSeason(level,me,seed){
  SEED=seed||("NC-"+Math.random().toString(36).slice(2,7).toUpperCase());
  R.s=hashSeed(SEED+"|"+me);
  S={level,me,pool:null,squad:[],oppP:[],oppTeams:{},cash:MONEY.start,morale:0,recovery:0,practice:null,hitting:false,
    played:0,round:0,alive:true,sacked:false,sentHome:[],field:null,bracket:null,results:[],exit:null,champion:null,
    record:{w:0,l:0},calls:[],shark:null};
  S.pool=makePool(me);
  S.field=makeDraw();S.bracket=[S.field.slice()];
  const used=new Set(S.pool.map(p=>p.nm));
  S.field.forEach(n=>{if(n!==S.me)S.oppTeams[n]=makeOpp(n,used)});
  return S;
}
function resetTournament(){S.round=0;S.bracket=[S.field.slice()];S.results=[];S.exit=null;S.champion=null;S.played=0}

/* ---- the Shark --------------------------------------------------------------------------- *
   Its squad: every three men and three women, scored on the chance of
   winning each round's tie against the likeliest opponent with the best
   line-up; the best few then played out many times. */
function combos(arr,k){const out=[];const go=(s,cur)=>{if(cur.length===k){out.push(cur.slice());return}for(let i=s;i<arr.length;i++){cur.push(arr[i]);go(i+1,cur);cur.pop()}};go(0,[]);return out}
function squadScore(ids){
  const save=S.squad;S.squad=ids;let v=0;
  ROUNDS.forEach((rd,r)=>{const opp=likelyOpp(r),olu=oppLineup(opp,rd.surface),lu=bestLineup(olu,rd.surface);v+=Math.log(Math.max(.01,tieChance(lu,olu,rd.surface)))});
  S.squad=save;return v;
}
function allSquads(){const m=S.pool.filter(p=>p.g==="m"&&!p.standIn).map(p=>p.id),w=S.pool.filter(p=>p.g==="w"&&!p.standIn).map(p=>p.id);
  const out=[];combos(m,3).forEach(a=>combos(w,3).forEach(b=>out.push(a.concat(b))));return out}
function sharkSquad(){
  const ranked=allSquads().map(c=>({c,v:squadScore(c)})).sort((a,b)=>b.v-a.v).slice(0,5);
  const runs=typeof SHARK_PICK_RUNS==="number"?SHARK_PICK_RUNS:80;
  let best=ranked[0].c,bv=-1;
  for(const{c}of ranked){const fc=forecast(c,runs);const v=STAGES.reduce((s,k,i)=>s+i*(fc[k]||0),0);if(v>bv){bv=v;best=c}}
  return best;
}
function topRatedSquad(){const top=g=>S.pool.filter(p=>p.g===g).sort((a,b)=>avgRating(b)-avgRating(a)).slice(0,3).map(p=>p.id);return top("m").concat(top("w"))}

const STAGES=["First round","Quarter-final","Semi-final","Final","Champions"];
function forecast(squad,runs){
  return sandbox(()=>{
    const snap=JSON.stringify(S),out={};STAGES.forEach(s=>out[s]=0);let fav=0;const top=seedList().find(n=>S.field.includes(n));
    for(let k=0;k<runs;k++){S=JSON.parse(snap);S.squad=squad.slice();resetTournament();
      while(!S.champion){if(S.bracket[S.round].includes(S.me)&&!S.exit)autoTie();else playRoundOthers(false,[0,0])}
      out[S.champion===S.me?"Champions":S.exit]++;if(S.champion===top)fav++}
    S=JSON.parse(snap);for(const k in out)out[k]/=runs;out.fav=fav/runs;return out;
  },SEED+"|forecast");
}
function likeliest(fc){return STAGES.reduce((a,b)=>fc[b]>fc[a]?b:a)}
function reachChance(fc,stage){const i=STAGES.indexOf(stage);return STAGES.slice(i).reduce((s,k)=>s+(fc[k]||0),0)}
function unlocked(f){return S.played>=LEVELS[S.level].unlock[f]}
