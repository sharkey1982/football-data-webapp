/* ===========================================================================
   poker/cards.js — poker cards and the hand evaluator: the best five cards
   from up to seven, as a category and a score that orders any two hands.

   The base every poker trainer builds on (hand strength, outs, equity, the
   full game). No DOM. Cards are {r:2..14, s:0..3}: 11 jack, 12 queen,
   13 king, 14 ace; suits ♠ ♥ ♦ ♣.
   =========================================================================== */
const PK_RANK=["","","2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const PK_RANK_WORD=["","","two","three","four","five","six","seven","eight","nine","ten","jack","queen","king","ace"];
const PK_RANK_PLURAL=["","","twos","threes","fours","fives","sixes","sevens","eights","nines","tens","jacks","queens","kings","aces"];
const PK_SUIT=["♠","♥","♦","♣"],PK_SUIT_WORD=["spades","hearts","diamonds","clubs"];
const CATEGORIES=["High card","One pair","Two pair","Three of a kind","Straight","Flush","Full house","Four of a kind","Straight flush"];

function pkDeck(){const d=[];for(let s=0;s<4;s++)for(let r=2;r<=14;r++)d.push({r,s});return d}
function pkText(c){return PK_RANK[c.r]+PK_SUIT[c.s]}
function sameCard(a,b){return a.r===b.r&&a.s===b.s}

/* Five cards: {cat, tb (tie-break ranks, most important first), score}.
   score orders any two hands: higher wins, equal splits. */
function eval5(cs){
  const rs=cs.map(c=>c.r).sort((a,b)=>b-a);
  const flush=cs.every(c=>c.s===cs[0].s);
  const cnt={};rs.forEach(r=>cnt[r]=(cnt[r]||0)+1);
  const groups=Object.keys(cnt).map(Number).sort((a,b)=>cnt[b]-cnt[a]||b-a);
  let straight=0;
  if(groups.length===5){if(rs[0]-rs[4]===4)straight=rs[0];else if(rs[0]===14&&rs[1]===5)straight=5}   // A-2-3-4-5: five high
  let cat,tb;
  if(straight&&flush){cat=8;tb=[straight]}
  else if(cnt[groups[0]]===4){cat=7;tb=groups}
  else if(cnt[groups[0]]===3&&cnt[groups[1]]===2){cat=6;tb=groups}
  else if(flush){cat=5;tb=rs}
  else if(straight){cat=4;tb=[straight]}
  else if(cnt[groups[0]]===3){cat=3;tb=groups}
  else if(cnt[groups[0]]===2&&cnt[groups[1]]===2){cat=2;tb=groups}
  else if(cnt[groups[0]]===2){cat=1;tb=groups}
  else{cat=0;tb=rs}
  let score=cat;for(let i=0;i<5;i++)score=score*16+(tb[i]||0);
  return{cat,tb,score};
}
/* The best five of five to seven cards. Returns the eval plus the five cards. */
function bestHand(cards){
  if(cards.length===5){const e=eval5(cards);return{...e,five:cards.slice()}}
  let best=null;const n=cards.length,idx=[0,1,2,3,4];
  const go=(start,pick)=>{
    if(pick.length===5){const five=pick.map(i=>cards[i]),e=eval5(five);if(!best||e.score>best.score)best={...e,five};return}
    for(let i=start;i<n;i++){pick.push(i);go(i+1,pick);pick.pop()}};
  go(0,[]);return best;
}
/* A hand in words: "Two pair, kings and fives, queen kicker". */
function describeHand(h){
  const t=h.tb,W=r=>PK_RANK_WORD[r],P=r=>PK_RANK_PLURAL[r];
  switch(h.cat){
    case 8:return t[0]===14?"Royal flush":`Straight flush, ${W(t[0])} high`;
    case 7:return`Four of a kind, ${P(t[0])}, ${W(t[1])} kicker`;
    case 6:return`Full house, ${P(t[0])} full of ${P(t[1])}`;
    case 5:return`Flush, ${W(t[0])} high`;
    case 4:return`Straight, ${W(t[0])} high`;
    case 3:return`Three of a kind, ${P(t[0])}`;
    case 2:return`Two pair, ${P(t[0])} and ${P(t[1])}, ${W(t[2])} kicker`;
    case 1:return`One pair, ${P(t[0])}`;
    default:return`High card, ${W(t[0])}`;
  }
}
/* Why one hand beats another, in a sentence. na, nb: the players' names. */
function compareText(a,b,na,nb){
  if(a.score===b.score)return`Same five-card hand for both (${describeHand(a).toLowerCase()}): the pot is split.`;
  const[w,l,nw,nl]=a.score>b.score?[a,b,na,nb]:[b,a,nb,na];
  const W=r=>PK_RANK_WORD[r],P=r=>PK_RANK_PLURAL[r],C=CATEGORIES[w.cat].toLowerCase();
  if(w.cat!==l.cat)return`${nw}'s ${C} beats ${nl}'s ${CATEGORIES[l.cat].toLowerCase()}.`;
  const i=w.tb.findIndex((r,k)=>r!==l.tb[k]),x=w.tb[i],y=l.tb[i];
  const made={1:`a pair of ${P(w.tb[0])}`,2:`two pair, ${P(w.tb[0])} and ${P(w.tb[1])}`,3:`three ${P(w.tb[0])}`,7:`four ${P(w.tb[0])}`}[w.cat];
  const kicker=`Both have ${made}; ${nw}'s ${W(x)} kicker beats ${nl}'s ${W(y)}.`;
  switch(w.cat){
    case 1:return i===0?`${nw}'s pair of ${P(x)} beats ${nl}'s pair of ${P(y)}.`:kicker;
    case 2:return i<2?`${nw}'s ${P(w.tb[0])} and ${P(w.tb[1])} beat ${nl}'s ${P(l.tb[0])} and ${P(l.tb[1])}.`:kicker;
    case 3:return i===0?`${nw}'s three ${P(x)} beat ${nl}'s three ${P(y)}.`:kicker;
    case 7:return i===0?`${nw}'s four ${P(x)} beat ${nl}'s four ${P(y)}.`:kicker;
    case 6:return`${nw}'s ${P(w.tb[0])} full of ${P(w.tb[1])} beats ${nl}'s ${P(l.tb[0])} full of ${P(l.tb[1])}.`;
    case 4:case 8:return`Both have a ${C}: ${nw}'s is ${W(x)} high, ${nl}'s ${W(y)} high.`;
    default:return`Both have a ${C}${i>0?` with the same top card${i>1?"s":""}`:""}: ${nw}'s ${W(x)} beats ${nl}'s ${W(y)}${i>0?" further down":""}.`;
  }
}
