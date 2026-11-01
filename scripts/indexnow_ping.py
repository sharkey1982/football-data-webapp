#!/usr/bin/env python3
"""IndexNow: tell Bing, Yandex and the other IndexNow engines which pages changed.

Reads the live sitemap, compares each URL's <lastmod> with the state saved by
the previous run (STATE file, kept in the Actions cache), and submits only the
URLs that are new or whose lastmod moved. Runs at most hourly (the workflow's
schedule). The first run (no state) submits nothing and just saves the state,
so the engines are never sent the whole site at once.

Key file: https://fixtureshark.com/<KEY>.txt (public/<KEY>.txt), which proves
we own the host. Stdlib only. Prints one summary line (used for pipeline_runs).
"""
import json, os, re, sys, urllib.request, urllib.error

SITE = os.environ.get("SITE", "https://fixtureshark.com").rstrip("/")
HOST = SITE.split("://", 1)[1]
KEY = os.environ["INDEXNOW_KEY"]
STATE = os.environ.get("STATE", ".indexnow/state.json")
ENDPOINT = "https://api.indexnow.org/indexnow"
MAX_PER_REQUEST = 10000
DRY = os.environ.get("DRY_RUN") == "1"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "FixtureShark-indexnow"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def sitemap_entries():
    root = get(f"{SITE}/sitemap.xml")
    children = re.findall(r"<sitemap>\s*<loc>(.*?)</loc>", root) or [f"{SITE}/sitemap.xml"]
    out = {}
    for child in children:
        xml = root if child == f"{SITE}/sitemap.xml" else get(child)
        for loc, lastmod in re.findall(r"<url>\s*<loc>(.*?)</loc>(?:\s*<lastmod>(.*?)</lastmod>)?", xml):
            out[loc] = lastmod or ""
    return out


def main():
    # The key file must be live before any submission counts.
    key_live = get(f"{SITE}/{KEY}.txt").strip() == KEY
    now = sitemap_entries()
    if len(now) < 1000:
        print(f"sitemap looks wrong ({len(now)} URLs); nothing submitted")
        return 1
    try:
        prev = json.load(open(STATE))
    except Exception:
        prev = None
    os.makedirs(os.path.dirname(STATE) or ".", exist_ok=True)
    if prev is None:
        json.dump(now, open(STATE, "w"))
        print(f"first run: saved state for {len(now)} URLs, submitted 0 (key file live: {key_live})")
        return 0
    changed = [u for u, lm in now.items() if prev.get(u) != lm]
    if not changed:
        json.dump(now, open(STATE, "w"))
        print(f"{len(now)} URLs, 0 changed, nothing submitted")
        return 0
    if not key_live:
        print(f"{len(changed)} changed but key file not live; nothing submitted (state kept)")
        return 1
    statuses = []
    for i in range(0, len(changed), MAX_PER_REQUEST):
        batch = changed[i:i + MAX_PER_REQUEST]
        body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"{SITE}/{KEY}.txt", "urlList": batch}).encode()
        if DRY:
            statuses.append("dry")
            continue
        req = urllib.request.Request(ENDPOINT, data=body, method="POST",
                                     headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": "FixtureShark-indexnow"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                statuses.append(r.status)
        except urllib.error.HTTPError as e:
            # Keep the engine's reason (e.g. "key not valid") for pipeline_runs.
            statuses.append(f"{e.code} {e.read()[:160].decode('utf-8', 'replace').strip()}")
    ok = all(s in (200, 202, "dry") for s in statuses)
    if ok:
        json.dump(now, open(STATE, "w"))  # only move on once the engines accepted them
    print(f"{len(now)} URLs, {len(changed)} changed, submitted in {len(statuses)} request(s): HTTP {statuses}"
          f"{'' if ok else ' (state kept, will retry)'}; e.g. {changed[:3]}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
