"""
The production DEFCON SQL (migration 20261030190000) reproduces Model Lab P3
(scripts/lab_p3_defcon.py) for synthetic inputs:
  - market_goal_lambdas()   v lab market_lambdas()      (team goal share)
  - fpl_nb_upper_tail()     v lab nb_sf()
  - fpl_defcon_rate90()     v lab rate_and_share() with K = 3, no decay
  - fpl_defcon_probability() v the P3 mixture sum(w x nb_sf(T, rate x m / 90 x mult, phi))
    over the same minutes distribution, with P3's fitted phi and beta.

Runs the functions in a throwaway local Postgres (initdb + pg_ctl); skipped
when no Postgres server binaries are installed.

  python -m pytest -q scripts/test_defcon_p3_sql.py
"""
from __future__ import annotations

import glob
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(__file__))
from lab_p3_defcon import market_lambdas, nb_sf, rate_and_share  # noqa: E402

MIGRATION = os.path.join(os.path.dirname(__file__), "..", "supabase", "migrations",
                         "20261030190000_fpl_defcon_p3_production.sql")
FUNCS = ["market_goal_residuals", "market_goal_lambdas", "fpl_nb_upper_tail", "fpl_defcon_rate90", "fpl_defcon_probability"]
# Fitted P3 values (analysis_results lab_p3_defcon, 30 Oct 2026).
PHI = {2: 13.212544953237025, 3: 16.46738311229665, 4: 9.326229990188573}
BETA = {2: -0.33101056404511525, 3: -0.1569644591353071, 4: -0.1569644591353071}
MU = {2: 7.762449743666107, 3: 8.609386956891422, 4: 4.615626440876892}
THRESH = {2: 10, 3: 12, 4: 12}
EARLY, MID, SUB = [32, 45, 45, 56, 59], [62, 68, 73, 78, 82], [2, 9, 16, 24, 37]


