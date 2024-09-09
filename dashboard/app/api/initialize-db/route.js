// app/api/initialize-db/route.js
import { NextResponse } from 'next/server';

export async function POST() {
    const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

    try {
        // Call the backend to initialize the database
        const initializeResponse = await fetch(`${apiEndpoint}/initialize-db`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!initializeResponse.ok) {
            throw new Error('Failed to initialize database');
        }

        const initializeResult = await initializeResponse.json();
        console.log('Database initialization result:', initializeResult);

        return NextResponse.json(initializeResult);
    } catch (error) {
        console.error('Error initializing database:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
