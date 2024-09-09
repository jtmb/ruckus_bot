// api/check-admin/route.js

import { NextResponse } from 'next/server';

export async function GET() {
    const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

    try {
        const response = await fetch(`${apiEndpoint}/users`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }

        const users = await response.json();
        const adminExists = users.some(user => user.role === 'admin'); // Check if any user has role 'admin'

        return NextResponse.json({ adminExists });
    } catch (error) {
        console.error('Error checking admin existence:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
