// app/api/login/route.js

import { NextResponse } from 'next/server';

export async function POST(request) {
    const { username, password } = await request.json();
    const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3003';

    try {
        const response = await fetch(`${apiEndpoint}/users/authenticate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            throw new Error('Authentication failed');
        }

        const result = await response.json();
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error during authentication:', error);
        return NextResponse.json({ error: error.message }, { status: 401 });
    }
}
