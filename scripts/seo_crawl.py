#!/usr/bin/env python3
"""Crawl the live site the way a non-JS crawler sees it, for the indexing audit.

Outputs (in OUT dir):
  pages.jsonl   one row per fetched URL: status, location, robots, canonical,
                og:url, title, h1, word count, internal link count, source
  links.jsonl.gz  per fetched 200 HTML page: its internal links (as written)
  variants.jsonl  status/location/canonical for host/scheme/slash/case/query variants
  special.jsonl   robots.txt, sitemap files, legacy hosts
No redirects are followed. Stdlib only.
"""
import gzip, html, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

SITE = os.environ.get("SITE", "https://fixtureshark.com").rstrip("/")
HOST = urllib.parse.urlparse(SITE).netloc
OUT = os.environ.get("OUT", "seo-crawl")
WORKERS = int(os.environ.get("WORKERS", "4"))
MAX_EXTRA = int(os.environ.get("MAX_EXTRA", "25000"))
UA = "Mozilla/5.0 (compatible; FixtureShark-seo-audit/1.0)"
os.makedirs(OUT, exist_ok=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)


def fetch(url, body=True):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    t = time.time()
    for attempt in range(3):
        try:
            with opener.open(req, timeout=40) as r:
                data = r.read() if body else b""
                return r.status, dict(r.headers), data, time.time() - t
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and attempt < 2:
                time.sleep(2 + attempt * 3)
                continue
            return e.code, dict(e.headers or {}), b"", time.time() - t
        except Exception as e:  # noqa
            if attempt < 2:
                time.sleep(2)
                continue
            return 0, {"error": str(e)}, b"", time.time() - t


def h(headers, name):
    for k, v in headers.items():
        if k.lower() == name:
            return v
    return None


RE_CANON = re.compile(r'<link[^>]+rel=["\']canonical["\'][^>]*>', re.I)
RE_HREF = re.compile(r'href=["\']([^"\']*)["\']', re.I)
RE_META_ROBOTS = re.compile(r'<meta[^>]+name=["\']robots["\'][^>]*>', re.I)
RE_CONTENT = re.compile(r'content=["\']([^"\']*)["\']', re.I)
RE_OGURL = re.compile(r'<meta[^>]+property=["\']og:url["\'][^>]*>', re.I)
RE_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
RE_DESC = re.compile(r'<meta[^>]+name=["\']description["\'][^>]*>', re.I)
RE_H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.I | re.S)
RE_A = re.compile(r'<a\s[^>]*href=["\']([^"\'#][^"\']*)["\']', re.I)
RE_TAG = re.compile(r"<[^>]+>")
RE_SCRIPT = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.I | re.S)
RE_LD = re.compile(r'"@type"\s*:\s*"([A-Za-z]+)"')
RE_ROOT = re.compile(r'<div id="root">(.*)', re.S)


def first(rx, s, sub=None):
    m = rx.search(s)
    if not m:
        return None
    if sub:
        m2 = sub.search(m.group(0))
        return html.unescape(m2.group(1)) if m2 else None
    return html.unescape(RE_TAG.sub("", m.group(1))).strip()


def norm_link(base, href):
    href = html.unescape(href.strip())
    if href.startswith(("mailto:", "tel:", "javascript:", "data:")):
        return None
    u = urllib.parse.urljoin(base, href)
    p = urllib.parse.urlparse(u)
    if p.netloc.lower() not in (HOST, "www." + HOST):
        return None
    return urllib.parse.urlunparse((p.scheme, p.netloc, p.path or "/", "", p.query, ""))


def analyse(url, source):
    status, headers, data, dt = fetch(url)
    row = {
        "url": url, "source": source, "status": status, "ms": int(dt * 1000),
        "location": h(headers, "location"), "xrobots": h(headers, "x-robots-tag"),
        "ctype": h(headers, "content-type"), "err": headers.get("error"),
    }
    links = []
    if status == 200 and data and "html" in (row["ctype"] or ""):
        s = data.decode("utf-8", "replace")
        head = s.split("</head>", 1)[0]
        row["canonical"] = first(RE_CANON, head, RE_HREF)
        row["meta_robots"] = first(RE_META_ROBOTS, head, RE_CONTENT)
        row["og_url"] = first(RE_OGURL, head, RE_CONTENT)
        row["title"] = first(RE_TITLE, head)
        row["desc"] = first(RE_DESC, head, RE_CONTENT)
        row["ld_types"] = sorted(set(RE_LD.findall(s)))
        m = RE_ROOT.search(s)
        bodyhtml = m.group(1) if m else s
        row["h1"] = first(RE_H1, bodyhtml)
        text = RE_TAG.sub(" ", RE_SCRIPT.sub(" ", bodyhtml))
        row["words"] = len(re.findall(r"[A-Za-z0-9][\w'’.-]*", html.unescape(text)))
        row["body_empty"] = bool(m) and m.group(1).lstrip().startswith("</div>")
        raw = RE_A.findall(bodyhtml)
        for href in raw:
            n = norm_link(url, href)
            if n:
                links.append(n)
        row["links_out"] = len(links)
        row["bytes"] = len(data)
    return row, links


