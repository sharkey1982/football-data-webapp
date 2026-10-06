/* ===========================================================================
   nfl/content.js — the writing: the week's events, the press conference,
   the trade deadline. Each event is a function, because its wording and
   effects read the team as it stands.

   Effects (fx) are applied by apply() in engine.js. Every event has a
   choice marked def:true: what happens if you decide nothing (the headless
   "no decisions" policy takes it).
   =========================================================================== */
const pl=pos=>player(pos);
const hurtList=()=>S.roster.filter(p=>p.out);

/* ---- head coach: the week between games --------------------------------- */
const COACH_EVENTS=[
 ()=>({sig:"practice",title:"Wednesday practice",lede:"Two hours on the field, and you choose what they are spent on.",
   choices:[
    {t:"Red-zone drills",d:"Finish drives",fx:{next:{off:4}},out:"Inside the twenty, over and over. The offence is sharper for it."},
    {t:"Turnover drills",d:"Protect the ball, take it away",fx:{next:{off:1,def:3}},out:"Strip drills and ball security until their forearms ache."},
    {t:"Walk-through only",d:"Rest the legs",fx:{morale:2},def:true,out:"A light day. Nobody complains."}]}),
 ()=>({sig:"film",title:"Film night",lede:`The scouts have cut every snap of ${oppOf(S.wk)}'s last three games.`,
   choices:[
    {t:"Three hours of film",d:"Their tendencies, play by play",fx:{next:{def:4},morale:-1},out:"Long, dull and useful. The defence knows what is coming."},
    {t:"The highlights",d:"Twenty minutes",fx:{next:{def:1}},def:true,out:"Enough to know their best players. Not much more."},
    {t:"Cancel it, team dinner",d:"Spirit over study",fx:{morale:4},out:"Steak, speeches and a karaoke machine nobody asked for."}]}),
 ()=>{const p=pl("QB");return{sig:"qbpress",title:`${p.nm} is in the papers`,lede:"\"Quarterback questions the play-calling\", says the back page. He says he was misquoted.",
   choices:[
    {t:"Back him in public",d:"Shut the story down",fx:{morale:3},out:"\"He is my quarterback.\" The story dies by lunchtime."},
    {t:"Have it out in private",d:"Clear the air",fx:{morale:1,next:{off:2}},def:true,out:"A long conversation, door shut. He comes out with a better idea for the opening script."},
    {t:"Bench him for a quarter",d:"Make the point",fx:{morale:-5,next:{off:-6}},out:"The point is made. So is a mess of a first quarter."}]}},
 ()=>({sig:"weather",title:"The forecast",lede:"Wind gusting to thirty miles an hour on Sunday. Passing will be a lottery.",
   choices:[
    {t:"Build the plan around the run",d:"Use the weather",fx:{next:{off:2}},out:"You rewrite the call sheet for the wind. The line loves it."},
    {t:"Practise in the wind",d:"Wind machines on the practice field",fx:{next:{off:1},morale:-1},out:"The kickers are miserable. The quarterbacks get used to it."},
    {t:"Ignore it",d:"It might not blow",fx:{next:{passPen:4}},def:true,out:"It blows. Your passes go sideways."}]}),
 ()=>{const p=pick(S.roster.filter(x=>!x.out&&["WR2","TE","LB","S","CB2"].includes(x.pos)));return{sig:"rookie",title:"The rookie",lede:`An undrafted rookie has looked better than ${p.nm} in practice for a fortnight.`,
   choices:[
    {t:"Start the rookie",d:"Reward practice form",fx:{upgrade:{pos:p.pos,by:rnd(-2,5)},morale:2},out:"He starts. The veterans notice that practice counts here."},
    {t:"Give him a package of plays",d:"A few snaps a game",fx:{upgrade:{pos:p.pos,by:1}},def:true,out:"A handful of snaps, and he makes the most of them."},
    {t:"Keep the veteran",d:"Experience matters",fx:{morale:-1},out:"The rookie sulks. The veteran plays as he always has."}]}},
 ()=>({sig:"kicker",title:"The kicker is struggling",lede:`${pl("K").nm} has missed three from forty yards in practice this week.`,
   choices:[
    {t:"Bring in a kicker for a tryout",d:"Competition",fx:{upgrade:{pos:"K",by:rnd(-3,6)}},out:"A tryout, a few nervous kicks, and a decision."},
    {t:"Leave him alone",d:"Kickers are like that",fx:{},def:true,out:"You say nothing. It is the oldest advice in football."},
    {t:"Extra kicks after practice",d:"Fifty a day",fx:{upgrade:{pos:"K",by:2},morale:-1},out:"Fifty kicks a day. He hates you, and he is better for it."}]}),
 ()=>({sig:"shortweek",title:"A short week",lede:"Thursday night football. Three days to recover, one to prepare.",
   choices:[
    {t:"No pads all week",d:"Freshness over preparation",fx:{next:{def:2}},out:"Light work, cold tubs, early nights."},
    {t:"Prepare as normal",d:"Same routine, less time",fx:{next:{off:1},morale:-2},def:true,out:"The routine squeezed into half the time. Everyone is tired."},
    {t:"Install a new package",d:"Surprise them",fx:{next:{off:4,def:-2}},out:"Six new plays in three days. Some of them will work."}]}),
 ()=>({sig:"captain",title:"The captains' meeting",lede:"The team captains ask for a word. They want a say in the travel schedule.",
   choices:[
    {t:"Give them the say",d:"Trust the leaders",fx:{morale:4},out:"They pick a later flight. The locker room likes being asked."},
    {t:"Listen, then decide",d:"Your call, their voice",fx:{morale:2},def:true,out:"You hear them out and change one thing. It is enough."},
    {t:"Tell them no",d:"One voice runs this team",fx:{morale:-3,next:{def:1}},out:"Short and clear. They go back to work."}]})
];

