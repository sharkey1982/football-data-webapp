#!/usr/bin/env python3
# ============================================================================
# scripts/ga_import.py
#
# Google Analytics 4 traffic for fixtureshark.com (12 Oct 2026), into the
# private `ga` schema (migration 20261012060000_ga4_site_traffic), for the
# admin Site traffic page (/admin/traffic) beside Search Console.
#
# Same service account and secret as scripts/gsc_import.py (Viewer on the GA4
# property), same rules, and it reuses that script's credential handling and
# redaction:
#   * every run deletes and rewrites ALL rows in its date window, for every
#     table, in ONE transaction -- GA's late revisions replace what was
#     there, and a failed run changes nothing;
#   * daily mode re-reads the last REFETCH_DAYS days plus any gap since the
#     last day loaded; --backfill reads from BACKFILL_FROM;
#   * logs ga.import_runs and public.pipeline_runs ('ga_import', counts
#     only -- pipeline_runs is public).
#
# GA only loads after a visitor accepts cookies, and never on an admin's
# device, so these numbers undercount real visitors.
#
#   python scripts/ga_import.py                    # daily
#   python scripts/ga_import.py --backfill         # all history
#   python scripts/ga_import.py --start 2026-09-01 --end 2026-09-30
#   python scripts/ga_import.py --check-access     # credential check, writes nothing
#
# Needs GSC_SERVICE_ACCOUNT_JSON (the shared service-account key, from a
# GitHub Actions secret), GA4_PROPERTY_ID (numeric, not the G- measurement
# id; not a secret) and SUPABASE_DB_URL.
# ============================================================================

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from gsc_import import connect, load_credential_info, redact, safe_error

SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"]
API = "https://analyticsdata.googleapis.com/v1beta"
JOB_NAME = "ga_import"

REFETCH_DAYS = 5           # GA revises the last ~72 hours
FINAL_AFTER_DAYS = 3
BACKFILL_FROM = date(2025, 1, 1)   # before FixtureShark had GA; nothing earlier exists
CHUNK_DAYS = 31            # long ranges are read a month at a time
ROW_LIMIT = 100000
PROPERTY_TZ = ZoneInfo("Europe/London")

COMMON = ("activeUsers", "sessions", "engagedSessions", "screenPageViews", "userEngagementDuration")
COMMON_COLS = ("active_users", "sessions", "engaged_sessions", "page_views", "engagement_seconds")


@dataclass(frozen=True)
class Dataset:
    name: str
    table: str
    dims: tuple[str, ...]       # API dimensions after "date"
    cols: tuple[str, ...]       # matching table columns
    metrics: tuple[str, ...] = COMMON
    metric_cols: tuple[str, ...] = COMMON_COLS


DATASETS = (
    Dataset("totals", "daily_totals", (), (),
            ("activeUsers", "newUsers", "sessions", "engagedSessions", "screenPageViews",
             "userEngagementDuration", "eventCount"),
            ("active_users", "new_users", "sessions", "engaged_sessions", "page_views",
             "engagement_seconds", "events")),
    Dataset("channel", "daily_by_channel", ("sessionDefaultChannelGroup", "sessionSource", "sessionMedium"),
            ("channel_group", "source", "medium")),
    Dataset("landing_page", "daily_by_landing_page", ("landingPage",), ("landing_page",)),
    Dataset("page", "daily_by_page", ("pagePath",), ("page_path",)),
    Dataset("device", "daily_by_device", ("deviceCategory",), ("device",)),
    Dataset("country", "daily_by_country", ("country",), ("country",)),
)


def property_id(raw: str | None) -> str:
    pid = (raw or "").strip()
    if pid.startswith("properties/"):
        pid = pid.split("/", 1)[1]
    if not re.fullmatch(r"\d{6,12}", pid):
        raise RuntimeError("GA4_PROPERTY_ID must be the numeric GA4 property id (Admin > Property details), "
                           "not the G- measurement id")
    return pid


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

def ga_today(now: datetime | None = None) -> date:
    now = now or datetime.now(tz=PROPERTY_TZ)
    return now.astimezone(PROPERTY_TZ).date()


def daily_window(today: date, last_loaded: date | None) -> tuple[date, date]:
    start = today - timedelta(days=REFETCH_DAYS)
    if last_loaded is None:
        start = BACKFILL_FROM
    elif last_loaded + timedelta(days=1) < start:
        start = last_loaded + timedelta(days=1)
    return start, today


def is_final(d: date, today: date) -> bool:
    return d <= today - timedelta(days=FINAL_AFTER_DAYS)


def chunks(start: date, end: date, size: int | None = None) -> list[tuple[date, date]]:
    size = size or CHUNK_DAYS
    out = []
    s = start
    while s <= end:
        e = min(end, s + timedelta(days=size - 1))
        out.append((s, e))
        s = e + timedelta(days=1)
    return out


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