def sitemap_urls():
    special = []
    st, hd, data, _ = fetch(SITE + "/sitemap.xml")
    special.append({"url": SITE + "/sitemap.xml", "status": st})
    body = data.decode("utf-8", "replace")
    locs = re.findall(r"<loc>([^<]+)</loc>", body)
    urls = {}
    if "<sitemapindex" in body:
        for f in locs:
            fs, _, fd, _ = fetch(f)
            fb = fd.decode("utf-8", "replace")
            sub = re.findall(r"<loc>([^<]+)</loc>", fb)
            special.append({"url": f, "status": fs, "count": len(sub),
                            "lastmods": len(re.findall(r"<lastmod>", fb))})
            for u in sub:
                urls[html.unescape(u)] = f.rsplit("/", 1)[-1]
    else:
        for u in locs:
            urls[html.unescape(u)] = "sitemap.xml"
    return urls, special


def variants(url):
    p = urllib.parse.urlparse(url)
    path = p.path
    out = {}
    if path != "/":
        out["slash"] = f"{SITE}{path.rstrip('/')}/"
        out["upper"] = f"{SITE}{path.upper()}"
        out["title_case"] = f"{SITE}" + "/".join(x[:1].upper() + x[1:] for x in path.split("/"))
        out["dot_html"] = f"{SITE}{path.rstrip('/')}.html"
        out["index_html"] = f"{SITE}{path.rstrip('/')}/index.html"
    out["http"] = f"http://{HOST}{path}"
    out["www"] = f"https://www.{HOST}{path}"
    out["http_www"] = f"http://www.{HOST}{path}"
    out["query"] = f"{SITE}{path}?utm_source=audit"
    return out


def main():
    t0 = time.time()
    sm, special = sitemap_urls()
    print(f"sitemap: {len(sm)} urls in {time.time()-t0:.0f}s", flush=True)

    for extra in ["/robots.txt", "/llms.txt", "/nonexistent-page-xyz", "/football/teams/not-a-club",
                  "/play/beat-the-shark", "/play/beat-the-shark/"]:
        st, hd, _, _ = fetch(SITE + extra, body=False)
        special.append({"url": SITE + extra, "status": st, "location": h(hd, "location"),
                        "xrobots": h(hd, "x-robots-tag")})
    for host in ["http://fixtureshark.com/", "http://www.fixtureshark.com/", "https://www.fixtureshark.com/",
                 "https://footballdatashark.netlify.app/", "https://footballdatashark.netlify.app/football"]:
        st, hd, _, _ = fetch(host, body=False)
        special.append({"url": host, "status": st, "location": h(hd, "location")})

    pages = open(os.path.join(OUT, "pages.jsonl"), "w")
    linkf = gzip.open(os.path.join(OUT, "links.jsonl.gz"), "wt")
    seen = set(sm)
    found = {}

    def run(batch, source_of):
        with ThreadPoolExecutor(WORKERS) as ex:
            for row, links in ex.map(lambda u: analyse(u, source_of(u)), batch):
                pages.write(json.dumps(row) + "\n")
                if links:
                    linkf.write(json.dumps({"u": row["url"], "l": links}) + "\n")
                    for l in links:
                        found[l] = found.get(l, 0) + 1

    run(sorted(sm), lambda u: "sitemap:" + sm[u])
    print(f"sitemap pages done {time.time()-t0:.0f}s; distinct link targets {len(found)}", flush=True)

    # Second wave: every internal link target not in the sitemap (one level out),
    # then their links once more, capped.
    for wave in (1, 2):
        extra = [u for u in found if u not in seen][:MAX_EXTRA - (len(seen) - len(sm))]
        if not extra:
            break
        seen.update(extra)
        run(sorted(extra), lambda u, w=wave: f"link:{w}")
        print(f"wave {wave}: {len(extra)} done {time.time()-t0:.0f}s", flush=True)

    pages.close()
    linkf.close()

    # Variants for a sample: first 3 URLs of each path family.
    fam = {}
    for u in sorted(sm):
        segs = urllib.parse.urlparse(u).path.strip("/").split("/")
        key = "/".join(segs[:2]) + f"#{len(segs)}"
        fam.setdefault(key, []).append(u)
    sample = [u for us in fam.values() for u in us[:2]]
    with open(os.path.join(OUT, "variants.jsonl"), "w") as vf:
        jobs = [(u, k, v) for u in sample for k, v in variants(u).items()]

        def vrun(j):
            u, k, v = j
            st, hd, data, _ = fetch(v)
            canon = None
            if st == 200 and data:
                canon = first(RE_CANON, data.decode("utf-8", "replace").split("</head>", 1)[0], RE_HREF)
            return {"base": u, "kind": k, "url": v, "status": st, "location": h(hd, "location"), "canonical": canon}

        with ThreadPoolExecutor(WORKERS) as ex:
            for r in ex.map(vrun, jobs):
                vf.write(json.dumps(r) + "\n")
    with open(os.path.join(OUT, "special.jsonl"), "w") as sf:
        for r in special:
            sf.write(json.dumps(r) + "\n")
    print(f"done {time.time()-t0:.0f}s; variants {len(jobs)}", flush=True)


if __name__ == "__main__":
    main()
