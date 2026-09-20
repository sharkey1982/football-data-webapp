// ============================================================================
// src/__tests__/triggerWorkflow.auth.test.ts
//
// The Netlify workflow proxy holds a GitHub token with write access and
// used to accept ANY anonymous POST. It couldn't corrupt data -- the
// three allowed workflows only re-derive projections -- but an anonymous
// caller could burn unlimited Actions minutes and start concurrent runs
// that race. These tests pin the access rules that closed that.
//
// The handler is imported directly and driven with real Request objects,
// so this covers the actual deployed code path rather than a mock of it.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getUser = vi.fn();
const rpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser }, rpc }),
}));

// Imported lazily per test: the handler keeps rate-limit state in module
// scope, so tests must not share an instance of it.
async function loadHandler() {
  vi.resetModules();
  const mod = await import('../../netlify/functions/trigger-workflow');
  return mod.default;
}

function post(body: unknown, token: string | null = 'good-token'): Request {
  return new Request('https://example.test/.netlify/functions/trigger-workflow', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID = { workflow: 'refresh-fpl-projections', inputs: { from_matchweek: 1, to_matchweek: 5 } };

describe('trigger-workflow proxy', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_ACTIONS_TOKEN', 'gh-token');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-key');
    getUser.mockReset();
    rpc.mockReset();
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 204, text: async () => '' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects an anonymous caller with no token', async () => {
    const handler = await loadHandler();
    const resp = await handler(post(VALID, null));
    expect(resp.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a token Supabase does not recognise', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const handler = await loadHandler();
    const resp = await handler(post(VALID));
    expect(resp.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a signed-in NON-admin', async () => {
    // The important case: "authenticated" is not a trusted set, since
    // is_admin defaults false for any new signup.
    rpc.mockResolvedValue({ data: false, error: null });
    const handler = await loadHandler();
    const resp = await handler(post(VALID));
    expect(resp.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores a client-supplied isAdmin flag', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const handler = await loadHandler();
    const resp = await handler(post({ ...VALID, isAdmin: true }));
    // Anything the browser can send, an attacker can send. Only the
    // server-side is_admin() result counts.
    expect(resp.status).toBe(403);
  });

  it('lets a valid admin through and dispatches the workflow', async () => {
    const handler = await loadHandler();
    const resp = await handler(post(VALID));
    expect(resp.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('refresh-fpl-projections.yml');
  });

  it.each([
    ['out of range', { from_matchweek: 1, to_matchweek: 900 }],
    ['not an integer', { from_matchweek: 1, to_matchweek: 'abc' }],
    ['reversed range', { from_matchweek: 10, to_matchweek: 2 }],
  ])('rejects input that is %s rather than coercing it', async (_label, inputs) => {
    const handler = await loadHandler();
    const resp = await handler(post({ workflow: 'refresh-fpl-projections', inputs }));
    expect(resp.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unknown workflows and unknown input keys', async () => {
    const handler = await loadHandler();
    expect((await handler(post({ workflow: 'rm-rf', inputs: {} }))).status).toBe(400);
    expect((await handler(post({ workflow: 'simulate-final-table', inputs: { season_id: 13, evil: 1 } }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rate limits a single admin after repeated triggers', async () => {
    const handler = await loadHandler();
    for (let i = 0; i < 5; i++) {
      expect((await handler(post(VALID))).status).toBe(200);
    }
    const sixth = await handler(post(VALID));
    expect(sixth.status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('does not leak GitHub API detail to the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 403,
      text: async () => 'token lacks workflow scope for sharkey1982/football-data-webapp',
    }));
    const handler = await loadHandler();
    const resp = await handler(post(VALID));
    expect(resp.status).toBe(502);
    const body = await resp.json();
    expect(body.error).not.toContain('scope');
    expect(body.error).not.toContain('sharkey1982');
  });
});
