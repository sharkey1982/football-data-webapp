# Beat the Shark: Poker trainers

Texas hold'em, one idea at a time, building towards a full heads-up game
against the Shark scored on results and decision quality separately
(Chris's plan, 7 Oct 2026):

Hand strength → Outs → Pot odds → Equity → Pre-flop → Ranges → Post-flop →
the full trainer (heads-up hands, then a session report).

One folder, one engine; each trainer is a mode (`?mode=`) with its own entry
on the picker under Casino & probability. No money or chips in the trainers
until the full game, which will use fictional chips as the blackjack trainer
does.

```
poker/cards.js        cards; the evaluator (best five of up to seven: kind, tie-breaks, score); hands in words; who wins and why
poker/quiz.js         Hand strength questions: deals chosen by kind of hand or by trap
poker/ui.js           screens; its last line starts the game
poker/test/checks.cjs evaluator against every five-card hand and the hold'em frequencies; questions; screens
shared/trainer.css    cards, feedback bands and report tiles shared with the blackjack trainer
shared/training.js    decision records and scores (as blackjack)
```

## Hand strength (live)

- **Name the hand:** your two cards and a board of three, four or five; pick
  the hand from the nine. Rare hands are asked far more often than they are
  dealt, and two questions in five are traps: the board plays, ace-to-five
  straights, three pairs, two sets of three, flush and straight together, six
  of a suit, only one hole card playing.
- **Who wins?:** two hands, one board; A, B or split. Mostly close: the same
  kind of hand (decided by pair rank or kicker), some splits.
- Right: a quiet tick. Wrong: a red band with the right answer. Either way the
  best five cards are lit and the hand is said in words; who-wins explains the
  deciding card. Hand Score = share right; report by kind of question.

## Outs & draws (live, `?mode=outs`)

- `outs.js`: draws of seven kinds (flush, open-ended, gutshot, flush plus
  straight, pocket pair to a set, two pair to a full house, two overcards),
  on the flop or turn, not yet made; straight and flush draws from a pair or
  less so no full-house outs muddle the count. Outs are counted exactly (every
  unseen card added); the chance by the river exactly over every remaining
  card or pair of cards (so runner-runner counts), beside the outs-only figure
  and the rule of 4 and 2.
- `outsui.js`: how many outs (stepper), then the chance (four answers, at
  least 7 points apart); the outs shown as cards; Outs Score; report.

## Pot odds (live, `?mode=pot`)

- `potodds.js`: a draw (from outs.js), a pot and a bet sized as a share of
  it; needed equity = call ÷ (pot + bet + call); a call's value = equity ×
  (pot + bet) − (1 − equity) × call. The Shark has the better hand now, so
  outs are clean; on the flop it is all in (one call sees both cards).
  Questions balanced between call and fold, with close calls.
- `potui.js`: Call / Fold; the price, the rule of thumb, the exact chance
  and the call's value in chips; severity from chips given away as a share of
  the call; Pot Odds Score and chips given away; report.

## Checks

```
node games/beat-the-shark/poker/test/checks.cjs
```

- All 2,598,960 five-card hands counted by kind: exactly the published totals
  (1,302,540 high card … 40 straight flushes).
- 200,000 random seven-card hands: every kind within sampling error of the
  published hold'em frequencies.
- The hands people misread, explanations, questions (each shows what it says,
  every kind and trap appears), both parts through the screens.
- Outs: 9 / 8 / 4 / 15 / 2 / 4 / 6 for the textbook draws; a flush draw
  35.0% from the flop and 19.6% from the turn; an open-ended draw 31.5%; every
  question's outs recomputed, none already made; the screens.
- Pot odds: needed equity and call values on worked examples; every
  question's answer follows the value of calling; the screens.
