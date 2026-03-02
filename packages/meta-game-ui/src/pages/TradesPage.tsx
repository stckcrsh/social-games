import { useState, useEffect, type FormEvent } from 'react';
import { tradesApi, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorMessage } from '../components/ErrorMessage';
import type { TradeOffer } from '../types/api';

type Tab = 'incoming' | 'outgoing' | 'history';

function shortId(id: string): string {
  return id.slice(0, 8);
}

function ItemsList({ escrow }: { escrow: { items: unknown[] } | null }) {
  if (!escrow) return <span className="muted">—</span>;
  return <pre className="raw-response" style={{ margin: 0, fontSize: '0.8em' }}>{JSON.stringify(escrow.items, null, 2)}</pre>;
}

function TradeCard({
  trade,
  myId,
  onRefresh,
}: {
  trade: TradeOffer;
  myId: string;
  onRefresh: () => void;
}) {
  const isProposer = trade.proposerId === myId;
  const counterpart = isProposer ? trade.targetId : trade.proposerId;

  const [counterJson, setCounterJson] = useState('[\n  {"kind": "stack", "defId": "gold", "qty": 10}\n]');
  const [actionError, setActionError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function handle(fn: () => Promise<unknown>) {
    setActionError(null);
    setLoading(true);
    try {
      await fn();
      onRefresh();
    } catch (err) {
      setActionError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCounter(e: FormEvent) {
    e.preventDefault();
    await handle(async () => {
      const items = JSON.parse(counterJson) as unknown[];
      await tradesApi.counter(trade.tradeId, { counterItems: items });
    });
  }

  const myApproved = isProposer ? trade.proposerApproved : trade.targetApproved;

  return (
    <div className="admin-section" style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>Trade {shortId(trade.tradeId)}</strong>
        <span className="badge">{trade.status}</span>
        <span className="muted">Counterpart: {shortId(counterpart)}</span>
        <span className="muted">Expires: {new Date(trade.expiresAt).toLocaleString()}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
        <div>
          <div className="muted" style={{ fontSize: '0.8em' }}>Proposer's offer</div>
          <ItemsList escrow={trade.proposerEscrow} />
        </div>
        <div>
          <div className="muted" style={{ fontSize: '0.8em' }}>Counter offer</div>
          <ItemsList escrow={trade.targetEscrow} />
        </div>
      </div>

      {/* Incoming awaiting_counter: show counter form + cancel */}
      {!isProposer && trade.status === 'awaiting_counter' && (
        <form onSubmit={handleCounter} className="form" style={{ marginTop: '0.75rem' }}>
          <label>
            Items I Offer (JSON)
            <textarea value={counterJson} onChange={e => setCounterJson(e.target.value)} rows={4} required />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Counter'}</button>
            <button type="button" disabled={loading} onClick={() => handle(() => tradesApi.cancel(trade.tradeId))}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* awaiting_approval: approve + cancel */}
      {trade.status === 'awaiting_approval' && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
          {myApproved ? (
            <span className="muted">Waiting for other player to approve...</span>
          ) : (
            <button disabled={loading} onClick={() => handle(() => tradesApi.approve(trade.tradeId))}>
              {loading ? 'Approving...' : 'Approve'}
            </button>
          )}
          <button disabled={loading} onClick={() => handle(() => tradesApi.cancel(trade.tradeId))}>
            Cancel
          </button>
        </div>
      )}

      {/* Outgoing awaiting_counter: only cancel */}
      {isProposer && trade.status === 'awaiting_counter' && (
        <div style={{ marginTop: '0.75rem' }}>
          <span className="muted" style={{ marginRight: '0.75rem' }}>Waiting for counter...</span>
          <button disabled={loading} onClick={() => handle(() => tradesApi.cancel(trade.tradeId))}>
            Cancel
          </button>
        </div>
      )}

      <ErrorMessage error={actionError} />
    </div>
  );
}

export function TradesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('incoming');

  const [incoming, setIncoming] = useState<TradeOffer[]>([]);
  const [outgoing, setOutgoing] = useState<TradeOffer[]>([]);
  const [history, setHistory] = useState<TradeOffer[]>([]);
  const [listError, setListError] = useState<unknown>(null);

  // Propose form
  const [targetId, setTargetId] = useState('');
  const [offerJson, setOfferJson] = useState('[\n  {"kind": "stack", "defId": "gold", "qty": 10}\n]');
  const [proposeError, setProposeError] = useState<unknown>(null);
  const [proposeLoading, setProposeLoading] = useState(false);

  async function fetchTrades() {
    setListError(null);
    try {
      const data = await tradesApi.list();
      setIncoming(data.incoming);
      setOutgoing(data.outgoing);
      setHistory(data.history);
    } catch (err) {
      setListError(err);
    }
  }

  useEffect(() => {
    void fetchTrades();
  }, []);

  async function handlePropose(e: FormEvent) {
    e.preventDefault();
    setProposeError(null);
    setProposeLoading(true);
    try {
      const items = JSON.parse(offerJson) as unknown[];
      await tradesApi.propose({ targetPlayerId: targetId, offerItems: items });
      setTargetId('');
      setOfferJson('[\n  {"kind": "stack", "defId": "gold", "qty": 10}\n]');
      await fetchTrades();
      setTab('outgoing');
    } catch (err) {
      setProposeError(err instanceof ApiError ? err.body ?? err : err);
    } finally {
      setProposeLoading(false);
    }
  }

  const currentList = tab === 'incoming' ? incoming : tab === 'outgoing' ? outgoing : history;

  return (
    <div className="page">
      <h1>Trades</h1>

      <section className="admin-section">
        <h2>Propose New Trade</h2>
        <form onSubmit={handlePropose} className="form">
          <label>
            Target Player ID (UUID)
            <input
              value={targetId}
              onChange={e => setTargetId(e.target.value)}
              required
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </label>
          <label>
            Items I Offer (JSON)
            <textarea
              value={offerJson}
              onChange={e => setOfferJson(e.target.value)}
              rows={4}
              required
            />
          </label>
          <button type="submit" disabled={proposeLoading}>
            {proposeLoading ? 'Proposing...' : 'Propose Trade'}
          </button>
        </form>
        <ErrorMessage error={proposeError} />
      </section>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        {(['incoming', 'outgoing', 'history'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ fontWeight: tab === t ? 'bold' : 'normal' }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'incoming' && incoming.length > 0 && ` (${incoming.length})`}
            {t === 'outgoing' && outgoing.length > 0 && ` (${outgoing.length})`}
          </button>
        ))}
        <button onClick={fetchTrades} style={{ marginLeft: 'auto' }}>Refresh</button>
      </div>

      <ErrorMessage error={listError} />

      {currentList.length === 0 ? (
        <p className="muted">No trades here.</p>
      ) : (
        currentList.map(trade => (
          <TradeCard
            key={trade.tradeId}
            trade={trade}
            myId={user!.playerId}
            onRefresh={fetchTrades}
          />
        ))
      )}
    </div>
  );
}
