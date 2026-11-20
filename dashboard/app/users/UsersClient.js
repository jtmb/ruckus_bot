"use client";

// Client view for user management. Kept intact from the original page so the
// admin-only list, create and delete actions and their messages are unchanged.
import { useEffect, useState, useCallback } from 'react';
import useAuthRedirect from '../components/useAuthRedirect';
import './../styles/App.css';

export default function UsersClient() {
  // Secondary session check only; the server page component is the access control.
  const me = useAuthRedirect();
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ username: '', password: '', role: 'user' });

  const load = useCallback(async () => {
    const res = await fetch('/api/users', { cache: 'no-store' });
    if (res.status === 403) { setMessage('Only administrators can manage users.'); return; }
    if (res.ok) setUsers(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/create-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const body = await res.json();
    setMessage(res.ok ? `Created ${form.username}` : body.error || 'Failed');
    if (res.ok) { setForm({ username: '', password: '', role: 'user' }); load(); }
  };

  const remove = async (username) => {
    if (!confirm(`Delete ${username}?`)) return;
    const res = await fetch(`/api/users?username=${encodeURIComponent(username)}`, { method: 'DELETE' });
    const body = await res.json();
    setMessage(res.ok ? `Deleted ${username}` : body.error || 'Failed');
    load();
  };

  return (
    <div className="App">
      <div className="container">
        <h1>User management</h1>
        {message && <div role="status" className="guild-name">{message}</div>}
        <table>
          <thead><tr><th>User</th><th>Role</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td><td>{u.role}</td>
                <td>{me && me.username !== u.username && <button onClick={() => remove(u.username)}>Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={create}>
          <label>Username <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required minLength={3} /></label>
          <label>Password <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></label>
          <label>Role <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="user">user</option><option value="admin">admin</option></select></label>
          <button type="submit">Add user</button>
        </form>
      </div>
    </div>
  );
}
