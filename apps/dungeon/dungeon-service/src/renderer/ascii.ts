import type { RunState } from '@org/shared';

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
      if (tile.type === 'weakWall')     { row += 'W'; continue; }
      if (tile.type === 'wall')         { row += '#'; continue; }
      if (tile.type === 'exit')         { row += 'E'; continue; }
      if (tile.type === 'hazard')       { row += 'H'; continue; }
      if (tile.type === 'interactable') { row += tile.interactable?.state ? 'i' : 'I'; continue; }
      // Effects on floor
      const fireEff = tile.effects.find(e => e.tag === 'fire');
      if (fireEff) { row += fireEff.duration === 1 ? 'f' : 'F'; continue; }
      if (tile.effects.some(e => e.tag === 'oil')) { row += 'o'; continue; }
      // Floor
      row += tile.items.length > 0 ? '$' : '.';
    }
    lines.push(row);
  }

  lines.push('');
  lines.push(`Turn: ${overclock}  Player HP: ${player.hp}/${player.maxHp}  Status: ${status}`);

  return lines.join('\n');
}
