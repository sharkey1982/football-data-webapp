// ============================================================================
// scripts/lib/indexability.mjs
//
// The rules a URL must meet to be in the sitemap, as plain functions so the
// build report (scripts/check-indexability.mjs), the unit tests
// (src/__tests__/indexability.test.ts) and reviewers all read one definition.
// Added in the 7 Oct 2026 indexing audit (docs/seo-indexation.md).
//
// A sitemap URL must:
//   - be https on the apex host, lower case, no trailing slash (except "/"),
//     no query string or fragment;
//   - not be blocked by robots.txt for Googlebot;
//   - be served by a generated file whose <link rel="canonical"> is exactly
//     that URL, with no robots noindex;
//   - have a title no other sitemap page shares.
// ============================================================================

export const SITE = 'https://fixtureshark.com';

/** Problems with the shape of a sitemap/canonical URL, [] when it's clean. */
export function urlShapeProblems(url) {
  const out = [];
  let u;
  try {
    u = new URL(url);
  } catch {
    return ['not a valid URL'];
  }
  if (u.protocol !== 'https:') out.push('not https');
  if (u.host !== new URL(SITE).host) out.push(`host is ${u.host}`);
  if (u.search) out.push('has a query string');
  if (u.hash) out.push('has a fragment');
  if (u.pathname !== '/' && u.pathname.endsWith('/')) out.push('trailing slash');
  if (u.pathname !== u.pathname.toLowerCase()) out.push('upper-case path');
  if (u.pathname.endsWith('.html')) out.push('ends .html');
  return out;
}

/** The Disallow prefixes that apply to Googlebot (its own group, else '*'). */
export function googlebotDisallows(robotsTxt) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) {
        current = { agents: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && key === 'disallow' && value) current.disallow.push(value);
    }
  }
  const own = groups.find((g) => g.agents.includes('googlebot'));
  return (own ?? groups.find((g) => g.agents.includes('*')))?.disallow ?? [];
}

/** True when robots.txt stops Googlebot fetching this path (prefix rules only; the file uses no wildcards). */
export function isBlocked(path, disallows) {
  return disallows.some((d) => path.startsWith(d));
}

/** Reads the head tags that decide indexing from a page's raw HTML. */
export function headTags(html) {
  const head = html.split('</head>')[0];
  const attr = (tag, name) => tag?.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;
  const canonTag = head.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0];
  const robotsTag = head.match(/<meta[^>]*name="robots"[^>]*>/)?.[0];
  const ogTag = head.match(/<meta[^>]*property="og:url"[^>]*>/)?.[0];
  return {
    canonical: attr(canonTag, 'href'),
    robots: attr(robotsTag, 'content'),
    ogUrl: attr(ogTag, 'content'),
    title: head.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? null,
  };
}

/** Problems with one sitemap URL's generated page, [] when it's indexable as listed. */
export function pageProblems(loc, html) {
  if (html == null) return ['no generated file (served by the app shell, which has no canonical)'];
  const t = headTags(html);
  const out = [];
  if (!t.canonical) out.push('no canonical');
  else if (t.canonical !== loc) out.push(`canonical is ${t.canonical}`);
  if (t.robots && /noindex/i.test(t.robots)) out.push(`robots meta "${t.robots}"`);
  if (t.ogUrl && t.ogUrl !== loc) out.push(`og:url is ${t.ogUrl}`);
  if (!t.title) out.push('no title');
  return out;
}

/** Titles used by more than one sitemap page: Map title -> locs. */
export function duplicateTitles(pages) {
  const by = new Map();
  for (const { loc, title } of pages) {
    if (!title) continue;
    if (!by.has(title)) by.set(title, []);
    by.get(title).push(loc);
  }
  return new Map([...by].filter(([, locs]) => locs.length > 1));
}

/** Paths that must never be in the sitemap and must stay blocked in robots.txt. */
export const PRIVATE_PATHS = ['/admin/', '/admin/fanteam', '/admin/team-ratings', '/login', '/data-health', '/data-flow', '/source-data', '/fpl/tactical-roles', '/build-report.txt'];