def _bin(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    cands = sorted(glob.glob(f"/usr/lib/postgresql/*/bin/{name}"))
    return cands[-1] if cands else None


@pytest.fixture(scope="module")
def psql():
    initdb, pg_ctl, psql_bin = _bin("initdb"), _bin("pg_ctl"), _bin("psql")
    if not (initdb and pg_ctl and psql_bin):
        pytest.skip("no local Postgres server binaries")
    tmp = tempfile.mkdtemp(prefix="defcon_pg_")
    data, sock = os.path.join(tmp, "data"), os.path.join(tmp, "sock")
    os.makedirs(sock)
    as_pg: list[str] = []
    if os.geteuid() == 0:  # initdb refuses to run as root
        as_pg = ["runuser", "-u", "postgres", "--"]
        shutil.chown(tmp, "postgres")
        shutil.chown(sock, "postgres")
    subprocess.run(as_pg + [initdb, "-D", data, "-A", "trust", "-U", "postgres"], check=True, capture_output=True)
    subprocess.run(as_pg + [pg_ctl, "-D", data, "-l", os.path.join(tmp, "pg.log"),
                            "-o", f"-k {sock} -c listen_addresses=''", "-w", "start"],
                   check=True, capture_output=True)

    def run(sql: str) -> str:
        out = subprocess.run([psql_bin, "-h", sock, "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1",
                              "-c", sql], check=True, capture_output=True, text=True)
        return out.stdout.strip()

    try:
        mig = open(MIGRATION).read()
        for fn in FUNCS:
            m = re.search(r"create or replace function public\." + fn + r"\(.*?\$\$;", mig, re.S)
            assert m, f"{fn} not found in the migration"
            run(m.group(0))
        yield run
    finally:
        subprocess.run(as_pg + [pg_ctl, "-D", data, "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)


LINES = [(0.733728, 0.157227, 0.109045, 0.691610), (0.398369, 0.278041, 0.323590, 0.538259),
         (0.152047, 0.219624, 0.628328, 0.539683), (0.865162, 0.093277, 0.041561, 0.690909),
         (0.059988, 0.116866, 0.823145, 0.704194), (0.33, 0.34, 0.33, 0.38)]


@pytest.mark.parametrize("line", LINES)
def test_market_share_matches_lab(psql, line):
    lh, la = market_lambdas(*line)
    got = psql("select lambda_home || ',' || lambda_away from public.market_goal_lambdas(%s, %s, %s, %s)" % line)
    sh, sa = (float(x) for x in got.split(","))
    assert abs(sh / (sh + sa) - lh / (lh + la)) < 1e-4
    assert abs(sh - lh) < 1e-3 and abs(sa - la) < 1e-3


@pytest.mark.parametrize("t,mean,phi", [(10, 9.5, PHI[2]), (12, 7.0, PHI[3]), (12, 3.3, PHI[4]), (10, 0.4, PHI[2]),
                                        (12, 20.0, PHI[3]), (10, 0.0, PHI[2])])
def test_nb_upper_tail_matches_scipy(psql, t, mean, phi):
    got = float(psql(f"select public.fpl_nb_upper_tail({t}, {mean}, {phi})"))
    assert abs(got - float(nb_sf(t, np.array([mean]), phi)[0])) < 1e-9


def test_rate90_matches_lab(psql):
    pri = {p: {"mu90": MU[p]} for p in (2, 3, 4)}
    ko = datetime(2026, 10, 31)
    hist = [{"ko": ko - timedelta(days=7 * i), "min": m, "cbi": c, "tck": t, "rec": r, "share": s}
            for i, (m, c, t, r, s) in enumerate([(90, 8, 3, 5, 0.42), (90, 6, 1, 7, None), (64, 5, 2, 3, 0.55), (12, 0, 1, 1, 0.5)], 1)]
    rows = hist + [{"ko": ko, "pos": 2, "hist": list(range(len(hist)))}]
    for pos in (2, 3, 4):
        rows[-1]["pos"] = pos
        rate, sbar = rate_and_share(rows, rows[-1], 3, None, pri)
        cnt = sum(h["cbi"] + h["tck"] + (0 if pos == 2 else h["rec"]) for h in hist)
        mins = sum(h["min"] for h in hist)
        got = float(psql(f"select public.fpl_defcon_rate90({pos}, {mins}, {cnt})"))
        assert abs(got - rate) < 1e-5  # mu is stored to 6 decimals
        # share_bar as the view computes it: share_sum / share_minutes over matches with a price
        sm = sum(h["min"] for h in hist if h["share"] is not None)
        ss = sum(h["min"] * h["share"] for h in hist if h["share"] is not None)
        assert abs(ss / sm - sbar) < 1e-12
    # no history: the position mean (P3 returns mu, share 0.5)
    for pos in (2, 3, 4):
        assert abs(float(psql(f"select public.fpl_defcon_rate90({pos}, 0, 0)")) - MU[pos]) < 1e-5


def p3_mixture(pos, rate, dx, start, sub, bands):
    """P3's P(DEFCON) = sum over the minutes distribution of w x nb_sf(T, rate x m / 90 x exp(beta dx), phi)."""
    mult = math.exp(BETA[pos] * dx)
    vals = np.array(EARLY + MID + [90] + SUB, float)
    e, m, f = bands
    w = np.array([start * e / 5] * 5 + [start * m / 5] * 5 + [start * f] + [sub / 5] * 5)
    return float(np.sum(w * nb_sf(THRESH[pos], rate * vals / 90 * mult, PHI[pos])))


CASES = [  # pos, rate90, share - share_bar, P(start), P(sub), exit bands
    (2, 10.92, 0.0, 0.96, 0.02, (0.06, 0.14, 0.80)),   # about Hill
    (2, 9.75, -0.08, 0.94, 0.03, (0.05, 0.10, 0.85)),  # about Silva, stronger opponent
    (2, 7.93, 0.12, 0.90, 0.05, (0.10, 0.30, 0.60)),
    (3, 9.40, 0.05, 0.80, 0.15, (0.15, 0.45, 0.40)),
    (3, 12.5, -0.15, 0.99, 0.0, (0.02, 0.18, 0.80)),
    (4, 4.6, 0.0, 0.70, 0.25, (0.20, 0.50, 0.30)),
    (2, 7.76, 0.0, 0.0, 0.0, (0.1, 0.2, 0.7)),
]


@pytest.mark.parametrize("case", CASES)
def test_probability_matches_p3(psql, case):
    pos, rate, dx, start, sub, (e, m, f) = case
    mult = math.exp(BETA[pos] * dx)
    got = float(psql(f"select public.fpl_defcon_probability({pos}, {rate}, {mult}, {start}, {sub}, {e}, {m}, {f})"))
    want = p3_mixture(pos, rate, dx, start, sub, (e, m, f))
    assert abs(got - want) < 0.01
    assert abs(got - want) < 1e-5  # in practice identical


def test_probability_conditional_on_full_match_matches_p3_illustration(psql):
    # P3's own illustration for Hill (rate 10.92 per 90, neutral state) was 0.565 averaged over his
    # last-10 minutes; a certain 90-minute start must sit at or above that.
    got = float(psql("select public.fpl_defcon_probability(2, 10.92, 1, 1, 0, 0, 0, 1)"))
    assert abs(got - float(nb_sf(10, np.array([10.92]), PHI[2])[0])) < 1e-6
    assert got >= 0.565


def test_goalkeepers_and_unknown_are_zero(psql):
    assert float(psql("select public.fpl_defcon_probability(1, 5, 1, 1, 0, 0, 0, 1)")) == 0
    assert float(psql("select public.fpl_defcon_probability(5, 5, 1, 1, 0, 0, 0, 1)")) == 0
