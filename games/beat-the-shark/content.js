/* ===========================================================================
   content.js — the writing: every event, press conference, phone call, headline, transfer
   window and pre-season. Nearly every future change lands here.
   =========================================================================== */
/* ====================== TRANSFER WINDOW (owner) =========================== */
/* Transfer targets are TYPES of player, like the squad: the name tells you
   what you are buying, including the catch. Each carries the same traits as
   a squad player, so a signing changes attack, defence and trajectory -- not
   just the average. */
const TARGET_TYPES=[
  {pos:"FW",nm:"Veteran Target Man",   rt:[60,68],att:3,def:0, dev:-.5,inj:1.4,line:"thirty-three, knees like a deckchair, still scores"},
  {pos:"FW",nm:"Hungry Young Striker", rt:[50,58],att:2,def:0, dev:1.0,inj:.9, line:"released by a Championship club; nobody will say why"},
  {pos:"MF",nm:"Box-to-Box Grafter",   rt:[54,62],att:1,def:2, dev:0,  inj:.7, line:"never the best player, never the worst"},
  {pos:"MF",nm:"Flair Merchant",       rt:[56,66],att:4,def:-3,dev:0,  inj:1.1,line:"unplayable one week, invisible the next"},
  {pos:"DF",nm:"No-Nonsense Stopper",  rt:[54,62],att:0,def:4, dev:-.2,inj:.8, line:"has never passed forward, has never needed to"},
  {pos:"DF",nm:"Attacking Wing-Back",  rt:[52,60],att:3,def:-2,dev:.3, inj:1,  line:"more winger than defender, whatever the contract says"},
  {pos:"GK",nm:"Veteran Keeper",       rt:[56,64],att:0,def:3, dev:-.3,inj:.7, line:"forty next birthday, organises the whole back line"},
  {pos:"MF",nm:"Iceland Loan Signing", rt:[50,60],att:1,def:1, dev:.6, inj:.9, line:"FixtureShark rate his league; nobody else has heard of it"}
];
function makeTargets(n){
  return shuffle(TARGET_TYPES).slice(0,n).map(t=>{
    const rt=rnd(t.rt[0],t.rt[1]),fee=Math.round((rt-40)*rnd(9,18)*priceScale()),wage=Math.round((rt-40)*rnd(.4,.9)+3);
    return Object.assign({},t,{rt,rtf:rt,fee,wage,fit:rnd(80,97),out:0,goals:0,gone:false,quip:t.line,bought:false});
  });
}
/* What the XI's rating WOULD be after a signing or a sale -- worked out by
   actually trying the change and re-picking the best XI, then undoing it.
   A cheap signing who would not make the team shows no change, which is the
   honest answer; the old version averaged the WHOLE squad, so bench players
   looked like they mattered as much as starters. */
function ratingWith(extra,dropIdx){
  const was=S.squadList.length,wasGone=dropIdx!=null?S.squadList[dropIdx].gone:null,wasManual=S.manualXI;
  if(extra)S.squadList.push(Object.assign({},extra,{gone:false,out:0}));
  if(dropIdx!=null)S.squadList[dropIdx].gone=true;
  S.manualXI=null;
  const q=Math.round(xiStats().q);
  S.squadList.length=was;
  if(dropIdx!=null)S.squadList[dropIdx].gone=wasGone;
  S.manualXI=wasManual;
  return clamp(q);
}
function deltaChip(now,then){
  const d=then-now;
  const col=d>0?"var(--good)":d<0?"var(--bad)":"var(--mute)";
  return `<span style="font-family:var(--mono);font-size:12px;color:${col}">${now} → ${then} (${d>0?'+':''}${d})</span>`;
}
/* What can be spent right now. The owner spends the club's cash; the
   manager spends only the budget the owner gave him for January. */
function spendable(){return S.janBudget!=null&&ROLE.id==="manager"?Math.min(S.janBudget,S.cash):S.cash}
/* THE KNOCK (Beginner, after Gameweek 2): one named player, one decision.
   Replaces "Rest everyone under 70%", which benched nobody. */
/* One sale price per player: shown and paid alike. (It was re-rolled at
   random on every redraw, and rolled again when the sale went through.) */
// Beginner's economy is smaller (GBP120k in the bank, GBP41k a week in
// wages), so transfer prices are a third of the ten-game season's.
const priceScale=()=>NEUTRAL?1/3:1;
function saleFee(p){return Math.round((p.rt-38)*13*priceScale())}
/* THE WINDOW, SIMPLY (Chris): a choice between two players for your weakest
   position -- a better one who costs more, or a cheaper one -- with the fee,
   the wages, the cash left and the change in squad quality for each. */
function signingSpec(){
  const xi=currentXI().map(x=>({p:S.squadList[x.i],slot:x.slot})).filter(x=>x.p&&x.p.pos!=="GK");
  const weak=xi.sort((a,b)=>a.p.rt-b.p.rt)[0],pos=weak.p.pos;
  const names=pos==="FW"?["Late Bloomer","Loan Ranger"]:pos==="MF"?["Metronome","Bargain Bin"]:["Stopper","Free Transfer"];
  const mk=(nm,rt,feeX,wage)=>({pos,nm,rt,rtf:rt,fee:Math.round((rt-40)*feeX*priceScale()),wage,fit:94,out:0,goals:0,gone:false,att:weak.p.att,def:weak.p.def,line:"new signing",quirk:""});
  const A=mk(names[0],weak.p.rt+9,13,14),B=mk(names[1],weak.p.rt+4,6,6);
  // to one decimal: rounded to whole numbers, both signings showed the same change
  const quality=t=>{const was=S.squadList.length;S.squadList.push(t);recalcSquadRating();const q=xiStats().q;S.squadList.length=was;recalcSquadRating();return q.toFixed(1)};
  const nowQ=xiStats().q.toFixed(1);
  // the impact on your NEXT match, like every other decision (Chris)
  const[nh,na]=myFixture(S.mw),nHome=nh===CLUB,nOpp=nHome?na:nh;
  const nextP=t=>{const was=S.squadList.length;if(t)S.squadList.push(t);recalcSquadRating();const p=matchProbs(nOpp,nHome);S.squadList.length=was;recalcSquadRating();return p};
  const impact=p=>`next game v ${nOpp}: you ${p.xgf.toFixed(1)} xG · them ${p.xga.toFixed(1)} xG · clean sheet ${Math.round(p.cs*100)}% · win ${p.w}% · draw ${p.d}% · lose ${p.l}%`;
  const opt=t=>({t:`Sign ${t.nm} (${pos}, Q${t.rt})`,
    d:`${fmtMoney(t.fee)} now · wages +${fmtMoney(t.wage)} a week · ${fmtMoney(S.cash-t.fee)} left · squad quality ${nowQ} → ${quality(t)}`,
    fx:{cash:-t.fee},after(){S.wages+=t.wage;S.squadList.push(Object.assign({},t));recalcSquadRating()},
    out:`${t.nm} signs. ${S.cash-t.fee<0?"You're in the red: the bank will be in touch.":""}`});
  return{title:"Freshen up the squad",lede:`Two ${pos==="FW"?"strikers":pos==="MF"?"midfielders":"defenders"} are available. ${fmtMoney(S.cash)} in the bank; wages are the bigger cost.`,
    choices:[opt(A),opt(B),
      // not forced to buy (Chris: "only an option between 2 players")
      {t:"No signing: keep your money",d:`${fmtMoney(S.cash)} stays in the bank · squad quality ${nowQ}`,out:"You keep your powder dry."}]};
}
/* THE SPONSOR CALLS (Beginner, before the final day): a chance scenario
   that moves the weekly cash moments -- gate receipts or the wage bill. */
