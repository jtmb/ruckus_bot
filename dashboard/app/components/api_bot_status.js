// Client helper: polls the dashboard's own status route.
export async function fetchBotStatus() {
    const response = await fetch('/api/bot-status', { cache: 'no-store' });
    if (response.status === 401) throw Object.assign(new Error('unauthenticated'), { code: 401 });
    if (!response.ok) throw new Error('Status unavailable');
    return response.json();
}
