import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import type { RunState, GameEvent, SlotView, Tile } from '@org/shared';
import { IsoRenderer } from './IsoRenderer';
import { SlotHUD } from './SlotHUD';
import { getTileset } from './tileset';
import { getWsUrl, stepTick } from '../api/dungeon';

// ── Key → action map ─────────────────────────────────────────────────────────

type PlayerAction =
  | { type: 'move'; dir: 'N' | 'S' | 'E' | 'W' }
  | { type: 'attack'; dir: 'N' | 'S' | 'E' | 'W' }
  | { type: 'useActive'; dir: 'N' | 'S' | 'E' | 'W' }
  | { type: 'switchSlot' }
  | { type: 'interact' }
  | { type: 'wait' };

const KEY_MAP: Record<string, PlayerAction> = {
  ArrowUp:    { type: 'move',      dir: 'N' },
  ArrowDown:  { type: 'move',      dir: 'S' },
  ArrowRight: { type: 'move',      dir: 'E' },
  ArrowLeft:  { type: 'move',      dir: 'W' },
  w:          { type: 'useActive', dir: 'N' },
  s:          { type: 'useActive', dir: 'S' },
  d:          { type: 'useActive', dir: 'E' },
  a:          { type: 'useActive', dir: 'W' },
  e:          { type: 'interact' },
  ' ':        { type: 'wait' },
};

// ── Event formatter ───────────────────────────────────────────────────────────

function formatEvent(ev: GameEvent): string | null {
  switch (ev.type) {
    case 'move': {
      const m = ev as Extract<GameEvent, { type: 'move' }>;
      return m.entityId === 'player'
        ? `-> player moved to (${m.to.x}, ${m.to.y})`
        : `-> ${m.entityId} moved`;
    }
    case 'attack': {
      const a = ev as Extract<GameEvent, { type: 'attack' }>;
      return `[attack] ${a.attackerId} attacked ${a.targetId} for ${a.damage} dmg`;
    }
    case 'collision_attack': {
      const c = ev as Extract<GameEvent, { type: 'collision_attack' }>;
      return `[collision] ${c.attackerId} collided with ${c.targetId} for ${c.damage} dmg`;
    }
    case 'death': {
      const d = ev as Extract<GameEvent, { type: 'death' }>;
      return `[death] ${d.entityId} was killed`;
    }
    case 'pickup': {
      const p = ev as Extract<GameEvent, { type: 'pickup' }>;
      return `[pickup] picked up ${p.item?.name ?? p.item?.id ?? 'item'} x1`;
    }
    case 'noop': {
      const n = ev as Extract<GameEvent, { type: 'noop' }>;
      return `(no effect: ${n.reason})`;
    }
    case 'interacted': {
      const it = ev as Extract<GameEvent, { type: 'interacted' }>;
      return `[interact] ${it.label} (${it.kind}) -> state ${it.newState}`;
    }
    case 'tile_changed': {
      const t = ev as Extract<GameEvent, { type: 'tile_changed' }>;
      return `[tile] (${t.x},${t.y}): ${t.from} -> ${t.to}`;
    }
    case 'mechanism_solved': {
      const ms = ev as Extract<GameEvent, { type: 'mechanism_solved' }>;
      return `[mechanism] triggered: ${ms.mechanismId}`;
    }
    case 'mechanism_reset': {
      const mr = ev as Extract<GameEvent, { type: 'mechanism_reset' }>;
      return `[mechanism] reset: ${mr.mechanismId}`;
    }
    case 'item_fail': {
      const f = ev as Extract<GameEvent, { type: 'item_fail' }>;
      return `[item] fail (${f.reason})`;
    }
    case 'item_hit': {
      const h = ev as Extract<GameEvent, { type: 'item_hit' }>;
      return `[item] hit ${h.entityId} for ${h.amount}`;
    }
    case 'item_whiff': {
      const w = ev as Extract<GameEvent, { type: 'item_whiff' }>;
      return `(whiff: ${w.reason})`;
    }
    case 'mine_placed': {
      const mp = ev as Extract<GameEvent, { type: 'mine_placed' }>;
      return `[mine] placed at (${mp.x},${mp.y})`;
    }
    case 'mine_detonated': {
      const md = ev as Extract<GameEvent, { type: 'mine_detonated' }>;
      return `[mine] detonated at (${md.x},${md.y})`;
    }
    case 'slot_switched': {
      const ss = ev as Extract<GameEvent, { type: 'slot_switched' }>;
      return `[slot] active slot -> ${ss.slot}`;
    }
    case 'run_end':
    case 'player_action':
      return null;
    default:
      return null;
  }
}

