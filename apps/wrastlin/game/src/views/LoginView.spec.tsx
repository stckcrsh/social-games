import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext.js';
import { LoginView } from './LoginView.js';
import { api } from '../api/client.js';

vi.mock('../api/client.js', () => ({
  api: {
    login: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public serverMessage: string, public status: number) {
      super(serverMessage);
    }
  },
}));

function wrap(initialEntries = ['/login']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

it('stores token and redirects home on successful login', async () => {
  const payload = btoa(JSON.stringify({ playerId: 'p-1', username: 'alice', isAdmin: false }));
  (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ token: `h.${payload}.s` });

  wrap();
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: /log in/i }));

  await waitFor(() => expect(screen.getByText('home')).toBeInTheDocument());
  expect(localStorage.getItem('token')).toBe(`h.${payload}.s`);
});

it('shows error message on failed login', async () => {
  const { ApiError } = await import('../api/client.js');
  (api.login as ReturnType<typeof vi.fn>).mockRejectedValue(
    new ApiError('invalid credentials', 401)
  );

  wrap();
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'alice' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: /log in/i }));

  await waitFor(() => expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument());
  expect(localStorage.getItem('token')).toBeNull();
});
