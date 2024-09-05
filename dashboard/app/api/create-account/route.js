// api/create-account/route.js
import { NextResponse } from 'next/server';

export async function POST(request) {
    const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || 'http://host.docker.internal:3003';
    const { username, password } = await request.json();

    const role = 'admin'; // Force the role to 'admin'

    try {
        // Step 1: Fetch all users from the backend
        const usersResponse = await fetch(`${apiEndpoint}/users`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!usersResponse.ok) {
            throw new Error('Error fetching users');
        }

        const users = await usersResponse.json();
        console.log('Fetched users:', users);

        // Step 2: Check if any user has the role 'admin'
        const adminExists = users.some(user => user.role === 'admin');
        console.log('Admin exists:', adminExists);

        // Step 3: If an admin exists and the user trying to be created is also an admin, deny the request
        if (adminExists) {
            console.log('Denying account creation. Admin already exists and trying to create another admin.');
            return NextResponse.json({ error: 'Admin account already exists' }, { status: 400 });
        }

        // Step 4: Proceed to create the user if no admin exists
        const userResponse = await fetch(`${apiEndpoint}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });

        if (!userResponse.ok) {
            throw new Error('Error creating user');
        }

        const result = await userResponse.json();
        console.log('User created:', result);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
