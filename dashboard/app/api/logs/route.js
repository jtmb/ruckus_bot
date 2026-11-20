import { NextResponse } from 'next/server';
import { tokenOf } from '../../lib/server';
import { normalizeParams, upstreamPath } from '../../logs/logic.mjs';
import { fetchLogPage } from './upstream.mjs';

export const dynamic = 'force-dynamic';

// GET /api/logs?type=all|logins|interactions&offset=N&limit=N
// Requires the existing dashboard session cookie; forwards it as a bearer token.
// Returns { type, offset, limit, total, rows } with total from X-Total-Count.
export async function GET(request) {
    const token = tokenOf(request);
    if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const parsed = normalizeParams(new URL(request.url).searchParams);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { type, offset, limit } = parsed.value;
    let page;
    try {
        page = await fetchLogPage(upstreamPath({ type, offset, limit }), token);
    } catch {
        return NextResponse.json({ error: 'API unavailable' }, { status: 502 });
    }
    if (!page.ok) {
        return NextResponse.json(page.json || { error: 'Log request failed' }, { status: page.status });
    }

    const rows = Array.isArray(page.json) ? page.json : [];
    return NextResponse.json({ type, offset, limit, total: page.total, rows });
}
