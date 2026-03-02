import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { authApi } from '../api/client';

export function Header() {
  const { user, token, clearAuth } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try { await authApi.logout(); } catch { /* ignore */ }
    clearAuth();
    navigate('/login');
  }

  return (
    <header className="header">
      <nav className="nav">
        <Link to="/content/items">Items</Link>
        <Link to="/shop">Shop</Link>
        {token && <Link to="/inventory">Inventory</Link>}
        {token && <Link to="/trades">Trades</Link>}
        {token && <Link to="/account">Account</Link>}
        {token && <Link to="/admin">Admin</Link>}
      </nav>
      <div className="user-info">
        {user ? (
          <>
            <span>{user.username}</span>
            {user.roles.includes('admin') && <span className="badge admin">admin</span>}
            <button onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </header>
  );
}
