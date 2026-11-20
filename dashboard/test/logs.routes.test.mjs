// Route-level tests without installing Next: a tiny module hook replaces only
// `next/server`, and global fetch is stubbed with local Response fixtures.
// No API, database, network, credentials or production service is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const nextResponseStub = `
export class NextResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers || {});
  }
  static json(data, init = {}) {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    });
  }
  async json() { return JSON.parse(this.body); }
  async text() { return String(this.body); }
}
export default NextResponse;
`;
// The shared server helper also imports next/headers and next/navigation for the
// protected-page gate; stub those too so these route tests stay install-free.
const nextHeadersStub = `export async function cookies() { return { get: () => undefined }; }`;
const nextNavigationStub = `export function redirect(url) { throw new Error('redirect ' + url); }`;
// Apostrophes survive encodeURIComponent, so escape them for the inner data URL.
const encodedStub = (src) => encodeURIComponent(src).replace(/'/g, '%27');
const loaderSource = `
const urls = {
  'next/server': 'data:text/javascript,${encodedStub(nextResponseStub)}',
  'next/headers': 'data:text/javascript,${encodedStub(nextHeadersStub)}',
  'next/navigation': 'data:text/javascript,${encodedStub(nextNavigationStub)}',
};
export async function resolve(specifier, context, nextResolve) {
  if (urls[specifier]) return { url: urls[specifier], shortCircuit: true };
  // Next resolves extensionless imports; native ESM does not.
  if (specifier.startsWith('.') && !/\\.[a-z0-9]+$/i.test(specifier)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const listRoute = await import('../app/api/logs/route.js');
const exportRoute = await import('../app/api/logs/export/route.js');

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

// Replaces fetch with bounded local responses; returns the recorded calls.
function stubFetch(responses) {
    const calls = [];
    let index = 0;
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), init });
        const response = responses[Math.min(index++, responses.length - 1)];
        if (response instanceof Error) throw response;
        return response;
    };
    return calls;
}

// Minimal NextRequest-shaped object carrying the dashboard session cookie.
function request(search = '', token = 'session-token') {
    return {
        url: `http://dashboard.local${search}`,
        cookies: { get: (name) => (name === 'ruckus_session' && token ? { value: token } : undefined) },
    };
}

const pageResponse = (rows, total) => new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Total-Count': String(total) },
});

const row = (id, eventData = 'ok') => ({
    id, timestamp: `2026-11-17T00:00:${String(id % 60).padStart(2, '0')}Z`,
    event_type: 'error', event_data: eventData,
});

test('list route refuses anonymous callers before touching the API', async () => {
    const calls = stubFetch([]);
    const res = await listRoute.GET(request('/api/logs?type=all', null));
    assert.equal(res.status, 401);
    assert.equal(calls.length, 0);
});

test('list route forwards the session and only supported paging parameters', async () => {
    const calls = stubFetch([pageResponse([row(1)], 7)]);
    const res = await listRoute.GET(request('/api/logs?type=interactions&offset=20&limit=10'));
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/bot\/interactions\?offset=20&limit=10$/);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer session-token');
    assert.deepEqual(await res.json(), {
        type: 'interactions', offset: 20, limit: 10, total: 7, rows: [row(1)],
    });
});

test('list route rejects unsupported type filters and propagates upstream auth failures', async () => {
    const calls = stubFetch([]);
    const bad = await listRoute.GET(request('/api/logs?type=guild_id'));
    assert.equal(bad.status, 400);
    assert.equal(calls.length, 0);

    stubFetch([new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 })]);
    const denied = await listRoute.GET(request('/api/logs?type=all'));
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'Authentication required' });
});

test('export walks the full active filter with a bounded number of pages', async () => {
    const first = Array.from({ length: 100 }, (_, i) => row(i + 1, i === 0 ? '=cmd()' : 'ok'));
    const second = Array.from({ length: 100 }, (_, i) => row(i + 101));
    const third = Array.from({ length: 50 }, (_, i) => row(i + 201));
    const calls = stubFetch([pageResponse(first, 250), pageResponse(second, 250), pageResponse(third, 250)]);
    const res = await exportRoute.GET(request('/api/logs/export?type=all'));
    assert.equal(res.status, 200);
    assert.deepEqual(calls.map((c) => c.url.replace(/^.*\/bot/, '/bot')),
        ['/bot/logs?offset=0&limit=100', '/bot/logs?offset=100&limit=100', '/bot/logs?offset=200&limit=100']);
    assert.equal(res.headers.get('X-Log-Export-Rows'), '250');
    assert.equal(res.headers.get('X-Log-Export-Total'), '250');
    assert.equal(res.headers.get('X-Log-Export-Truncated'), '0');
    assert.match(res.headers.get('Content-Disposition'), /attachment; filename="logs-all-/);
    const text = await res.text();
    assert.ok(text.startsWith('\uFEFF"id"'));
    assert.equal(text.trimEnd().split('\r\n').length, 251);
    assert.match(text, /"'=cmd\(\)"/);
});

test('export refuses anonymous callers and reports a bounded shortfall', async () => {
    const calls = stubFetch([]);
    const denied = await exportRoute.GET(request('/api/logs/export?type=all', null));
    assert.equal(denied.status, 401);
    assert.equal(calls.length, 0);

    stubFetch([pageResponse([row(1)], 5001)]);
    const res = await exportRoute.GET(request('/api/logs/export?type=logins'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('X-Log-Export-Rows'), '1');
    assert.equal(res.headers.get('X-Log-Export-Truncated'), '1');
});
