import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi, ApiError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { RawResponse } from '../components/RawResponse';

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await authApi.register({
        username,
        password,
        ...(displayName ? { displayName } : {}),
      });
      setResponse(data);
      navigate('/login');
    } catch (err) {
      setError(err);
      if (err instanceof ApiError) setResponse(err.body);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1>Register</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Username
          <input value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        <label>
          Display Name (optional)
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Registering...' : 'Register'}</button>
      </form>
      <p><Link to="/login">Already have an account? Login</Link></p>
      <ErrorMessage error={error} />
      <RawResponse data={response} />
    </div>
  );
}