// ── Item activation highlight ─────────────────────────────────────────────────

type HCell = { x: number; y: number; valid: boolean };
const D = { N:{dx:0,dy:-1}, S:{dx:0,dy:1}, E:{dx:1,dy:0}, W:{dx:-1,dy:0} } as const;
function ib(g: Tile[][], x: number, y: number) {
  return y >= 0 && y < g.length && x >= 0 && x < g[0].length;
}
function iw(g: Tile[][], x: number, y: number) {
  if (!ib(g, x, y)) return true;
  const t = g[y][x].type;
  return t === 'wall' || t === 'weakWall';
}

function computeHighlight(
  state: RunState,
  slots: SlotView | undefined,
  dir: 'N'|'S'|'E'|'W' | null,
): HCell[] {
  if (!dir || !slots) return [];
  const slot = slots.activeSlot;
  const entry = slots[slot];
  if (!entry.itemId || entry.cooldown > 0) return [];

  const { dx, dy } = D[dir];
  const px = state.player.pos.x;
  const py = state.player.pos.y;
  const g = state.grid;
  const slotState = state.runItemState[slot];

  switch (entry.itemId) {
    case 'hammer': {
      const tx = px + dx, ty = py + dy;
      return [{ x: tx, y: ty, valid: ib(g, tx, ty) && !iw(g, tx, ty) }];
    }
    case 'rivet_gun': {
      const cells: HCell[] = [];
      let tx = px, ty = py;
      for (let i = 0; i < 4; i++) {
        tx += dx; ty += dy;
        if (!ib(g, tx, ty) || iw(g, tx, ty)) break;
        cells.push({ x: tx, y: ty, valid: true });
      }
      return cells;
    }
    case 'remote_mine': {
      if (slotState?.mode === 'placed') {
        const mp = slotState.meta?.minePos as { x: number; y: number } | undefined;
        if (!mp) return [];
        const cells: HCell[] = [];
        for (let ox = -1; ox <= 1; ox++)
          for (let oy = -1; oy <= 1; oy++)
            if (ib(g, mp.x + ox, mp.y + oy))
              cells.push({ x: mp.x + ox, y: mp.y + oy, valid: true });
        return cells;
      }
      const tx = px + dx, ty = py + dy;
      const valid = ib(g, tx, ty) && g[ty][tx].type === 'floor';
      return [{ x: tx, y: ty, valid }];
    }
    default: return [];
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface GameFrame {
  state: RunState;
  turnEvents: GameEvent[];
  slots?: SlotView;
  error?: string;
}

export function GamePage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDebug = searchParams.get('debug') === 'true';

  // We need an initial state — start with null and wait for WS
  const [frame, setFrame] = useState<GameFrame | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [itemDir, setItemDir] = useState<'N'|'S'|'E'|'W' | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [autoTick, setAutoTick] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const navigatedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-tick for debug runs
  useEffect(() => {
    if (!isDebug || !autoTick || !runId) return;
    const interval = setInterval(() => {
      stepTick(runId).catch(console.error);
    }, 500);
    return () => clearInterval(interval);
  }, [isDebug, autoTick, runId]);

  // WebSocket lifecycle
  useEffect(() => {
    if (!runId) return;
    setDisconnected(false);
    const ws = new WebSocket(getWsUrl(runId));
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Partial<GameFrame> & { error?: string };
        if (data.state) {
          // Navigate away on terminal states
          if (data.state.status === 'dead' || data.state.status === 'extracted') {
            if (!navigatedRef.current) {
              navigatedRef.current = true;
              navigate(`/results/${runId}`);
            }
            return;
          }
          setFrame({
            state: data.state,
            turnEvents: data.turnEvents ?? [],
            slots: data.slots,
            error: data.error,
          });
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => { if (wsRef.current === ws) setDisconnected(true); };
    ws.onerror = () => { if (wsRef.current === ws) setDisconnected(true); };

    return () => {
      wsRef.current = null;
      navigatedRef.current = false;
      ws.close();
    };
  }, [runId, navigate]);

  // Focus container so keydown fires without a global listener
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'q') {
      e.preventDefault();
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'switchSlot' }));
        if (isDebug) setPendingAction('switchSlot');
      }
      return;
    }
    const action = KEY_MAP[e.key];
    if (!action) return;
    e.preventDefault();
    if (action.type === 'useActive') setItemDir(action.dir);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(action));
      if (isDebug) {
        const label = action.type === 'move' || action.type === 'attack' || action.type === 'useActive'
          ? `${action.type}:${'dir' in action ? action.dir : ''}`
          : action.type;
        setPendingAction(label);
      }
    }
  }

  async function handleStepTick() {
    if (!runId) return;
    try {
      const data = await stepTick(runId);
      setFrame({
        state: data.state,
        turnEvents: (data.turnEvents ?? []) as GameEvent[],
        slots: data.slots,
        error: data.error,
      });
      setPendingAction(null);
    } catch (err) {
      setFrame(f => f ? { ...f, error: err instanceof Error ? err.message : String(err) } : f);
    }
  }

  function handleKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    if (['w', 'a', 's', 'd'].includes(e.key)) setItemDir(null);
  }

  const highlightedCells = useMemo(
    () => frame ? computeHighlight(frame.state, frame.slots, itemDir) : [],
    [frame, itemDir],
  );

  // Loading state — waiting for first WS message
  if (!frame) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
        <p>Connecting to dungeon...</p>
        {disconnected && <p style={{ color: '#ff8800' }}>Disconnected. Retrying...</p>}
      </div>
    );
  }

  const { state, turnEvents, error } = frame;
  const { player, overclock, status } = state;

  // Pending status — show Ready screen
  if (state.status === 'pending') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
        <h2>Ready to Start</h2>
        <p>Click Start when ready to enter the dungeon.</p>
        <button
          onClick={() => wsRef.current?.send(JSON.stringify({ type: 'start' }))}
          style={{ padding: '12px 32px', fontSize: 18, marginTop: 24, cursor: 'pointer' }}
        >
          Start Run
        </button>
      </div>
    );
  }

  const tileset = getTileset(state.preset ?? 'default');

  const eventLines = turnEvents
    .map(formatEvent)
    .filter((l): l is string => l !== null)
    .slice(-8);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        outline: 'none',
        fontFamily: 'monospace',
        color: '#ccc',
      }}
    >
      {/* Isometric canvas (fills viewport) */}
      <IsoRenderer
        grid={state.grid}
        player={state.player}
        enemies={state.enemies}
        tileset={tileset}
        highlightedCells={highlightedCells}
      />

      {/* HUD overlay */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          padding: '0.5rem 1rem',
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}
      >
        {/* Debug panel */}
        {isDebug && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ color: '#ff0', fontWeight: 'bold' }}>DEBUG</span>
            <button
              onClick={handleStepTick}
              style={{ fontFamily: 'monospace', cursor: 'pointer', padding: '0.1rem 0.5rem' }}
            >
              Step Tick
            </button>
            <span style={{ color: '#888', fontSize: '0.8rem' }}>
              {pendingAction ? `queued: ${pendingAction}` : 'queued: wait'}
            </span>
            <label style={{ display: 'block' }}>
              <input
                type="checkbox"
                checked={autoTick}
                onChange={(e) => setAutoTick(e.target.checked)}
              />
              {' '}Auto-tick (500ms)
            </label>
          </div>
        )}

        {/* Stats */}
        <div style={{ color: '#aaa' }}>
          Turn: <strong>{overclock}</strong>
          {'  '}Player HP:{' '}
          <strong style={{ color: player.hp < player.maxHp * 0.4 ? '#ff4444' : '#00ff00' }}>
            {player.hp}/{player.maxHp}
          </strong>
          {'  '}Status:{' '}
          <strong style={{ color: status === 'active' ? '#00ff00' : status === 'dead' ? '#ff4444' : '#00ffff' }}>
            {status}
          </strong>
        </div>

        {/* Slot HUD */}
        {frame.slots && (
          <SlotHUD
            slotA={frame.slots.A}
            slotB={frame.slots.B}
            activeSlot={frame.slots.activeSlot}
          />
        )}

        {/* Event log */}
        {eventLines.length > 0 && (
          <div style={{ color: '#888', fontSize: '0.875rem' }}>
            {eventLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && <div style={{ color: '#ffff00' }}>! {error}</div>}

        {/* Disconnected warning */}
        {disconnected && <div style={{ color: '#ff8800' }}>Warning: Disconnected from server</div>}

        {/* Controls hint */}
        <div style={{ color: '#555', fontSize: '0.8rem' }}>
          Arrow keys: move  |  WASD: use active item  |  Q: switch slot  |  e: interact  |  Space: wait
        </div>
      </div>
    </div>
  );
}
