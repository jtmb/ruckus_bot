// Server-only helpers shared by the dashboard's route handlers and protected pages.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const COOKIE = 'ruckus_session';
export const apiBase = () => process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

export const tokenOf = (request) => request.cookies.get(COOKIE)?.value || null;

// Calls the API, forwarding the caller's session as a bearer token.
export async function callApi(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(`${apiBase()}${path}`, {
        method,
        cache: 'no-store',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { message: text }; }
    return { ok: res.ok, status: res.status, json };
}

// Rejects cross-site state-changing requests: Origin, when present, must match the Host.
export function sameOrigin(request) {
    const origin = request.headers.get('origin');
    if (!origin) return true;
    try { return new URL(origin).host === request.headers.get('host'); } catch { return false; }
}

export const forbidden = () => NextResponse.json({ error: 'Cross-origin request refused' }, { status: 403 });

export function setSession(response, request, token) {
    const secure = request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:';
    response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure, path: '/', maxAge: 60 * 60 * 12 });
}
export const clearSession = (response) => response.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });

// Validates the request's session cookie against the API before any protected view renders.
// Input: current request cookies (read through next/headers). Output: { ok, token, user } on
// success or { ok:false, reason:'anonymous'|'invalid'|'outage' } otherwise. Side effects: none
// (no cookie is cleared here); a network/5xx failure is reported as an outage, never as bad auth.
export async function readRequestSession() {
    const store = await cookies();
    const token = store.get(COOKIE)?.value || null;
    if (!token) return { ok: false, reason: 'anonymous' };
    let result;
    try {
        result = await callApi('/auth/session', { token });
    } catch {
        return { ok: false, reason: 'outage' };
    }
    if (result.status === 401) return { ok: false, reason: 'invalid' };
    if (!result.ok) return { ok: false, reason: 'outage' };
    return { ok: true, token, user: result.json?.user || null };
}

// Redirect boundary for protected server page components: fail closed before rendering.
// Invalid/absent sessions go to login; an upstream outage goes to login with a distinct
// notice and is not mislabelled as an authentication failure.
export async function requirePageSession() {
    const session = await readRequestSession();
    if (!session.ok) redirect(session.reason === 'outage' ? '/?upstream=1' : '/');
    return session;
}
