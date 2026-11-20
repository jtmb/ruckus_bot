import { NextResponse } from 'next/server';
import { callApi, sameOrigin, forbidden, tokenOf, clearSession } from '../../lib/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    if (!sameOrigin(request)) return forbidden();
    const token = tokenOf(request);
    if (token) { try { await callApi('/auth/logout', { method: 'POST', token }); } catch { /* cookie is cleared regardless */ } }
    const response = NextResponse.json({ message: 'Logged out' });
    clearSession(response);
    return response;
}
