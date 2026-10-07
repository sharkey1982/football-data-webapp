/* ===========================================================================
   blackjack/rules.js — the table rules, in one place.

   V1 plays one standard ruleset (below), shown to the player. Every engine
   (the game, the strategy chart, the expected-value calculator) reads its
   rules from an object of this shape, so a variant later -- more or fewer
   decks, the dealer hitting soft 17, resplitting, surrender, a 6:5 payout --
   is a different object, plus that variant's strategy chart.
   =========================================================================== */
const RULES_V1=Object.freeze({
  id:"6d-s17-das",
  decks:6,
  dealerHitsSoft17:false,   // dealer stands on all 17s
  blackjackPays:1.5,        // 3 to 2
  doubleAnyTwo:true,        // double on any first two cards
  doubleAfterSplit:true,
  maxHands:2,               // split once; no resplitting
  splitAcesOneCard:true,    // split aces get one card each (21 there is not a blackjack)
  splitAnyTens:true,        // any two ten-value cards count as a pair
  dealerPeeks:true,         // dealer checks for blackjack under an ace or a ten
  surrender:false,
  insurance:false,
  penetration:.75           // reshuffle once three quarters of the shoe is used
});

/* The rules in plain words, for the start screen and the footer. */
function rulesText(r){
  return[
    `${r.decks} decks, reshuffled when ${Math.round(r.penetration*100)}% is used`,
    r.dealerHitsSoft17?"Dealer hits soft 17":"Dealer stands on all 17s",
    r.dealerPeeks?"Dealer checks for blackjack under an ace or a ten":"Dealer does not check for blackjack",
    r.blackjackPays===1.5?"Blackjack pays 3 to 2":`Blackjack pays ${r.blackjackPays} to 1`,
    `Double on any first two cards${r.doubleAfterSplit?", including after a split":""}`,
    r.maxHands===2?"Split once":`Split up to ${r.maxHands} hands`,
    r.splitAcesOneCard?"Split aces get one card each":"",
    [!r.insurance&&"no insurance",!r.surrender&&"no surrender"].filter(Boolean).join(" and ").replace(/^n/,"N")
  ].filter(Boolean);
}
