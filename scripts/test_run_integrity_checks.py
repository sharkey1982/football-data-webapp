"""Tests for the acknowledgement rules in run_integrity_checks.py (audit P-02)."""
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run_integrity_checks import acknowledgement_row, apply_acknowledgements, list_items, area_status  # noqa: E402

TODAY = dt.date(2026, 10, 22)
STALE = ("Jobs with no successful run within their expected interval: refresh-history-derived (last success 2026-10-21 12:50); "
         "tennis_import (last success 2026-10-04 20:45)")


def ack(check, until="2026-11-05", subject=None):
    return {"check_name": check, "subject": subject, "reason": "PC import", "acknowledged_until": dt.date.fromisoformat(until)}


def row(check, detail="x", status="failed", found=1):
    return {"check_name": check, "status": status, "found": found, "detail": detail}


def test_list_items():
    assert list_items(STALE) == ["refresh-history-derived", "tennis_import"]
    assert list_items("no colon here") == []


def test_whole_check_acknowledged_becomes_warning():
    out = apply_acknowledgements([row("tennis_fresh")], [ack("tennis_fresh")], TODAY)
    assert out[0]["status"] == "warning"
    assert "ACKNOWLEDGED until 2026-11-05" in out[0]["detail"]


def test_expired_acknowledgement_fails_again():
    out = apply_acknowledgements([row("tennis_fresh")], [ack("tennis_fresh", "2026-10-21")], TODAY)
    assert out[0]["status"] == "failed"


def test_acknowledgement_lasts_through_its_last_day():
    out = apply_acknowledgements([row("tennis_fresh")], [ack("tennis_fresh", "2026-10-22")], TODAY)
    assert out[0]["status"] == "warning"


def test_list_check_fails_while_any_item_is_not_acknowledged():
    out = apply_acknowledgements([row("jobs_stale", STALE, found=2)], [ack("jobs_stale", subject="tennis_import")], TODAY)
    assert out[0]["status"] == "failed"
    assert out[0]["found"] == 1
    assert "[acknowledged: tennis_import]" in out[0]["detail"]


def test_list_check_with_every_item_acknowledged_warns():
    only_tennis = "Jobs with no successful run within their expected interval: tennis_import (last success 2026-10-04 20:45)"
    out = apply_acknowledgements([row("jobs_stale", only_tennis)], [ack("jobs_stale", subject="tennis_import")], TODAY)
    assert out[0]["status"] == "warning"


def test_other_checks_and_non_failures_untouched():
    rows = [row("unique_function_names"), row("tennis_fresh", status="ok", found=0)]
    out = apply_acknowledgements(rows, [ack("tennis_fresh")], TODAY)
    assert out == rows
    assert area_status(out) == "failed"


def test_acknowledgement_row_lists_active_only():
    r = acknowledgement_row([ack("tennis_fresh"), ack("old", "2026-10-01"), ack("jobs_stale", subject="tennis_import")], TODAY)
    assert r["found"] == 2 and r["status"] == "ok"
    assert "jobs_stale/tennis_import until 2026-11-05" in r["detail"]
    assert "old" not in r["detail"]
