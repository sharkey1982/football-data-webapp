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
