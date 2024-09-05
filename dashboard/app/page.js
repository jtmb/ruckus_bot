"use client";

import { useState } from 'react';
import Link from 'next/link';
import './styles/Login.css'; // Ensure you have this CSS file for styling

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(""); // For displaying authentication errors

    const handleLogin = async (event) => {
        event.preventDefault();
        try {
            const response = await fetch('/api/login', { // Endpoint to authenticate user
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Authentication failed');
            }

            const result = await response.json();
            console.log('Login successful:', result);
            localStorage.setItem('authenticated', 'true'); // Save authentication status
            // Redirect or handle successful login
            window.location.href = '/dashboard'; // Redirect to the dashboard
        } catch (error) {
            console.error('Error logging in:', error);
            setError(error.message);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h1 className="login-title">Login</h1>
                {error && <p className="error-message">{error}</p>} {/* Display error messages */}
                <form onSubmit={handleLogin} className="login-form">
                    <div className="input-group">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="login-button">
                        Login
                    </button>
                </form>
                <p className="text-center create-account-text">
                    Need to create an account?{' '}
                    <Link href="/createAccount" className="text-link">
                        Create Account
                    </Link>
                </p>
            </div>
        </div>
    );
}
