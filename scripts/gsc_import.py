#!/usr/bin/env python3
# ============================================================================
# scripts/gsc_import.py
#
# Google Search Console performance data for fixtureshark.com (11 Oct 2026),
# into the private `gsc` schema (migration 20261011220000_gsc_search_console).
#
# Reads the Search Analytics API with a read-only service account
# (id-fixtureshark-gsc-reader@fixtureshark-analytics.iam.gserviceaccount.com,
# Restricted user on sc-domain:fixtureshark.com) and stores, per day:
#   totals, by device, by country      -- aggregated by property
#   by page, by query, by page+query   -- Google's top rows; anonymised
#                                         queries are omitted by the API
#
# Idempotent: every run deletes and rewrites ALL rows in its date window,
# for every table, in ONE transaction. Revisions from Google (including rows
# that vanish) replace what was there; a failed run changes nothing.
#
# Daily mode re-fetches the last REFETCH_DAYS days (Google revises recent
# days) and also reaches back to the day after the last one loaded, so a
# missed run heals itself. --backfill fetches everything Google still keeps
# (about 16 months).
#
# Logging: gsc.import_runs (private detail) and public.pipeline_runs
# (job_name 'gsc_import'). pipeline_runs is publicly readable, so its row
# carries counts only -- never queries, pages or clicks -- and every error
# text goes through redact() first.
#
#   python scripts/gsc_import.py                     # daily
#   python scripts/gsc_import.py --backfill          # all available history
#   python scripts/gsc_import.py --start 2026-09-01 --end 2026-09-30
#   python scripts/gsc_import.py --check-access      # credential check, writes nothing
#
# Needs GSC_SERVICE_ACCOUNT_JSON (the key file's JSON, from a GitHub Actions
# secret -- never a file in the repo) and SUPABASE_DB_URL (session pooler).
# GSC_SITE_URL overrides the property (default sc-domain:fixtureshark.com).
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
from urllib.parse import quote
from zoneinfo import ZoneInfo

SITE_URL = os.environ.get("GSC_SITE_URL") or "sc-domain:fixtureshark.com"
SEARCH_TYPE = "web"
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
API = "https://searchconsole.googleapis.com/webmasters/v3"
JOB_NAME = "gsc_import"

REFETCH_DAYS = 10          # Google revises recent days; re-read this many every run
HISTORY_DAYS = 500         # a little over Google's 16-month retention
ROW_LIMIT = 25000          # API maximum per request
FINAL_AFTER_DAYS = 4       # fallback when the API gives no firstIncompleteDate

# Search Console dates are Pacific Time.
GSC_TZ = ZoneInfo("America/Los_Angeles")


@dataclass(frozen=True)
class Dataset:
    name: str
    table: str
    dims: tuple[str, ...]          # API dimensions, always starting with "date"
    per_day: bool                  # query one day at a time (page/query sets)
    aggregation: str               # API aggregationType

    @property
    def columns(self) -> tuple[str, ...]:
        return self.dims[1:]


DATASETS = (
    Dataset("totals", "daily_totals", ("date",), False, "byProperty"),
    Dataset("device", "daily_by_device", ("date", "device"), False, "byProperty"),
    Dataset("country", "daily_by_country", ("date", "country"), False, "byProperty"),
    Dataset("page", "daily_by_page", ("date", "page"), True, "auto"),
    Dataset("query", "daily_by_query", ("date", "query"), True, "auto"),
    Dataset("page_query", "daily_by_page_query", ("date", "page", "query"), True, "auto"),
)


# ---------------------------------------------------------------------------
# Secrets hygiene
# ---------------------------------------------------------------------------

_PEM = re.compile(r"-----BEGIN [A-Z ]+-----.*?(-----END [A-Z ]+-----|$)", re.S)
_KEYISH = re.compile(r'"?(private_key(_id)?|client_secret|access_token|refresh_token|id_token)"?\s*[:=]\s*"?[^",\s}]+', re.I)
_BEARER = re.compile(r"(Bearer|ya29\.)[A-Za-z0-9._\-]+")
_LONG = re.compile(r"[A-Za-z0-9+/=_\-]{80,}")

_secret_fragments: list[str] = []


def register_secret(info: dict) -> None:
    """Remember the credential's secret parts so redact() can strip them
    even if a library echoes them in an error."""
    for k in ("private_key", "private_key_id"):
        v = info.get(k)
        if isinstance(v, str) and len(v) >= 8:
            _secret_fragments.append(v)
            # Also each base64 line of the key, in case it is quoted piecemeal.
            _secret_fragments.extend(line for line in v.splitlines() if len(line) >= 16)


