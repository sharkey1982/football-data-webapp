"""Tests for scripts/gsc_import.py -- no network, no database.

Run: python -m pytest -q scripts/test_gsc_import.py
"""

from datetime import date, datetime, timezone

import pytest

import gsc_import as g

# Assembled at runtime so no PEM-shaped string sits in the repo (secret
# scanners would flag it). Not a real key.
_PEM_LABEL = "PRIVATE" + " KEY"
FAKE_KEY = (f"-----BEGIN {_PEM_LABEL}-----\n" + "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7"
            + "\nabcdefghijklmnopqrstuvwxyz0123456789ABCDEF\n" + f"-----END {_PEM_LABEL}-----\n")
FAKE_INFO = {
    "type": "service_account",
    "project_id": "fixtureshark-analytics",
    "private_key_id": "0123456789abcdef0123456789abcdef01234567",
    "private_key": FAKE_KEY,
    "client_email": "id-fixtureshark-gsc-reader@fixtureshark-analytics.iam.gserviceaccount.com",
}


# --- credential handling ----------------------------------------------------

def test_load_credential_rejects_missing_and_bad_json_without_echoing():
    with pytest.raises(RuntimeError, match="not set"):
        g.load_credential_info("")
    with pytest.raises(RuntimeError) as e:
        g.load_credential_info('{"private_key": "SECRETSECRET", oops}')
    assert "SECRETSECRET" not in str(e.value)
    with pytest.raises(RuntimeError, match="not a service-account"):
        g.load_credential_info('{"type": "authorized_user"}')


def test_redact_strips_key_material_and_tokens():
    import json
    g.load_credential_info(json.dumps(FAKE_INFO))
    msg = (f"boom {FAKE_KEY} id={FAKE_INFO['private_key_id']} "
           f'"private_key": "abc" Authorization: Bearer ' + 'ya29' + '.a0fakeTOKEN-_123 '
           "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7")
    out = g.redact(msg, limit=2000)
    assert "BEGIN " + _PEM_LABEL not in out
    assert FAKE_INFO["private_key_id"] not in out
    assert "ya29" not in out
    assert "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7" not in out
    assert out.startswith("boom")


def test_safe_error_is_bounded():
    assert len(g.safe_error(ValueError("x" * 5000))) <= 500


# --- dates ------------------------------------------------------------------

def test_gsc_today_is_pacific():
    # 03:00 UTC on 11 Oct is still 10 Oct in California.
    assert g.gsc_today(datetime(2026, 10, 11, 3, 0, tzinfo=timezone.utc)) == date(2026, 10, 10)


def test_daily_window_refetches_recent_days():
    today = date(2026, 10, 11)
    assert g.daily_window(today, date(2026, 10, 10)) == (date(2026, 10, 1), today)


def test_daily_window_heals_a_gap():
    today = date(2026, 10, 11)
    assert g.daily_window(today, date(2026, 9, 20)) == (date(2026, 9, 21), today)


def test_daily_window_first_run_is_full_history():
    today = date(2026, 10, 11)
    start, end = g.daily_window(today, None)
    assert (today - start).days == g.HISTORY_DAYS and end == today


def test_is_final_uses_api_metadata_then_fallback():
    today = date(2026, 10, 11)
    assert g.is_final(date(2026, 10, 8), date(2026, 10, 9), today)
    assert not g.is_final(date(2026, 10, 9), date(2026, 10, 9), today)
    assert g.is_final(date(2026, 10, 7), None, today)
    assert not g.is_final(date(2026, 10, 8), None, today)


# --- shaping ----------------------------------------------------------------

def test_flatten_and_key_count():
    ds = g.DATASETS[5]  # page_query
    r = g.flatten(ds, {"keys": ["2026-10-01", "https://fixtureshark.com/fpl", "fpl captain"],
                       "clicks": 3.0, "impressions": 40.0, "ctr": 0.075, "position": 7.25})
    assert r == {"date": date(2026, 10, 1), "page": "https://fixtureshark.com/fpl", "query": "fpl captain",
                 "clicks": 3, "impressions": 40, "ctr": 0.075, "position": 7.25}
    with pytest.raises(ValueError):
        g.flatten(ds, {"keys": ["2026-10-01"]})


def _tot(d, imp):
    return {"date": d, "clicks": 0, "impressions": imp, "ctr": 0.0, "position": 1.0}


def test_fill_zero_days_completes_calendar_from_first_data_day():
    rows = [_tot(date(2026, 10, 3), 5), _tot(date(2026, 10, 6), 2)]
    out = g.fill_zero_days(rows, date(2026, 10, 1), date(2026, 10, 10), None)
    assert [r["date"].day for r in out] == [3, 4, 5, 6]
    assert out[1]["impressions"] == 0


def test_fill_zero_days_starts_at_window_when_history_exists():
    rows = [_tot(date(2026, 10, 6), 2)]
    out = g.fill_zero_days(rows, date(2026, 10, 1), date(2026, 10, 10), date(2026, 9, 1))
    assert [r["date"].day for r in out] == [1, 2, 3, 4, 5, 6]


