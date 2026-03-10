import { useState } from 'react';
import { api } from '../api/client.js';

interface Message {
  from: 'manager' | 'wrestler';
  text: string;
}

interface Props {
  managerId: string;
  wrestlerName: string;
}

export function ChatPanel({ managerId, wrestlerName }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { from: 'manager', text }]);
    setLoading(true);

    try {
      const resp = await api.chat(managerId, text);
      setMessages(prev => [...prev, { from: 'wrestler', text: resp.message }]);
    } catch {
      setMessages(prev => [...prev, { from: 'wrestler', text: '...' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
      <h3>Chat with {wrestlerName}</h3>

      <div style={{ height: '300px', overflowY: 'auto', marginBottom: '1rem', padding: '0.5rem', background: '#f9f9f9' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ textAlign: m.from === 'manager' ? 'right' : 'left', margin: '0.5rem 0' }}>
            <span style={{
              display: 'inline-block',
              background: m.from === 'manager' ? '#007bff' : '#e9ecef',
              color: m.from === 'manager' ? 'white' : 'black',
              padding: '0.4rem 0.8rem',
              borderRadius: '12px',
              maxWidth: '80%',
            }}>
              {m.text}
            </span>
          </div>
        ))}
        {loading && <div style={{ color: '#999' }}>...</div>}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Say something to your wrestler..."
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <button onClick={send} disabled={loading}>Send</button>
      </div>
    </div>
  );
}
