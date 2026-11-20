// api/check-admin/route.js
// Reports first-run state only. Migrations run at API startup; checking whether an
// admin exists must not perform an anonymous database-initialisation call.
import { NextResponse } from 'next/server';
import { callApi } from '../../lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const r = await callApi('/auth/bootstrap');
        if (!r.ok) throw new Error('Failed to check administrators');
        return NextResponse.json({ adminExists: Boolean(r.json.adminExists) });
    } catch (error) {
        console.error('Error checking admin existence:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
