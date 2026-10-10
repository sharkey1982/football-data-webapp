# Shark Fantasy

A fictional, persistent football universe with an FPL-style fantasy game on
top. Design and approved rules: project doc `claude/shark-fantasy-design-2026-10-10.md`.

Approved by Chris (10 Oct 2026):
- the rules in design §3, as proposed;
- results revealed live through Sunday afternoon (deadline 12:00, kick-off 15:00);
- the game lives in the Beat the Shark section (listed with the Beat the Shark
  games; pages in the main site, since it needs sign-in);
- identities: originals plus about 10 comic originals; historical figures
  deferred until reviewed.

## Phase 2: offline simulation prototype (this folder's engine)

No database, nothing live. The engine is pure TypeScript in
`src/sharkfantasy/engine/`:

| File | What it does |
|---|---|
| `rng.ts` | seeded, named random streams (no `Math.random`) |
| `params.ts` | every football number, the calibration targets, `ENGINE_VERSION` |
| `names.ts`, `world.ts` | generate 10 clubs × 20 players and their managers from a seed |
| `strength.ts`, `manager.ts` | team strength from the XI; AI managers pick formation and XI (injuries, bans, form, rotation) |
| `match.ts` | the minute-by-minute match: shots, goals, assists, saves, penalties, own goals, cards, injuries, substitutions → the event log; player stats derived from it |
| `scoring.ts` | fantasy scoring v1 and the Shark Rating bonus |
| `season.ts` | fixtures (balanced round-robin), table, Finals Sunday, injuries and bans between rounds |
| `calibrate.ts` | measures over many seasons against the targets |

Run the calibration report (about 25 s):

```
npx tsx scripts/sf/sim-season.ts 40 25
```

It writes `docs/shark-fantasy/calibration.md` and exits non-zero if any
target fails or the same seed doesn't reproduce identical output. Tests:
`src/__tests__/sharkFantasyEngine.test.ts`.

### Observations for Phase 3
- Forwards average fewer fantasy points per appearance than FPL forwards
  (2.5 v 3.6): ours share goals with attacking midfielders and come off the
  bench more. Prices are set from expected points, so this doesn't unbalance
  the game, but forwards may need a bigger share of 90-minute starts.
- Generated names and club names still need the check against real
  footballers and clubs before anything is public (design §10).
