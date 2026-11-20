// dashboard/page.js — server gate, then the preserved client status view.
// The session is validated from the request cookie before any markup is rendered;
// a client redirect is never the access control (FIX-031).
import { requirePageSession } from '../lib/server';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
    await requirePageSession();
    return <DashboardClient />;
}
