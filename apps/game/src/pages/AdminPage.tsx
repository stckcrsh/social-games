import { useState, type FormEvent, type ReactNode } from 'react';
import { authApi, inventoryApi, ApiError } from '../api/meta';
import { ErrorMessage } from '../components/ErrorMessage';
import { RawResponse } from '../components/RawResponse';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function AdminPage() {
  // Reset Password
  const [rpTarget, setRpTarget] = useState('');
  const [rpNewPw, setRpNewPw] = useState('');
  const [rpResult, setRpResult] = useState<unknown>(null);
  const [rpError, setRpError] = useState<unknown>(null);
  const [rpLoading, setRpLoading] = useState(false);

  // Grant
  const [grantPlayerId, setGrantPlayerId] = useState('');
  const [grantJson, setGrantJson] = useState('[\n  {"kind": "stack", "defId": "gold", "qty": 100}\n]');
  const [grantResult, setGrantResult] = useState<unknown>(null);
  const [grantError, setGrantError] = useState<unknown>(null);
  const [grantLoading, setGrantLoading] = useState(false);

  // Burn
  const [burnPlayerId, setBurnPlayerId] = useState('');
  const [burnJson, setBurnJson] = useState('[\n  {"kind": "stack", "defId": "gold", "qty": 10}\n]');
  const [burnResult, setBurnResult] = useState<unknown>(null);
  const [burnError, setBurnError] = useState<unknown>(null);
  const [burnLoading, setBurnLoading] = useState(false);

  // Transfer
  const [fromPlayerId, setFromPlayerId] = useState('');
  const [toPlayerId, setToPlayerId] = useState('');
  const [transferJson, setTransferJson] = useState('[\n  {"kind": "stack", "defId": "gold", "qty": 10}\n]');
  const [transferResult, setTransferResult] = useState<unknown>(null);
  const [transferError, setTransferError] = useState<unknown>(null);
  const [transferLoading, setTransferLoading] = useState(false);

  async function handleResetPw(e: FormEvent) {
    e.preventDefault();
    setRpError(null);
    setRpLoading(true);
    try {
      await authApi.adminResetPassword({ targetUsername: rpTarget, newPassword: rpNewPw });
      setRpResult({ status: 'password reset successfully' });
    } catch (err) {
      setRpError(err);
      if (err instanceof ApiError) setRpResult(err.body);
    } finally {
      setRpLoading(false);
    }
  }

  async function handleGrant(e: FormEvent) {
    e.preventDefault();
    setGrantError(null);
    setGrantLoading(true);
    try {
      const items = JSON.parse(grantJson) as unknown[];
      const result = await inventoryApi.grant({ playerId: grantPlayerId, items });
      setGrantResult(result);
    } catch (err) {
      setGrantError(err);
      if (err instanceof ApiError) setGrantResult(err.body);
    } finally {
      setGrantLoading(false);
    }
  }

  async function handleBurn(e: FormEvent) {
    e.preventDefault();
    setBurnError(null);
    setBurnLoading(true);
    try {
      const items = JSON.parse(burnJson) as unknown[];
      const result = await inventoryApi.burn({ playerId: burnPlayerId, items });
      setBurnResult(result);
    } catch (err) {
      setBurnError(err);
      if (err instanceof ApiError) setBurnResult(err.body);
    } finally {
      setBurnLoading(false);
    }
  }

  async function handleTransfer(e: FormEvent) {
    e.preventDefault();
    setTransferError(null);
    setTransferLoading(true);
    try {
      const items = JSON.parse(transferJson) as unknown[];
      const result = await inventoryApi.transfer({ fromPlayerId, toPlayerId, items });
      setTransferResult(result);
    } catch (err) {
      setTransferError(err);
      if (err instanceof ApiError) setTransferResult(err.body);
    } finally {
      setTransferLoading(false);
    }
  }

  return (
    <div className="page">
      <h1>Admin Panel</h1>

      <Section title="Reset Password">
        <form onSubmit={handleResetPw} className="form">
          <label>
            Target Username
            <input value={rpTarget} onChange={e => setRpTarget(e.target.value)} required />
          </label>
          <label>
            New Password
            <input type="password" value={rpNewPw} onChange={e => setRpNewPw(e.target.value)} required />
          </label>
          <button type="submit" disabled={rpLoading}>{rpLoading ? 'Resetting...' : 'Reset Password'}</button>
        </form>
        <ErrorMessage error={rpError} />
        <RawResponse data={rpResult} />
      </Section>

      <Section title="Grant Items">
        <form onSubmit={handleGrant} className="form">
          <label>
            Player ID (UUID)
            <input value={grantPlayerId} onChange={e => setGrantPlayerId(e.target.value)} required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </label>
          <label>
            Items (JSON array)
            <textarea value={grantJson} onChange={e => setGrantJson(e.target.value)} rows={5} required />
          </label>
          <button type="submit" disabled={grantLoading}>{grantLoading ? 'Granting...' : 'Grant'}</button>
        </form>
        <ErrorMessage error={grantError} />
        <RawResponse data={grantResult} />
      </Section>

      <Section title="Burn Items">
        <form onSubmit={handleBurn} className="form">
          <label>
            Player ID (UUID)
            <input value={burnPlayerId} onChange={e => setBurnPlayerId(e.target.value)} required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </label>
          <label>
            Items (JSON array)
            <textarea value={burnJson} onChange={e => setBurnJson(e.target.value)} rows={5} required />
          </label>
          <button type="submit" disabled={burnLoading}>{burnLoading ? 'Burning...' : 'Burn'}</button>
        </form>
        <ErrorMessage error={burnError} />
        <RawResponse data={burnResult} />
      </Section>

      <Section title="Transfer Items">
        <form onSubmit={handleTransfer} className="form">
          <label>
            From Player ID (UUID)
            <input value={fromPlayerId} onChange={e => setFromPlayerId(e.target.value)} required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </label>
          <label>
            To Player ID (UUID)
            <input value={toPlayerId} onChange={e => setToPlayerId(e.target.value)} required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </label>
          <label>
            Items (JSON array)
            <textarea value={transferJson} onChange={e => setTransferJson(e.target.value)} rows={5} required />
          </label>
          <button type="submit" disabled={transferLoading}>{transferLoading ? 'Transferring...' : 'Transfer'}</button>
        </form>
        <ErrorMessage error={transferError} />
        <RawResponse data={transferResult} />
      </Section>
    </div>
  );
}
