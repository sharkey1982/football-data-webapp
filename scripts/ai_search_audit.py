#!/usr/bin/env python3
"""AI-search / SEO audit of the LIVE site, as a non-JS fetcher sees it.

Writes ai-audit/report.json (and a short report.txt). Stdlib only. No redirects
followed. Run from GitHub Actions (the Claude workspace can't reach the site).
"""
import html, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

SITE = os.environ.get("SITE", "https://fixtureshark.com").rstrip("/")
OUT = os.environ.get("OUT", "ai-audit")
os.makedirs(OUT, exist_ok=True)
BROWSER_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"
BOT_UAS = {
    "Googlebot": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Bingbot": "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "GPTBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
    "OAI-SearchBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
    "ChatGPT-User": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
    "PerplexityBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    "ClaudeBot": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Claude-SearchBot": "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://www.anthropic.com)",
    "Applebot": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
}
KEY_PAGES = [
    "/", "/football", "/fixtures", "/tv-guide", "/team-strength", "/football/leagues", "/football/records",
    "/football/teams/arsenal", "/football/leagues/premier-league", "/fpl/start", "/fpl", "/fpl/player-points",
    "/fpl/line-ups", "/fpl/injuries", "/fpl/gameweek", "/fpl/articles", "/fpl/articles/xg-or-fdr",
    "/finance", "/international", "/international/teams", "/international/tournaments", "/nfl", "/nfl/table",
    "/tennis", "/tennis/players", "/llms.txt", "/robots.txt", "/sitemap.xml", "/does-not-exist-xyz",
]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)


