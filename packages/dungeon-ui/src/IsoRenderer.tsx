import { useRef, useEffect } from 'react';
import type { Tile } from './types';
import type { Tileset, TileColors } from './tileset';

interface IsoRendererProps {
  grid: Tile[][];
  player: { pos: { x: number; y: number } };
  enemies: { id: string; pos: { x: number; y: number }; aiType?: string }[];
  tileset: Tileset;
}

export function IsoRenderer({ grid, player, enemies, tileset }: IsoRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const { tileW, tileH, wallH } = tileset;

  // offsetX: shift right so (0, rows-1) tile starts at cx=0
  const offsetX = rows * (tileW / 2);
  // offsetY: pad top so wall tops never go above y=0
  const offsetY = wallH;

  const canvasWidth  = (rows + cols) * (tileW / 2);
  const canvasHeight = offsetY + (rows + cols) * (tileH / 2) + tileH;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows === 0 || cols === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Build entity-position lookup: "x,y" → role
    const entityAt = new Map<string, 'player' | 'chase' | 'patrol' | 'charger'>();
    entityAt.set(`${player.pos.x},${player.pos.y}`, 'player');
    for (const e of enemies) {
      const role: 'chase' | 'patrol' | 'charger' =
        e.aiType === 'patrol_loop' ? 'patrol'
        : e.aiType === 'charger'   ? 'charger'
        : 'chase';
      entityAt.set(`${e.pos.x},${e.pos.y}`, role);
    }

    // Painter's algorithm: increasing diagonal (x+y), then increasing x
    for (let d = 0; d < rows + cols - 1; d++) {
      for (let x = 0; x < cols; x++) {
        const y = d - x;
        if (y < 0 || y >= rows) continue;

        const tile = grid[y][x];

        // Top vertex of tile diamond in screen space
        const topX = offsetX + (x - y) * (tileW / 2);
        const topY = offsetY + (x + y) * (tileH / 2);
        // Bounding-box origin (top-left of tileW × tileH rect)
        const cx = topX - tileW / 2;
        const cy = topY;

        drawTile(ctx, cx, cy, tile, tileset);

        const role = entityAt.get(`${x},${y}`);
        if (role) {
          drawEntity(ctx, cx, cy, role, tileset);
        }
      }
    }
  }, [grid, player, enemies, tileset, rows, cols, offsetX, offsetY, tileW, tileH, wallH]);

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxWidth: '100%' }}>
      <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} />
    </div>
  );
}

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

function drawTile(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  tile: Tile,
  tileset: Tileset,
) {
  const { tileW, tileH, wallH, colors } = tileset;

  if (tile.type === 'wall') {
    drawBlock(ctx, cx, cy, tileW, tileH, wallH, colors.wall);
    return;
  }

  if (tile.type === 'weakWall') {
    drawBlock(ctx, cx, cy, tileW, tileH, wallH * 0.6, colors.weakWall);
    return;
  }

  const floorColors: TileColors =
    tile.type === 'exit'         ? colors.exit
    : tile.type === 'hazard'     ? colors.hazard
    : tile.type === 'interactable'
      ? (tile.interactable && tile.interactable.state > 0
          ? colors.interactableOn
          : colors.interactableOff)
    : colors.floor;

  drawFloorDiamond(ctx, cx, cy, tileW, tileH, floorColors);

  // Effect overlays (after floor, before item dot)
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

function drawEntity(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  role: EntityRole,
  tileset: Tileset,
) {
  const { tileW, tileH, entityH, colors } = tileset;

  const entityColors: TileColors = {
    player:  colors.player,
    chase:   colors.enemyChase,
    patrol:  colors.enemyPatrol,
    charger: colors.enemyCharger,
  }[role];

  // Entity block is half-tile size, centered on the tile
  const ew  = tileW / 2;
  const eh  = tileH / 2;
  const ecx = cx + tileW / 4;
  const ecy = cy + tileH / 4;

  drawBlock(ctx, ecx, ecy, ew, eh, entityH, entityColors);
}