function sponsorSpec(){
  return{title:"The sponsor calls",lede:"A local firm wants in before the final day.",
    choices:[
      {t:"Shirt deal",d:"+£6k at the gate every game",fx:{gate:6},out:"The logo goes on the shirt."},
      {t:"Players' bonus",d:"Wages +£4k a week, the team lifted",fx:{wages:4,squad:6},out:"The dressing room is buzzing."}]};
}
function knockSpec(){
  const xi=currentXI().map(x=>S.squadList[x.i]).filter(p=>p&&p.pos!=="GK");
  const p=xi.sort((a,b)=>b.rt-a.rt)[0];const i=S.squadList.indexOf(p);
  return{title:`${p.nm} has a knock`,lede:`Your best outfield player, quality ${p.rt}. The physio isn't sure.`,
    choices:[
      {t:`Rest him for Gameweek 3`,d:"Weaker for one game, fully fit after",after(){p.out=1;p.fit=clamp(p.fit+15);recalcSquadRating()},out:`${p.nm} sits this one out.`},
      {t:`Risk him`,d:"Plays Gameweek 3; a 1 in 2 chance he's out for the rest",after(){S._knockRisk=i},out:`${p.nm} will play. Fingers crossed.`}]};
}
/* THE BANK CALLS (Beginner, before Gameweek 4): cash is now the issue. */
function bankSpec(){
  const sellable=alive().filter(p=>!p.gone&&p.pos!=="GK").sort((a,b)=>b.rt-a.rt);
  const p=sellable[1]||sellable[0],fee=saleFee(p);
  const weekly=Math.max(0,S.wages-18);
  return{title:"The bank has called",
    lede:`${fmtMoney(S.cash)} in the bank. Wages cost about ${fmtMoney(weekly)} a week more than the gate brings in. In the red at the end of a gameweek, the bank sells your best player.`,
    choices:[
      {t:`Sell ${p.nm} for ${fmtMoney(fee)}`,d:"Safe in the bank, a weaker team",after(){p.gone=true;recalcSquadRating()},fx:{cash:fee},out:`${p.nm} is sold. The bank is happy.`},
      {t:"Ride it out",d:S.cash-2*weekly<0?"Likely in the red before the end":"Should just about get through",out:`You hold your nerve.`}]};
}
function renderWindow(which,after){
  const targets=S.flags["tw_"+which]||(S.flags["tw_"+which]=makeTargets(3));
  const guru=!!LEVELS[LEVEL].guru;
  let sellOpen=false; // keep "Sell a player" open once someone is sold
  const sellListHTML=canSell=>`<p class="small">Selling raises cash and lowers quality.</p>
      ${S.squadList.map((p,i)=>({p,i})).filter(x=>!x.p.gone).sort((a,b)=>b.p.rt-a.p.rt).map(({p,i})=>`<div class="market">
        <div class="top"><span class="nm">${p.pos} ${p.nm}</span><span class="fee">${fmtMoney(saleFee(p))}</span></div>
        <div class="meta">Quality ${p.rt} · condition ${p.fit}${p.out?` · <span style="color:var(--bad)">out ${p.out}w</span>`:''} · ${p.line}</div>
        <button class="choice" style="margin:8px 0 0" data-sell="${i}" ${canSell?"":"disabled"}>
          <span class="t">${canSell?"Accept an offer":"Squad too small to sell"}</span>
          <span class="d">Cash now, quality gone</span></button></div>`).join('')}`;
  function draw(){
    paintHeader();
    const canSell=alive().length>5;
    document.getElementById('app').innerHTML=`<div class="card">
      <div class="datechip">${which==="summer"?"AUGUST · TRANSFER WINDOW":which==="freshen"?"AFTER GAMEWEEK 3 · TRANSFER WINDOW":"JANUARY · TRANSFER WINDOW"}</div>
      <h1>${which==="summer"?"The window is open":which==="freshen"?"Freshen up the squad":"The January window"}</h1>
      <p class="lede">${which==="summer"
        ? "Six weeks to change the squad you inherited. You have "+fmtMoney(S.cash)+" and a wage bill of "+fmtMoney(S.wages)+" a week."
        : which==="freshen"?`${ord(S.pos)} of six, ${fmtMoney(S.cash)} in the bank, two games to go. Sell to raise money, then sign.`
        : "Halfway, "+ord(S.pos)+" of six, and one last chance to change the shape of the season."}</p>
      ${ROLE.id==="manager"&&S.janBudget!=null?`<div class="outcome">The owner has given you <b>${fmtMoney(spendable())}</b> to spend this window.</div>`:""}
      <div class="shark"><div><b>FixtureShark</b>${sharkRate(S)} Every fee below is what the model says they are worth, give or take.</div></div>
      <div style="background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:10px 12px;margin-bottom:11px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-family:var(--mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--mute)">Squad quality</span>
          <span style="font-family:var(--disp);font-size:28px;font-weight:700;line-height:1">${S.squad}</span></div>
        <div style="font-size:12.5px;color:var(--ink2);margin-top:2px">The number that drives results. Each move shows what it becomes.</div></div>
      <h2>Available</h2>
      ${targets.map((t,i)=>`<div class="market">
        <div class="top"><span class="nm">${t.pos} ${t.nm}</span><span class="fee">${t.bought?"SIGNED":fmtMoney(t.fee)}</span></div>
        <div class="meta">Quality ${t.rt} · wants ${fmtMoney(t.wage)}/wk · condition ${t.fit}</div>
        ${(()=>{const vfm=(t.rt-38)/Math.max(1,t.fee/100);
          const verdict=vfm>2.6?'<span style="color:var(--good)">The model likes this one</span>':vfm<1.4?'<span style="color:var(--bad)">Overpriced on the model</span>':'';
          // Everyone gets the verdict; the Data guru also gets the figures behind it.
          return guru?`<div class="meta" style="color:var(--ink2)">Value for money: <b>${vfm.toFixed(2)}</b> quality per £100k ·
            <b>${((t.rt-38)/Math.max(1,t.wage)).toFixed(1)}</b> per £1k of wages${verdict?` — ${verdict.toLowerCase()}`:''}</div>`
            :verdict?`<div class="meta">${verdict}</div>`:'';})()}
        <div class="quip">${t.quip}</div>
        ${t.bought?"":`<button class="choice" style="margin:8px 0 0" data-buy="${i}" ${spendable()<t.fee?"disabled":""}>
          <span class="t">${spendable()<t.fee?"Over budget":"Sign him"} · ${deltaChip(S.squad,ratingWith(t,null))}</span>
          <span class="d">${fmtMoney(t.fee)} now, ${fmtMoney(t.wage)} a week after · cash would be ${fmtMoney(S.cash-t.fee)}</span></button>`}
      </div>`).join('')}
      ${guru?`<h2 style="margin-top:14px">Your squad</h2>${sellListHTML(canSell)}`:why(sellListHTML(canSell),"Sell a player",sellOpen)}
      <button class="choice primary" id="close" style="margin-top:12px"><span class="t">Close the window</span>
        <span class="d">${which==="summer"?"Get the season started":"Back to the run-in"}</span></button></div>`;
    document.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{
      const t=targets[+b.dataset.buy];if(spendable()<t.fee)return;if(S.janBudget!=null&&ROLE.id==="manager")S.janBudget-=t.fee;
      S.cash-=t.fee;S.wages+=t.wage;t.bought=true;S.signings++;
      S.squadList.push(Object.assign({},t,{bought:undefined,quip:undefined,gone:false,out:0,goals:0}));
      recalcSquadRating();S.fans=clamp(S.fans+4);draw();
    });
    document.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>{
      const p=S.squadList[+b.dataset.sell];
      S.cash+=saleFee(p);S.wages=Math.max(8,S.wages-Math.round((p.rt-40)*.5+3));
      // Sale money is spendable: it went into cash but not the manager's
      // January budget, so it could never be spent (Chris: "sold players,
      // had cash, but unable to buy").
      if(S.janBudget!=null)S.janBudget+=saleFee(p);
      p.gone=true;recalcSquadRating();S.fans=clamp(S.fans-(p.rt>60?11:4));sellOpen=true;draw();
    });
    document.getElementById('close').onclick=()=>{recalcSquadRating();after()};
  }
  draw();
}

/* ================== PRE-SEASON & WINTER BREAK (manager) =================== */
/* PRE-SEASON (Chris: the venue question was rubbish). A real dilemma that
   ties into the money rules: an offer for your best player. */
function preseasonSpec(){
  const p=alive().filter(x=>!x.gone).sort((a,b)=>b.rt-a.rt)[0];
  const fee=Math.round((p.rt-38)*16);
  return{
    title:`An offer for ${p.nm}`,
    lede:`A bigger club wants your best player and will pay ${fmtMoney(fee)}.`,
    choices:[
      {t:`Keep ${p.nm}`,d:"Your best player stays",fx:{squad:2},out:`${p.nm} stays. The dressing room notices.`},
      {t:`Sell for ${fmtMoney(fee)}`,d:"Money in the bank, a weaker team",fx:{cash:fee,squad:-2},
        after(){p.gone=true;recalcSquadRating()},out:`${p.nm} is gone. The money is in the bank.`}]};
}
function winterSpec(){return{
  title:"The winter break",
  lede:`Ten days with no match. ${ord(S.pos)} of six, and the squad is at ${S.fatigue}% fatigue.`,
  choices:[
    {t:"Warm-weather camp in Spain",d:"Reset the legs, spend the money",fx:{cash:-48,condition:14,fatigue:-16,squad:3},
      out:"Ten days of sun. They return looking like a different side."},
    {t:"The Christmas party",d:"Morale up. Judgement down.",fx:{squad:9,fans:2,condition:-5},
      delayed:rng()<.55?{fans:-9,squad:-4}:null,
      delayedText:"A photograph from the Christmas party has surfaced. The chairman has seen it. Everyone has seen it.",
      out:"Fancy dress, a karaoke machine, and a group chat that will not survive contact with the press."},
    {t:"Train straight through",d:"No break, no nonsense",fx:{squad:-5,fatigue:6,condition:3,board:4},
      out:"Boxing Day off, and nothing else. They notice everyone else is in Marbella."},
    {t:"Give them ten days off",d:"Trust them",fx:{fatigue:-20,condition:8,squad:4},
      delayed:{condition:-7},delayedText:"Three players have come back heavier than they left.",
      out:"Go home. See your families. Be back on the fourth."}]};
}
/* =================== SUMMER & MIDWINTER (star player) ===================== */
function playerSummerSpec(){return{
  title:"Your summer",
  lede:"Six weeks, a small amount of money and a phone that will not stop.",
  choices:[
    {t:"Train privately every day",d:"Unglamorous, effective",fx:{fitness:14,form:6,interest:4},
      out:"A running coach, a gym in an industrial unit, nobody watching. You have never felt better."},
    {t:"Dubai with the lads",d:"Two weeks, no photographs, allegedly",fx:{form:-5,fitness:-8,fans:2},
      delayed:{fans:-7,form:-3},delayedText:"A video of you at four in the morning in Dubai has done the rounds. You look magnificent and unemployable.",
      out:"You have a wonderful time and come back a yard slower."},
    {t:"A summer at the family caravan",d:"Cheap, quiet, restful",fx:{fitness:8,form:2,fans:4},
      out:"Rain, a leaking awning, and the best sleep you have had in a year."},
    {t:"Open a coffee shop with your brother",d:"A business for after football",fx:{cash:0,form:-3,fitness:-2,interest:-3},
      delayed:{form:-4},delayedText:"The coffee shop is haemorrhaging money and you are doing the Tuesday shifts yourself.",
      out:"Forty grand of your own money and a lot of opinions about oat milk."}]};
}
function playerWinterSpec(){return{
  title:"Midwinter",
  lede:`Your form is ${Math.round(S.form)} and the transfer window is open. Everything you do now is watched.`,
  choices:[
    {t:"Say nothing and play",d:"Boring is a strategy",fx:{form:7,fans:6},out:"Head down. Two goals in three games."},
    {t:"Let your agent brief a newspaper",d:"Engineer the move",fx:{interest:16,fans:-13,form:-3},
      delayed:{fans:-8},delayedText:"The briefing was traced back to your agent, and the supporters' forum has your name in a thread title.",
      out:"A back-page story about your 'frustration'. You did not use that word. He did."},
    {t:"Visit the children's hospital, no cameras",d:"Nobody will know",fx:{fans:5,form:3},
      delayed:{fans:9},delayedText:"A nurse mentioned your visits on local radio. You had told nobody, and that is precisely why it has landed.",
      out:"Two hours on a Tuesday. You go back the following week."},
    {t:"Get sent off arguing on the touchline",d:"You have had enough",fx:{form:-8,squad:-4,fans:-5,board:-4},
      out:"Second yellow for dissent, in a game you were winning. The long walk is longer than it looks on television."}]};
}

