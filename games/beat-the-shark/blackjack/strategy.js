/* ===========================================================================
   blackjack/strategy.js — basic strategy: the mathematically best play for
   any hand against any dealer up-card, for the rules being played.

   The chart is the published basic strategy for 4–8 decks, dealer stands
   on soft 17, double after split, no surrender (the Wizard of Odds chart
   for those rules, the standard reference). The checks compare every cell
   with an independent copy of that chart, and with the expected-value
   calculator (ev.js), which must agree everywhere except where two plays
   are within a fraction of a per cent of each other.

   Columns: dealer 2, 3, 4, 5, 6, 7, 8, 9, 10, A.
     H hit · S stand · D double (hit if you can't) · X double (stand if you
     can't) · P split
   =========================================================================== */
const STRATEGY_CHARTS={
  "6d-s17-das":{
    hard:{
      5:"HHHHHHHHHH",6:"HHHHHHHHHH",7:"HHHHHHHHHH",8:"HHHHHHHHHH",
      9:"HDDDDHHHHH",10:"DDDDDDDDHH",11:"DDDDDDDDDH",
      12:"HHSSSHHHHH",13:"SSSSSHHHHH",14:"SSSSSHHHHH",15:"SSSSSHHHHH",16:"SSSSSHHHHH",
      17:"SSSSSSSSSS",18:"SSSSSSSSSS",19:"SSSSSSSSSS",20:"SSSSSSSSSS",21:"SSSSSSSSSS"},
    soft:{
      // soft 12 is a pair of aces that can't be split (already split once): always hit
      12:"HHHHHHHHHH",
      13:"HHHDDHHHHH",14:"HHHDDHHHHH",15:"HHDDDHHHHH",16:"HHDDDHHHHH",17:"HDDDDHHHHH",
      18:"SXXXXSSHHH",19:"SSSSSSSSSS",20:"SSSSSSSSSS",21:"SSSSSSSSSS"},
    // pairs by card value (11 = aces); 5s are never split (played as hard 10)
    pairs:{
      2:"PPPPPPHHHH",3:"PPPPPPHHHH",4:"HHHPPHHHHH",5:"DDDDDDDDHH",6:"PPPPPHHHHH",
      7:"PPPPPPHHHH",8:"PPPPPPPPPP",9:"PPPPPSPPSS",10:"SSSSSSSSSS",11:"PPPPPPPPPP"}
  }
};
const ACTION_NAME={hit:"Hit",stand:"Stand",double:"Double",split:"Split"};

/* The chart's letter for a hand: which table and which row. */
function chartColumn(up){const v=cardValue(up);return v===1?9:v-2}
function chartCell(cards,up,rules,canSplit){
  const ch=STRATEGY_CHARTS[rules.id];if(!ch)throw new Error("no strategy chart for rules "+rules.id);
  const col=chartColumn(up),v=handValue(cards);
  if(canSplit&&isPair(cards,rules)){const pv=cardValue(cards[0])===1?11:cardValue(cards[0]);return{table:"pairs",row:pv,code:ch.pairs[pv][col]}}
  if(v.soft&&v.total>=12)return{table:"soft",row:v.total,code:ch.soft[v.total][col]};
  const row=Math.max(5,Math.min(21,v.total));return{table:"hard",row,code:ch.hard[row][col]};
}
/* The basic-strategy action among those allowed. legal: the legal actions. */
function bestAction(cards,up,rules,legal){
  const can=a=>legal.includes(a);
  const cell=chartCell(cards,up,rules,can("split"));
  switch(cell.code){
    case"P":return"split";
    case"D":return can("double")?"double":"hit";
    case"X":return can("double")?"double":"stand";
    case"S":return"stand";
    default:return"hit";
  }
}
/* How a hand is described, and the group it is scored in (the session
   report's "where are the leaks"). Groups, not single cells, so a group
   gathers enough decisions to say something. */
function handLabel(cards,rules,canSplit){
  const v=handValue(cards);
  if(canSplit&&isPair(cards,rules)){const c=cardValue(cards[0]);return c===1?"a pair of aces":`a pair of ${c===10?"tens":c+"s"}`}
  return`${v.soft?"soft":"hard"} ${v.total}`;
}
function handGroup(cards,rules,canSplit){
  const v=handValue(cards);
  if(canSplit&&isPair(cards,rules))return"Pairs";
  if(v.soft)return v.total<=18?"Soft 13–18":"Soft 19–21";
  if(v.total<=8)return"Hard 8 or less";
  if(v.total<=11)return"Hard 9–11";
  if(v.total<=16)return"Hard 12–16";
  return"Hard 17+";
}
function upText(up){const v=cardValue(up);return v===1?"an ace":v===10?"a ten":`a ${v}`}
/* One line of why, by the kind of hand: the idea behind the chart. */
function whyLine(cards,up,rules,best,canSplit){
  const v=handValue(cards),u=cardValue(up),weak=u>=2&&u<=6;
  if(best==="split"){const c=cardValue(cards[0]);
    if(c===1)return"Two aces are one hand of 12; split, each ace is a fresh start.";
    if(c===8)return"Sixteen is the worst total there is; two hands starting with 8 are better.";
    return weak?"The dealer is weak showing 2–6: two hands means more money on a likely bust.":"Two hands from this card do better than one total.";}
  if(canSplit&&isPair(cards,rules)&&cardValue(cards[0])===10)return"Twenty is a winning hand already; splitting throws it away.";
  if(best==="double")return v.soft?"A soft hand can't bust with one card, and the dealer is weak: get more money in.":
    "One card is likely to give you a strong total, and you are the favourite: get more money in.";
  if(!v.soft&&v.total>=12&&v.total<=16)return weak?"Showing 2–6 the dealer busts often: don't risk busting yourself.":
    "Showing 7 or more the dealer usually makes 17+: standing here mostly loses.";
  if(v.soft&&best==="hit")return"A soft hand can't bust with one more card, and this total won't win often enough as it is.";
  if(best==="stand"&&v.total>=17)return"Seventeen or more: the chance of busting outweighs the chance of improving.";
  if(best==="hit"&&v.total<=11)return"You can't bust with one card: always take it.";
  return"";
}
