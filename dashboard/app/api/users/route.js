import { NextResponse } from 'next/server';
import { callApi, sameOrigin, forbidden, tokenOf } from '../../lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const token = tokenOf(request);
    if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const r = await callApi('/users', { token }).catch(() => null);
    if (!r) return NextResponse.json({ error: 'API unavailable' }, { status: 502 });
    return NextResponse.json(r.json, { status: r.status });
}

export async function DELETE(request) {
    if (!sameOrigin(request)) return forbidden();
    const token = tokenOf(request);
    const username = request.nextUrl.searchParams.get('username') || '';
    if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const r = await callApi(`/users/${encodeURIComponent(username)}`, { method: 'DELETE', token }).catch(() => null);
    if (!r) return NextResponse.json({ error: 'API unavailable' }, { status: 502 });
    return NextResponse.json(r.json, { status: r.status });
}
