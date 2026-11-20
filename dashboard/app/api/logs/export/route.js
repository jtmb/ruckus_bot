import { NextResponse } from 'next/server';
import { tokenOf } from '../../../lib/server';
import { normalizeType, upstreamPath, exportPlan, toCsv, MAX_LIMIT, MAX_EXPORT_ROWS } from '../../../logs/logic.mjs';
import { fetchLogPage } from '../upstream.mjs';

export const dynamic = 'force-dynamic';

// GET /api/logs/export?type=all|logins|interactions
// Exports the full active type filter, newest first, bounded to MAX_EXPORT_ROWS
// rows. Walk pages with the caller's session; never an anonymous upstream call.
export async function GET(request) {
    const token = tokenOf(request);
    if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const rawType = new URL(request.url).searchParams.get('type') || 'all';
    const type = normalizeType(rawType);
    if (!type) return NextResponse.json({ error: 'Unknown log type' }, { status: 400 });

    let page;
    try {
        page = await fetchLogPage(upstreamPath({ type, offset: 0, limit: MAX_LIMIT }), token);
    } catch {
        return NextResponse.json({ error: 'API unavailable' }, { status: 502 });
    }
    if (!page.ok) {
        return NextResponse.json(page.json || { error: 'Log request failed' }, { status: page.status });
    }

    const total = page.total;
    const plan = exportPlan(total, MAX_LIMIT, MAX_EXPORT_ROWS);
    const rows = [];
    let offset = 0;
    while (true) {
        const batch = Array.isArray(page.json) ? page.json : [];
        rows.push(...batch);
        // Stop at the row bound, on a short page, or at the declared total.
        const fullPage = batch.length === plan.pageSize;
        if (rows.length >= MAX_EXPORT_ROWS || !fullPage) break;
        offset += plan.pageSize;
        if (plan.expected > 0 && offset >= plan.expected) break;
        try {
            page = await fetchLogPage(upstreamPath({ type, offset, limit: plan.pageSize }), token);
        } catch {
            return NextResponse.json({ error: 'API unavailable' }, { status: 502 });
        }
        if (!page.ok) {
            return NextResponse.json(page.json || { error: 'Log request failed' }, { status: page.status });
        }
    }

    const exported = rows.slice(0, MAX_EXPORT_ROWS);
    // BOM keeps UTF-8 event data readable in spreadsheet applications.
    const csv = `\uFEFF${toCsv(exported)}`;
    // With a total header we can report a genuine shortfall; without one, a
    // completely full bounded export is reported conservatively as truncated.
    const truncated = total > 0
        ? total > exported.length
        : exported.length >= MAX_EXPORT_ROWS;
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="logs-${type}-${stamp}.csv"`,
            'Cache-Control': 'no-store',
            'X-Log-Export-Rows': String(exported.length),
            'X-Log-Export-Total': String(total),
            'X-Log-Export-Truncated': truncated ? '1' : '0',
        },
    });
}
