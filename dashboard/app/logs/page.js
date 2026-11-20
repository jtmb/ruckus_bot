// logs/page.js — server gate, then the preserved client log-explorer view.
// Filters, paging, retry and CSV export live unchanged in ./LogsClient.js.
import { requirePageSession } from '../lib/server';
import LogsClient from './LogsClient';

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
    await requirePageSession();
    return <LogsClient />;
}
