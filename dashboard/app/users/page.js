// users/page.js — server gate, then the preserved client user-management view.
import { requirePageSession } from '../lib/server';
import UsersClient from './UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
    await requirePageSession();
    return <UsersClient />;
}