def redact(text: object, limit: int = 500) -> str:
    s = str(text)
    for frag in _secret_fragments:
        s = s.replace(frag, "[redacted]")
    s = _PEM.sub("[redacted key]", s)
    s = _KEYISH.sub(lambda m: m.group(1) + "=[redacted]", s)
    s = _BEARER.sub("[redacted token]", s)
    s = _LONG.sub("[redacted]", s)
    return s[:limit]


def safe_error(e: BaseException) -> str:
    return redact(f"{type(e).__name__}: {e}")


def load_credential_info(raw: str | None) -> dict:
    if not raw or not raw.strip():
        raise RuntimeError("GSC_SERVICE_ACCOUNT_JSON is not set (add it as a GitHub Actions secret)")
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as e:
        # Position only -- never the content.
        raise RuntimeError(f"GSC_SERVICE_ACCOUNT_JSON is not valid JSON (line {e.lineno}, column {e.colno})") from None
    if not isinstance(info, dict) or info.get("type") != "service_account" or "private_key" not in info:
        raise RuntimeError("GSC_SERVICE_ACCOUNT_JSON is not a service-account key file")
    register_secret(info)
    return info


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

def gsc_today(now: datetime | None = None) -> date:
    now = now or datetime.now(tz=GSC_TZ)
    return now.astimezone(GSC_TZ).date()


def daily_window(today: date, last_loaded: date | None) -> tuple[date, date]:
    """Re-read the last REFETCH_DAYS days, and anything since the last day
    loaded (so missed runs heal). Nothing loaded yet -> full history."""
    start = today - timedelta(days=REFETCH_DAYS)
    if last_loaded is None:
        start = today - timedelta(days=HISTORY_DAYS)
    elif last_loaded + timedelta(days=1) < start:
        start = last_loaded + timedelta(days=1)
    return start, today


def is_final(d: date, first_incomplete: date | None, today: date) -> bool:
    if first_incomplete is not None:
        return d < first_incomplete
    return d <= today - timedelta(days=FINAL_AFTER_DAYS)


