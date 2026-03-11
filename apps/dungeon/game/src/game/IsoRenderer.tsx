import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { Tile } from '@org/shared';
import type { Tileset, TileColors } from './tileset';
import type { AnimationState, TileFlashAnim } from './animation/AnimationState.js';
import { slide, lunge, flash, burst, tileFlash, collapse, missIndicator, projectile } from './animation/animationPrimitives.js';

interface IsoRendererProps {
  grid: Tile[][];
  player: { pos: { x: number; y: number } };
  enemies: { id: string; pos: { x: number; y: number }; aiType?: string }[];
  tileset: Tileset;
  highlightedCells?: { x: number; y: number; valid: boolean }[];
}

export interface IsoRendererHandle {
  startAnimating(animState: AnimationState, onDone: () => void): void;
  cancelAnimation(): void;
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function tileToScreen(
  pos: { x: number; y: number },
  offsetX: number, offsetY: number,
  tileW: number, tileH: number,
): { cx: number; cy: number } {
  const topX = offsetX + (pos.x - pos.y) * (tileW / 2);
  const topY = offsetY + (pos.x + pos.y) * (tileH / 2);
  return { cx: topX - tileW / 2, cy: topY };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export const IsoRenderer = forwardRef<IsoRendererHandle, IsoRendererProps>(
  function IsoRenderer({ grid, player, enemies, tileset, highlightedCells }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sheetRef  = useRef<HTMLImageElement | null>(null);
    const sheetReadyRef = useRef(false);

    const rafRef = useRef<number | null>(null);
    const animStateRef = useRef<AnimationState | null>(null);
    const onDoneRef = useRef<(() => void) | null>(null);
    const redrawRef = useRef<((animState?: AnimationState | null) => void) | null>(null);

    const rows = grid.length;
    const cols = rows > 0 ? grid[0].length : 0;
    const { tileW, tileH, wallH } = tileset;

    // offsetX: shift right so (0, rows-1) tile starts at cx=0
    const offsetX = rows * (tileW / 2);
    // offsetY: pad top so wall tops never go above y=0
    const offsetY = wallH;

    const canvasWidth  = (rows + cols) * (tileW / 2);
    const canvasHeight = offsetY + (rows + cols) * (tileH / 2) + tileH;

    useImperativeHandle(ref, () => ({
      startAnimating(animState, onDone) {
        // Cut-and-replace: if a previous animation is running, cancel it.
        // The previous onDone is intentionally discarded — the new turn takes over.
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        animStateRef.current = animState;
        onDoneRef.current = onDone;

        function loop() {
          redrawRef.current?.(animStateRef.current);
          if (!animStateRef.current?.done) {
            rafRef.current = requestAnimationFrame(loop);
          } else {
            rafRef.current = null;
            animStateRef.current = null;
            onDoneRef.current?.();
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      },
      cancelAnimation() {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        animStateRef.current = null;
        onDoneRef.current = null;
      },
    }));

    // Cancel any in-flight rAF loop on unmount to prevent running against a detached canvas.
    useEffect(() => {
      return () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }, []);

    // Load sprite sheet when tileset changes
    useEffect(() => {
      const { sprites } = tileset;
      if (!sprites) {
        sheetRef.current = null;
        sheetReadyRef.current = false;
        return;
      }
      // Reuse existing image if it's already for this sheet URL
      if (sheetRef.current?.src.endsWith(sprites.sheet)) return;

      sheetReadyRef.current = false;
      const img = new Image();
      img.src = sprites.sheet;
      img.onload = () => {
        sheetRef.current = img;
        sheetReadyRef.current = true;
        // Trigger a redraw by touching the canvas directly
        const canvas = canvasRef.current;
        if (canvas) canvas.dispatchEvent(new Event('sheetloaded'));
      };
      sheetRef.current = img;
    }, [tileset]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || rows === 0 || cols === 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      function redrawWithAnim(ctx: CanvasRenderingContext2D, animState?: AnimationState | null) {
        ctx.clearRect(0, 0, canvas!.width, canvas!.height);
        const now = performance.now();

        // ── Build override maps from animState ──────────────────────────────────
        const posOverride = new Map<string, { x: number; y: number }>();
        const flashOverride = new Map<string, string>(); // entityId → rgba color
        const scaleOverride = new Map<string, number>(); // entityId → scale (0-1)

        const tileFlashMap = new Map<string, TileFlashAnim>();
        if (animState) {
          for (const anim of animState.entityPositions) {
            const p = clamp((now - anim.startTime) / anim.duration, 0, 1);
            const pos = anim.kind === 'slide'
              ? slide(anim.from, anim.to, p)
              : lunge(anim.from, anim.to, p);
            posOverride.set(anim.entityId, pos);
          }
          for (const anim of animState.entityFlashes) {
            const p = clamp((now - anim.startTime) / anim.duration, 0, 1);
            flashOverride.set(anim.entityId, flash(anim.rgbColor, p));
          }
          for (const anim of animState.entityScales) {
            const p = clamp((now - anim.startTime) / anim.duration, 0, 1);
            scaleOverride.set(anim.entityId, collapse(p).scale);
          }
          for (const tf of animState.tileFlashes) {
            tileFlashMap.set(tf.key, tf);
          }
        }

        // ── Separate animated vs static entities ──────────────────────────────
        const highlightAt = new Map<string, boolean>();
        for (const cell of highlightedCells ?? []) {
          highlightAt.set(`${cell.x},${cell.y}`, cell.valid);
        }

        type EntityRole = 'player' | 'chase' | 'patrol' | 'charger';
        const staticEntityAt = new Map<string, EntityRole>();
        const animatedEntities: Array<{ role: EntityRole; pos: { x: number; y: number }; id: string }> = [];

        // Player
        const playerAnimatedPos = posOverride.get('player');
        if (playerAnimatedPos) {
          animatedEntities.push({ role: 'player', pos: playerAnimatedPos, id: 'player' });
        } else {
          staticEntityAt.set(`${player.pos.x},${player.pos.y}`, 'player');
        }

        // Enemies
        for (const e of enemies) {
          const role: EntityRole =
            e.aiType === 'patrol_loop' ? 'patrol'
            : e.aiType === 'charger'   ? 'charger'
            : 'chase';
          const enemyAnimPos = posOverride.get(e.id);
          if (enemyAnimPos) {
            animatedEntities.push({ role, pos: enemyAnimPos, id: e.id });
          } else {
            staticEntityAt.set(`${e.pos.x},${e.pos.y}`, role);
          }
        }

        // ── Painter's algorithm (static entities only) ─────────────────────────
        for (let d = 0; d < rows + cols - 1; d++) {
          for (let x = 0; x < cols; x++) {
            const y = d - x;
            if (y < 0 || y >= rows) continue;

            const tile = grid[y][x];
            const topX = offsetX + (x - y) * (tileW / 2);
            const topY = offsetY + (x + y) * (tileH / 2);
            const cx = topX - tileW / 2;
            const cy = topY;

            drawTile(ctx, cx, cy, tile, tileset, sheetReadyRef.current ? sheetRef.current : null);

            // Highlight
            const hlValid = highlightAt.get(`${x},${y}`);
            if (hlValid !== undefined) {
              ctx.fillStyle = hlValid ? 'rgba(255, 220, 50, 0.4)' : 'rgba(160, 160, 160, 0.4)';
              diamond(ctx, cx, cy, tileW, tileH);
              ctx.fill();
            }

            // Tile flash overlay
            if (animState) {
              const tf = tileFlashMap.get(`${x},${y}`);
              if (tf) {
                const p = clamp((now - tf.startTime) / tf.duration, 0, 1);
                ctx.fillStyle = tileFlash(tf.rgbColor, p, tf.peakAlpha);
                diamond(ctx, cx, cy, tileW, tileH);
                ctx.fill();
              }
            }

            // Static entity
            const role = staticEntityAt.get(`${x},${y}`);
            if (role) {
              const entityId = role === 'player' ? 'player' : enemies.find(e => e.pos.x === x && e.pos.y === y)?.id ?? '';
              const sc = scaleOverride.get(entityId) ?? 1;
              const fl = flashOverride.get(entityId);
              drawEntityWithOverrides(ctx, cx, cy, role, tileset, sc, fl);
            }
          }
        }

        // ── Animated entities (drawn at fractional positions) ──────────────────
        for (const anim of animatedEntities) {
          const { cx, cy } = tileToScreen(anim.pos, offsetX, offsetY, tileW, tileH);
          const sc = scaleOverride.get(anim.id) ?? 1;
          const fl = flashOverride.get(anim.id);
          drawEntityWithOverrides(ctx, cx, cy, anim.role, tileset, sc, fl);
        }

        // ── Bursts ───────────────────────────────────────────────────────────────
        if (animState) {
          for (const b of animState.bursts) {
            const p = clamp((now - b.startTime) / b.duration, 0, 1);
            const { radiusPx, alpha } = burst(b.tileRadiusPx, p);
            const { cx, cy } = tileToScreen({ x: b.x, y: b.y }, offsetX, offsetY, tileW, tileH);
            const centerX = cx + tileW / 2;
            const centerY = cy + tileH / 2;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radiusPx, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = `rgba(255, 140, 0, ${alpha * 0.25})`;
            ctx.fill();
            ctx.restore();
          }

          // ── Projectiles ────────────────────────────────────────────────────────
          for (const proj of animState.projectiles) {
            const p = clamp((now - proj.startTime) / proj.duration, 0, 1);
            const pos = projectile(proj.from, proj.to, p);
            const { cx, cy } = tileToScreen(pos, offsetX, offsetY, tileW, tileH);
            ctx.save();
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(cx + tileW / 2, cy + tileH / 2, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // ── Miss indicators ────────────────────────────────────────────────────
          for (const miss of animState.missIndicators) {
            const p = clamp((now - miss.startTime) / miss.duration, 0, 1);
            const { alpha } = missIndicator(p);
            const { cx, cy } = tileToScreen(miss.at, offsetX, offsetY, tileW, tileH);
            const midX = cx + tileW / 2;
            const midY = cy + tileH / 2;
            const s = 8;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(midX - s, midY - s); ctx.lineTo(midX + s, midY + s);
            ctx.moveTo(midX + s, midY - s); ctx.lineTo(midX - s, midY + s);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // Expose redrawWithAnim via ref so the rAF loop can call it with latest props
      redrawRef.current = (animState?: AnimationState | null) => redrawWithAnim(ctx, animState);

      function redraw() {
        redrawWithAnim(ctx, null);
      }

      const onSheetLoaded = () => redraw();
      canvas.addEventListener('sheetloaded', onSheetLoaded);

      redraw();

      return () => canvas.removeEventListener('sheetloaded', onSheetLoaded);
    }, [grid, player, enemies, tileset, rows, cols, offsetX, offsetY, tileW, tileH, wallH, highlightedCells]);

    return (
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxWidth: '100%' }}>
        <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />
      </div>
    );
  }
);

// ── Drawing primitives ────────────────────────────────────────────────────────

function diamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  w: number, h: number,
) {
  ctx.beginPath();
  ctx.moveTo(cx + w / 2, cy);
  ctx.lineTo(cx + w,     cy + h / 2);
  ctx.lineTo(cx + w / 2, cy + h);
  ctx.lineTo(cx,         cy + h / 2);
  ctx.closePath();
}

function drawFloorDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  tileW: number, tileH: number,
  colors: TileColors,
) {
  ctx.fillStyle = colors.top;
  diamond(ctx, cx, cy, tileW, tileH);
  ctx.fill();

  // Subtle grid line
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.5;
  diamond(ctx, cx, cy, tileW, tileH);
  ctx.stroke();
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  tileW: number, tileH: number,
  blockH: number,
  colors: TileColors,
) {
  // Left face
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(cx,           cy - blockH + tileH / 2); // left of top face
  ctx.lineTo(cx + tileW/2, cy - blockH + tileH);     // bottom of top face (= floor top)
  ctx.lineTo(cx + tileW/2, cy + tileH);              // bottom of floor
  ctx.lineTo(cx,           cy + tileH / 2);           // left of floor
  ctx.closePath();
  ctx.fill();

  // Right face
  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(cx + tileW,   cy - blockH + tileH / 2); // right of top face
  ctx.lineTo(cx + tileW/2, cy - blockH + tileH);     // bottom of top face
  ctx.lineTo(cx + tileW/2, cy + tileH);              // bottom of floor
  ctx.lineTo(cx + tileW,   cy + tileH / 2);           // right of floor
  ctx.closePath();
  ctx.fill();

  // Top face
  ctx.fillStyle = colors.top;
  diamond(ctx, cx, cy - blockH, tileW, tileH);
  ctx.fill();

  // Top-edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx,           cy - blockH + tileH / 2);
  ctx.lineTo(cx + tileW/2, cy - blockH);
  ctx.lineTo(cx + tileW,   cy - blockH + tileH / 2);
  ctx.stroke();
}

// ── Tile dispatch ─────────────────────────────────────────────────────────────

// Kenney isometric blocks are 111×128. Scaled to tileW (64px) wide:
// dst height = 128 * (64/111) ≈ 74px — preserves the cube's proportions.
// The top-face diamond of the scaled block occupies roughly the top ~37px (≈ tileH+5),
// and the visible side faces extend ~37px below. Painter's algorithm hides those sides.
function kenneyDstH(tileW: number): number {
  return Math.round(tileW * 128 / 111);
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  tile: Tile,
  tileset: Tileset,
  sheet: HTMLImageElement | null,
) {
  const { tileW, tileH, wallH, colors, sprites } = tileset;

  if (tile.type === 'wall') {
    if (sheet && sprites?.frames.wall) {
      // Draw at natural proportions (kenneyDstH), shifted up by wallH so top face
      // aligns with the wall's top diamond. Side faces extend from cy downward.
      const f = sprites.frames.wall;
      ctx.drawImage(sheet, f.x, f.y, sprites.tileW, sprites.tileH,
        cx, cy - wallH, tileW, kenneyDstH(tileW));
    } else {
      drawBlock(ctx, cx, cy, tileW, tileH, wallH, colors.wall);
    }
    return;
  }

  if (tile.type === 'weakWall') {
    if (sheet && sprites?.frames.weakWall) {
      const f = sprites.frames.weakWall;
      const wh = wallH * 0.6;
      ctx.drawImage(sheet, f.x, f.y, sprites.tileW, sprites.tileH,
        cx, cy - wh, tileW, kenneyDstH(tileW));
    } else {
      drawBlock(ctx, cx, cy, tileW, tileH, wallH * 0.6, colors.weakWall);
    }
    return;
  }

  // Floor-type tiles
  const floorColors: TileColors =
    tile.type === 'exit'         ? colors.exit
    : tile.type === 'hazard'     ? colors.hazard
    : tile.type === 'interactable'
      ? (tile.interactable && tile.interactable.state > 0
          ? colors.interactableOn
          : colors.interactableOff)
    : colors.floor;

  if (sheet && sprites) {
    type FloorKey = 'floor' | 'exit' | 'hazard' | 'interactableOff' | 'interactableOn';
    let frameKey: FloorKey = 'floor';
    if (tile.type === 'exit')            frameKey = 'exit';
    else if (tile.type === 'hazard')     frameKey = 'hazard';
    else if (tile.type === 'interactable') {
      frameKey = tile.interactable && tile.interactable.state > 0 ? 'interactableOn' : 'interactableOff';
    }
    const f = sprites.frames[frameKey];
    if (f) {
      // Draw the full Kenney block starting at the tile's top vertex.
      // The block's top-face sits on the tile; its sides dip below and are covered
      // by tiles drawn later (closer to the viewer) in the painter's algorithm.
      ctx.drawImage(sheet, f.x, f.y, sprites.tileW, sprites.tileH,
        cx, cy, tileW, kenneyDstH(tileW));
    } else {
      drawFloorDiamond(ctx, cx, cy, tileW, tileH, floorColors);
    }
  } else {
    drawFloorDiamond(ctx, cx, cy, tileW, tileH, floorColors);
  }

  // Effect overlays
  const fireEff = tile.effects?.find(e => e.tag === 'fire');
  if (fireEff) {
    ctx.globalAlpha = fireEff.duration === 1 ? 0.45 : 0.75;
    ctx.fillStyle = colors.effectFire.top;
    diamond(ctx, cx, cy, tileW, tileH);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  } else if (tile.effects?.some(e => e.tag === 'oil')) {
    ctx.fillStyle = colors.effectOil;
    diamond(ctx, cx, cy, tileW, tileH);
    ctx.fill();
  }

  // Item indicator dot
  if (tile.items.length > 0) {
    ctx.fillStyle = colors.itemDot;
    ctx.beginPath();
    ctx.arc(cx + tileW / 2, cy + tileH / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Entity drawing ────────────────────────────────────────────────────────────

type EntityRole = 'player' | 'chase' | 'patrol' | 'charger';

function drawEntityWithOverrides(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  role: EntityRole,
  tileset: Tileset,
  scale: number,
  flashColor: string | undefined,
) {
  const { tileW, tileH } = tileset;
  const midX = cx + tileW / 2;
  const midY = cy + tileH / 2;

  ctx.save();
  if (scale !== 1) {
    ctx.translate(midX, midY);
    ctx.scale(scale, scale);
    ctx.translate(-midX, -midY);
  }

  drawEntity(ctx, cx, cy, role, tileset);

  // Flash overlay: draw a translucent colored diamond over the entity area
  if (flashColor) {
    ctx.fillStyle = flashColor;
    diamond(ctx, cx, cy - tileset.entityH * 0.5, tileW, tileH);
    ctx.fill();
  }
  ctx.restore();
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  role: EntityRole,
  tileset: Tileset,
) {
  const { tileW, tileH, entityH } = tileset;

  // Center of the tile's top diamond surface
  const midX = cx + tileW / 2;
  const midY = cy + tileH / 2;

  ctx.save();
  ctx.globalAlpha = 0.92;

  switch (role) {
    case 'player': {
      // Humanoid silhouette: circle head + body rect, teal
      const headR = tileH * 0.22;
      const bodyW = tileH * 0.28;
      const bodyH = entityH * 0.5;
      const headCY = midY - entityH * 0.6 - headR;

      ctx.fillStyle = 'rgba(0, 200, 200, 0.85)';
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 1.5;

      // Head
      ctx.beginPath();
      ctx.arc(midX, headCY, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Body
      ctx.beginPath();
      ctx.rect(midX - bodyW / 2, headCY + headR, bodyW, bodyH);
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'chase': {
      // Skull oval with X pupils, red
      const rx = tileH * 0.25;
      const ry = tileH * 0.28;
      const ovalCY = midY - entityH * 0.5;

      ctx.fillStyle = '#cc2222';
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.ellipse(midX, ovalCY, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // X pupils (two small X marks)
      const eyeOffX = rx * 0.35;
      const eyeS = ry * 0.25;
      ctx.strokeStyle = '#ffaaaa';
      ctx.lineWidth = 1.2;
      for (const ex of [midX - eyeOffX, midX + eyeOffX]) {
        ctx.beginPath();
        ctx.moveTo(ex - eyeS, ovalCY - eyeS); ctx.lineTo(ex + eyeS, ovalCY + eyeS);
        ctx.moveTo(ex + eyeS, ovalCY - eyeS); ctx.lineTo(ex - eyeS, ovalCY + eyeS);
        ctx.stroke();
      }
      break;
    }

    case 'patrol': {
      // Orange rotated diamond
      const hw = tileH * 0.25;
      const hh = entityH * 0.4;
      const dCY = midY - entityH * 0.4;

      ctx.fillStyle = '#cc6622';
      ctx.strokeStyle = '#ff8844';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(midX,      dCY - hh);
      ctx.lineTo(midX + hw, dCY);
      ctx.lineTo(midX,      dCY + hh);
      ctx.lineTo(midX - hw, dCY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'charger': {
      // Yellow triangle pointing up (charge implied)
      const tw = tileH * 0.5;
      const th = entityH * 0.9;
      const tBase = midY - entityH * 0.05;

      ctx.fillStyle = '#cccc22';
      ctx.strokeStyle = '#ffff44';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(midX,          tBase - th);
      ctx.lineTo(midX + tw / 2, tBase);
      ctx.lineTo(midX - tw / 2, tBase);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}