def test_check_unique_rejects_duplicate_keys():
    ds = g.DATASETS[1]
    row = {"date": date(2026, 10, 1), "device": "MOBILE"}
    with pytest.raises(ValueError, match="duplicate"):
        g.check_unique(ds, [row, dict(row)])


# --- API client with a fake session ------------------------------------------

class FakeResp:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload
        self.text = str(payload)

    def json(self):
        return self._payload


class FakeSession:
    """Answers searchAnalytics queries from a table of rows per dimension set."""

    def __init__(self, rows_by_dims, fail_first=0, status=200):
        self.rows_by_dims = rows_by_dims
        self.calls = []
        self.fail_first = fail_first
        self.status = status

    def request(self, method, url, json=None, timeout=None):
        self.calls.append((method, url, json))
        if self.fail_first:
            self.fail_first -= 1
            return FakeResp(503, {"error": {"message": "backend"}})
        if self.status != 200:
            return FakeResp(self.status, {"error": {"message": "User does not have sufficient permission"}})
        if method == "GET":
            return FakeResp(200, {"siteUrl": "sc-domain:fixtureshark.com", "permissionLevel": "siteRestrictedUser"})
        rows = [r for r in self.rows_by_dims.get(tuple(json["dimensions"]), [])
                if json["startDate"] <= r["keys"][0] <= json["endDate"]]
        page = rows[json["startRow"]: json["startRow"] + json["rowLimit"]]
        return FakeResp(200, {"rows": page, "responseAggregationType": json["aggregationType"],
                              "metadata": {"firstIncompleteDate": "2026-10-09"}})


def _row(keys, clicks, imp):
    return {"keys": keys, "clicks": clicks, "impressions": imp, "ctr": clicks / imp if imp else 0, "position": 5.0}


def test_site_url_is_encoded_and_request_shape():
    s = FakeSession({})
    c = g.GscClient(s, sleep=lambda _: None)
    c.query(g.DATASETS[0], date(2026, 10, 1), date(2026, 10, 2))
    method, url, body = s.calls[0]
    assert url.endswith("/sites/sc-domain%3Afixtureshark.com/searchAnalytics/query")
    assert body["dataState"] == "all" and body["type"] == "web" and body["rowLimit"] == 25000


def test_paging_reads_every_row(monkeypatch):
    monkeypatch.setattr(g, "ROW_LIMIT", 2)
    rows = [_row(["2026-10-01", f"q{i}"], 1, 2) for i in range(5)]
    s = FakeSession({("date", "query"): rows})
    c = g.GscClient(s, sleep=lambda _: None)
    out = c.query(g.DATASETS[4], date(2026, 10, 1), date(2026, 10, 1))
    assert len(out) == 5 and len(s.calls) == 3


def test_retries_transient_errors_and_reports_403_clearly():
    s = FakeSession({}, fail_first=2)
    c = g.GscClient(s, sleep=lambda _: None)
    c.query(g.DATASETS[0], date(2026, 10, 1), date(2026, 10, 1))
    assert c.requests == 3
    c403 = g.GscClient(FakeSession({}, status=403), sleep=lambda _: None)
    with pytest.raises(RuntimeError, match="403.*service account is a user"):
        c403.permission_level()


def test_fetch_window_reads_page_sets_only_on_active_days():
    rows = {
        ("date",): [_row(["2026-10-02"], 1, 10), _row(["2026-10-04"], 0, 3)],
        ("date", "device"): [_row(["2026-10-02", "MOBILE"], 1, 10), _row(["2026-10-04", "DESKTOP"], 0, 3)],
        ("date", "country"): [_row(["2026-10-02", "gbr"], 1, 10), _row(["2026-10-04", "gbr"], 0, 3)],
        ("date", "page"): [_row(["2026-10-02", "https://fixtureshark.com/"], 1, 10)],
        ("date", "query"): [_row(["2026-10-02", "fixtureshark"], 1, 4)],
        ("date", "page", "query"): [_row(["2026-10-02", "https://fixtureshark.com/", "fixtureshark"], 1, 4)],
    }
    s = FakeSession(rows)
    c = g.GscClient(s, sleep=lambda _: None)
    data = g.fetch_window(c, date(2026, 10, 1), date(2026, 10, 5), None)
    assert [r["date"].day for r in data["totals"]] == [2, 3, 4]       # 3 Oct filled with zero
    assert len(data["device"]) == 2 and len(data["page"]) == 1
    per_day_calls = [b for (_, _, b) in s.calls if b and len(b["dimensions"]) > 1 and b["startDate"] == b["endDate"]]
    assert {b["startDate"] for b in per_day_calls} == {"2026-10-02", "2026-10-04"}
    assert c.first_incomplete == date(2026, 10, 9)


def test_summary_never_contains_dimension_values():
    s = g.summarise("daily", date(2026, 10, 1), date(2026, 10, 11), {"totals": 11, "query": 40}, 9)
    assert s == "daily 2026-10-01..2026-10-11: rows totals 11, query 40; 9 API requests"
