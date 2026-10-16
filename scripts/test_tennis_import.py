# Unit tests for the data repairs in scripts/tennis_import.py (dates, player
# names). Cases are taken from the 2000-2026 profile of 4 Oct 2026.
#   python -m pytest scripts/test_tennis_import.py

import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import tennis_import as ti  # noqa: E402


def frame(rows):
    cols = ["Tournament", "Date", "Round", "Winner", "Loser", "W1", "L1", "W2", "L2", "Wsets", "Lsets", "Comment"]
    return pd.DataFrame([dict(zip(cols, r)) for r in rows], columns=cols)


def test_blank_date_takes_tournament_latest():
    # WTA 2012 Cincinnati final has no date; pd.NaT used to become the text "NaT"
    ti.NOTES.clear()
    rows = ti.to_rows("WTA", 2012, frame([
        ("Cincy", pd.Timestamp("2012-08-19"), "Semifinals", "Li N.", "Williams V.", 7, 5, 6, 1, 2, 0, "Completed"),
        ("Cincy", pd.NaT, "The Final", "Li N.", "Kerber A.", 1, 6, 6, 3, 1, 1, "Completed"),
    ]))
    assert rows[1]["match_date"] == "2012-08-19"
    assert "Date" not in rows[1]["raw"]  # blank source value is dropped, not "NaT"
    assert len(ti.NOTES) == 1


def test_year_typo_is_repaired():
    # ATP 2006 Paris final dated 2005-11-05
    ti.NOTES.clear()
    rows = ti.to_rows("ATP", 2006, frame([
        ("Paris", pd.Timestamp("2005-11-05"), "The Final", "Davydenko N.", "Hrbaty D.", 6, 1, 6, 2, 2, 0, "Completed"),
    ]))
    assert rows[0]["match_date"] == "2006-11-05"


def test_late_december_of_previous_year_is_kept():
    rows = ti.to_rows("ATP", 2014, frame([
        ("Brisbane", pd.Timestamp("2013-12-30"), "1st Round", "A A.", "B B.", 6, 1, 6, 2, 2, 0, "Completed"),
    ]))
    assert rows[0]["match_date"] == "2013-12-30"


def test_tidy_name_keeps_key():
    for raw, want in [("Choi J-H.", "Choi J.H."), ("Del Potro J. M.", "Del Potro J.M."), ("Kim K", "Kim K."),
                      ("Mccabe J.", "McCabe J."), ("Sharapova, M.", "Sharapova M."),
                      ("Kohlschreiber P..", "Kohlschreiber P."), ("Auger-Aliassime F.", "Auger-Aliassime F."),
                      ("de Minaur A.", "de Minaur A.")]:
        assert ti.tidy_name(raw) == want
        assert ti.name_key(want) == ti.name_key(raw)


def row(tour, year, w, l, rnd="1st Round", t="T"):
    return {"tour": tour, "year": year, "tournament": t, "round": rnd, "winner": w, "loser": l}


def test_name_map_merges_spellings_and_aliases():
    rows = [row("ATP", 2008, "Del Potro J.M.", "Querry S."), row("ATP", 2009, "Del Potro J. M.", "Querrey S."),
            row("ATP", 2009, "Del Potro J.M.", "X Y.", "2nd Round")]
    m = ti.build_name_map("ATP", rows, [])
    assert m[("Del Potro J. M.", 2009)] == m[("Del Potro J.M.", 2008)] == "Del Potro J.M."
    assert m[("Querry S.", 2008)] == "Querrey S."


def test_name_map_prefers_database_spelling():
    m = ti.build_name_map("WTA", [row("WTA", 2026, "Raducànu E.", "Z Z.")], ["Raducanu E."])
    assert m[("Raducànu E.", 2026)] == "Raducanu E."


def test_year_limited_alias():
    rows = [row("ATP", 2012, "Ramos A.", "Q Q."), row("ATP", 2025, "Ramos A.", "Q Q.")]
    m = ti.build_name_map("ATP", rows, [])
    assert m[("Ramos A.", 2012)] == "Ramos-Vinolas A."
    assert m[("Ramos A.", 2025)] == "Ramos A."


def test_apply_names_rebuilds_key():
    rows = [dict(row("WTA", 2016, "Mchale C.", "Doi M."), source_key="old")]
    names = ti.build_name_map("WTA", rows, [])
    ti.apply_names("WTA", 2016, rows, names)
    assert rows[0]["source_key"] == "WTA|2016|T|1st Round|McHale C.|Doi M."


# --- 16 Oct 2026: every run leaves a pipeline_runs row with its outcome ------
class _Q:
    def __init__(self, log, table):
        self.log, self.table, self.op, self.payload = log, table, None, None

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def select(self, *_a, **_k):
        self.op = "select"
        return self

    def eq(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a):
        return self

    def execute(self):
        self.log.append((self.table, self.op, self.payload))
        data = [{"run_id": 7}] if self.op == "insert" else []
        return type("R", (), {"data": data})()


class _SB:
    def __init__(self):
        self.log = []

    def table(self, name):
        return _Q(self.log, name)


def _run_main(monkeypatch, argv, sb):
    import types
    monkeypatch.setitem(sys.modules, "supabase", types.SimpleNamespace(create_client=lambda *_a: sb))
    monkeypatch.setenv("SUPABASE_URL", "http://x")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "k")
    monkeypatch.setattr(sys, "argv", ["tennis_import.py", *argv])
    return ti.main()


def test_download_failure_is_recorded(monkeypatch):
    sb = _SB()

    def refuse(*_a, **_k):
        raise RuntimeError("HTTP Error 403: Forbidden")

    monkeypatch.setattr(ti, "load_workbook", refuse)
    assert _run_main(monkeypatch, ["--years", "2026"], sb) == 1
    runs = [x for x in sb.log if x[0] == "pipeline_runs"]
    assert runs[0][1] == "insert" and runs[0][2]["status"] == "running"
    assert runs[-1][1] == "update" and runs[-1][2]["status"] == "failed"
    assert "403" in runs[-1][2]["error_message"]


def test_crash_is_recorded_and_raised(monkeypatch):
    sb = _SB()

    def boom(*_a, **_k):
        raise KeyError("unexpected")

    monkeypatch.setattr(ti, "parse_years", lambda *_a: [2026])
    monkeypatch.setattr(ti, "build_name_map", boom)
    monkeypatch.setattr(ti, "load_workbook", lambda *_a: ("x", frame([])))
    try:
        _run_main(monkeypatch, [], sb)
        raise AssertionError("should raise")
    except KeyError:
        pass
    last = [x for x in sb.log if x[0] == "pipeline_runs"][-1]
    assert last[2]["status"] == "failed" and "KeyError" in last[2]["error_message"]
