// Dependency-free coverage for the server-side page gate and the hardened
// check-admin / initialize-db proxies. No Next install, API, DB, network or
// credentials: next/* modules and fetch are replaced with local fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const stubs = {
  'next/server': `
    export class NextResponse {
      constructor(body, init = {}) {
        this.body = body; this.status = init.status ?? 200;
        this.headers = new Headers(init.headers || {});
      }
      static json(data, init = {}) {
        return new NextResponse(JSON.stringify(data), {
          ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) },
        });
      }
      async json() { return JSON.parse(this.body); }
      async text() { return String(this.body); }
    }
    export default NextResponse;
  `,
  'next/headers': `
    export async function cookies() {
      return { get: (name) => (name === 'ruckus_session' && globalThis.__cookieValue
        ? { value: globalThis.__cookieValue } : undefined) };
    }
  `,
  'next/navigation': `
    export class RedirectSignal extends Error {
      constructor(url) { super('redirect ' + url); this.name = 'RedirectSignal'; this.url = url; }
    }
    export function redirect(url) { throw new RedirectSignal(url); }
  `,
};
const urls = Object.fromEntries(
  Object.entries(stubs).map(([spec, src]) => [spec, `data:text/javascript,${encodeURIComponent(src)}`])
);
const loaderSource = `
const urls = ${JSON.stringify(urls)};
export async function resolve(specifier, context, nextResolve) {
  if (urls[specifier]) return { url: urls[specifier], shortCircuit: true };
  if (specifier.startsWith('.') && !/\\.[a-z0-9]+$/i.test(specifier)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const { readRequestSession, requirePageSession } = await import('../app/lib/server.js');
const initRoute = await import('../app/api/initialize-db/route.js');
const checkAdminRoute = await import('../app/api/check-admin/route.js');

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; globalThis.__cookieValue = null; });

// Records calls and replays bounded local responses; an Error instance is thrown.
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
const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const setCookie = (value) => { globalThis.__cookieValue = value; };

test('readRequestSession reports anonymous callers without contacting the API', async () => {
  setCookie(null);
  const calls = stubFetch([]);
  assert.deepEqual(await readRequestSession(), { ok: false, reason: 'anonymous' });
  assert.equal(calls.length, 0);
});

test('readRequestSession separates invalid auth from an upstream outage', async () => {
  setCookie('good-token');
  stubFetch([jsonResponse({ error: 'Authentication required' }, 401)]);
  assert.deepEqual(await readRequestSession(), { ok: false, reason: 'invalid' });

  stubFetch([jsonResponse({ error: 'db down' }, 503)]);
  assert.deepEqual(await readRequestSession(), { ok: false, reason: 'outage' });

  stubFetch([new Error('network down')]);
  assert.deepEqual(await readRequestSession(), { ok: false, reason: 'outage' });
});

test('readRequestSession returns the user for a valid session', async () => {
  setCookie('good-token');
  stubFetch([jsonResponse({ authenticated: true, user: { id: 1, role: 'admin' } })]);
  const session = await readRequestSession();
  assert.equal(session.ok, true);
  assert.equal(session.token, 'good-token');
  assert.deepEqual(session.user, { id: 1, role: 'admin' });
});

test('requirePageSession fails closed and marks the outage redirect distinctly', async () => {
  setCookie(null);
  stubFetch([]);
  // Async function: the redirect is a rejected promise, not a synchronous throw.
  await assert.rejects(requirePageSession(), (e) => e.name === 'RedirectSignal' && e.url === '/');

  setCookie('stale');
  stubFetch([jsonResponse({ error: 'Authentication required' }, 401)]);
  await assert.rejects(requirePageSession(), (e) => e.url === '/');

  stubFetch([new Error('network down')]);
  await assert.rejects(requirePageSession(), (e) => e.url === '/?upstream=1');

  setCookie('good-token');
  stubFetch([jsonResponse({ authenticated: true, user: { id: 2, role: 'operator' } })]);
  assert.equal((await requirePageSession()).ok, true);
});

// Minimal NextRequest-shaped object with only the headers/cookies used by these routes.
function request(token = null, origin = null) {
  return {
    cookies: { get: (name) => (name === 'ruckus_session' && token ? { value: token } : undefined) },
    headers: { get: (name) => (name === 'origin' ? origin : name === 'host' ? 'dashboard.local' : null) },
  };
}

test('initialize-db proxy refuses anonymous and cross-origin callers before fetch', async () => {
  const calls = stubFetch([]);
  const anon = await initRoute.POST(request(null));
  assert.equal(anon.status, 401);
  assert.equal(calls.length, 0);

  const cross = await initRoute.POST(request('token', 'https://evil.example'));
  assert.equal(cross.status, 403);
  assert.equal(calls.length, 0);
});

test('initialize-db proxy forwards the session so the API can enforce admin', async () => {
  const calls = stubFetch([jsonResponse({ message: 'ok' })]);
  const res = await initRoute.POST(request('admin-token'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { message: 'ok' });
  assert.match(calls[0].url, /\/initialize-db$/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer admin-token');

  stubFetch([jsonResponse({ error: 'Administrator role required' }, 403)]);
  const denied = await initRoute.POST(request('viewer-token'));
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: 'Administrator role required' });
});

test('check-admin no longer performs an anonymous migration call', async () => {
  const calls = stubFetch([jsonResponse({ adminExists: false })]);
  const res = await checkAdminRoute.GET();
  assert.deepEqual(await res.json(), { adminExists: false });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/bootstrap$/);
});

test('protected pages are dynamic server components that gate before rendering', () => {
  for (const [page, client] of [
    ['../app/dashboard/page.js', 'DashboardClient'],
    ['../app/users/page.js', 'UsersClient'],
    ['../app/logs/page.js', 'LogsClient'],
  ]) {
    const source = readFileSync(fileURLToPath(new URL(page, import.meta.url)), 'utf8');
    assert.doesNotMatch(source, /["']use client["']/);
    assert.match(source, /force-dynamic/);
    assert.match(source, /await requirePageSession\(\)/);
    assert.match(source, new RegExp(`return <${client} />`));
  }
  // The login view must not trigger a database initialisation on mount.
  const login = readFileSync(fileURLToPath(new URL('../app/page.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(login, /initialize-db/);
});