/* ============================ ROLE EVENT POOLS ============================ */
const SHAPES={
/* ---- OWNER: memorable ones ---- */
kebab(){const amt=rnd(70,150);
  return{sig:"kebab",title:`A kebab shop wants to name the stand`,
    lede:`${fmtMoney(amt)} a season for "The Golden Skewer Stand, in association with Aydin's".`,
    body:`<p>Aydin has had a season ticket since 1994 and has never missed an away game. His signage is, in his own words, "very yellow".</p>`,
    choices:[{t:"Take the money",d:fmtMoney(amt)+" a season",fx:{cash:amt,fans:6},
        out:`It is extremely yellow. The away end sing about it within a fortnight, which Aydin frames and hangs above the grill.`},
      {t:"Take it, but negotiate the sign down",d:"Smaller money, smaller sign",fx:{cash:Math.round(amt*.65),fans:2},
        out:`A tasteful sign, a smaller cheque, and a slightly hurt kebab shop owner.`},
      {t:"Hold out for a corporate sponsor",d:"There isn't one",fx:{board:-3,fans:-5},
        delayed:{cash:-20},delayedText:`No corporate sponsor came. The stand is unnamed and Aydin now sponsors ${RIVALS[1].n}.`,
        out:`You tell Aydin you are exploring other options. He is very gracious about it, which makes it worse.`}]}},
mascot(){return{sig:"mascot",title:"The mascot has been sent off",
  lede:"Finny the Shark was dismissed for an altercation with a linesman. There is footage, and it is on national news.",
  body:`<p>Inside the costume is Dennis, sixty-one, a volunteer of nineteen years' standing. The FA want a response by Friday.</p>`,
  choices:[{t:"Sack Finny",d:"Decisive, and brutal",fx:{board:5,fans:-14},
      delayed:{fans:-6},delayedText:"There is a banner at the next home game. It says FREE DENNIS, and it is enormous.",
      out:"Dennis hands in the head in a Tesco bag. Nobody feels good about it."},
    {t:"Back him publicly",d:"He is a club institution",fx:{fans:16,board:-7},
      out:`You tell the press that Finny "saw something the officials did not" and refuse all follow-ups. The clip does four million views.`},
    {t:"Quietly reassign him to the club shop",d:"No statement, no drama",fx:{fans:2,board:2},
      out:"Dennis now runs the till on matchdays, and is significantly better at it."}]}},
wedding(){return{sig:"wedding",title:"There is a wedding on the pitch",
  lede:"The previous owner sold summer bookings to raise cash. One of them is next Saturday. You have a match next Saturday.",
  choices:[{t:"Honour the booking, play elsewhere",d:"Rent a ground, keep the peace",fx:{cash:-40,fans:-6,squad:-3},
      out:"You play a 'home' game eleven miles away in front of 400 people, while somebody called Nadine gets married on your centre circle."},
    {t:"Cancel the wedding, refund double",d:"Expensive and correct",fx:{cash:-65,fans:4,board:-2},
      out:"Nadine is furious, then gracious, then invites the squad to the evening do. Four of them go."},
    {t:"Both. Wedding at noon, kick-off at three",d:"What could go wrong",fx:{cash:25,squad:-6,fans:8},
      delayed:{squad:-4},delayedText:"The pitch never recovered from the marquee pegs. It is playing like a car park.",
      out:"Confetti in the six-yard box at kick-off. The referee is, remarkably, fine with it."}]}},
barfly(){const r=pick(RIVALS).n,v=rnd(240,620);
  return{sig:"barfly",title:`The owner of ${r} has found you at the bar`,
    lede:`He has had three pints and would like to buy your best player. ${fmtMoney(v)}, he says, cash, tonight.`,
    body:`<p>He is serious, in the way that men who own football clubs are serious at eleven o'clock at night.</p>`,
    choices:[{t:"Shake on it",d:fmtMoney(v)+", to your direct rival",fx:{cash:v,squad:-10,fans:-15,board:3},
        after(){const b=alive().sort((x,y)=>y.rt-x.rt)[0];if(b)b.gone=true;recalcSquadRating()},
        out:`You shake on it at the bar and regret it by the car park. He does pay, though, which is more than the last one did.`},
      {t:"Tell him to put it in writing on Monday",d:"Sober terms, or none",fx:{board:4},
        delayed:{cash:Math.round(v*.8)},delayedText:`${r} did put it in writing, and paid a little less than the bar price. You still sold him.`,
        out:"He calls you a coward, warmly, and buys you a drink."},
      {t:"Refuse, loudly",d:"Not to them, not ever",fx:{fans:13,board:-5},
        out:`Somebody films it. By morning you are a folk hero at ${STADIUM} and a punchline everywhere else.`}]}},
scout(){return{sig:"scout",title:"Your chief scout is ninety-one",
  lede:"Ron has been at the club since 1968 and has not driven since 2011. He watches games on a portable television.",
  body:`<div class="shark"><div><b>FixtureShark</b>Of the last eleven players Ron recommended, the model rated two. Those two were excellent.</div></div>`,
  choices:[{t:"Retire him with a testimonial",d:"Dignity, and a data service instead",fx:{cash:-22,squad:5,fans:-4},
      out:"A packed lounge, a carriage clock and a genuinely moving speech. Then you buy a subscription."},
    {t:"Keep him, add the data alongside",d:"Both",fx:{cash:-14,squad:3,fans:3},
      out:"Ron and a laptop. He calls it 'the machine' and disagrees with it constantly, sometimes correctly."},
    {t:"Leave it exactly as it is",d:"He has earned it",fx:{fans:5,board:-3},
      delayed:{squad:-5},delayedText:"Ron's two January recommendations cannot get in the side. He is the first to admit it.",
      out:"Ron soldiers on. So does the recruitment."}]}},
director(){return{sig:"director",title:"A director wants to buy in",
  lede:`${fmtMoney(300)} for twenty per cent, from a man who describes himself as "a disruptor".`,
  body:`<p>He has made his money in vape distribution and has already drawn a rebrand on a napkin. The shark has sunglasses on it.</p>`,
  choices:[{t:"Take the money",d:fmtMoney(300)+", and the napkin",fx:{cash:300,fans:-7,board:6},
      delayed:{fans:-5},delayedText:"The disruptor has given an interview about 'legacy fans'. It went about as well as you would expect.",
      out:"The money clears. The napkin, mercifully, does not."},
    {t:"Take the money, refuse the rebrand",d:"Written into the deal",fx:{cash:270,board:4,fans:2},
      out:"Clause 14 protects the badge. He signs it, visibly wounded."},
    {t:"Decline",d:"Not at that price",fx:{fans:6,board:-6},out:"He buys a padel centre instead and seems happier."}]}},
ticketprice(){return{sig:`tix|${S.ticketLevel}`,title:"Season ticket prices are set this month",
  lede:"Nobody has raised them since the relegation before last.",
  choices:[{t:"Increase by 10%",d:"More per head, fewer heads",fx:{cash:70,fans:-11},after(){S.ticketLevel++},
      out:"Announced on a Friday afternoon, which fools nobody."},
    {t:"Freeze them",d:"Safe, and it says something",fx:{fans:4,board:1},out:"A freeze, and a statement about the cost of living."},
    {t:"Cut by 15% and fill the ground",d:"Less per head, more noise",fx:{cash:-40,fans:14},
      delayed:{cash:55},delayedText:"The cheaper tickets worked. Attendance is up by a third and the bars are busy.",
      after(){S.ticketLevel--},out:"The cheapest seats in the division."}]}},
stadiumuse(){return{sig:"stad",title:"The stadium sits empty six days a week",
  lede:"There are offers, and none of them are football.",
  choices:[{t:"Host a concert",d:"Good money, ruined pitch",fx:{cash:130,fans:-4},delayed:{squad:-5},
      delayedText:"The pitch has not recovered from the concert. It is playing like a ploughed field.",out:"Two nights in June, sold out."},
    {t:"Conferences and weddings",d:"Steady, unglamorous",fx:{cash:45,wages:3},delayed:{cash:40},
      delayedText:"The events business is ticking over nicely.",out:"Mostly weddings."},
    {t:"Keep it for football",d:"Protect the pitch",fx:{squad:3,fans:3},out:"The pitch stays immaculate and the account stays empty."}]}},
creditor(){const c=pick([["HMRC","a winding-up petition"],["the bank","calling in the facility"],["the council","pulling the safety certificate"]]),
    amt=[60,140,280][rnd(0,2)];
  return{sig:`cred|${c[0]}|${amt}`,title:`${c[0]} want ${fmtMoney(amt)}`,lede:`Fail to pay and they are threatening ${c[1]}.`,
    choices:[{t:"Pay in full",d:fmtMoney(amt),fx:{cash:-amt,board:4},out:"Paid."},
      {t:"Negotiate terms",d:"A third now, a surcharge on the rest",fx:{cash:-Math.round(amt*.35),debt:Math.round(amt*.75),board:-2},
        delayed:{cash:-Math.round(amt*.2)},delayedText:`The ${c[0]} instalment came out of the account.`,out:"Spread over six months."},
      {t:"Ignore it",d:"Buys weeks, costs more",fx:{debt:Math.round(amt*1.15),board:-6},
        delayed:{cash:-Math.round(amt*.3),board:-6},delayedText:`${c[0]} escalated, and the board heard about it from someone else.`,out:"You let it slide."}]}},
rivalshark(){const r=pick(RIVALS.slice(0,2)).n;
  return{sig:`rival|${r}`,title:`${r} have signed a player you looked at`,lede:"For a third of what you were quoted.",
    body:`<div class="shark"><div><b>FixtureShark</b>Their recruitment staff run every target through the value model. Yours works from a hunch and a DVD.</div></div>`,
    choices:[{t:"Subscribe to the data",d:"A small cost, better signings",fx:{cash:-18,squad:4,board:3},out:"You start buying on numbers rather than nostalgia."},
      {t:"Trust your scouts",d:"Thirty years of instinct",fx:{board:-3},delayed:{squad:-4},
        delayedText:"Two of this season's signings cannot get in the side. Both were flagged as poor value.",out:"Loyalty over evidence."}]}},
/* ---- MANAGER ---- */
psychic(){return{sig:"psychic",title:"The chairman has hired a psychic",
  lede:"She has been given a seat in the directors' box and an opinion on team selection.",
  body:`<p>Her name is Marguerite. She has told the chairman that the number nine has "a heavy aura", and the chairman has repeated this to you twice.</p>`,
  choices:[{t:"Humour her",d:"Nod, then ignore it",fx:{board:5,squad:-2},
      out:"You thank Marguerite for her insight and pick the team you were always going to pick."},
    {t:"Refuse to have her near the squad",d:"A line in the sand",fx:{board:-9,squad:6,fans:4},
      out:"A short, memorable conversation in the car park. She tells you your aura is 'stubborn', which is fair."},
    {t:"Let the players meet her",d:"See what happens",fx:{squad:rng()<.5?7:-7,fans:3},
      delayed:{squad:-3},delayedText:"Two players now refuse to play without their 'cleansed' shinpads. One of them is the captain.",
      out:"Forty minutes in the canteen. Three of them are converts by lunchtime."}]}},
kitcolour(){return{sig:"kit",title:"The kit has arrived in the wrong colour",
  lede:"Two hundred shirts, and they are pink. Not a heritage pink. A very confident pink.",
  choices:[{t:"Wear them",d:"Own it completely",fx:{fans:9,squad:-3,cash:20},
      delayed:{fans:7},delayedText:"The pink shirt has sold out twice. The club shop has never had a season like it.",
      out:"You put out a photograph of the captain in it, captioned only with a shark emoji. It goes everywhere."},
    {t:"Send them back",d:"Six weeks in last year's kit",fx:{cash:-15,fans:-4},out:"Last season's shirts, washed grey, until mid-October."},
    {t:"Blame the supplier publicly",d:"Not your fault",fx:{board:2,fans:-3,cash:10},out:"A statement. The supplier replies with a statement. Nobody wins a statement."}]}},
bus(){return{sig:"bus",title:"The team bus has died on the A38",
  lede:"Kick-off is in two hours and you are forty miles away on a hard shoulder.",
  choices:[{t:"Taxis, immediately",d:"Expensive, and they arrive",fx:{cash:-14,fatigue:4,squad:-2},
      out:"Six taxis, one of which contains the goalkeeper and all of the kit. They arrive twenty minutes before kick-off."},
    {t:"Ask the opposition for help",d:"Swallow the pride",fx:{fans:-2,squad:2,board:-2},
      delayed:{fans:5},delayedText:"The story of the rival club sending their own bus has gone national, and everyone comes out of it well.",
      out:"Their chairman sends their bus. It is nicer than yours, and everybody notices."},
    {t:"Request a postponement",d:"Fixture congestion later",fx:{fatigue:-6},delayed:{fatigue:11,squad:-3},
      delayedText:"The rearranged match means three games in seven days. The legs have gone.",out:"Granted, grudgingly."}]}},
tiktok(){const p=pick(alive()).nm;
  return{sig:`tiktok|${p}`,title:`${p} has posted a video from the treatment room`,
    lede:"It is very funny. It also shows the physio's whiteboard, which lists every injury at the club.",
    choices:[{t:"Make him take it down and fine him",d:"By the book",fx:{squad:-5,board:5,fans:-2},out:"Deleted within the hour, screenshotted within ten minutes."},
      {t:"Let it stand",d:"They are young, it is 2026",fx:{squad:5,fans:7},
        delayed:{squad:-4},delayedText:"Saturday's opponents targeted two players whose injuries were on that whiteboard.",out:"Four hundred thousand views by Thursday."},
      {t:"Put him in charge of the club account",d:"Turn it into an asset",fx:{fans:11,squad:3,cash:8},
        out:"He is genuinely good at it. The club account gains more followers in a month than in six years."}]}},
training(){return{sig:`train|${S.fatigue>55?"tired":"fresh"}`,title:"How hard do you train them this week?",
  lede:`Fatigue is at ${S.fatigue}%. There is a match on Saturday and another on Tuesday.`,
  choices:[{t:"Full intensity",d:"Sharper, and likelier to break",fx:{squad:4,fatigue:9,condition:-4},
      delayed:{squad:-6},delayedText:"Two hamstrings have gone. Both were flagged by the physio.",out:"Double sessions."},
    {t:"Recovery week",d:"Fresher legs, blunter edge",fx:{fatigue:-18,squad:-2,condition:8},out:"Pool, bikes and video."},
    {t:"Split the squad",d:"Starters rest, fringe players work",fx:{fatigue:-9,squad:1,board:1,condition:3},out:"Two groups, two plans."}]}},
tactics(){return{sig:`tac|${S.pos}`,title:"They have worked you out",
  lede:"Three opponents in a row have set up the same way, and it keeps working.",
  body:`<div class="shark"><div><b>FixtureShark</b>The model has you conceding from the same channel in four of the last five. Your next opponent can see it too.</div></div>`,
  choices:[{t:"Change the system",d:"New shape, unfamiliar roles",fx:{squad:-3,fatigue:4},delayed:{squad:8},
      delayedText:"The new shape has clicked. They look like a different side.",out:"Two weeks of ugly training."},
    {t:"Do it better, not differently",d:"Back what you know",fx:{squad:2,board:2},delayed:{squad:-5},
      delayedText:"Same problem, fifth match running. Now it is a story.",out:"Drill it harder."},
    {t:"Ask the owner for a specialist",d:"Not your money",fx:{board:-2,squad:3},out:"A left-sided defender arrives on loan."}]}},
youth(){const y=pick(SURNAMES);
  return{sig:`yth|${y}`,title:"The kid is ready. Probably.",lede:`${y}, seventeen, has been unplayable in training.`,
    choices:[{t:"Start him",d:"Sink or swim",fx:{squad:2,fans:8},delayed:rng()<.5?{squad:5,fans:6}:{squad:-5,fans:-4},
        delayedText:rng()<.5?`${y} has been the best thing about the last month.`:`${y} was overwhelmed and has lost his confidence.`,out:"He starts on Saturday."},
      {t:"Twenty minutes off the bench",d:"Ease him in",fx:{squad:1,fans:3},out:"A gentle introduction."},
      {t:"Loan him out",d:"Men's football elsewhere",fx:{squad:-1,cash:6},out:"Off to a non-league side until March."}]}},
discipline(){const p=pick(alive()).nm;
  return{sig:`disc|${p}`,title:`${p} was photographed out at two in the morning`,lede:"The match is on Saturday. The photograph is already everywhere.",
    choices:[{t:"Drop him and say why",d:"Public standards",fx:{squad:-3,fans:7,board:5},out:"He watches from the stand."},
      {t:"Deal with it privately",d:"Fine him, play him",fx:{squad:3,fans:-4},out:"A fine, and no comment."},
      {t:"Defend him publicly",d:"Back your player",fx:{squad:6,fans:-6,board:-4},delayed:{board:-5},
        delayedText:"Defending him has not aged well. He has been late twice since.",out:"You take the flak for him."}]}},
medical(){const who=pick(alive()).nm,wk=pick([2,4,8]);
  return{sig:`med|${who}|${wk}`,title:`${who} is out for ${wk} weeks`,lede:wk>=8?"That is most of what is left.":"Back before it matters, probably.",
    body:squadHTML(),
    choices:[{t:"Ask the owner for a loan signing",d:"Not your money to spend",fx:{squad:4,board:-2},out:"A short-term replacement arrives."},
      {t:"Promote from the academy",d:"Free, and the supporters enjoy it",fx:{squad:-3,fans:7},out:"A seventeen-year-old gets a shirt."},
      {t:"Cope",d:"Same eleven, more minutes",fx:{squad:-2,fatigue:8,condition:-5},delayed:{fatigue:6},
        delayedText:"Covering the injury has run the rest of them into the ground.",out:"You make do."}]}},
askowner(){return{sig:`ask|${S.mw}`,title:"You need money the owner will not spend",lede:"One loan signing would change the run-in.",
  choices:[{t:"Ask privately",d:"Protects the relationship",fx:{board:2,squad:2},out:"He agrees to a loan. Less than you wanted."},
    {t:"Ask publicly, through the press",d:"Pressure works, and it burns",fx:{fans:9,board:-6,squad:2},delayed:{board:-12},
      delayedText:"The owner has not forgotten being asked for money on television.",out:"The supporters back you loudly."},
    {t:"Make do",d:"Work with what you have",fx:{board:6,squad:-2,fatigue:5},out:"The same eleven play every week."}]}},
/* ---- STAR PLAYER: risk, reward and numbers, not morality ----
   Note on design: these used to be moral dilemmas (visit the hospital, be
   loyal). They read well and played flat, because there was no calculation
   to make. Every one below now states the odds, the stake and the payoff,
   and FixtureShark supplies the projection you are betting against. */
selfpens(){
  const other=pick(alive().filter(p=>p.nm!==me().nm))||{nm:"the captain"};
  const mine=rnd(72,88),his=rnd(74,92),pens=rnd(3,6);
  return{sig:`pens|${mine}`,title:"Penalty duty is up for grabs",
    lede:`${other.nm} has taken them for three years.`,
    body:`<div class="shark"><div><b>FixtureShark spot-kick model</b>
      You convert at <b>${mine}%</b> across your career, ${other.nm} at <b>${his}%</b>.
      The model expects <b>${pens} penalties</b> in the remaining fixtures — worth roughly
      <b>${(pens*mine/100).toFixed(1)} goals</b> to you, or <b>${(pens*his/100).toFixed(1)}</b> to him.</div></div>`,
    choices:[
      {t:"Take them",d:`+${(pens*mine/100).toFixed(1)} expected goals, and a teammate who stops speaking to you`,
        fx:{form:7,interest:6,squad:-6},delayed:{squad:-3},
        delayedText:`${other.nm} has not passed to you in three matches. The data says so, and so does everyone watching.`,
        out:`You take the ball. The first one goes in off the underside of the bar.`},
      {t:"Leave them with him",d:`He is ${his>mine?"the better taker on the numbers":"marginally worse, but it is his"}`,
        fx:{squad:6,fans:3,form:-2},out:`You hand it over. He scores two within a month, and nobody forgets who let him.`},
      {t:"Ask for them only when you are level or behind",d:"Share the risk, keep the upside",
        fx:{form:3,squad:1,interest:2},out:`A sensible split that annoys precisely nobody, which at this club is an achievement.`}]}},
selfcontract(){
  const app=rnd(3,7),goal=rnd(8,18),projApp=rnd(24,32),projGoals=rnd(7,16);
  return{sig:`contract|${goal}`,title:"Your new contract: how do you want paying?",
    lede:"Same basic wage. The bonus structure is yours to choose.",
    body:`<div class="shark"><div><b>FixtureShark projection</b>
      The model expects you to make <b>${projApp} appearances</b> and score <b>${projGoals} goals</b> this season.
      Appearance money would pay <b>${fmtMoney(app*projApp)}</b>; goal money would pay <b>${fmtMoney(goal*projGoals)}</b>.
      It also rates your injury risk as <b>${S.fitness<80?"elevated":"normal"}</b>.</div></div>`,
    choices:[
      {t:`${fmtMoney(app)} per appearance`,d:`Safe. Projected ${fmtMoney(app*projApp)} if you stay fit`,
        fx:{form:2},delayed:{form:2},delayedText:"The appearance money is ticking over. Dull, and it has cleared your overdraft.",
        out:`Signed. You will be paid for turning up, which you intend to do a lot of.`},
      {t:`${fmtMoney(goal)} per goal`,d:`Volatile. Projected ${fmtMoney(goal*projGoals)}, and nothing in a barren run`,
        fx:{form:5,interest:4},delayed:rng()<.5?{form:6,interest:5}:{form:-6},
        delayedText:rng()<.5?"The goal bonus has focused you. Five in six, and the scouts have noticed.":"Four games without a goal and you are shooting from everywhere. It shows.",
        out:`Signed. Every shot now has a number attached to it.`},
      {t:"Split it, and add a relegation clause",d:"Less upside, and you are protected if the club goes down",
        fx:{form:3,squad:3,fans:-2},out:`Your agent calls it prudent. The chairman calls it pessimistic. Both are right.`}]}},
selfrole(){
  const xg=(rnd(30,55)/100).toFixed(2),xa=(rnd(18,40)/100).toFixed(2);
  return{sig:`role|${xg}`,title:"The manager wants to move you into the ten",
    lede:"Off the front instead of leading the line.",
    body:`<div class="shark"><div><b>FixtureShark role model</b>
      As a nine you average <b>${xg} expected goals</b> per ninety and <b>${xa} expected assists</b>.
      In the division above, the model has <b>eleven</b> clubs wanting a nine and <b>four</b> wanting a ten —
      but the tens who move go for <b>thirty per cent more</b>.</div></div>`,
    choices:[
      {t:"Stay as the nine",d:"More goals, a bigger market, less football",fx:{form:5,interest:5},
        out:`You stay on the shoulder. Simpler, and it is what the scouts came to watch.`},
      {t:"Move into the ten",d:"Fewer goals, more of the game, a smaller but richer market",
        fx:{form:-3,interest:8,squad:4},delayed:{form:7},
        delayedText:"The ten has clicked. You are touching the ball twice as often and the assists are arriving.",
        out:`A month of looking lost, and then it starts to make sense.`},
      {t:"Refuse and say why",d:"Protect your numbers",fx:{form:2,squad:-5,board:-3},
        out:`You tell him the goals are your currency. He does not disagree, which is somehow worse.`}]}},
selfdeadline(){
  const a={n:"a Championship side",fee:rnd(900,1600),mins:rnd(900,1500),w:rnd(28,42)};
  const b={n:"a League One title chaser",fee:rnd(400,800),mins:rnd(2200,2900),w:rnd(14,22)};
  return{sig:`deadline|${a.fee}`,title:"Deadline day: two offers, one afternoon",
    lede:"Both want an answer by eleven o'clock tonight.",
    body:`<div class="shark"><div><b>FixtureShark minutes projection</b>
      ${a.n}: fee <b>${fmtMoney(a.fee)}</b>, wages <b>${fmtMoney(a.w)}/wk</b>, projected
      <b>${a.mins} minutes</b> — the model has you as a squad player.<br>
      ${b.n}: fee <b>${fmtMoney(b.fee)}</b>, wages <b>${fmtMoney(b.w)}/wk</b>, projected
      <b>${b.mins} minutes</b> — first choice, and promotion would take you up anyway.</div></div>`,
    choices:[
      {t:`Take the money and the bench`,d:`${fmtMoney(a.fee)} to your club, ${a.mins} projected minutes`,
        fx:{interest:14,fans:-6},after(){S.cash+=a.fee;const m=me();if(m)m.gone=true;recalcSquadRating()},
        out:`The big fee lands in your club's account on deadline day. You will be watching a lot of football from a padded seat.`},
      {t:`Take the football`,d:`${fmtMoney(b.fee)} to your club, ${b.mins} projected minutes`,
        fx:{interest:8,fans:2},after(){S.cash+=b.fee;const m=me();if(m)m.gone=true;recalcSquadRating()},
        out:`Less money for everyone, and you will play every week. The model likes it more than your agent does.`},
      {t:"Stay and run your contract down",d:"Nothing now, a free transfer in summer",
        fx:{fans:14,squad:6,form:4,interest:-6},
        delayed:{interest:10},delayedText:"Staying has worked. You are playing every week and three clubs have been watching.",
        out:`Your club gets nothing, which the supporters will forgive because you stayed.`}]}},
selfsponsor(){
  const flat=rnd(30,60),per=rnd(4,9),projG=rnd(7,16);
  return{sig:`spon|${per}`,title:"A sportswear brand wants you",
    lede:"Two structures on the table.",
    body:`<div class="shark"><div><b>FixtureShark</b>The model projects <b>${projG} goals</b> this season,
      which would pay <b>${fmtMoney(per*projG)}</b> on the performance deal against <b>${fmtMoney(flat)}</b> flat.</div></div>`,
    choices:[
      {t:`${fmtMoney(flat)} flat`,d:"Guaranteed, whatever happens",fx:{form:1},out:`Signed. Boring money is still money.`},
      {t:`${fmtMoney(per)} per goal`,d:`Projected ${fmtMoney(per*projG)}, nothing if the goals dry up`,
        fx:{form:3,interest:2},delayed:rng()<.45?{form:-5}:{form:4},
        delayedText:rng()<.45?"Chasing the bonus has made you greedy in front of goal.":"The bonus has sharpened you.",
        out:`Every finish now has a price on it.`},
      {t:"Turn it down and stay unsponsored",d:"No obligations, no photoshoots",fx:{form:4,fitness:3},
        out:`Your agent is baffled. Your Tuesdays are your own.`}]}},
selfextras(){
  const risk=S.fitness<78?38:18;
  return{sig:`extras|${risk}`,title:"Extra finishing sessions, or recovery?",
    lede:`You are at ${Math.round(S.fitness)}% fitness with three matches in eight days.`,
    body:`<div class="shark"><div><b>FixtureShark load model</b>
      At your current load, extra sessions carry roughly a <b>${risk}%</b> soft-tissue risk over the next fortnight,
      against an expected <b>+6 form</b> if you get through them clean.</div></div>`,
    choices:[
      {t:"Stay out after training every day",d:`+6 form, ${risk}% chance of a fortnight out`,
        fx:{form:6,fitness:-7},delayed:rng()*100<risk?{fitness:-22,form:-10}:null,
        delayedText:"The extra sessions caught up with you. A calf, and a fortnight in the gym.",
        out:`Two hundred finishes a week, alone, in the dark.`},
      {t:"Recovery only",d:"No gain, no risk",fx:{fitness:11,form:-2},out:`Ice baths and bikes. Dull, and you are fit on Saturday.`},
      {t:"Alternate the two",d:"Half the gain, half the risk",fx:{form:3,fitness:2},out:`A compromise your physio can live with.`}]}},
selfinjury(){
  const risk=S.fitness<72?45:28,wk=pick([3,6]);
  return{sig:`inj|${risk}`,title:"Your hamstring is not right",
    lede:`Fitness ${Math.round(S.fitness)}%. There are scouts at Saturday's match.`,
    body:`<div class="shark"><div><b>FixtureShark medical model</b>
      Playing carries a <b>${risk}%</b> chance of a genuine tear, which would cost about
      <b>${wk} weeks</b> and, on the model, roughly <b>${(wk*1.4).toFixed(0)} points</b> of interest from suitors.</div></div>`,
    choices:[
      {t:"Play",d:`${risk}% chance of ${wk} weeks out, and the scouts see you`,
        fx:{form:5,interest:5,squad:3},delayed:rng()*100<risk?{fitness:-24,form:-12,interest:-10}:null,
        delayedText:`The hamstring went properly. ${wk} weeks, and the scouts have moved on to somebody else.`,
        out:`You play, and you get through it. Whether it holds is a different question.`},
      {t:"Sit it out",d:"No risk, no shop window",fx:{fitness:18,interest:-4,fans:-3},
        out:`You watch from the stand. The phone-in questions your commitment, as it always does.`},
      {t:"Play the first half only",d:`Roughly half the risk, half the exposure`,
        fx:{form:2,interest:2,fitness:-4},delayed:rng()*100<risk/2?{fitness:-16,form:-6}:null,
        delayedText:"Even forty-five minutes was too many. It has tightened again.",
        out:`Forty-five minutes, then off, with the scouts still scribbling.`}]}},
selfcaptain(){
  return{sig:"cap",title:"The manager offers you the armband",
    lede:"The current captain is thirty-four and has started twice since Christmas.",
    body:`<div class="shark"><div><b>FixtureShark</b>Across the division, players who take the armband
      average <b>+4 form</b> over the following ten matches, and <b>-2</b> in the fortnight after they take it.</div></div>`,
    choices:[
      {t:"Take it",d:"-2 now, +4 across the run-in",fx:{squad:5,fans:9,form:-2},delayed:{form:6},
        delayedText:"The responsibility has settled you. Best on the pitch twice running.",out:`You take the armband.`},
      {t:"Refuse, because it is his",d:"Dressing room over numbers",fx:{squad:8,fans:4},
        out:`He hears about it and finds you afterwards. Neither of you mentions it again.`},
      {t:"Take it, but call it temporary",d:"Half the effect, half the commitment",fx:{squad:2,fans:2,form:1},
        out:`Nobody is quite sure who the captain is, which is its own kind of answer.`}]}},
/* ---- HOMAGE EVENTS: the furniture of English football, invented fresh.
   Deliberately NOT real people or their actual words -- these are new
   scenes that rhyme with moments every supporter already knows. ---- */
/* BONUS STRUCTURES. One player per turn, and the position decides what the
   bonus actually does -- a goal bonus on a striker is a different decision
   from a goal bonus on a centre-back. That is where the variety comes from.
   Liabilities are settled at the end of the season, against real results. */
bonus(){
  /* Found by the season simulator: if injuries leave nobody AVAILABLE,
     this used to dereference undefined and crash the page. Injured players
     can still sign a bonus -- they are at the club, just not playing. */
  const cands=alive().filter(p=>!S.bonuses.some(b=>b.nm===p.nm));
  const p=pick(cands.length?cands:alive());
  const G={FW:{at:5,de:-1,note:"a striker chasing goals is still mostly a striker"},
           MF:{at:3,de:-3,note:"he will arrive late in the box, and leave gaps behind him"},
           DF:{at:2,de:-5,note:"a centre-back chasing goals is a centre-back not defending"},
           GK:{at:0,de:-2,note:"he will be up for every corner, which is a sentence nobody wants to write"}}[p.pos];
  const rate=p.pos==="FW"?6:p.pos==="MF"?9:14;
  return{sig:`bonus|${p.nm}|${p.pos}`,title:`${p.nm} wants a bonus`,
    lede:`${p.pos==="FW"?"Your striker":p.pos==="MF"?"A midfielder":p.pos==="DF"?"A defender":"Your goalkeeper"}, quality ${p.rt}. Three structures on the table.`,
    body:`<div class="shark"><div><b>FixtureShark</b>A goal bonus on a ${p.pos==="FW"?"forward":p.pos==="MF"?"midfielder":p.pos==="DF"?"defender":"goalkeeper"}:
      ${G.note}. Finishing-position money lifts everyone a little, because it rewards the result rather than the individual.</div></div>`,
    choices:[
      {t:`${fmtMoney(rate)} per goal he scores`,d:`Attack +${G.at}, defence ${G.de} · paid at the end, per goal`,
        fx:{},after(){S.attMod+=G.at;S.defMod+=G.de;S.bonuses.push({type:"goals",nm:p.nm,rate,from:p.goals||0})},
        out:`Signed. Watch where he stands at the next corner.`},
      {t:`${fmtMoney(60)} if you finish top three`,d:"Attack +2, defence +2 · paid only if it happens",
        fx:{},after(){S.attMod+=2;S.defMod+=2;S.bonuses.push({type:"finish",nm:p.nm,amt:60})},
        out:`A bonus for the result, not the scoresheet. He shrugs, and signs.`},
      {t:`${fmtMoney(3)} per appearance`,d:"Attack +1, defence +1 · a small, certain cost",
        fx:{},after(){S.attMod+=1;S.defMod+=1;S.bonuses.push({type:"apps",nm:p.nm,rate:3,from:S.played||0})},
        out:`Paid for turning up. Unexciting, and he turns up.`},
      {t:"No bonus",d:"Keep the money",fx:{board:2},out:`He takes it better than expected. His agent does not.`}]}},
tannoy(){return{sig:"tannoy",title:"The stadium microphone is right there",
  lede:"Half time, one down, and the ground has gone quiet enough to hear the pies being warmed.",
  body:`<p>You have had two glasses of wine in the boardroom. The stadium announcer has stepped away from his desk. The microphone is, technically, unattended.</p>`,
  choices:[
    {t:"Pick it up and rouse them",d:"Unforgettable, one way or the other",fx:{fans:rng()<.6?17:-12,board:-6},
      delayed:{cash:22},delayedText:"The clip of your half-time address has been viewed four million times. The club shop has sold out of everything.",
      out:`You tell eight thousand people exactly what you think of the first half and invite them, at volume, to do something about it. The second half is the loudest forty-five minutes in nine years.`},
    {t:"Have a quiet word with the announcer instead",d:"Let him say it properly",fx:{fans:4},
      out:`He reads your words in a measured baritone. It is fine. Nobody will remember it.`},
    {t:"Put it down and go back upstairs",d:"You are the owner, not the entertainment",fx:{board:5,fans:-2},
      out:`You return to the boardroom and the sandwiches. Probably the correct decision.`}]}},
prawn(){return{sig:"prawn",title:"Two hundred seats, two hundred arguments",
  lede:"The corporate boxes are full and silent. The terrace behind the goal is half empty and deafening.",
  body:`<p>Your commercial manager wants forty more hospitality seats. The supporters' trust have used the phrase "atmosphere" eleven times in one letter.</p>`,
  choices:[
    {t:"Build the hospitality",d:"Reliable money, quieter ground",fx:{cash:95,fans:-13},
      delayed:{cash:35},delayedText:"The hospitality is sold out every week. It is the most profitable thing at the club and the least enjoyable.",
      out:`Forty seats, a carvery and a view. They sell instantly and clap politely at throw-ins.`},
    {t:"Expand the terrace and cut prices behind the goal",d:"Less per head, a ground that sounds like one",
      fx:{cash:-35,fans:18},delayed:{cash:40},delayedText:"The singing end is full every week, and the bars behind it have never taken so much.",
      out:`You put the cheapest tickets behind the goal and let the noise come back.`},
    {t:"Both, on opposite sides",d:"Have it all ways",fx:{cash:40,fans:5,board:3},
      out:`Prawn sandwiches on one side, a wall of noise on the other, and a ground at war with itself in the most English way possible.`}]}},
sharkdeal(){return{sig:"sharkdeal",title:"FixtureShark want to put their name on your shirt",
  lede:`${fmtMoney(140)} a season, and they will throw in their recruitment platform.`,
  body:`<div class="shark"><div><b>The pitch from FixtureShark</b>
    Their model has your squad at <b>${S.squad}</b> and your wage-to-points ratio as the second worst in the division.
    They believe they can fix the second number without touching the first, and they would like the front of the shirt while they do it.</div></div>`,
  choices:[
    {t:"Sign the full deal",d:`${fmtMoney(140)} and the data platform`,fx:{cash:140,squad:3,board:4,fans:-2},
      delayed:{squad:5},delayedText:"The recruitment platform has earned its keep. Two of the January signings are already the best value in the division.",
      out:`Shirts to the printers, and a login for your head of recruitment.`},
    {t:"Take the data, keep the shirt free",d:"Less money, and the badge stays clean",fx:{cash:40,squad:3,fans:5},
      out:`A smaller deal. Your supporters' trust send a note of thanks, which is a first.`},
    {t:"Turn it down",d:"You have always done it on instinct",fx:{fans:3,board:-4},
      delayed:{squad:-4},delayedText:"Two rivals signed up instead, and both have recruited better than you this season.",
      out:`You tell them you will stick with what you know.`}]}},
hisjob(){const p=pick(alive()).nm,pun=PUNDITS[0];
  return{sig:`hisjob|${p}`,title:`A pundit has taken your defender apart`,
    lede:`On television, at length: "People keep telling me he is unlucky. He is a defender. Defending is the job."`,
    body:`<p class="small">${pun.n} is ${pun.d}, and he said it three times in ninety seconds. ${p} has seen it. Everyone has seen it.</p>`,
    choices:[
      {t:"Agree with him publicly",d:"Brutal, and it might work",fx:{squad:-8,fans:6,board:4},
        delayed:rng()<.5?{squad:9}:{squad:-6},
        delayedText:rng()<.5?`${p} has not made a mistake since. He has also not spoken to you since.`:`${p}'s confidence has gone entirely. He asked not to be considered on Saturday.`,
        out:`You are asked about it in the press conference and you do not defend him. The room notices.`},
      {t:"Defend him in public, correct him in private",d:"The usual, and it usually works",fx:{squad:7,fans:-3},
        out:`A wall of support on camera, and a very different forty minutes on Monday morning.`},
      {t:"Put him in front of the cameras himself",d:"Let him answer it",fx:{squad:3,fans:8,board:-2},
        delayed:{squad:4},delayedText:`${p} handled the interview better than anyone expected, and the dressing room has noticed who backed him.`,
        out:`He is nervous, honest and rather good, and the pundit looks slightly silly for a week.`}]}},
mindgames(){const r=pick(RIVALS).n;
  return{sig:`mind|${r}`,title:`The ${r} manager has been talking about you`,
    lede:`"They are a big club for this level. The pressure is all on them, not us."`,
    body:`<p>It is nonsense — you are sixth in a six-team division — and it has been repeated on every bulletin since Thursday.</p>`,
    choices:[
      {t:"Fire it straight back",d:"Give them a headline",fx:{fans:9,squad:4,board:-3},
        delayed:{squad:-4},delayedText:"The war of words has become the whole story. Your players are being asked about it instead of the football.",
        out:`You point out, pleasantly, that his budget is three times yours. It leads the bulletins for two days.`},
      {t:"Refuse to engage at all",d:"Bore it to death",fx:{board:5,fans:-3,squad:2},
        out:`"I have not seen it." You have seen it. Everyone knows you have seen it.`},
      {t:"Pin it on the dressing-room wall",d:"Use it inside, say nothing outside",fx:{squad:8,fans:2},
        out:`No public response, and a printout above the kit skip where nobody can miss it.`}]}},
sharkscout(){const opp=pick(RIVALS).n;
  return{sig:`sharkscout|${opp}`,title:`The analyst has found something about ${opp}`,
    lede:"Fourteen minutes of clips and one very clear pattern.",
    body:`<div class="shark"><div><b>FixtureShark opposition report</b>
      ${opp} press high for the opening twenty minutes and then drop off sharply — the model has them conceding
      <b>61%</b> of their goals after the hour. Their left back has the worst duel success rate in the division.</div></div>`,
    choices:[
      {t:"Set up to survive twenty minutes, then go",d:"Trust the data, take the early pressure",
        fx:{squad:6,fatigue:4},delayed:{squad:3},delayedText:"The plan worked almost exactly as the report said it would.",
        out:`Deep, narrow and patient for twenty minutes, then at them. It is not pretty and it is very effective.`},
      {t:"Attack that left back from the first whistle",d:"Target the weakness immediately",
        fx:{squad:4,fatigue:6},out:`Everything down their left. He is substituted on the hour, visibly relieved.`},
      {t:"Ignore it and play your way",d:"You have a plan already",fx:{squad:-2,board:-2},
        out:`You leave the clips unwatched. Your assistant, who watched them twice, says nothing.`}]}}
};
/* --- media ---------------------------------------------------------------- */
/* PRESS CONFERENCES, rewritten.
   The old version offered three tones -- back the players, demand more, dead
   bat -- attached to no actual situation, so nothing was at stake and no
   choice was interesting. Each of these is now a SPECIFIC problem walking
   into the room with you, with a concrete thing to win or lose. */
