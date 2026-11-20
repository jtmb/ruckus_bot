// Server-only upstream fetch for the log explorer. Reuses the dashboard's
// existing session cookie helper and bearer forwarding; requires a token from
// the caller and never falls back to an unauthenticated request. A dedicated
// fetch is used because lib/server's callApi discards X-Total-Count.
import { apiBase } from '../../lib/server';
import { readTotal } from '../../logs/logic.mjs';

// Fetches one page from the API. Returns { ok, status, json, total }.
// Network/timeout failures are thrown so callers can answer 502.
export async function fetchLogPage(path, token) {
    const res = await fetch(`${apiBase()}${path}`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty or non-JSON body */ }
    return { ok: res.ok, status: res.status, json, total: readTotal(res.headers) };
}
