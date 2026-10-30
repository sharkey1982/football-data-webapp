import math
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
from scipy.stats import poisson

sys.path.insert(0, os.path.dirname(__file__))
import lab_p3_defcon as p3  # noqa: E402


def test_nb_sf_matches_simulation():
    rng = np.random.default_rng(1)
    mean, phi = 8.0, 4.0
    sim = rng.negative_binomial(phi, phi / (phi + mean), 200_000)
    assert abs(p3.nb_sf(10, np.array([mean]), phi)[0] - (sim >= 10).mean()) < 0.005
    assert abs(sim.mean() - mean) < 0.05


def test_nb_sf_approaches_poisson_for_large_phi():
    assert abs(p3.nb_sf(10, np.array([7.0]), 1e6)[0] - poisson.sf(9, 7.0)) < 1e-4


def test_market_lambdas_round_trip():
    lh, la = 1.8, 0.9
    g = np.arange(11)
    m = np.outer(poisson.pmf(g, lh), poisson.pmf(g, la))
    ph, pa = np.tril(m, -1).sum(), np.triu(m, 1).sum()
    po = 1 - sum(m[i, j] for i in range(3) for j in range(3 - i))
    a, b = p3.market_lambdas(ph, 1 - ph - pa, pa, po)
    assert abs(a - lh) < 0.01 and abs(b - la) < 0.01


def _rows():
    t0 = datetime(2025, 8, 16, tzinfo=timezone.utc)
    rows = []
    for i in range(6):
        rows.append({"season": "2025", "gw": i + 1, "ko": t0 + timedelta(days=7 * i), "fid": f"v{i}", "pid": 1, "code": "c1",
                     "pos": 2, "min": 90, "start": 1, "cbi": 8, "tck": 3, "rec": 5, "dc": 11, "share": 0.4, "name": "x"})
    return rows


def _pri():
    return {pos: {"mu90": 6.0, "hit": 0.2, "pool_min": np.array([30.0, 90.0]), "pool_w": np.array([0.25, 0.75]),
                  "pool_start": 0.75, "n": 100} for pos in (2, 3, 4)}


def test_rate_shrinks_to_prior_and_uses_target_definition():
    rows = _rows()
    p3.attach_history(rows)
    pri = _pri()
    r = rows[-1]  # 5 earlier matches, 11 CBIT each in 90 minutes
    rate, sbar = p3.rate_and_share(rows, r, K=5, H=None, pri=pri)
    assert abs(rate - (5 * 11 + 5 * 6.0) / (5 + 5)) < 1e-9
    assert abs(sbar - 0.4) < 1e-9
    # Same history judged as a midfielder: recoveries count too.
    r2 = dict(r, pos=3)
    rate2, _ = p3.rate_and_share(rows, r2, K=5, H=None, pri=pri)
    assert abs(rate2 - (5 * 16 + 5 * 6.0) / 10) < 1e-9
    # No history -> the position prior.
    assert p3.rate_and_share(rows, rows[0], 5, None, pri)[0] == 6.0


def test_history_is_strictly_earlier():
    rows = _rows()
    p3.attach_history(rows)
    assert rows[0]["hist"] == [] and rows[3]["hist"] == [0, 1, 2]


def test_minutes_mixture_weights_sum_to_one():
    rows = _rows()
    p3.attach_history(rows)
    vals, w, start = p3.minutes_mixture(rows, rows[-1], _pri())
    assert abs(w.sum() - 1) < 1e-12 and len(vals) == 5 + 2
    assert abs(start - (5 + 2 * 0.75) / 7) < 1e-12


def test_production_formula_replicates_live_view():
    rows = _rows()
    p3.attach_history(rows)
    pri = _pri()
    r = rows[-1]
    got = p3.predict_production(rows, [r], pri)[0]
    vals, w, start = p3.minutes_mixture(rows, r, pri)
    shrunk = (5 * 8 + 7.143 * 5) / (450 + 450) * 90  # defenders: CBI only
    want = min(0.9, start * 0.255 * math.exp(0.28 * (shrunk - 7.143)) * min(1, float((w * vals).sum()) / 60))
    assert abs(got - want) < 1e-12


def test_naive_season_rate():
    rows = _rows()
    p3.attach_history(rows)
    got = p3.predict_naive(rows, [rows[-1]], 5, _pri())[0]
    assert abs(got - (5 + 5 * 0.2) / 10) < 1e-12


def test_paired_cluster_se_runs():
    a, b, y = np.array([0.2, 0.3, 0.4, 0.1]), np.array([0.25, 0.3, 0.3, 0.2]), np.array([0.0, 1.0, 1.0, 0.0])
    out = p3.paired(a, b, y, ["f1", "f1", "f2", "f3"])
    assert set(out) == {"brier", "log_loss"} and out["brier"]["se"] > 0