class GaClient:
    def __init__(self, session, prop: str, sleep=time.sleep):
        self.session = session
        self.prop = prop
        self.requests = 0
        self._sleep = sleep

    def _call(self, method: str, url: str, body: dict | None = None) -> dict:
        for attempt in range(6):
            self.requests += 1
            resp = self.session.request(method, url, json=body, timeout=90)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < 5:
                self._sleep(min(60, 2 ** attempt * 2))
                continue
            try:
                msg = resp.json().get("error", {}).get("message") or resp.text
            except ValueError:
                msg = resp.text
            hint = ""
            if resp.status_code == 403:
                hint = (" -- check the Google Analytics Data API is enabled in the Cloud project and the"
                        " service account is a Viewer on the GA4 property")
            raise RuntimeError(f"Google Analytics API {resp.status_code}: {redact(msg, 300)}{hint}")
        raise RuntimeError("Google Analytics API: retries exhausted")

    def check(self) -> int:
        """Reads the property's metadata (any Viewer can); returns the number of dimensions offered."""
        data = self._call("GET", f"{API}/properties/{self.prop}/metadata")
        return len(data.get("dimensions") or [])

    def report(self, ds: Dataset, start: date, end: date) -> list[dict]:
        out: list[dict] = []
        offset = 0
        while True:
            body = {
                "dateRanges": [{"startDate": start.isoformat(), "endDate": end.isoformat()}],
                "dimensions": [{"name": "date"}] + [{"name": d} for d in ds.dims],
                "metrics": [{"name": m} for m in ds.metrics],
                "limit": ROW_LIMIT,
                "offset": offset,
                "keepEmptyRows": False,
            }
            data = self._call("POST", f"{API}/properties/{self.prop}:runReport", body)
            rows = data.get("rows") or []
            out += [flatten(ds, r) for r in rows]
            total = int(data.get("rowCount") or 0)
            offset += len(rows)
            if not rows or offset >= total:
                return out


def flatten(ds: Dataset, row: dict) -> dict:
    dv = [v.get("value", "") for v in row.get("dimensionValues") or []]
    mv = [v.get("value", "0") for v in row.get("metricValues") or []]
    if len(dv) != 1 + len(ds.dims) or len(mv) != len(ds.metrics):
        raise ValueError(f"{ds.name}: unexpected row shape from the API")
    rec: dict = {"date": datetime.strptime(dv[0], "%Y%m%d").date()}
    for col, v in zip(ds.cols, dv[1:]):
        rec[col] = v if v != "" else "(not set)"
    for col, v in zip(ds.metric_cols, mv):
        rec[col] = int(round(float(v or 0)))
    return rec


def fill_zero_days(ds: Dataset, totals: list[dict], start: date, end: date,
                   earliest_known: date | None, today: date) -> list[dict]:
    """Complete calendar from the first day with data (here or stored) to
    the end of the window (capped at today)."""
    have = {r["date"]: r for r in totals}
    first = min(have) if have else None
    if earliest_known is not None:
        first = max(start, earliest_known) if first is None else min(first, max(start, earliest_known))
    if first is None:
        return []
    zero = {c: 0 for c in ds.metric_cols}
    d, last, out = max(first, start), min(end, today), []
    while d <= last:
        out.append(have.get(d) or {"date": d, **zero})
        d += timedelta(days=1)
    return out


def fetch_window(client: GaClient, start: date, end: date, earliest_known: date | None, today: date) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {ds.name: [] for ds in DATASETS}
    for s, e in chunks(start, end):
        for ds in DATASETS:
            result[ds.name] += client.report(ds, s, e)
    result["totals"] = fill_zero_days(DATASETS[0], result["totals"], start, end, earliest_known, today)
    return result


def check_unique(ds: Dataset, rows: list[dict]) -> None:
    seen = set()
    for r in rows:
        k = (r["date"], *(r[c] for c in ds.cols))
        if k in seen:
            raise ValueError(f"{ds.name}: duplicate row from the API for {k[0]}")
        seen.add(k)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def loaded_range(conn, prop: str) -> tuple[date | None, date | None]:
    row = conn.execute("select max(date), min(date) filter (where sessions > 0) from ga.daily_totals"
                       " where property_id = %s", (prop,)).fetchone()
    return row[0], row[1]


def start_run(conn, mode: str, prop: str, start: date, end: date) -> tuple[int, int]:
    ga_id = conn.execute("insert into ga.import_runs (mode, property_id, start_date, end_date)"
                         " values (%s, %s, %s, %s) returning run_id", (mode, prop, start, end)).fetchone()[0]
    pr_id = conn.execute("insert into public.pipeline_runs (job_name, status, summary) values (%s, 'running', %s)"
                         " returning run_id", (JOB_NAME, f"{mode} {start}..{end}")).fetchone()[0]
    return ga_id, pr_id