def days(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

class GscClient:
    def __init__(self, session, site_url: str = SITE_URL, sleep=time.sleep):
        self.session = session
        self.site_url = site_url
        self.requests = 0
        self.first_incomplete: date | None = None
        self._sleep = sleep

    @property
    def _site(self) -> str:
        return quote(self.site_url, safe="")

    def _call(self, method: str, url: str, body: dict | None = None) -> dict:
        for attempt in range(6):
            self.requests += 1
            resp = self.session.request(method, url, json=body, timeout=60)
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
                hint = (" -- check the service account is a user on the Search Console property"
                        " and the Search Console API is enabled in the Cloud project")
            raise RuntimeError(f"Search Console API {resp.status_code}: {redact(msg, 300)}{hint}")
        raise RuntimeError("Search Console API: retries exhausted")

    def permission_level(self) -> str:
        return self._call("GET", f"{API}/sites/{self._site}").get("permissionLevel", "unknown")

    def query(self, ds: Dataset, start: date, end: date) -> list[dict]:
        """All rows for one dataset over [start, end], paging by ROW_LIMIT."""
        out: list[dict] = []
        start_row = 0
        while True:
            body = {
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "dimensions": list(ds.dims),
                "type": SEARCH_TYPE,
                "aggregationType": ds.aggregation,
                "dataState": "all",
                "rowLimit": ROW_LIMIT,
                "startRow": start_row,
            }
            data = self._call("POST", f"{API}/sites/{self._site}/searchAnalytics/query", body)
            self._note_metadata(data)
            rows = data.get("rows") or []
            out += [flatten(ds, r) for r in rows]
            if len(rows) < ROW_LIMIT:
                return out
            start_row += ROW_LIMIT

    def _note_metadata(self, data: dict) -> None:
        meta = data.get("metadata") or {}
        v = meta.get("firstIncompleteDate") or meta.get("first_incomplete_date")
        if v:
            d = date.fromisoformat(v[:10])
            if self.first_incomplete is None or d < self.first_incomplete:
                self.first_incomplete = d


def flatten(ds: Dataset, row: dict) -> dict:
    keys = row.get("keys") or []
    if len(keys) != len(ds.dims):
        raise ValueError(f"{ds.name}: expected {len(ds.dims)} keys, got {len(keys)}")
    rec = dict(zip(ds.dims, keys))
    rec["date"] = date.fromisoformat(rec["date"])
    rec["clicks"] = int(round(row.get("clicks", 0)))
    rec["impressions"] = int(round(row.get("impressions", 0)))
    rec["ctr"] = float(row.get("ctr", 0.0))
    rec["position"] = float(row.get("position", 0.0))
    return rec


def fetch_window(client: GscClient, start: date, end: date, earliest_known: date | None) -> dict[str, list[dict]]:
    """Every dataset for the window. Page/query sets are read one day at a
    time, and only for days the totals show impressions on."""
    result: dict[str, list[dict]] = {}
    totals = client.query(DATASETS[0], start, end)
    active = sorted({r["date"] for r in totals if r["impressions"] > 0})
    result["totals"] = fill_zero_days(totals, start, end, earliest_known)
    for ds in DATASETS[1:]:
        if not ds.per_day:
            result[ds.name] = client.query(ds, start, end)
        else:
            rows: list[dict] = []
            for d in active:
                rows += client.query(ds, d, d)
            result[ds.name] = rows
    return result


def fill_zero_days(totals: list[dict], start: date, end: date, earliest_known: date | None) -> list[dict]:
    """Make the totals calendar complete: zero rows for days with no data,
    from the first day with data (here or already stored) to the last day
    Google returned. Days before the site had any data stay absent."""
    have = {r["date"]: r for r in totals}
    if not have:
        return []
    first = min(have)
    if earliest_known is not None and earliest_known < first:
        first = max(start, earliest_known)
    last = max(have)
    out = []
    for d in days(max(first, start), min(last, end)):
        out.append(have.get(d) or {"date": d, "clicks": 0, "impressions": 0, "ctr": 0.0, "position": 0.0})
    return out


def check_unique(ds: Dataset, rows: list[dict]) -> None:
    """Fail loudly if Google ever returns the same key twice (the table's
    primary key would reject it anyway; this names the dataset)."""
    seen = set()
    for r in rows:
        k = tuple(r[c] for c in ds.dims)
        if k in seen:
            raise ValueError(f"{ds.name}: duplicate row from the API for {k[0]}")
        seen.add(k)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def connect(url: str):
    import psycopg
    conn = psycopg.connect(url, autocommit=True, connect_timeout=30,
                           keepalives=1, keepalives_idle=30, keepalives_interval=10,
                           keepalives_count=3, tcp_user_timeout=60000)
    conn.execute("set statement_timeout = '10min'")
    return conn


def last_loaded_date(conn, site: str) -> tuple[date | None, date | None]:
    row = conn.execute(
        "select max(date), min(date) filter (where impressions > 0) from gsc.daily_totals"
        " where site_url = %s and search_type = %s", (site, SEARCH_TYPE)).fetchone()
    return row[0], row[1]


def start_run(conn, mode: str, site: str, start: date | None, end: date | None) -> tuple[int, int]:
    gsc_id = conn.execute(
        "insert into gsc.import_runs (mode, site_url, search_type, start_date, end_date)"
        " values (%s, %s, %s, %s, %s) returning run_id", (mode, site, SEARCH_TYPE, start, end)).fetchone()[0]
    pr_id = conn.execute(
        "insert into public.pipeline_runs (job_name, status, summary) values (%s, 'running', %s) returning run_id",
        (JOB_NAME, f"{mode} {start}..{end}")).fetchone()[0]
    return gsc_id, pr_id


def finish_run(conn, gsc_id: int, pr_id: int, status: str, summary: str, counts: dict,
               api_requests: int, first_incomplete: date | None, error: str | None) -> None:
    conn.execute(
        "update gsc.import_runs set finished_at = now(), status = %s, rows_written = %s::jsonb,"
        " api_requests = %s, first_incomplete_date = %s, error_message = %s where run_id = %s",
        (status, json.dumps(counts), api_requests, first_incomplete, error, gsc_id))
    conn.execute(
        "update public.pipeline_runs set finished_at = now(), status = %s, summary = %s, error_message = %s"
        " where run_id = %s", (status, redact(summary, 400), error, pr_id))


def write_window(conn, site: str, start: date, end: date, data: dict[str, list[dict]],
                 run_id: int, first_incomplete: date | None, today: date) -> dict[str, int]:
    """Replace every table's rows in [start, end] in one transaction."""
    counts: dict[str, int] = {}
    with conn.transaction():
        for ds in DATASETS:
            rows = data.get(ds.name, [])
            check_unique(ds, rows)
            conn.execute(
                f"delete from gsc.{ds.table} where site_url = %s and search_type = %s and date between %s and %s",
                (site, SEARCH_TYPE, start, end))
            cols = ("site_url", "search_type", "date", *ds.columns,
                    "clicks", "impressions", "ctr", "position", "is_final", "run_id")
            with conn.cursor() as cur:
                with cur.copy(f"copy gsc.{ds.table} ({', '.join(cols)}) from stdin") as cp:
                    for r in rows:
                        cp.write_row((site, SEARCH_TYPE, r["date"], *(r[c] for c in ds.columns),
                                      r["clicks"], r["impressions"], r["ctr"], r["position"],
                                      is_final(r["date"], first_incomplete, today), run_id))
            counts[ds.name] = len(rows)
    return counts


def summarise(mode: str, start: date, end: date, counts: dict, requests: int) -> str:
    parts = ", ".join(f"{k} {v}" for k, v in counts.items())
    return f"{mode} {start}..{end}: rows {parts}; {requests} API requests"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def make_session(info: dict):
    from google.auth.transport.requests import AuthorizedSession
    from google.oauth2 import service_account
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return AuthorizedSession(creds), info.get("client_email", "?")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--backfill", action="store_true", help="fetch all history Google keeps")
    ap.add_argument("--start", type=date.fromisoformat)
    ap.add_argument("--end", type=date.fromisoformat)
    ap.add_argument("--check-access", action="store_true", help="check the credential can read the property; write nothing")
    args = ap.parse_args(argv)

    try:
        info = load_credential_info(os.environ.get("GSC_SERVICE_ACCOUNT_JSON"))
        session, email = make_session(info)
    except Exception as e:  # noqa: BLE001
        print(f"::error::{safe_error(e)}")
        return 1
    client = GscClient(session)
    print(f"Search Console property {SITE_URL} as {email}")

    if args.check_access:
        try:
            level = client.permission_level()
        except Exception as e:  # noqa: BLE001
            print(f"::error::{safe_error(e)}")
            return 1
        print(f"Access OK: permissionLevel {level}")
        return 0

    today = gsc_today()
    try:
        conn = connect(os.environ["SUPABASE_DB_URL"])
        last, earliest = last_loaded_date(conn, SITE_URL)
    except Exception as e:  # noqa: BLE001 -- no traceback: it could show connection details
        print(f"::error::database: {safe_error(e)}")
        return 1
    if args.start or args.end:
        mode = "range"
        start = args.start or today - timedelta(days=REFETCH_DAYS)
        end = min(args.end or today, today)
    elif args.backfill:
        mode, start, end = "backfill", today - timedelta(days=HISTORY_DAYS), today
    else:
        mode = "daily"
        start, end = daily_window(today, last)
    if start > end:
        print(f"::error::start {start} is after end {end}")
        return 1

    try:
        gsc_id, pr_id = start_run(conn, mode, SITE_URL, start, end)
    except Exception as e:  # noqa: BLE001
        print(f"::error::database: {safe_error(e)}")
        return 1
    counts: dict[str, int] = {}
    try:
        client.permission_level()  # clear 403 message before any data call
        data = fetch_window(client, start, end, earliest)
        counts = write_window(conn, SITE_URL, start, end, data, gsc_id, client.first_incomplete, today)
        summary = summarise(mode, start, end, counts, client.requests)
        # A whole daily window with no impressions is not normal once the
        # site is indexed -- worth a warning, not a failure.
        status = "warning" if mode == "daily" and counts.get("totals", 0) == 0 else "success"
        finish_run(conn, gsc_id, pr_id, status, summary, counts, client.requests, client.first_incomplete, None)
        print(summary)
        print(f"first incomplete date: {client.first_incomplete}")
        return 0
    except Exception as e:  # noqa: BLE001
        err = safe_error(e)
        summary = f"{mode} {start}..{end}: failed after {client.requests} API requests (nothing written)"
        try:
            finish_run(conn, gsc_id, pr_id, "failed", summary, counts, client.requests, client.first_incomplete, err)
        except Exception as e2:  # noqa: BLE001
            print(f"::warning::could not record the failure: {safe_error(e2)}")
        print(f"::error::{err}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
