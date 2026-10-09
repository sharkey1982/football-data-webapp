# Beat the Shark: Blackjack trainer

A blackjack trainer with fictional Shark Chips. Its one idea: **did you win?**
and **did you play it right?** are different questions. The chips answer the
first; the Shark Score answers the second, decision by decision, against basic
strategy. Not a gambling product: no deposits, purchases, prizes or cash value;
chips can't be cashed or transferred, and topping up is free.

Served at `/play/beat-the-shark/blackjack/` from the game site, with the shared
picker, core and styles.

```
blackjack/rules.js       the table rules (V1: RULES_V1) and their plain-words list
blackjack/engine.js      cards, the shoe, a round: deal, peek, hit, stand, double, split, dealer, settle
blackjack/strategy.js    basic strategy: the published chart for the rules, and fallbacks
blackjack/ev.js          the expected value of every play (cost of mistakes, luck, chart check)
blackjack/ui.js          screens: start, the table, feedback, the session report
blackjack/test/checks.cjs   cards, rules, strategy, simulation, training framework, screens
shared/training.js       the training framework (decision, outcome, Shark Score, verdict), not blackjack-specific
shared/analytics.js      product events through the site's GA property and consent (off until GA_MEASUREMENT_ID is set)
```

## Rules (V1)

6 decks, reshuffled at 75%; dealer stands on all 17s; dealer checks for
blackjack under an ace or a ten; blackjack pays 3 to 2; double on any first two
cards, including after a split; split once (no resplitting); split aces get one
card each (and 21 there is not a blackjack); no insurance or surrender.

A variant is a new rules object plus its strategy chart (`STRATEGY_CHARTS`,
keyed by `rules.id`); the engine and EV calculator already read deck count,
soft 17, payout, double after split, split limits and peeking from the rules.

## How decisions are judged

- **Correct play:** the chart (Wizard of Odds, 4–8 decks, S17, DAS, no
  surrender), with D → hit and Ds → stand when you can't double, and a pair you
  can't split played as its total.
- **Severity from expected value lost** (`shared/training.js`): optimal; small
  mistake under 2% of the stake; mistake 2–10%; major over 10%. A play that
  isn't the chart's is never called optimal.
- **Expected value** (`ev.js`): the shoe less the cards on the table, each draw
  at those proportions, the dealer's hole card known not to make blackjack.
- **Shark Score:** the share of optimal decisions, out of 100. Expected chips
  given away is kept beside it, for a later score weighted by cost.
- **Luck:** what the hands paid minus what the decisions were worth (the
  position's value under perfect play, less each mistake's cost).
- **Verdict** (20+ decisions): Skilled at a Shark Score of 90+; Lucky when luck
  is positive. **Leak:** a kind of hand with 8+ decisions under 85% right.

## Testing

```
node games/beat-the-shark/blackjack/test/checks.cjs
```

Under a minute. Checked (7 Oct 2026): every rule on stacked shoes; all 280
cells of the published chart; the EV calculator picks the chart's play on all
540 two-card hands; EV of known spots (16 v 10, 11 v 6, 20 v 6); perfect play
over 150,000 hands loses 0.42% ± 0.30 (published: about 0.5%); blackjacks
4.8%, pushes 8.7%; luck averages zero for good and random play; whole
sessions through the real screens.

## The blackjack page (9 Oct 2026)

The games' picker has a single **Blackjack** entry; it opens `blackjack/`
with no mode: the three games in order (basic strategy → what's the count?
→ beat the house), each ticked once you reach its report, with its best and
latest score (`bjRecord`, reports of 5+ decisions, this browser's
localStorage), the next one highlighted, and "Clear them". Each game's
footer links back. Basic strategy is now `?mode=basic`; `?mode=count` and
`?mode=house` are unchanged. Same pattern as the poker path.

## Three modes (7 Oct 2026), one table, by `?mode=` in the address

- **Basic strategy** (`blackjack/`): every playing decision judged. A right
  play is a quiet tick; a mistake is a red band (a major one shakes once),
  the right play, why, its average cost, and the chart's row for the hand
  with the dealer's card marked. The table waits for "Got it". The lesson sits
  under the cards, above the controls.
- **What's the count?** (`?mode=count`, countdrill.js): Hi-Lo drill. Runs of
  cards at a chosen speed; give the running count (and every third check the
  true count from the decks left). Wrong answers replay the run with each
  card's value. Count Score = checks exactly right. Runs lengthen after three
  right in a row.
- **Beat the house** (`?mode=house`): basic strategy plus a bet in units
  (1, 2, 4, 6, 8 × 100) judged against the ramp at the true count (count.js);
  two scores (play, bets); "Show the count" for learners; the report values
  the bets at about 0.5% edge per point of true count against flat betting.

Checked: Hi-Lo values, a full shoe counts to 0, true count rounding, the
ramp; the EV calculator puts the edge at −0.57% off the top and 0.52% per
point of true count; in simulation hands at +3 or more pay the player
(+1.2%) and at 0 or less lose (−1.0%), and the ramp returns +0.4% per unit
staked against −0.3% flat; the drill and Beat the house through the screens.

## Later

Practice / Challenge timing, count-based playing deviations (the
"Illustrious 18"), insurance at high counts, rule variants, a Shark Score
weighted by EV lost, lifetime stats.
