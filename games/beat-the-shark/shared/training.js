/* ===========================================================================
   shared/training.js — the Beat the Shark training framework: decisions
   judged on their quality, kept apart from what happened.

   Three separate ideas, none of them tied to one game:
     OUTCOME      what a hand, a match or a season actually paid (the game
                  reports it; chips, points, cash)
     DECISION     each choice set against the best one, with the expected
                  value it gave away (the game supplies both values)
     SHARK SCORE  the quality of all your decisions over a session

   First used by the blackjack trainer; built so that a poker or pot-odds
   trainer can record decisions the same way.

   Severity comes from expected value lost, as a share of the stake -- not
   from labels chosen by hand. A choice that isn't the best play is never
   called optimal, however small its cost.
   =========================================================================== */
const SEVERITY=[
  {id:"optimal",name:"Optimal",max:0},
  {id:"small",name:"Small mistake",max:.02},   // under 2% of the stake
  {id:"mistake",name:"Mistake",max:.10},       // 2–10%
  {id:"major",name:"Major mistake",max:Infinity}]; // over 10%
function severityOf(optimal,evLoss){
  if(optimal)return SEVERITY[0];
  return SEVERITY.slice(1).find(s=>evLoss<s.max)||SEVERITY[3];
}
function newTrainingSession(game,opts){
  return{game,started:Date.now(),decisions:[],outcomes:[],...(opts||{})};
}
/* One decision. d: {situation, group, chosen, best, evChosen, evBest, stake,
   optimal?}. evChosen/evBest are in units of the stake (optional: a game
   without an EV model records right/wrong only). */
function recordDecision(T,d){
  const optimal=d.optimal!=null?d.optimal:d.chosen===d.best;
  const evLoss=d.evBest!=null&&d.evChosen!=null?Math.max(0,d.evBest-d.evChosen):null;
  const rec={...d,optimal,evLoss,severity:severityOf(optimal,evLoss||0).id};
  T.decisions.push(rec);return rec;
}
/* One completed hand / round: what it paid, and what it was worth at the
   start given the decisions made (expected), both in chips. */
function recordOutcome(T,o){T.outcomes.push(o);return o}

/* The Shark Score: the share of decisions that were the best play, out of
   100. V1 is accuracy; evLost (expected chips given away) is kept beside it
   so a later version can weight decisions by what they cost. */
function sharkScore(T){const n=T.decisions.length;return n?Math.round(100*T.decisions.filter(d=>d.optimal).length/n):null}
function summarise(T,minForLeak){
  const ds=T.decisions,n=ds.length,opt=ds.filter(d=>d.optimal).length;
  const by=key=>{const m={};ds.forEach(d=>{const k=d[key];if(k==null)return;(m[k]=m[k]||{n:0,ok:0,evLost:0});m[k].n++;if(d.optimal)m[k].ok++;m[k].evLost+=(d.evLoss||0)*(d.stake||1)});return m};
  const sev={};SEVERITY.forEach(s=>sev[s.id]=ds.filter(d=>d.severity===s.id).length);
  const result=T.outcomes.reduce((a,o)=>a+o.net,0),expected=T.outcomes.reduce((a,o)=>a+o.expected,0);
  const groups=by("group"),need=minForLeak||8;
  const leaks=Object.entries(groups).filter(([,g])=>g.n>=need&&g.ok<g.n).map(([k,g])=>({group:k,...g,acc:g.ok/g.n}))
    .sort((a,b)=>a.acc-b.acc||b.evLost-a.evLost);
  return{decisions:n,optimal:opt,accuracy:n?opt/n:null,score:sharkScore(T),severity:sev,
    evLost:ds.reduce((a,d)=>a+(d.evLoss||0)*(d.stake||1),0),
    byBest:by("best"),byGroup:groups,leak:leaks[0]&&leaks[0].acc<.85?leaks[0]:null,
    hands:T.outcomes.length,result,expected,luck:result-expected};
}
/* The verdict: skill from the Shark Score, luck from the result against
   what the decisions were worth. Defined rules, shown to the player. */
const VERDICT_RULES={skilledFrom:90,minDecisions:20};
function verdictOf(S){
  if(S.decisions<VERDICT_RULES.minDecisions)return null;
  const skilled=S.score>=VERDICT_RULES.skilledFrom,lucky=S.luck>0;
  return{skilled,lucky,label:`${skilled?"Skilled":"Poor decisions"} & ${lucky?"lucky":"unlucky"}`};
}
