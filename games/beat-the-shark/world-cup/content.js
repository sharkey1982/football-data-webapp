/* ===========================================================================
   world-cup/content.js — the writing: the week's decisions around the
   tournament. Each has a do-nothing choice (def:true). Only money is shown
   after a decision; the rest plays out in the matches.
   =========================================================================== */

function baseCampSpec(){
  return{sig:"camp",title:"The base camp",lede:`Where ${S.me} stay for the tournament.`,
   choices:[
    {t:"The beach resort",d:"£3m now · players recover faster between matches",fx:{cash:-3,recovery:6},out:"Ice baths, sea air and a chef. The squad will thank you by the semi-final."},
    {t:"The FA's usual hotel",d:"No extra cost",fx:{},def:true,out:"The same corridors as last time. Nobody complains, nobody is impressed."},
    {t:"A university campus",d:"Camp costs £0.4m a match less · slower recovery",fx:{camp:-.4,recovery:-4},out:"Single beds and a canteen. The accountants are delighted."}]};
}
function sponsorSpec(){
  return{sig:"sponsor",title:"The sponsor's day",lede:"A drinks company wants the whole squad for a day of filming.",
   choices:[
    {t:"Do the shoot",d:"+£2.5m · the squad loses a day's rest",fx:{cash:2.5,cond:-10},out:"Eight hours under the lights. The cheque clears; the legs are heavier."},
    {t:"Send two players",d:"+£1m",fx:{cash:1,cond:-3},out:"Two volunteers, a few hours, a smaller cheque."},
    {t:"Turn it down",d:"Rest comes first",fx:{},def:true,out:"The sponsor is disappointed. The physio is not."}]};
}
function bonusSpec(){
  return{sig:"bonus",title:"The players want a bonus",lede:"The captain asks, on behalf of the squad, for a payment for every win from here.",
   choices:[
    {t:"Agree £0.6m a win",d:"The squad lifted",fx:{bonus:.6,morale:4},out:"Agreed in the corridor. The squad are noticeably louder at dinner."},
    {t:"Promise to talk after the tournament",d:"No money now",fx:{morale:-1},def:true,out:"They accept it, and they remember it."},
    {t:"Refuse",d:"They play for the shirt",fx:{morale:-3},out:"\"You play for the shirt.\" The room goes quiet."}]};
}
function trainingSpec(){
  return{sig:"training",title:"The heat",lede:"It is 34 degrees at the training ground at midday.",
   choices:[
    {t:"Train at dawn",d:"The legs stay fresh",fx:{cond:6},out:"Five o'clock starts. Nobody enjoys them; everybody benefits."},
    {t:"Train as normal",d:"Same routine",fx:{cond:-4},def:true,out:"The routine holds, and the heat takes its toll."},
    {t:"A rest day by the pool",d:"Spirit over sharpness",fx:{cond:8,morale:2},out:"Sun loungers and a quiz. Morale is high; the shape is untouched."}]};
}
function pressSpec(){
  const last=S.lastResult;
  return{sig:"press",title:"The press conference",
   lede:last==="w"?"\"Can you win this?\"":last==="l"?"\"Was that the end of your tournament?\"":"\"Are you happy with a draw?\"",
   choices:[
    {t:"Back the players",d:"Their tournament",fx:{morale:3},out:"\"They have earned the right to dream.\" The players hear it."},
    {t:"Keep expectations low",d:"Take the pressure off",fx:{morale:1},def:true,out:"\"One game at a time.\" Nobody writes it down."},
    {t:"Criticise the referee",d:"Deflect",fx:{morale:-1,cash:-.5},out:"A fine from FIFA by the morning, and a headline you did not need."}]};
}
function physioSpec(){
  return{sig:"physio",title:"The medical team",lede:"The physio wants a specialist flown in for the injured.",
   choices:[
    {t:"Fly him in",d:"£2m now · the injured are back",fx:{cash:-2,heal:true},out:"He arrives at midnight and works through the night."},
    {t:"Make do",d:"Keep the money",fx:{},def:true,out:"The physio does what he can with what he has."}]};
}
const BETWEEN_EVENTS=[sponsorSpec,bonusSpec,trainingSpec,pressSpec,physioSpec];
