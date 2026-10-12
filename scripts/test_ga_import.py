"""Tests for scripts/ga_import.py -- no network, no database.

Run: python -m pytest -q scripts/test_ga_import.py
"""

import json
from datetime import date, datetime, timezone

import pytest

import ga_import as g
import gsc_import
from test_gsc_import import FAKE_INFO, FAKE_KEY, FakeResp


def test_property_id_validation():
    assert g.property_id(" 412345678 ") == "412345678"
    assert g.property_id("properties/412345678") == "412345678"
    for bad in ("", "G-ABC123XYZ", "12", "412345678; drop"):
        with pytest.raises(RuntimeError, match="numeric"):
            g.property_id(bad)


def test_ga_today_is_london():
    assert g.ga_today(datetime(2026, 10, 11, 23, 30, tzinfo=timezone.utc)) == date(2026, 10, 12)


def test_daily_window():
    today = date(2026, 10, 12)
    assert g.daily_window(today, date(2026, 10, 11)) == (date(2026, 10, 7), today)
    assert g.daily_window(today, date(2026, 9, 1)) == (date(2026, 9, 2), today)
    assert g.daily_window(today, None) == (g.BACKFILL_FROM, today)


def test_chunks_cover_range_without_overlap():
    cs = g.chunks(date(2026, 1, 1), date(2026, 3, 5), 31)
    assert cs[0] == (date(2026, 1, 1), date(2026, 1, 31))
    assert cs[-1][1] == date(2026, 3, 5)
    for (a, b), (c, _) in zip(cs, cs[1:]):
        assert (c - b).days == 1


def _row(d, dims, metrics):
    return {"dimensionValues": [{"value": d}] + [{"value": v} for v in dims],
            "metricValues": [{"value": str(m)} for m in metrics]}


def test_flatten_shapes_and_not_set():
    ds = g.DATASETS[1]  # channel
    r = g.flatten(ds, _row("20261005", ["Organic Search", "google", ""], [3, 4, 2, 9, 120.6]))
    assert r == {"date": date(2026, 10, 5), "channel_group": "Organic Search", "source": "google",
                 "medium": "(not set)", "active_users": 3, "sessions": 4, "engaged_sessions": 2,
                 "page_views": 9, "engagement_seconds": 121}
    with pytest.raises(ValueError):
        g.flatten(ds, _row("20261005", ["x"], [1]))


def test_fill_zero_days_runs_to_today_not_past_it():
    ds = g.DATASETS[0]
    rows = [{"date": date(2026, 10, 3), **{c: 1 for c in ds.metric_cols}}]
    out = g.fill_zero_days(ds, rows, date(2026, 10, 1), date(2026, 10, 12), None, date(2026, 10, 6))
    assert [r["date"].day for r in out] == [3, 4, 5, 6]
    assert out[1]["sessions"] == 0 and set(out[1]) == {"date", *ds.metric_cols}


def test_fill_zero_days_with_history_starts_at_window():
    ds = g.DATASETS[0]
    out = g.fill_zero_days(ds, [], date(2026, 10, 7), date(2026, 10, 12), date(2026, 9, 1), date(2026, 10, 12))
    assert len(out) == 6 and all(r["sessions"] == 0 for r in out)
    assert g.fill_zero_days(ds, [], date(2026, 10, 7), date(2026, 10, 12), None, date(2026, 10, 12)) == []


class FakeGa:
    def __init__(self, rows_by_dims, status=200, row_limit_override=None):
        self.rows_by_dims = rows_by_dims
        self.status = status
        self.calls = []

    def request(self, method, url, json=None, timeout=None):
        self.calls.append((method, url, json))
        if self.status != 200:
            return FakeResp(self.status, {"error": {"message": "denied " + FAKE_KEY}})
        if method == "GET":
            return FakeResp(200, {"dimensions": [{}, {}]})
        dims = tuple(d["name"] for d in json["dimensions"][1:])
        lo = json["dateRanges"][0]["startDate"].replace("-", "")
        hi = json["dateRanges"][0]["endDate"].replace("-", "")
        rows = [r for r in self.rows_by_dims.get(dims, []) if lo <= r["dimensionValues"][0]["value"] <= hi]
        page = rows[json["offset"]: json["offset"] + json["limit"]]
        return FakeResp(200, {"rows": page, "rowCount": len(rows)})


def test_report_pages_by_offset(monkeypatch):
    monkeypatch.setattr(g, "ROW_LIMIT", 2)
    rows = [_row("20261005", [f"/p{i}"], [1, 1, 1, 1, 1]) for i in range(5)]
    s = FakeGa({("pagePath",): rows})
    c = g.GaClient(s, "412345678", sleep=lambda _: None)
    out = c.report(g.DATASETS[3], date(2026, 10, 1), date(2026, 10, 10))
    assert len(out) == 5 and len(s.calls) == 3
    assert s.calls[0][1].endswith("/properties/412345678:runReport")


def test_403_is_explained_and_redacted():
    gsc_import.load_credential_info(json.dumps(FAKE_INFO))
    c = g.GaClient(FakeGa({}, status=403), "412345678", sleep=lambda _: None)
    with pytest.raises(RuntimeError) as e:
        c.check()
    assert "Viewer on the GA4 property" in str(e.value)
    assert "PRIVATE" not in g.safe_error(e.value)


def test_fetch_window_reads_every_dataset_per_chunk(monkeypatch):
    monkeypatch.setattr(g, "CHUNK_DAYS", 3)
    s = FakeGa({(): [_row("20261002", [], [1, 1, 2, 1, 5, 30, 9])]})
    c = g.GaClient(s, "412345678", sleep=lambda _: None)
    data = g.fetch_window(c, date(2026, 10, 1), date(2026, 10, 6), None, date(2026, 10, 6))
    assert len(s.calls) == 2 * len(g.DATASETS)       # two 3-day chunks
    assert [r["date"].day for r in data["totals"]] == [2, 3, 4, 5, 6]


def test_check_unique():
    ds = g.DATASETS[4]
    r = {"date": date(2026, 10, 1), "device": "mobile"}
    with pytest.raises(ValueError, match="duplicate"):
        g.check_unique(ds, [r, dict(r)])
