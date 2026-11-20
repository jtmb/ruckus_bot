// app/api/login/route.js
import { NextResponse } from 'next/server';
import { callApi, sameOrigin, forbidden, setSession } from '../../lib/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    if (!sameOrigin(request)) return forbidden();
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
    try {
        const r = await callApi('/auth/login', { method: 'POST', body: { username: body.username, password: body.password } });
        if (!r.ok) return NextResponse.json({ error: r.json?.error || 'Authentication failed' }, { status: r.status === 429 ? 429 : 401 });
        const response = NextResponse.json({ message: 'Authentication successful', user: r.json.user });
        setSession(response, request, r.json.token);
        return response;
    } catch (error) {
        console.error('Error during authentication:', error.message);
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }
}
