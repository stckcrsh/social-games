import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RunState, GameEvent } from './types';

// ── Color map ────────────────────────────────────────────────────────────────

type CharStyle = { color: string; fontWeight?: string };

const CHAR_STYLES: Record<string, CharStyle> = {
  '#': { color: '#555' },
  '.': { color: '#888' },
  'P': { color: '#00ff00', fontWeight: 'bold' },
  'e': { color: '#ff4444', fontWeight: 'bold' },
  'E': { color: '#00ffff' },
  '$': { color: '#ffff00' },
  'H': { color: '#ff00ff' },
  'I': { color: '#6699ff' },
  'i': { color: '#aabbff', fontWeight: 'bold' },
};

function colorizeRender(raw: string): ReactNode[] {
  // Strip last 2 lines (stat line from server — we render our own HUD)
  const lines = raw.split('\n');
  const grid = lines.slice(0, -2).join('\n');

  const nodes: ReactNode[] = [];
  let i = 0;
  for (const ch of grid) {
    const style = CHAR_STYLES[ch];
    if (style) {
      nodes.push(<span key={i} style={style}>{ch}</span>);
    } else {
      nodes.push(ch);
    }
    i++;
  }
  return nodes;
}

// ── Key → action map ─────────────────────────────────────────────────────────

type PlayerAction =
  | { type: 'move'; dir: 'N' | 'S' | 'E' | 'W' }
  | { type: 'attack'; dir: 'N' | 'S' | 'E' | 'W' }
  | { type: 'interact' }
  | { type: 'wait' };

const KEY_MAP: Record<string, PlayerAction> = {
  ArrowUp:    { type: 'move',    dir: 'N' },
  ArrowDown:  { type: 'move',    dir: 'S' },
  ArrowRight: { type: 'move',    dir: 'E' },
  ArrowLeft:  { type: 'move',    dir: 'W' },
  w:          { type: 'attack',  dir: 'N' },
  s:          { type: 'attack',  dir: 'S' },
  d:          { type: 'attack',  dir: 'E' },
  a:          { type: 'attack',  dir: 'W' },
  e:          { type: 'interact' },
  ' ':        { type: 'wait' },
};

// ── Event formatter ───────────────────────────────────────────────────────────

function formatEvent(ev: GameEvent): string | null {
  switch (ev.type) {
    case 'move': {
      const m = ev as Extract<GameEvent, { type: 'move' }>;
      return m.entityId === 'player'
        ? `→ player moved to (${m.to.x}, ${m.to.y})`
        : `→ ${m.entityId} moved`;
    }
    case 'attack': {
      const a = ev as Extract<GameEvent, { type: 'attack' }>;
      return `⚔ ${a.attackerId} attacked ${a.targetId} for ${a.damage} dmg`;
    }
    case 'collision_attack': {
      const c = ev as Extract<GameEvent, { type: 'collision_attack' }>;
      return `💥 ${c.attackerId} collided with ${c.targetId} for ${c.damage} dmg`;
    }
    case 'death': {
      const d = ev as Extract<GameEvent, { type: 'death' }>;
      return `☠ ${d.entityId} was killed`;
    }
    case 'pickup': {
      const p = ev as Extract<GameEvent, { type: 'pickup' }>;
      return `📦 picked up ${p.item?.name ?? p.item?.id ?? 'item'} ×1`;
    }
    case 'noop': {
      const n = ev as Extract<GameEvent, { type: 'noop' }>;
      return `· (no effect: ${n.reason})`;
    }
    case 'interacted': {
      const it = ev as Extract<GameEvent, { type: 'interacted' }>;
      return `🔧 ${it.label} (${it.kind}) → state ${it.newState}`;
    }
    case 'tile_changed': {
      const t = ev as Extract<GameEvent, { type: 'tile_changed' }>;
      return `🧱 tile (${t.x},${t.y}): ${t.from} → ${t.to}`;
    }
    case 'mechanism_solved': {
      const ms = ev as Extract<GameEvent, { type: 'mechanism_solved' }>;
      return `✅ mechanism triggered: ${ms.mechanismId}`;
    }
    case 'mechanism_reset': {
      const mr = ev as Extract<GameEvent, { type: 'mechanism_reset' }>;
      return `🔄 mechanism reset: ${mr.mechanismId}`;
    }
    case 'run_end':
    case 'player_action':
      return null;
    default:
      return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface GameFrame {
  state: RunState;
  render: string;
  turnEvents: GameEvent[];
  error?: string;
}

interface GameProps {
  runId: string;
  initialState: RunState;
  initialRender: string;
  onEnd: (reason: string) => void;
}

export function Game({ runId, initialState, initialRender, onEnd }: GameProps) {
  const [frame, setFrame] = useState<GameFrame>({
    state: initialState,
    render: initialRender,
    turnEvents: [],
  });
  const [disconnected, setDisconnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const endedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Signal end once per run
  useEffect(() => {
    if (frame.state.status !== 'active' && !endedRef.current) {
      endedRef.current = true;
      onEnd(frame.state.status);
    }
  }, [frame.state.status, onEnd]);

  // WebSocket lifecycle
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_DUNGEON_API_URL ?? 'http://localhost:3001';
    const wsBase = apiUrl.startsWith('/')
      ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${apiUrl}`
      : apiUrl.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/runs/${runId}/ws`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Partial<GameFrame> & { error?: string };
        if (data.state) {
          setFrame({
            state: data.state,
            render: data.render ?? '',
            turnEvents: data.turnEvents ?? [],
            error: data.error,
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => setDisconnected(true);
    ws.onerror = () => setDisconnected(true);

    return () => {
      ws.close();
    };
  }, [runId]);

  // Focus container so keydown fires without a global listener
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const action = KEY_MAP[e.key];
    if (!action) return;
    e.preventDefault();
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(action));
    }
  }

  const { state, render, turnEvents, error } = frame;
  const { player, overclock, status } = state;

  const eventLines = turnEvents
    .map(formatEvent)
    .filter((l): l is string => l !== null)
    .slice(-8);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        fontFamily: 'monospace',
        background: '#111',
        color: '#ccc',
        padding: '1rem',
        outline: 'none',
        minHeight: '100vh',
      }}
    >
      {/* Grid */}
      <pre style={{ margin: 0, lineHeight: 1.2, userSelect: 'none' }}>
        {colorizeRender(render)}
      </pre>

      {/* HUD */}
      <div style={{ marginTop: '0.75rem', color: '#aaa' }}>
        Turn: <strong>{overclock}</strong>
        {'  '}Player HP: <strong style={{ color: player.hp < player.maxHp * 0.4 ? '#ff4444' : '#00ff00' }}>
          {player.hp}/{player.maxHp}
        </strong>
        {'  '}Status:{' '}
        <strong style={{ color: status === 'active' ? '#00ff00' : status === 'dead' ? '#ff4444' : '#00ffff' }}>
          {status}
        </strong>
      </div>

      {/* Event log */}
      {eventLines.length > 0 && (
        <div style={{ marginTop: '0.5rem', color: '#888', fontSize: '0.875rem' }}>
          {eventLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: '0.5rem', color: '#ffff00' }}>! {error}</div>
      )}

      {/* Disconnected warning */}
      {disconnected && (
        <div style={{ marginTop: '0.5rem', color: '#ff8800' }}>⚠ Disconnected from server</div>
      )}

      {/* Controls hint */}
      <div style={{ marginTop: '0.75rem', color: '#555', fontSize: '0.8rem' }}>
        Arrow keys: move  |  WASD: attack  |  e: interact  |  Space: wait
      </div>
    </div>
  );
}
