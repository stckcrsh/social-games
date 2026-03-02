import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorMessage } from '../components/ErrorMessage';
import { RawResponse } from '../components/RawResponse';

export function AccountPage() {
  const { user, clearAuth } = useAuth();
  const navigate = useNavigate();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function handleChangePw(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authApi.changePassword({ currentPassword: currentPw, newPassword: newPw });
      setResponse({ status: 'password changed' });
      setCurrentPw('');
      setNewPw('');
    } catch (err) {
      setError(err);
      if (err instanceof ApiError) setResponse(err.body);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try { await authApi.logout(); } catch { /* ignore */ }
    clearAuth();
    navigate('/login');
  }

  return (
    <div className="page">
      <h1>Account</h1>
      <p>Logged in as: <strong>{user?.username}</strong></p>
      <p>Roles: {user?.roles.join(', ')}</p>
      <button onClick={handleLogout} style={{ marginBottom: '2rem' }}>Logout</button>

      <h2>Change Password</h2>
      <form onSubmit={handleChangePw} className="form">
        <label>
          Current Password
          <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required />
        </label>
        <label>
          New Password
          <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Changing...' : 'Change Password'}</button>
      </form>
      <ErrorMessage error={error} />
      <RawResponse data={response} />
    </div>
  );
}
