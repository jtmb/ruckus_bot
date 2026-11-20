// app/api/initialize-db/route.js
// Legacy idempotent migration trigger. No longer anonymous: the caller's session is
// required and forwarded, and the API enforces the admin role (REG-013 compatibility).
import { NextResponse } from 'next/server';
import { callApi, sameOrigin, forbidden, tokenOf } from '../../lib/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    if (!sameOrigin(request)) return forbidden();
    const token = tokenOf(request);
    if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    try {
        const r = await callApi('/initialize-db', { method: 'POST', token });
        if (!r.ok) return NextResponse.json({ error: r.json?.error || 'Failed to initialize database' }, { status: r.status });
        return NextResponse.json(r.json);
    } catch (error) {
        console.error('Error initializing database:', error.message);
        return NextResponse.json({ error: error.message }, { status: 502 });
    }
}
