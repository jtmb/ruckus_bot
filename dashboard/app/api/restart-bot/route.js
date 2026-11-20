// app/api/restart-bot/route.js — thin server handlers for the restart job flow.
// The browser never talks to the API directly; each handler forwards the caller's session.
import { NextResponse } from 'next/server';
import { callApi, sameOrigin, forbidden, tokenOf } from '../../lib/server';

export const dynamic = 'force-dynamic';

const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Queues a restart and returns the job id for bounded client-side tracking (REG-011).
// Input: same-origin request with session cookie. Output: { success, message, jobId } or readable error.
// Side effects: one upstream POST; no process-manager call happens in the dashboard.
export async function POST(request) {
    if (!sameOrigin(request)) return forbidden();
    const token = tokenOf(request);
    if (!token) return NextResponse.json({ success: false, message: 'Please sign in again.' }, { status: 401 });
    try {
        const r = await callApi('/bot/restart', { method: 'POST', token });
        if (r.status === 401) return NextResponse.json({ success: false, message: 'Please sign in again.' }, { status: 401 });
        if (r.status === 403) return NextResponse.json({ success: false, message: 'Only administrators can restart the bot.' }, { status: 403 });
        if (r.status === 409) return NextResponse.json({ success: false, conflict: true, message: 'A restart is already in progress.' }, { status: 409 });
        if (!r.ok) return NextResponse.json({ success: false, message: 'Failed to queue a restart. Please try again.' }, { status: 502 });
        const jobId = r.json?.jobId;
        if (!JOB_ID.test(String(jobId))) {
            return NextResponse.json({ success: false, message: 'The restart response was invalid. Please try again.' }, { status: 502 });
        }
        return NextResponse.json({ success: true, message: 'Restart queued...', jobId, state: r.json.state || 'queued' }, { status: 202 });
    } catch (error) {
        console.error('Error restarting bot:', error.message);
        return NextResponse.json({ success: false, message: 'An error occurred. Please try again.' });
    }
}

// Reads one job's bounded state so the client can show definite pending/success/failure.
// Input: same-origin request, session cookie and a bounded jobId query parameter.
// Output: { success, state, detail, ... } or a readable error. Side effects: one upstream GET.
export async function GET(request) {
    if (!sameOrigin(request)) return forbidden();
    const token = tokenOf(request);
    if (!token) return NextResponse.json({ success: false, message: 'Please sign in again.' }, { status: 401 });
    const jobId = new URL(request.url).searchParams.get('jobId');
    if (!jobId || !JOB_ID.test(jobId)) {
        return NextResponse.json({ success: false, message: 'Invalid restart job id.' }, { status: 400 });
    }
    try {
        const r = await callApi(`/bot/restart/${encodeURIComponent(jobId)}`, { token });
        if (r.status === 401) return NextResponse.json({ success: false, message: 'Please sign in again.' }, { status: 401 });
        if (r.status === 403) return NextResponse.json({ success: false, message: 'Only administrators can restart the bot.' }, { status: 403 });
        if (r.status === 404) return NextResponse.json({ success: false, message: 'Restart job not found.' }, { status: 404 });
        if (!r.ok) return NextResponse.json({ success: false, message: 'Could not read the restart state. Please try again.' }, { status: 502 });
        return NextResponse.json({
            success: true,
            state: r.json?.state,
            detail: r.json?.detail,
            startedAt: r.json?.startedAt,
            finishedAt: r.json?.finishedAt,
        });
    } catch (error) {
        console.error('Error reading restart state:', error.message);
        return NextResponse.json({ success: false, message: 'An error occurred. Please try again.' });
    }
}
