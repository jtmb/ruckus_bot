import { NextResponse } from 'next/server';
import { callApi, tokenOf } from '../../lib/server';

// Live data: must never be prerendered or cached at build time.
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const token = tokenOf(request);
    if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    try {
        const r = await callApi('/bot/status', { token });
        if (r.status === 401) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return NextResponse.json(r.json, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('Error fetching bot status:', error.message);
        return NextResponse.json({ error: 'API unavailable' }, { status: 502 });
    }
}
