/* ===========================================================================
   nations-cup/content.js — the writing: the decisions around the ties. Each
   has a do-nothing choice (def:true). Only money is shown after a decision;
   the rest plays out on court.
   =========================================================================== */

function campSpec(){
  return{sig:"camp",title:"The training block",lede:`Ten days before the first tie. Where do ${S.me} prepare?`,
   choices:[
    {t:"A warm-weather camp",d:"£0.3m now · everyone arrives fresh",fx:{cash:-.3,cond:10,recovery:2},out:"Sun, a sports scientist and two practice courts each. The squad arrives sharp."},
    {t:"The national tennis centre",d:"No extra cost",fx:{},def:true,out:"The usual courts, the usual canteen. Nobody complains."},
    {t:"Let them prepare at home",d:"£0.15m saved",fx:{cash:.15,morale:-1},out:"Everyone trains with their own coach. The squad meets at the airport, as strangers."}]};
}
function nextRound(){return ROUNDS[Math.min(S.round,ROUNDS.length-1)]}
function surfaceSpec(){const r=nextRound();
  return{sig:"surface",title:`On to ${SURF_NAME[r.surface].toLowerCase()}`,lede:`The ${r.name.toLowerCase()} is on ${SURF_NAME[r.surface].toLowerCase()} courts.`,
   choices:[
    {t:"Fly out early and practise on it",d:"£0.25m now",fx:{cash:-.25,practice:true},out:"Four days on the match courts before anyone else arrives."},
    {t:"Arrive as planned",d:"No change",fx:{},def:true,out:"Two practice sessions, as everyone else gets."},
    {t:"A rest day instead",d:"Legs over sharpness",fx:{cond:6},out:"A day off, a long lunch, an early night."}]};
}
function sponsorSpec(){const p=star();
  return{sig:"sponsor",title:"The watch launch",lede:`A watch brand wants ${p.nm} at an evening launch, two days before the tie.`,
   choices:[
    {t:`Send ${p.nm}`,d:"+£0.35m",fx:{cash:.35,starCond:-12},out:"Photographs, a speech, a late flight back. The cheque clears."},
    {t:"Go yourself",d:"+£0.1m",fx:{cash:.1},out:"The brand wanted a player and got a captain. A smaller cheque."},
    {t:"Turn it down",d:"The tie comes first",fx:{},def:true,out:"The brand is disappointed. The physio is not."}]};
}
function feeSpec(){const p=star();
  return{sig:"fee",title:"The agent calls",lede:`${p.nm}'s agent wants a bigger appearance fee for the rest of the event.`,
   choices:[
    {t:"Pay it",d:"A happier dressing room",fx:{fee:.1,morale:1},out:"Agreed by text. The mood lifts."},
    {t:"Talk after the event",d:"No money now",fx:{morale:-1},def:true,out:"The agent accepts, and remembers."},
    {t:"Refuse",d:"They play for the flag",fx:{morale:-2},out:"\"You play for the flag.\" The team room goes quiet."}]};
}
function hittingSpec(){
  return{sig:"hitting",title:"A left-handed hitting partner",lede:"The next opponents have a left-hander. A local coach who is left-handed is free for the week.",
   choices:[
    {t:"Hire him for the week",d:"£0.15m",fx:{cash:-.15,hitting:true},out:"A week of forehands coming from the wrong side. By Friday nobody flinches."},
    {t:"Make do",d:"No change",fx:{},def:true,out:"The squad practises against each other, as usual."}]};
}
function physioSpec(){
  return{sig:"physio",title:"The medical team",lede:"The physio wants a specialist flown in for the injured.",
   choices:[
    {t:"Fly the specialist in",d:"£0.3m now · the injured are back",fx:{cash:-.3,heal:true},out:"He arrives at midnight and works through the night."},
    {t:"Make do",d:"Keep the money",fx:{},def:true,out:"The physio does what he can."}]};
}
function pressSpec(){const last=S.lastResult;
  return{sig:"press",title:"The press conference",lede:last==="w"?"\"Can you win this?\"":"\"Was that the end of your event?\"",
   choices:[
    {t:"Back the players",d:"Their event",fx:{morale:2},out:"\"They have earned the right to dream.\" The players hear it."},
    {t:"Keep expectations low",d:"Take the pressure off",fx:{morale:1},def:true,out:"\"One tie at a time.\" Nobody writes it down."},
    {t:"Criticise the umpiring",d:"Deflect",fx:{morale:-1,cash:-.1},out:"A fine from the ITF by the morning."}]};
}
/* Between ties, the next event that fits the moment: a lefty partner only
   when the next opponents have a left-hander, the specialist only when
   someone is hurt. */
const BETWEEN_EVENTS=[
  {f:surfaceSpec,when:()=>true},
  {f:sponsorSpec,when:()=>!!star()},
  {f:hittingSpec,when:()=>{const o=nextOpponent();return!!o&&[...S.oppTeams[o].m,...S.oppTeams[o].w].some(id=>P(id).hand==="L")}},
  {f:physioSpec,when:()=>S.squad.some(id=>{const p=P(id);return!p.home&&(p.out||p.knock)})},
  {f:feeSpec,when:()=>!!star()},
  {f:pressSpec,when:()=>true}];
function nextEvent(i){for(let k=0;k<BETWEEN_EVENTS.length;k++){const e=BETWEEN_EVENTS[(i+k)%BETWEEN_EVENTS.length];if(e.when())return{spec:e.f(),next:i+k+1}}return null}