/* ---- head coach: the press conference ---------------------------------- */
function presserSpec(){
  const last=S.table[CLUB].res.slice(-1)[0],won=last&&last.r==="w";
  return{sig:"presser",title:"The press conference",
   lede:won?`"A good win. Is this team a contender?"`:`"Another loss. Is your job safe?"`,
   choices:[
    {t:"Credit the players",d:"Their win, their loss",fx:{morale:3},out:"\"It is on them, and they will fix it.\" They hear it in the locker room."},
    {t:"Talk about the process",d:"Say nothing at length",fx:{morale:1},def:true,out:"Eight minutes about the process. Nobody learns anything."},
    {t:"Call out the defence",d:"Light a fire",fx:{morale:-3,def:2},out:"The defence reads it on their phones. They are furious, and they practise like it."}]};
}

/* ---- money: the offers and bills that shape the season ---------------------- */
function bidSpec(){
  const p=pick(S.roster.filter(x=>["WR2","TE","LB","CB2","S","DT"].includes(x.pos)&&!x.out&&!x.traded));
  const fee=Math.round((p.r-30)*.4);
  return{sig:"bid",title:"A trade offer",lede:`A rival wants ${p.nm} (${POS_SHORT[p.pos]}). They will pay $${fee}m and take his contract.`,
   choices:[
    {t:"Accept",d:`+$${fee}m now, payroll down $1m, a weaker starter`,fx:{cash:fee,payroll:-1,upgrade:{pos:p.pos,by:-9}},out:"He is gone by the evening. A backup steps up."},
    {t:"Keep him",d:"No money, no change",fx:{},def:true,out:"\"Not for sale.\" He hears about it, and likes it."}]};
}
function sponsorSpec(){
  return{sig:"sponsor",title:"The sponsor calls",lede:"A sportswear company wants in. Two offers on the table.",
   choices:[
    {t:"A shirt deal",d:"+$2m at the gate every game",fx:{gate:2},out:"The logo goes on the shirts. The money comes every game."},
    {t:"A players' bonus pool",d:"Payroll +$2m a game, the team lifted",fx:{payroll:2,off:2,def:2,morale:2},out:"The players get the money. They play like it."},
    {t:"Turn both down",d:"Keep it simple",fx:{},def:true,out:"The sponsor goes to a rival."}]};
}
function medicalSpec(){
  return{sig:"medical",title:"The medical budget",lede:"The head trainer wants a new recovery programme.",
   choices:[
    {t:"Fund it",d:"$4m now, injured players back",fx:{cash:-4,heal:true},out:"Cryotherapy, sleep pods and a nutritionist. The injury list shrinks."},
    {t:"Not now",d:"Keep the money",fx:{},def:true,out:"The trainer goes back to ice baths and hope."}]};
}
function freeAgentSpec(){
  return{sig:"freeagent",title:"A free agent is available",lede:"A veteran pass rusher was released yesterday.",
   choices:[
    {t:"Sign him",d:"$5m now, payroll +$1m, a better pass rush",fx:{cash:-5,payroll:1,upgrade:{pos:"EDGE",by:6}},out:"He arrives Wednesday and is starting by Sunday."},
    {t:"Pass",d:"Keep the money",fx:{},def:true,out:"Someone else signs him by Friday."}]};
}
const MONEY_EVENTS=[bidSpec,sponsorSpec,medicalSpec,freeAgentSpec];

/* ---- the trade deadline, before the final boss ----------------------------- */
function deadlineSpec(){
  const boss=TEAMS[0].n,cb=pl("CB2");
  return{sig:"deadline",title:"The trade deadline",lede:`One deal before the ${boss}. Cash: ${money(S.cash)}.`,
   choices:[
    {t:"A pass rusher",d:`$8m, payroll +$1m · gives up ${cb.nm} (CB)`,fx:{cash:-8,payroll:1,upgrade:{pos:"EDGE",by:10}},after:()=>deadlineAfter("edge"),
     out:"A pass rusher arrives; a cornerback leaves. The defence is fiercer and a little thinner."},
    {t:"A receiver",d:"$12m, payroll +$2m · a No. 1 receiver",fx:{cash:-12,payroll:2},after:()=>deadlineAfter("wr"),
     out:"A receiver arrives. He has three days to learn the playbook."},
    {t:"Stand pat",d:"Trust this roster",fx:{morale:2},def:true,out:"No deal. The players take it as a vote of confidence."}]};
}
/* The deadline deals change players, which apply() can't express alone. */
function deadlineAfter(trade){
  if(trade==="edge"){const cb=pl("CB2");cb.r-=10;cb.nm="A backup cornerback"}
  if(trade==="wr"){const w=pl("WR1"),w2=pl("WR2");w2.nm=w.nm;w2.r=Math.max(w2.r,w.r);
    w.nm=pick(FIRST)+" "+pick(LAST);w.r=Math.max(w.r,MY_BASE+12);S.next.off=(S.next.off||0)-3}
}
