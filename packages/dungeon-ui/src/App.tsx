import { useState } from 'react';
import { Lobby } from './Lobby';
import { Game } from './Game';
import type { RunState } from './types';

type Screen = 'lobby' | 'playing' | 'ended';

export function App() {
  const [screen, setScreen] = useState<Screen>('lobby');
  const [runId, setRunId] = useState<string | null>(null);
  const [initialState, setInitialState] = useState<RunState | null>(null);
  const [initialRender, setInitialRender] = useState<string>('');
  const [endReason, setEndReason] = useState<string | null>(null);

  function handleStart(id: string, state: RunState, render: string) {
    setRunId(id);
    setInitialState(state);
    setInitialRender(render);
    setScreen('playing');
  }

  function handleEnd(reason: string) {
    setEndReason(reason);
    setScreen('ended');
  }

  function handleNewGame() {
    setRunId(null);
    setInitialState(null);
    setInitialRender('');
    setEndReason(null);
    setScreen('lobby');
  }

  if (screen === 'playing' && runId && initialState) {
    return (
      <Game
        runId={runId}
        initialState={initialState}
        initialRender={initialRender}
        onEnd={handleEnd}
      />
    );
  }

  if (screen === 'ended') {
    const died = endReason === 'dead';
    return (
      <div
        style={{
          fontFamily: 'monospace',
          background: '#111',
          color: '#ccc',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2rem',
        }}
      >
        <div
          style={{
            fontSize: '3rem',
            fontWeight: 'bold',
            color: died ? '#ff4444' : '#00ffff',
            textAlign: 'center',
          }}
        >
          {died ? 'YOU DIED' : 'EXTRACTED'}
        </div>
        <button
          onClick={handleNewGame}
          style={{
            background: '#00ff00',
            color: '#000',
            border: 'none',
            padding: '0.5rem 1.5rem',
            fontFamily: 'monospace',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          New Game
        </button>
      </div>
    );
  }

  return <Lobby onStart={handleStart} />;
}

export default App;
