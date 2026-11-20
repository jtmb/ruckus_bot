// Client helpers for the restart action. Both call dashboard route handlers, never the API directly.

// Queues a restart. Input: none. Output: { success, message, jobId, state, conflict }.
// Side effects: one POST; network/parse failures return a readable object instead of throwing.
export async function restartBot() {
    try {
        const response = await fetch('/api/restart-bot', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                success: false,
                message: body.message || 'Failed to restart bot. Please try again.',
                conflict: Boolean(body.conflict),
            };
        }
        return {
            success: true,
            message: body.message || 'Restart queued...',
            jobId: body.jobId,
            state: body.state || 'queued',
        };
    } catch (error) {
        console.error('Error restarting bot:', error);
        return { success: false, message: 'An error occurred. Please try again.' };
    }
}

// Reads one restart job's state. Input: jobId. Output: { success, state, detail, message }.
// Side effects: one bounded GET; failures return a readable object instead of throwing.
export async function restartBotStatus(jobId) {
    try {
        const response = await fetch(`/api/restart-bot?jobId=${encodeURIComponent(jobId)}`, {
            headers: { 'Content-Type': 'application/json' },
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return { success: false, message: body.message || 'Could not read the restart state.' };
        return {
            success: true,
            state: body.state,
            detail: body.detail,
            startedAt: body.startedAt,
            finishedAt: body.finishedAt,
        };
    } catch (error) {
        console.error('Error reading restart state:', error);
        return { success: false, message: 'An error occurred. Please try again.' };
    }
}
