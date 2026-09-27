# Model experiments log

Every experiment is recorded here, including the ones that change nothing. Protocol and roadmap: the FixtureShark Modelling Programme Design Report (27 Sep 2026).

| Date | Experiment | Data | Result | Decision |
|---|---|---|---|---|
| 2026-09-27 | Defender defensive-contribution probability: add tackles to the CBI rate (the official rule counts CBI + tackles) | FPL 2025/26 per-fixture history (vaastav), defenders with 60+ minutes, 3,026 player-fixtures; rates walk-forward from earlier fixtures that season; scored on GW20-38 | Brier (lower is better): current formula 0.1709; with tackles and a recalibrated prior 0.1697; current formula with only the base rate recalibrated 0.1690. Log loss: 0.5141 / 0.5148 / 0.5106. All within noise; the current prior (7.14 CBI per 90) sits above the league mean (5.98), so the model under-predicts (mean 0.23 against 0.26 actual) | **No production change.** Adding tackles on its own does not help inside the current exponential curve. Replace the curve with a count model using the real threshold (experiment P3), fitted and tested walk-forward |
