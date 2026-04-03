import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext.js';
import { RequireAuth } from '../components/RequireAuth.js';

function TokenDisplay() {
  const { token, username } = useAuth();
  return <div data-testid="info">{token ?? 'no-token'}|{username ?? 'no-user'}</div>;
}

function wrap(ui: React.ReactElement, initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('RequireAuth', () => {
  it('redirects to /login when no token stored', () => {
    wrap(
      <Routes>
        <Route path="/" element={<RequireAuth><p>protected</p></RequireAuth>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    );
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
  });

  it('renders children when token is in localStorage', () => {
    // Store a minimal valid-looking JWT (header.payload.sig — not verified in browser)
    const payload = btoa(JSON.stringify({ playerId: 'p-1', username: 'alice', isAdmin: false }));
    localStorage.setItem('token', `header.${payload}.sig`);

    wrap(
      <Routes>
        <Route path="/" element={<RequireAuth><p>protected</p></RequireAuth>} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    );
    expect(screen.getByText('protected')).toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });
});

describe('useAuth', () => {
  it('exposes username decoded from stored JWT', () => {
    const payload = btoa(JSON.stringify({ playerId: 'p-1', username: 'alice', isAdmin: false }));
    localStorage.setItem('token', `header.${payload}.sig`);

    wrap(<TokenDisplay />);
    expect(screen.getByTestId('info').textContent).toContain('alice');
  });
});