def fetch(url, ua=BROWSER_UA, body=True, method="GET"):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": "text/html,*/*"}, method=method)
    t = time.time()
    for attempt in range(3):
        try:
            with opener.open(req, timeout=40) as r:
                data = r.read() if body else b""
                return r.status, {k.lower(): v for k, v in r.headers.items()}, data, round(time.time() - t, 2)
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and attempt < 2:
                time.sleep(2 + attempt * 3)
                continue
            return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, (e.read() if body else b""), round(time.time() - t, 2)
        except Exception as e:  # noqa
            if attempt < 2:
                time.sleep(2)
                continue
            return 0, {"error": str(e)[:200]}, b"", round(time.time() - t, 2)


def tag(htm, pattern):
    m = re.search(pattern, htm, re.I | re.S)
    return html.unescape(m.group(1).strip()) if m else None


def analyse(htm):
    head_end = htm.lower().find("</head>")
    head = htm[: head_end if head_end > 0 else len(htm)]
    body = htm[head_end:] if head_end > 0 else htm
    title = tag(head, r"<title[^>]*>(.*?)</title>")
    desc = tag(head, r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']')
    canonical = tag(head, r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\'](.*?)["\']')
    robots = tag(head, r'<meta[^>]+name=["\']robots["\'][^>]+content=["\'](.*?)["\']')
    ld_types, ld_errors = [], []
    for block in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', htm, re.I | re.S):
        try:
            obj = json.loads(block)
            items = obj if isinstance(obj, list) else obj.get("@graph", [obj]) if isinstance(obj, dict) else []
            for it in items:
                if isinstance(it, dict):
                    ld_types.append(it.get("@type"))
        except Exception as e:  # noqa
            ld_errors.append(str(e)[:120])
    text_body = re.sub(r"<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", body, flags=re.I | re.S)
    h1 = tag(text_body, r"<h1[^>]*>(.*?)</h1>")
    h1 = re.sub(r"<[^>]+>", "", h1).strip() if h1 else None
    paras = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", p))).strip() for p in re.findall(r"<p[^>]*>(.*?)</p>", text_body, re.I | re.S)]
    paras = [p for p in paras if len(p) > 40]
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text_body))).strip()
    imgs = re.findall(r"<img\b[^>]*>", body, re.I)
    no_alt = [i[:120] for i in imgs if not re.search(r"\balt=", i, re.I)]
    links = re.findall(r'<a\b[^>]*href=["\'](.*?)["\']', body, re.I)
    footer = tag(body, r"<footer[^>]*>(.*?)</footer>")
    footer = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", footer)).strip()[:400] if footer else None
    return {
        "title": title, "description": desc, "canonical": canonical, "robots_meta": robots,
        "jsonld_types": ld_types, "jsonld_errors": ld_errors, "h1": h1,
        "first_paragraphs": paras[:2], "words": len(text.split()), "digits": len(re.findall(r"\d", text)),
        "internal_links": sum(1 for l in links if l.startswith("/") or l.startswith(SITE)),
        "images": len(imgs), "images_without_alt": no_alt[:5], "footer": footer,
        "html_bytes": len(htm), "scripts": len(re.findall(r"<script\b", htm, re.I)),
    }


report = {"site": SITE, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

# 1. Bots: same URL with each crawler UA (note: Cloudflare may treat a spoofed
# UA from a non-bot IP differently to the real crawler).
bots = {}
for name, ua in BOT_UAS.items():
    s, h, d, t = fetch(SITE + "/", ua)
    s2, _, _, _ = fetch(SITE + "/fpl/start", ua)
    bots[name] = {"home": s, "fpl_start": s2, "secs": t, "bytes": len(d), "server": h.get("server"), "cf_mitigated": h.get("cf-mitigated")}
report["bots"] = bots

# 4. Address variants.
variants = {}
for u in ["http://fixtureshark.com/", "http://www.fixtureshark.com/", "https://www.fixtureshark.com/",
          "https://www.fixtureshark.com/fpl/start", "http://fixtureshark.com/fpl/start", "https://fixtureshark.com/fpl/start/",
          "https://fixtureshark.com/FPL/start", "https://fixtureshark.com/fpl/start?ref=x"]:
    s, h, d, t = fetch(u, body=True)
    variants[u] = {"status": s, "location": h.get("location"), "canonical": analyse(d.decode("utf-8", "replace")).get("canonical") if s == 200 else None}
report["variants"] = variants

# 2/4/5/6/10. Key pages.
pages = {}
for p in KEY_PAGES:
    s, h, d, t = fetch(SITE + p)
    row = {"status": s, "secs": t, "content_type": h.get("content-type"), "x_robots": h.get("x-robots-tag"),
           "cache": h.get("cache-control"), "cf_cache": h.get("cf-cache-status"), "location": h.get("location")}
    if s == 200 and "html" in (h.get("content-type") or ""):
        row.update(analyse(d.decode("utf-8", "replace")))
    elif p in ("/llms.txt", "/robots.txt"):
        row["body"] = d.decode("utf-8", "replace")[:6000]
    pages[p] = row
report["pages"] = pages

# 3. Sitemap.
s, h, d, t = fetch(SITE + "/sitemap.xml")
xml = d.decode("utf-8", "replace")
locs = re.findall(r"<loc>(.*?)</loc>", xml)
sm = {"status": s, "entries": len(locs), "is_index": "<sitemapindex" in xml}
urls = []
if sm["is_index"]:
    sm["children"] = locs
    for child in locs:
        cs, _, cd, _ = fetch(child)
        cx = cd.decode("utf-8", "replace")
        urls += re.findall(r"<url>\s*<loc>(.*?)</loc>(?:\s*<lastmod>(.*?)</lastmod>)?", cx)
else:
    urls = re.findall(r"<url>\s*<loc>(.*?)</loc>(?:\s*<lastmod>(.*?)</lastmod>)?", xml)
sm["urls"] = len(urls)
sm["with_lastmod"] = sum(1 for u in urls if u[1])
lastmods = sorted(u[1] for u in urls if u[1])
sm["lastmod_min"], sm["lastmod_max"] = (lastmods[0], lastmods[-1]) if lastmods else (None, None)
from collections import Counter
sm["lastmod_top"] = Counter(lastmods).most_common(5)
sm["sections"] = Counter(urllib.parse.urlparse(u[0]).path.split("/")[1] or "(home)" for u in urls).most_common(30)
sm["non_canonical_host"] = [u[0] for u in urls if not u[0].startswith(SITE + "/") and u[0] != SITE][:10]
# sample: every 12th URL (about 400 of ~4,900), body fetched to check title/canonical/noindex.
sample = [u[0] for u in urls][:: max(1, len(urls) // 400)]


def check(u):
    s, h, d, t = fetch(u)
    a = analyse(d.decode("utf-8", "replace")) if s == 200 else {}
    return {"url": u, "status": s, "secs": t, "location": h.get("location"), "x_robots": h.get("x-robots-tag"),
            "title": a.get("title"), "canonical": a.get("canonical"), "robots_meta": a.get("robots_meta"),
            "words": a.get("words"), "digits": a.get("digits"), "jsonld": a.get("jsonld_types"), "h1": a.get("h1"),
            "first": (a.get("first_paragraphs") or [None])[0], "no_alt": len(a.get("images_without_alt") or [])}


with ThreadPoolExecutor(4) as ex:
    rows = list(ex.map(check, sample))
bad = [r for r in rows if r["status"] != 200 or (r["canonical"] and r["canonical"] != r["url"]) or (r["robots_meta"] and "noindex" in r["robots_meta"].lower()) or (r["x_robots"] and "noindex" in r["x_robots"].lower())]
titles = Counter(r["title"] for r in rows if r["title"])
sm["sample_size"] = len(rows)
sm["sample_bad"] = bad[:40]
sm["sample_bad_count"] = len(bad)
sm["sample_dup_titles"] = [t for t in titles.most_common(15) if t[1] > 1]
sm["sample_thin"] = [{"url": r["url"], "words": r["words"]} for r in rows if r["status"] == 200 and (r["words"] or 0) < 120][:30]
sm["sample_no_jsonld"] = sum(1 for r in rows if r["status"] == 200 and not r["jsonld"])
sm["sample_jsonld_types"] = Counter(t for r in rows for t in (r["jsonld"] or []) if isinstance(t, str)).most_common(20)
sm["sample_secs_p50"] = sorted(r["secs"] for r in rows)[len(rows) // 2] if rows else None
sm["sample_secs_p90"] = sorted(r["secs"] for r in rows)[int(len(rows) * 0.9)] if rows else None
sm["sample_first_sentences"] = [{"url": r["url"], "first": (r["first"] or "")[:200]} for r in rows[:: max(1, len(rows) // 40)]]
report["sitemap"] = sm
report["sample_rows"] = rows

# IndexNow key file / well-known.
for p in ["/.well-known/security.txt", "/humans.txt", "/ads.txt"]:
    s, _, _, _ = fetch(SITE + p, body=False)
    report.setdefault("misc", {})[p] = s

with open(os.path.join(OUT, "report.json"), "w") as f:
    json.dump(report, f, indent=1, default=str)
print(json.dumps({k: report[k] for k in ("bots", "variants")}, indent=1))
print("sitemap", {k: sm[k] for k in ("status", "urls", "with_lastmod", "sample_bad_count")})
