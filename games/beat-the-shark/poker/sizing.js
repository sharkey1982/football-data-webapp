/* ===========================================================================
   poker/sizing.js — "Bet sizing": how much should you bet on the river?

   The river is out and it's your turn. Check, or bet a third of the pot,
   half, three quarters, the pot or one and a half pots. The Shark's range is
   its pre-flop hands that can still be dealt; its rule is stated:
     facing a bet, it calls with its best hands: the top share of its range,
     share = pot ÷ (pot + bet) for a balanced Shark (the "minimum defence":
     calling less would let any bluff profit), more for a sticky one, less
     for a tight one. Facing a check, it checks too: a showdown.
   So a bigger bet is called less often, and by better hands. Everything is
   exact: each of its hands either calls or folds, and either beats yours,
   ties or loses.

   Value of each option, in chips, counting the pot:
     check:  pot × (wins + ties ÷ 2) ÷ hands
     bet b:  each fold +pot; each call: win +pot + b, tie +pot ÷ 2, lose −b
   Best = the highest; within 2% of the pot of it counts as right.

   No DOM.
   =========================================================================== */
const SZ_TYPES={
  tight:{name:"Tight",art:"a tight",d:"calls with fewer hands than a balanced player",f:.7},
  balanced:{name:"Balanced",art:"a balanced",d:"calls with exactly pot ÷ (pot + bet) of its hands",f:1},
  sticky:{name:"Sticky",art:"a sticky",d:"calls with more hands than a balanced player",f:1.3}};
const SZ_OPTS=[{id:"check",f:0,t:"Check"},{id:"third",f:1/3,t:"⅓ pot"},{id:"half",f:.5,t:"½ pot"},{id:"three",f:.75,t:"¾ pot"},{id:"pot",f:1,t:"Pot"},{id:"big",f:1.5,t:"1½ pots"}];
const SZ_HANDS=[{k:"monster",t:"A very strong hand (a straight or better)",w:.8},{k:"strong",t:"Two pair or a set",w:1},{k:"tptk",t:"Top pair, good kicker",w:1},{k:"thin",t:"Second pair",w:.8}];
function szHandOK(kind,hole,board){
  const all=hole.concat(board),cat=catOf(all),rs=board.map(c=>c.r).sort((a,b)=>b-a);
  if(new Set(rs).size<5)return false;
  if(!bestHand(all).five.some(c=>hole.some(h=>sameCard(h,c))))return false;     // your cards must play
  if(kind==="monster")return cat>=4;
  if(kind==="strong")return cat===2||cat===3;
  if(kind==="tptk")return cat===1&&hole[0].r!==hole[1].r&&hole.some(c=>c.r===rs[0])&&hole.find(c=>c.r!==rs[0]).r>=11;
  if(kind==="thin")return cat===1&&hole[0].r!==hole[1].r&&hole.some(c=>c.r===rs[1])&&!hole.some(c=>c.r>rs[0]);
  return false;
}
/* The Shark's range, strongest first, each hand scored against yours. */
function szRange(hole,board){
  const me=eval7(hole.concat(board)),un=unseenCards(hole.concat(board)),out=[];
  for(let i=0;i<un.length;i++)for(let j=i+1;j<un.length;j++){const h=[un[i],un[j]];if(!poPreflop(h))continue;
    const s=eval7(h.concat(board));out.push({h,s,res:s>me?-1:s<me?1:0})}
  return out.sort((a,b)=>b.s-a.s);
}
/* How many of its hands call a bet (its best ones). */
function szCalls(n,type,pot,bet){return Math.min(n,Math.round(n*Math.min(1,SZ_TYPES[type].f*pot/(pot+bet))))}
function szValues(range,type,pot){
  const n=range.length;
  return SZ_OPTS.map(o=>{
    if(!o.f){const v=range.reduce((a,x)=>a+(x.res>0?pot:x.res===0?pot/2:0),0)/n;return{...o,bet:0,value:v,calls:0}}
    const bet=Math.round(pot*o.f/10)*10,c=szCalls(n,type,pot,bet);let v=(n-c)*pot,won=0;
    for(let k=0;k<c;k++){const x=range[k];v+=x.res>0?pot+bet:x.res===0?pot/2:-bet;if(x.res>0)won++}
    return{...o,bet,value:v/n,calls:c,callShare:c/n,winWhenCalled:c?won/c:0};
  });
}
function sizingQuestion(){
  const kind=SZ_HANDS[weightedPick(SZ_HANDS.map(x=>x.w))],type=pick(Object.keys(SZ_TYPES));
  for(let tries=0;tries<8000;tries++){
    const d=shuffle(pkDeck()),hole=d.slice(0,2),board=d.slice(2,7);
    if(!szHandOK(kind.k,hole,board))continue;
    const range=szRange(hole,board);if(range.length<40)continue;
    const pot=50*rnd(4,16),vals=szValues(range,type,pot),best=vals.reduce((a,b)=>b.value>a.value?b:a);
    const beats=range.filter(x=>x.res>0).length/range.length;
    return{hole,board,kind,type,T:SZ_TYPES[type],pot,range,vals,best,beats,n:range.length};
  }
  return null;
}