def finish_run(conn, ga_id: int, pr_id: int, status: str, summary: str, counts: dict,
               api_requests: int, error: str | None) -> None:
    conn.execute("update ga.import_runs set finished_at = now(), status = %s, rows_written = %s::jsonb,"
                 " api_requests = %s, error_message = %s where run_id = %s",
                 (status, json.dumps(counts), api_requests, error, ga_id))
    conn.execute("update public.pipeline_runs set finished_at = now(), status = %s, summary = %s, error_message = %s"
                 " where run_id = %s", (status, redact(summary, 400), error, pr_id))


def write_window(conn, prop: str, start: date, end: date, data: dict[str, list[dict]],
                 run_id: int, today: date) -> dict[str, int]:
    counts: dict[str, int] = {}
    with conn.transaction():
        for ds in DATASETS:
            rows = data.get(ds.name, [])
            check_unique(ds, rows)
            conn.execute(f"delete from ga.{ds.table} where property_id = %s and date between %s and %s",
                         (prop, start, end))
            cols = ("property_id", "date", *ds.cols, *ds.metric_cols, "is_final", "run_id")
            with conn.cursor() as cur:
                with cur.copy(f"copy ga.{ds.table} ({', '.join(cols)}) from stdin") as cp:
                    for r in rows:
                        cp.write_row((prop, r["date"], *(r[c] for c in ds.cols), *(r[c] for c in ds.metric_cols),
                                      is_final(r["date"], today), run_id))
            counts[ds.name] = len(rows)
    return counts


def summarise(mode: str, start: date, end: date, counts: dict, requests: int) -> str:
    return f"{mode} {start}..{end}: rows " + ", ".join(f"{k} {v}" for k, v in counts.items()) + f"; {requests} API requests"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def make_session(info: dict):
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return AuthorizedSession(creds), info.get("client_email", "?")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Google Analytics 4 import")
    ap.add_argument("--backfill", action="store_true")
    ap.add_argument("--start", type=date.fromisoformat)
    ap.add_argument("--end", type=date.fromisoformat)
    ap.add_argument("--check-access", action="store_true")
    args = ap.parse_args(argv)

    try:
        prop = property_id(os.environ.get("GA4_PROPERTY_ID"))
        info = load_credential_info(os.environ.get("GSC_SERVICE_ACCOUNT_JSON"))
        session, email = make_session(info)
    except Exception as e:  # noqa: BLE001
        print(f"::error::{safe_error(e)}")
        return 1
    client = GaClient(session, prop)
    print(f"GA4 property {prop} as {email}")

    if args.check_access:
        try:
            n = client.check()
        except Exception as e:  # noqa: BLE001
            print(f"::error::{safe_error(e)}")
            return 1
        print(f"Access OK: property metadata readable ({n} dimensions)")
        return 0

    today = ga_today()
    try:
        conn = connect(os.environ["SUPABASE_DB_URL"])
        last, earliest = loaded_range(conn, prop)
    except Exception as e:  # noqa: BLE001
        print(f"::error::database: {safe_error(e)}")
        return 1
    if args.start or args.end:
        mode, start, end = "range", args.start or today - timedelta(days=REFETCH_DAYS), min(args.end or today, today)
    elif args.backfill:
        mode, start, end = "backfill", BACKFILL_FROM, today
    else:
        mode = "daily"
        start, end = daily_window(today, last)
    if start > end:
        print(f"::error::start {start} is after end {end}")
        return 1

    try:
        ga_id, pr_id = start_run(conn, mode, prop, start, end)
    except Exception as e:  # noqa: BLE001
        print(f"::error::database: {safe_error(e)}")
        return 1
    counts: dict[str, int] = {}
    try:
        client.check()
        data = fetch_window(client, start, end, earliest, today)
        counts = write_window(conn, prop, start, end, data, ga_id, today)
        summary = summarise(mode, start, end, counts, client.requests)
        status = "warning" if mode == "daily" and not any(r["sessions"] for r in data["totals"]) else "success"
        finish_run(conn, ga_id, pr_id, status, summary, counts, client.requests, None)
        print(summary)
        return 0
    except Exception as e:  # noqa: BLE001
        err = safe_error(e)
        summary = f"{mode} {start}..{end}: failed after {client.requests} API requests (nothing written)"
        try:
            finish_run(conn, ga_id, pr_id, "failed", summary, counts, client.requests, err)
        except Exception as e2:  # noqa: BLE001
            print(f"::warning::could not record the failure: {safe_error(e2)}")
        print(f"::error::{err}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
