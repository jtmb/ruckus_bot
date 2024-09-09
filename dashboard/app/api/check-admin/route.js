import { NextResponse } from 'next/server';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET() {
    const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

    try {
        // Initialize the database before checking for admin
        const initializeResponse = await fetch(`${apiEndpoint}/initialize-db`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!initializeResponse.ok) {
            throw new Error('Failed to initialize database');
        }

        const initializeResult = await initializeResponse.json();
        console.log('Database initialization result:', initializeResult);

        // Fetch users after database initialization
        const usersResponse = await fetch(`${apiEndpoint}/users`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!usersResponse.ok) {
            throw new Error('Failed to fetch users');
        }

        const users = await usersResponse.json();
        const adminExists = users.some(user => user.role === 'admin'); // Check if any user has role 'admin'

        return NextResponse.json({ adminExists });
    } catch (error) {
        console.error('Error checking admin existence:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