const PRESSERS_CLUB=[
{id:"leak",cond:()=>true,build(){
  return{title:"Somebody has leaked the wage deferral letter",
    lede:`A reporter slides a photocopy across the table. It is on club headed paper and it is real.`,
    body:`<p>Nobody outside the building was supposed to know the players were asked to wait for their money. He wants to know who signed it, and he already knows the answer.</p>`,
    choices:[
      {t:"Confirm it and explain the cash position",d:"Total candour, in public, on the record",
        fx:{fans:11,board:-9,cash:-8},delayed:{cash:-28},
        delayedText:"Two sponsors cited 'uncertainty' when they declined to renew. The deferral story was in every one of those conversations.",
        out:`You take them through the numbers line by line. It is the most honest twenty minutes the club has had in a decade, and it will cost you commercially.`},
      {t:"Confirm it, refuse to discuss details",d:"Accurate, and gives them nothing to run with",
        fx:{fans:3,board:2},out:`"The letter is genuine. It is a private matter between the club and its staff." Six more questions, six identical answers.`},
      {t:"Deny it",d:"It is in his hand",fx:{fans:-16,board:-6},
        delayed:{fans:-8,board:-6},delayedText:"The photocopy ran on the back page under the word DENIED, next to your quote. Nobody has forgotten it.",
        out:`You say you do not recognise the document. He photographs your face saying it.`},
      {t:"Ask him, on the record, who gave it to him",d:"Turn it around",fx:{fans:-4,board:6,squad:-5},
        out:`The room goes quiet and then turns on you. You have made yourself the story and started a hunt inside your own club.`}]}}},
{id:"guarantee",cond:()=>S.mw>=4,build(){
  const left=MW-S.mw;
  return{title:"\u201cCan you guarantee you will not go down?\u201d",
    lede:`${ord(S.pos)} of six with ${left} to play, and he has asked it three times now.`,
    body:`<p>It is a trap and everyone in the room knows it is a trap. There is no answer that survives contact with a bad afternoon.</p>`,
    choices:[
      {t:"Guarantee it",d:"A hostage to fortune, and they will love it today",
        fx:{fans:14,squad:6,board:-7},delayed:S.pos>=4?{fans:-16,board:-8}:null,
        delayedText:"The guarantee has been replayed on every bulletin since the last defeat. It follows you into every room.",
        out:`"We will not be relegated. Write it down." They write it down.`},
      {t:"Refuse to deal in guarantees",d:"Correct, and dull",fx:{board:4,fans:-3},
        out:`"I do not think guarantees help anybody." He asks a fourth time. You say it again.`},
      {t:"Turn it into a challenge to the supporters",d:"Ask them for something",
        fx:{fans:9,squad:3},delayed:{cash:22},
        delayedText:"The 'fill it every week' line worked. Attendances are up and so are the takings behind the goal.",
        out:`"I will guarantee this: fill that ground every week and we will not go down. That is the deal."`}]}}},
{id:"dropped",cond:()=>alive().length>3,build(){
  const p=pick(alive()).nm;
  return{title:`Why is ${p} not playing?`,
    lede:`He has not started in a month and the supporters have noticed before the press did.`,
    body:`<p>The honest answer is that he has been poor in training and worse on a Saturday. The useful answer might be something else entirely.</p>`,
    choices:[
      {t:"Tell the truth about his form",d:"Public, and it will get back to him",
        fx:{fans:6,board:3,squad:-8},delayed:rng()<.5?{squad:8}:{squad:-6},
        delayedText:rng()<.5?`${p} trained like a man possessed all week and scored on Saturday. Sometimes it works.`:`${p} has asked to leave in January. He has not spoken to you since the interview.`,
        out:`"He has not earned the shirt." It is true, and saying it out loud changes something.`},
      {t:"Invent a small injury for him",d:"Protects him, and it is a lie",
        fx:{squad:6,fans:-2},delayed:{fans:-7,board:-4},
        delayedText:"He was photographed training fully on the day he was supposedly injured. The 'knock' has become a running joke.",
        out:`"A tight calf. Day by day." He is fit as a flea and you have just said otherwise on camera.`},
      {t:"Say it is a selection decision and move on",d:"The oldest answer in football",fx:{board:2,squad:2,fans:-2},
        out:`"Selection." Four more attempts, four more selections.`}]}}},
{id:"rivalbid",cond:()=>true,build(){
  const r=pick(RIVALS).n,best=alive().sort((a,b)=>b.rt-a.rt)[0]||{nm:"your best player"};
  return{title:`${r} have bid for ${best.nm} and somebody has told the press`,
    lede:`You were going to reject it quietly on Monday.`,
    body:`<p>Now it is a story, and how you answer will set the price, the player's head and the supporters' mood for a fortnight.</p>`,
    choices:[
      {t:"He is not for sale at any price",d:"Strong, and it costs you leverage",
        fx:{fans:13,board:-4},delayed:{cash:-18},
        delayedText:`${r} withdrew entirely after the 'not for sale' line. There is no bid to negotiate against now.`,
        out:`"Not for sale. Not to them, not to anyone, not in January." The away end will sing about it.`},
      {t:"Everybody has a price",d:"Invites a bigger bid, unsettles him",
        fx:{fans:-9,squad:-5},delayed:{cash:60},
        delayedText:`${r} came back with a substantially improved offer after your 'everybody has a price' remark. Your agent friends call it accidental genius.`,
        out:`You say it with a smile. The smile does not make it into the photograph.`},
      {t:"Refuse to discuss another club's business",d:"Says nothing, gives nothing",fx:{board:5,fans:-2},
        out:`"I am not talking about speculation." A short, professional, forgettable exchange.`}]}}},
{id:"ticket",cond:()=>true,build(){
  return{title:"A question about the price of a pie",
    lede:`"Four pounds sixty for a pie. Five for a pint. Is that a club that respects its supporters?"`,
    body:`<p>It is a small question standing in for a much larger one, and the man asking it has a season ticket in the family stand.</p>`,
    choices:[
      {t:"Cut the prices on the spot, live",d:"Popular, and it comes straight off the margin",
        fx:{fans:15,cash:-30},delayed:{cash:18},
        delayedText:"The cheaper kiosks are selling nearly double. It has very nearly paid for itself.",
        out:`"From Saturday, three pounds. You have my word." The room actually applauds, which never happens.`},
      {t:"Explain the catering contract",d:"True, boring, and nobody wants to hear it",fx:{fans:-5,board:3},
        out:`You explain that the caterer sets the prices and takes the margin. It is entirely accurate and it satisfies nobody.`},
      {t:"Point out what the pies cost at the clubs above you",d:"Deflect upwards",fx:{fans:2,board:1},
        out:`"Go to ${RIVALS[0].n} and buy a pie. Then come back and ask me again." It gets a laugh and settles nothing.`}]}}}
];
const PRESSERS_PLAYER=[
{id:"agentleak",cond:()=>true,build(){
  return{title:"They have seen what your agent said",
    lede:`"Your representative told this paper you are 'too good for this level'. Are you?"`,
    body:`<div class="shark"><div><b>FixtureShark</b>The model has you as the highest-rated player in the division by a clear margin,
      which makes the quote accurate and does not make it any easier to answer.</div></div>`,
    choices:[
      {t:"Disown the quote completely",d:"Protects the dressing room, annoys your agent",
        fx:{fans:12,squad:7,interest:-6},out:`"He does not speak for me." Your phone rings before you are out of the building.`},
      {t:"Stand by it",d:"Honest, and it will be read as contempt",
        fx:{interest:12,fans:-14,squad:-6},delayed:{fans:-6},
        delayedText:"The 'too good for this level' line was sung back at you, sarcastically, by your own supporters.",
        out:`"He is not wrong." Two words, and a fortnight of consequences.`},
      {t:"Turn it into praise for the club",d:"The professional escape",fx:{fans:6,squad:3,interest:-1},
        out:`"What I said is that this club has been good to me." Not what he said. Close enough.`}]}}},
{id:"penaltymiss",cond:()=>true,build(){
  return{title:"You missed one on Saturday",
    lede:`"You have missed two of your last four. Should somebody else be taking them?"`,
    body:`<div class="shark"><div><b>FixtureShark</b>Two misses in four is well inside normal variance for a ${rnd(76,86)}% career taker.
      The model says nothing has changed. The supporters are not reading the model.</div></div>`,
    choices:[
      {t:"Say the numbers are fine and you will take the next one",d:"Correct, and it sounds arrogant",
        fx:{form:6,interest:4,fans:-5},out:`"I have scored eight of ten this season. I will take the next one." He writes down 'defiant'.`},
      {t:"Offer them to somebody else",d:"Humble, and you lose the goals",
        fx:{fans:8,squad:6,form:-5,interest:-5},out:`"If the manager wants somebody else on them, that is his call." He does want somebody else, now.`},
      {t:"Blame the pitch",d:"Everyone can see the pitch",fx:{fans:-3,form:-2,squad:-2},
        out:`The pitch is genuinely dreadful. It is still not why you missed.`}]}}}
];
function presserSpec(){
  const pool=(ROLE.id==="player"?PRESSERS_PLAYER:PRESSERS_CLUB).filter(x=>!x.cond||x.cond());
  const fresh=pool.filter(x=>!S.flags["pc_"+x.id]);
  const chosen=pick(fresh.length?fresh:pool);
  S.flags["pc_"+chosen.id]=1;
  return chosen.build();
}
function papersSpec(){
  const paper=pick(PAPERS),res=S.lastRes;
  const heads=res==='w'?[["FINS UP","A first win in six, and for ninety minutes the place believed again."],["TIDE TURNS","Three points that change little and feel like everything."]]
    :res==='l'?[["SINKING","The same mistakes again, in front of people who have run out of patience."],["DEEP WATER","The table does not lie, and it is getting late to argue with it."]]
    :[["TREADING WATER","A point that suits nobody and settles nothing."],["STALEMATE","Ninety minutes that will be forgotten by Tuesday."]];
  const h=pick(heads),pr=projectionNow()[CLUB];
  const shark=pick([`FixtureShark's model now gives ${CLUB} a ${100-pr.rel}% chance of staying up.`,
    `FixtureShark's model now projects ${CLUB} to finish ${ord(Math.round(pr.avg))}.`,
    `According to FixtureShark, only one club in this division gets less for its wage bill.`]);
  return{paper,h,shark};
}
function podcastSpec(){
  const a=pick(PUNDITS),b=pick(PUNDITS.filter(p=>p.n!==a.n));
  const bad=S.pos>=5||S.formArr.slice(-3).filter(f=>f==='l').length>=2;
  const lines=ROLE.id==="player"
    ?[[a.n,bad?"He is the best player at that club by a distance, and that tells you about the club rather than him.":"Every time I watch him I like him more."],
      [b.n,bad?"If he is still there in September, somebody has made a mistake.":"The question is whether he goes for the money or the football."]]
    :ROLE.id==="owner"
    ?[[a.n,bad?"You cannot cut your way out of this. Every sale makes the next result worse.":"Say what you like, the books are in better shape than they were."],
      [b.n,bad?"Relegation costs more than any player they have sold. That is the bit that gets forgotten.":"It is the boring things, paid on time, that keep clubs alive."]]
    :[[a.n,bad?"Three defeats and the same problem each time. That is coaching, not luck.":"He has got more out of that group than anyone had a right to expect."],
      [b.n,bad?"The dressing room is still with him, and when that goes it goes overnight.":"Give him money in January and they finish in the top half."]];
  const gap=Math.round((TABLE[CLUB].pts-sharkPts()*S.mw/MW)*10)/10;
  return{lines,shark:`${pick(PUNDITS).n}: "They are ${Math.abs(gap)} ${Math.abs(gap)===1?"point":"points"} ${gap>=0?"ahead of":"behind"} where FixtureShark said a well-run club would be by now. That is not nothing."`};
}

