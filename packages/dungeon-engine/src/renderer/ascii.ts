import type { RunState } from '../models/types.js';

export function renderGrid(state: RunState): string {
  const { grid, player, enemies, overclock, status } = state;
  const lines: string[] = [];

  for (let y = 0; y < grid.length; y++) {
    let row = '';
    for (let x = 0; x < grid[y].length; x++) {
      const tile = grid[y][x];

      // Player overrides everything
      if (player.pos.x === x && player.pos.y === y) {
        row += 'P';
        continue;
      }

      // Enemy overrides floor
      const enemy = enemies.find(e => e.pos.x === x && e.pos.y === y && e.hp > 0);
      if (enemy) {
        row += 'e';
        continue;
      }

      // Tile type
      switch (tile.type) {
        case 'wall':         row += '#'; break;
        case 'exit':         row += 'E'; break;
        case 'hazard':       row += 'H'; break;
        case 'interactable': row += tile.interactable?.state ? 'i' : 'I'; break;
        default:
          // Floor: show $ if items present, else dot
          row += tile.items.length > 0 ? '$' : '.';
      }
    }
    lines.push(row);
  }

  lines.push('');
  lines.push(`Turn: ${overclock}  Player HP: ${player.hp}/${player.maxHp}  Status: ${status}`);

  return lines.join('\n');
}
