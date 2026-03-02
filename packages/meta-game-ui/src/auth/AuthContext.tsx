import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { JwtPayload } from '../types/api';

interface AuthState {
  token: string | null;
  user: JwtPayload | null;
  isAdmin: boolean;
}

interface AuthContextValue extends AuthState {
  setAuth: (token: string) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload)) as JwtPayload;
  } catch {
    return null;
  }
}

function loadStoredAuth(): AuthState {
  const token = localStorage.getItem('token');
  if (!token) return { token: null, user: null, isAdmin: false };
  const user = decodeJwt(token);
  if (!user) return { token: null, user: null, isAdmin: false };
  return { token, user, isAdmin: user.roles.includes('admin') };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuthState] = useState<AuthState>(loadStoredAuth);

  const setAuth = useCallback((token: string) => {
    localStorage.setItem('token', token);
    const user = decodeJwt(token);
    setAuthState({ token, user, isAdmin: user?.roles.includes('admin') ?? false });
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('token');
    setAuthState({ token: null, user: null, isAdmin: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...auth, setAuth, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
