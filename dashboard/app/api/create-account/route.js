// api/create-account/route.js
// First run: creates the initial admin. Afterwards only a signed-in admin may create accounts (role "user").
import { NextResponse } from 'next/server';
import { callApi, sameOrigin, forbidden, tokenOf } from '../../lib/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
    if (!sameOrigin(request)) return forbidden();
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
    const { username, password } = body;
    try {
        const status = await callApi('/auth/bootstrap');
        if (!status.ok) throw new Error('Error checking administrators');
        if (!status.json.adminExists) {
            const r = await callApi('/auth/bootstrap', { method: 'POST', body: { username, password } });
            return NextResponse.json(r.ok ? r.json : { error: r.json?.error || 'Error creating user' }, { status: r.ok ? 201 : r.status });
        }
        const token = tokenOf(request);
        if (!token) return NextResponse.json({ error: 'An Admin account already exists' }, { status: 400 });
        const role = body.role === 'admin' ? 'admin' : 'user';
        const r = await callApi('/users', { method: 'POST', token, body: { username, password, role } });
        return NextResponse.json(r.ok ? r.json : { error: r.json?.error || 'Error creating user' }, { status: r.ok ? 201 : r.status });
    } catch (error) {
        console.error('Error creating user:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
