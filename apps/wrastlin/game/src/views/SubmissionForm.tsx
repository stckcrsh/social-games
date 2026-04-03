import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { MatchStyle, StoryRequestType, Manager } from '@org/wrastlin-shared';

const MATCH_STYLES: MatchStyle[] = ['technical', 'brawl', 'high-fly', 'heel', 'face'];
const STORY_TYPES: StoryRequestType[] = ['push', 'feud', 'betrayal', 'title-shot', 'promo'];

export function SubmissionForm() {
  const [manager, setManager] = useState<Manager | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [matchStyle, setMatchStyle] = useState<MatchStyle>('technical');
  const [targetOpponent, setTargetOpponent] = useState('');
  const [storyType, setStoryType] = useState<StoryRequestType>('feud');
  const [storyTarget, setStoryTarget] = useState('');
  const [bribe, setBribe] = useState(0);
  const [wrestlerMessage, setWrestlerMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getMe()
      .then(({ manager: m }) => setManager(m))
      .catch(e => setLoadError((e as Error).message));
  }, []);

  if (loadError) return <p style={{ color: 'red' }}>Error: {loadError}</p>;
  if (!manager) return <p>Loading...</p>;

  async function submit() {
    if (!manager) return;
    setStatus('submitting');
    try {
      await api.submitWeek(
        manager.managerId,
        { matchStyle, targetOpponent: targetOpponent || undefined },
        storyTarget
          ? [{ type: storyType, target: storyTarget, bribeAmount: bribe }]
          : [],
        wrestlerMessage || undefined
      );
      setStatus('done');
      setMessage('Submission recorded! Good luck this week.');
    } catch (e) {
      setStatus('error');
      setMessage((e as Error).message);
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '500px' }}>
      <h2>Weekly Submission</h2>

      <section>
        <h3>Match Advice</h3>
        <label>
          Preferred style:{' '}
          <select value={matchStyle} onChange={e => setMatchStyle(e.target.value as MatchStyle)}>
            {MATCH_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <br />
        <label>
          Target opponent wrestler ID (optional):{' '}
          <input value={targetOpponent} onChange={e => setTargetOpponent(e.target.value)} placeholder="w-001" />
        </label>
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h3>Story Request (optional)</h3>
        <label>
          Type:{' '}
          <select value={storyType} onChange={e => setStoryType(e.target.value as StoryRequestType)}>
            {STORY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <br />
        <label>
          Target wrestler ID:{' '}
          <input value={storyTarget} onChange={e => setStoryTarget(e.target.value)} placeholder="w-001" />
        </label>
        <br />
        <label>
          Bribe amount: $
          <input type="number" value={bribe} min={0} onChange={e => setBribe(Number(e.target.value))} />
        </label>
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h3>Message to Your Wrestler (optional)</h3>
        <textarea
          value={wrestlerMessage}
          onChange={e => setWrestlerMessage(e.target.value)}
          placeholder="Write a message or pep talk to your wrestler for this week..."
          rows={4}
          style={{ width: '100%' }}
        />
      </section>

      <button
        onClick={submit}
        disabled={status === 'submitting' || status === 'done'}
        style={{ marginTop: '1rem', padding: '0.5rem 1.5rem' }}
      >
        {status === 'submitting' ? 'Submitting...' : 'Submit for This Week'}
      </button>

      {message && (
        <p style={{ color: status === 'error' ? 'red' : 'green', marginTop: '0.5rem' }}>
          {message}
        </p>
      )}
    </div>
  );
}
