import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';

export function CreateProposition() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function addOption() {
    setOptions(prev => [...prev, '']);
  }

  function removeOption(index: number) {
    setOptions(prev => prev.filter((_, i) => i !== index));
  }

  function updateOption(index: number, value: string) {
    setOptions(prev => prev.map((o, i) => (i === index ? value : o)));
  }

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      const result = await api.createProposition({
        createdBy: 'm-001',
        question,
        closesAt: new Date(closesAt).toISOString(),
        eventKey,
        options: options.map((label, i) => ({ optionId: `opt-${i + 1}`, label })),
      });
      navigate(`/bets/${result.propositionId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.serverMessage : (e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '500px' }}>
      <h2>Create Proposition</h2>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="question">Question</label>
        <br />
        <input id="question" value={question} onChange={e => setQuestion(e.target.value)} style={{ width: '100%' }} />
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="closesAt">Closes At</label>
        <br />
        <input id="closesAt" type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)} />
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="eventKey">Event Key</label>
        <br />
        <input id="eventKey" value={eventKey} onChange={e => setEventKey(e.target.value)} />
      </div>

      <h3>Options</h3>
      {options.map((opt, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <label htmlFor={`opt-input-${i + 1}`}>Option {i + 1}</label>
          <input
            id={`opt-input-${i + 1}`}
            aria-label={`Option ${i + 1}`}
            value={opt}
            onChange={e => updateOption(i, e.target.value)}
          />
          <button type="button" onClick={() => removeOption(i)}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={addOption} style={{ marginBottom: '1rem' }}>Add option</button>

      <br />
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        style={{ marginTop: '1rem', padding: '0.5rem 1.5rem' }}
      >
        {submitting ? 'Creating...' : 'Create'}
      </button>

      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
