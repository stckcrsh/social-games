import { useAuth } from '../auth/AuthContext';
import type { ReactNode } from 'react';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <div style={{ padding: '2rem' }}>
        <h2>403 — Admin access required</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
