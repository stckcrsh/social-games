import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';

export function LoginView() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { token } = await api.login(username, password);
      login(token);
      navigate('/');
    } catch (e) {
      setError(e instanceof ApiError ? e.serverMessage : (e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '320px', margin: '4rem auto' }}>
      <h2>Wrastlin Login</h2>
      <form onSubmit={submit}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="username">Username</label>
          <br />
          <input
            id="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            required
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{ width: '100%' }}
          />
        </div>
        <button type="submit" disabled={submitting} style={{ padding: '0.5rem 1.5rem' }}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
        {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
      </form>
    </div>
  );
}
