"""--relegated-proxy: an unrated club gets the mean rating of last season's relegated clubs."""
import sys

import pytest

import estimate_promoted_team_ratings as est

LEAGUES = {"I1": 15}
FITS = [{"fit_run_id": 500, "fitted_at": "2026-10-25T06:30:00+00:00", "league_id": 15, "status": "accepted"}]
RATINGS = [  # fit 500: A, B stay up; R1, R2 were relegated last season; P (promoted) unrated
    {"fit_run_id": 500, "team_id": 1, "attack_strength": 0.3, "defence_strength": 0.2},
    {"fit_run_id": 500, "team_id": 2, "attack_strength": 0.1, "defence_strength": 0.0},
    {"fit_run_id": 500, "team_id": 91, "attack_strength": -0.4, "defence_strength": -0.3},
    {"fit_run_id": 500, "team_id": 92, "attack_strength": -0.2, "defence_strength": -0.1},
]
FIXTURES = [{"fixture_id": 1, "league_id": 15, "season_id": 13, "home_team_id": 1, "away_team_id": 2},
            {"fixture_id": 2, "league_id": 15, "season_id": 13, "home_team_id": 3, "away_team_id": 1}]
MATCHES = [{"league_id": 15, "season_id": 12, "home_team_id": 1, "away_team_id": 91, "match_date": "2026-05-01"},
           {"league_id": 15, "season_id": 12, "home_team_id": 92, "away_team_id": 2, "match_date": "2026-05-02"}]
TEAMS = [{"team_id": 3, "canonical_name": "Promoted FC"}]


class Q:
    def __init__(self, rows, sink=None):
        self.rows, self.sink, self.single_ = list(rows), sink, False

    def select(self, *_):
        return self

    def eq(self, k, v):
        self.rows = [r for r in self.rows if r.get(k) == v]
        return self

    def lt(self, k, v):
        self.rows = [r for r in self.rows if r.get(k) < v]
        return self

    def lte(self, k, v):
        return self

    def gt(self, k, v):
        return self

    def in_(self, k, vs):
        self.rows = [r for r in self.rows if r.get(k) in vs]
        return self

    def order(self, k, desc=False):
        self.rows.sort(key=lambda r: r.get(k), reverse=desc)
        return self

    def limit(self, n):
        self.rows = self.rows[:n]
        return self

    def single(self):
        self.single_ = True
        return self

    def insert(self, rows):
        self.sink.extend(rows)
        self.rows = rows
        return self

    def execute(self):
        data = (self.rows[0] if self.rows else None) if self.single_ else self.rows
        return type("R", (), {"data": data})()


class FakeClient:
    def __init__(self):
        self.written = []

    def table(self, name):
        if name == "leagues":
            return Q([{"league_id": v, "code": k} for k, v in LEAGUES.items()])
        if name == "model_fit_runs":
            return Q(FITS)
        if name == "team_ratings":
            return Q(RATINGS, self.written)
        if name == "fixtures":
            return Q(FIXTURES)
        if name == "matches":
            return Q(MATCHES)
        if name == "teams":
            return Q(TEAMS)
        raise KeyError(name)

    def rpc(self, name, *_):
        assert name == "current_season_id"
        return Q([13])


def run(monkeypatch, *argv):
    client = FakeClient()
    monkeypatch.setattr(est, "create_client", lambda *_: client)
    monkeypatch.setenv("SUPABASE_URL", "x")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "y")
    monkeypatch.setattr(sys, "argv", ["est", *argv])
    return client


def test_relegated_proxy_writes_mean_of_relegated(monkeypatch):
    # rpc().execute().data must be the bare season id
    client = run(monkeypatch, "--target-league", "I1", "--relegated-proxy")
    monkeypatch.setattr(client, "rpc", lambda *_: type("R", (), {"execute": lambda self: type("D", (), {"data": 13})()})())
    est.main()
    assert len(client.written) == 1
    row = client.written[0]
    assert row["team_id"] == 3 and row["is_estimated"] is True
    assert row["attack_strength"] == pytest.approx(-0.3)
    assert row["defence_strength"] == pytest.approx(-0.2)
    assert "relegated" in row["estimation_note"]


def test_without_any_basis_exits_2(monkeypatch):
    client = run(monkeypatch, "--target-league", "I1", "--relegated-proxy")
    monkeypatch.setattr(client, "rpc", lambda *_: type("R", (), {"execute": lambda self: type("D", (), {"data": 13})()})())
    monkeypatch.setattr(est, "previous_season_team_ids", lambda *_: (12, set()))
    with pytest.raises(SystemExit) as e:
        est.main()
    assert e.value.code == 2 and client.written == []