/* ===========================================================================
   LUCK. Things that happen TO the season rather than decisions within it --
   for you and against you, and to your rivals. They exist for two reasons
   raised in playtesting: Your Team's finishing position needed more spread,
   and a season with only decisions in it feels too controllable. Rival luck
   matters as much as your own: a strong club losing its striker reshapes
   the whole table. Every effect is real and stated.
   =========================================================================== */
function drawLuck(){
  const outfield=alive().filter(p=>p.pos!=="GK"&&!p.out);
  const rival=pick(RIVALS);
  const pool=[
    /* ---- for you ---- */
    ()=>({good:1,title:"A cup draw nobody expected",
      lede:"An away tie at a Premier League club, live on television.",
      text:"You lose 4–0, and nobody cares. The TV money clears three weeks of wages.",
      apply:()=>apply({cash:rnd(50,80),fans:6})}),
    ()=>{const p=pick(outfield.filter(x=>x.dev>0))||pick(outfield);return{good:1,title:`${p.nm} has found another gear`,
      lede:"Nobody can quite explain it, including him.",
      text:`${p.nm}'s quality jumps. Training has become something to watch.`,
      apply:()=>{p.rt+=4;p.rtf=(p.rtf||p.rt)+4;recalcSquadRating();return `<span class="up">${p.nm} quality +4</span>`}}},
    ()=>({good:1,title:"A local firm adds a bonus to the sponsorship",
      lede:"Their managing director has started coming to games.",
      text:"An unexpected top-up, paid immediately.",
      apply:()=>apply({cash:rnd(30,50)})}),
    ()=>({good:1,title:"The whole squad came back from the break sharp",
      lede:"The physio calls it the best-conditioned group he has had.",
      text:"Everyone's condition is up.",
      apply:()=>apply({condition:10,squad:3})}),
    /* ---- against you ---- */
    ()=>({good:0,title:"A sickness bug has gone through the dressing room",
      lede:"Eleven players, one Tuesday, very few toilets.",
      text:"Everyone's condition drops.",
      apply:()=>apply({condition:-12,squad:-2})}),
    ()=>{const p=pick(outfield);if(!p)return null;return{good:0,title:`${p.nm} is injured in training`,
      lede:"An innocuous challenge in a five-a-side.",
      text:`${p.nm} is out for two weeks.`,
      apply:()=>{p.out=2;recalcSquadRating();return `<span class="down">${p.nm} out for 2 weeks</span>`}}},
    ()=>({good:0,title:"A burst pipe has flooded the changing rooms",
      lede:"The insurance excess is not small.",
      text:"The repair comes straight out of the account.",
      apply:()=>apply({cash:-rnd(30,55)})}),
    ()=>({good:0,title:"A refereeing decision is still being talked about",
      lede:"The replays are unambiguous. The table is not changed by replays.",
      text:"The dressing room feels it was robbed, and plays like it.",
      apply:()=>apply({squad:-5})}),
    /* ---- your rivals ---- */
    ()=>{const d=-rnd(4,7);return{good:null,title:`${rival.n} have lost their best player`,
      lede:"A cruciate ligament, and the rest of the season.",
      text:`${rival.n} are weaker for the rest of the season. Good news, unless you needed them to beat someone.`,
      apply:()=>{S.rivalMod[rival.n]=(S.rivalMod[rival.n]||0)+d;return `<span class="up">${rival.n} strength ${d}</span>`}}},
    ()=>{const d=rnd(3,6);return{good:null,title:`${rival.n} have made a signing`,
      lede:"Out of nowhere, and he looks good.",
      text:`${rival.n} are stronger for the rest of the season.`,
      apply:()=>{S.rivalMod[rival.n]=(S.rivalMod[rival.n]||0)+d;return `<span class="down">${rival.n} strength +${d}</span>`}}}
  ];
  let out=null;for(let t=0;t<8&&!out;t++)out=pick(pool)();
  return out;
}

