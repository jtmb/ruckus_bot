import { NextResponse } from 'next/server';
import { callApi, tokenOf, clearSession } from '../../lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const token = tokenOf(request);
    if (!token) return NextResponse.json({ authenticated: false }, { status: 401 });
    try {
        const r = await callApi('/auth/session', { token });
        if (!r.ok) { const res = NextResponse.json({ authenticated: false }, { status: 401 }); clearSession(res); return res; }
        return NextResponse.json({ authenticated: true, user: r.json.user });
    } catch {
        return NextResponse.json({ error: 'API unavailable' }, { status: 502 });
    }
}