/* ===========================================================================
   THE CASH CRISIS. Money becomes a problem and one of two players must go:
   your best forward or your best defender. Neither is obviously right --
   it depends on the fixtures ahead, which is the point: the decision shows
   what each sale does to your expected goals FOR and your clean-sheet
   chance over the next five games, and puts the heat map in front of you.
   Making a real choice with the model's numbers is the lesson.
   The owner decides and answers for the cash; the manager is asked for his
   advice, and the owner acts on it.
   =========================================================================== */
function outlook(n){
  const out={xgf:0,cs:0,w:0,k:0};
  for(let wk=S.mw;wk<Math.min(MW,S.mw+n);wk++){
    const[h,a]=myFixture(wk),home=h===CLUB,opp=home?a:h,p=matchProbs(opp,home);
    out.xgf+=p.xgf;out.cs+=p.cs;out.w+=p.w;out.k++;
  }
  return out;
}
function outlookWithout(idx,n){
  const p=S.squadList[idx],was=p.gone,wm=S.manualXI;p.gone=true;S.manualXI=null;
  const o=outlook(n);p.gone=was;S.manualXI=wm;return o;
}
function crisisSpec(){
  const fwd=alive().filter(p=>p.pos==="FW"&&!p.out).sort((a,b)=>b.rt-a.rt)[0];
  const def=alive().filter(p=>p.pos==="DF"&&!p.out).sort((a,b)=>b.rt-a.rt)[0];
  if(!fwd||!def)return drawEvent();
  const need=rnd(110,170),fee=p=>Math.round((p.rt-38)*13);
  const n=Math.min(5,MW-S.mw),base=outlook(n);
  const fi=S.squadList.indexOf(fwd),di=S.squadList.indexOf(def);
  const oF=outlookWithout(fi,n),oD=outlookWithout(di,n);
  const cs=o=>(o.cs).toFixed(1),xg=o=>(o.xgf).toFixed(1),win=o=>Math.round(o.w/Math.max(1,o.k));
  const row=(label,o)=>`<tr><td>${label}</td><td class="n">${xg(o)}</td><td class="n">${cs(o)}</td><td class="n">${win(o)}%</td></tr>`;
  const owner=ROLE.id==="owner";
  /* The bank is paid either way. Selling covers it with the fee; borrowing
     keeps the squad and puts the account back by the demand plus interest --
     and for the owner, ending the season in the red costs score. */
  const sellFx=p=>owner?{cash:fee(p)-need}:{cash:fee(p)-need,board:2};
  const after=i=>()=>{S.squadList[i].gone=true;S.manualXI=null;recalcSquadRating()};
  return{sig:`crisis|${S.mw}`,title:owner?`You need ${fmtMoney(need)} by Friday`:`The owner needs ${fmtMoney(need)} by Friday`,
    lede:owner?`The bank will not extend again. One of two players has to go — and you decide which.`
      :`He has to sell one of two players, and he is asking which you can live without.`,
    body:`<div class="shark"><div><b>The Shark's view — your next ${n} games</b>
      <table class="tbl" style="margin-top:4px"><thead><tr><th></th><th class="n">xGF</th><th class="n">Clean sheets</th><th class="n">Avg win</th></tr></thead><tbody>
        ${row("Keep both",base)}${row(`Sell ${fwd.nm} (${fwd.rt}, FW)`,oF)}${row(`Sell ${def.nm} (${def.rt}, DF)`,oD)}
      </tbody></table>
      <div style="margin-top:6px">xGF is the goals you should score across those games; clean sheets is how many you should keep.
      Which matters more depends on who you are playing — the heat map below shows it.</div></div></div>
      ${fixtureHeatHTML(S.mw,n)}`,
    choices:[
      {t:`Sell ${fwd.nm}`,d:`${fmtMoney(fee(fwd))} · xGF ${xg(base)} → ${xg(oF)}, clean sheets ${cs(base)} → ${cs(oF)}`,
        fx:sellFx(fwd),after:after(fi),out:`${fwd.nm} is gone by Thursday. The goals will have to come from somewhere else.`},
      {t:`Sell ${def.nm}`,d:`${fmtMoney(fee(def))} · xGF ${xg(base)} → ${xg(oD)}, clean sheets ${cs(base)} → ${cs(oD)}`,
        fx:sellFx(def),after:after(di),out:`${def.nm} leaves. The back line will need reorganising.`},
      {t:owner?"Sell neither — borrow it":"Tell him you cannot lose either",
        d:owner?`Keep the squad; ${fmtMoney(need)} of debt, and the account goes backwards`:"He borrows instead. He will remember you said it.",
        fx:owner?{cash:-Math.round(need*1.1),board:-4}:{cash:-Math.round(need*1.1),board:-6,squad:3},out:owner?"Borrowed at a rate you would rather not repeat.":"He takes the loan, and your word for it."}]};
}
