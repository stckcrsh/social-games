export interface TileColors {
  top: string;
  left: string;
  right: string;
}

export interface TileSprites {
  /** Sprite sheet image URL */
  sheet: string;
  /** Source tile width in sprite sheet */
  tileW: number;
  /** Source tile height in sprite sheet */
  tileH: number;
  frames: {
    floor:            { x: number; y: number };
    wall:             { x: number; y: number };
    weakWall:         { x: number; y: number };
    exit:             { x: number; y: number };
    hazard?:          { x: number; y: number };
    interactableOff?: { x: number; y: number };
    interactableOn?:  { x: number; y: number };
  };
}

export interface Tileset {
  id: string;
  name: string;
  /** Diamond width in pixels */
  tileW: number;
  /** Diamond height in pixels (2:1 ratio with tileW) */
  tileH: number;
  /** Wall face height in pixels */
  wallH: number;
  /** Entity block height in pixels */
  entityH: number;
  /** Optional sprite sheet config; geometric fallback used when absent or image not loaded */
  sprites?: TileSprites;
  colors: {
    floor: TileColors;
    wall: TileColors;
    weakWall: TileColors;
    exit: TileColors;
    hazard: TileColors;
    interactableOff: TileColors;
    interactableOn: TileColors;
    /** Color of the item indicator dot */
    itemDot: string;
    player: TileColors;
    enemyChase: TileColors;
    enemyPatrol: TileColors;
    enemyCharger: TileColors;
    effectFire: TileColors;
    /** Semi-transparent overlay color for oil */
    effectOil: string;
  };
}

// Kenney isometric blocks sprite sheet (CC0) — shared by all tilesets
// 111×128 per tile, 9-col × 15-row grid. Tile at (col, row) → x = col*112, y = row*129
const KENNEY_SPRITES: TileSprites = {
  sheet: '/tiles/blocks.png',
  tileW: 111,
  tileH: 128,
  frames: {
    floor:           { x:   3*112, y:  13*129 }, // (col 0, row 7) — plain gray stone
    wall:            { x:   0, y:  774 }, // (col 0, row 6) — textured gray stone wall
    weakWall:        { x:   0, y:  516 }, // (col 0, row 4) — cracked/damaged stone
    exit:            { x: 224, y: 1032 }, // (col 2, row 8) — stone archway
    hazard:          { x: 784, y:    0 }, // (col 7, row 0) — red danger block
    interactableOff: { x: 448, y:  516 }, // (col 4, row 4) — tan panel (off)
    interactableOn:  { x: 448, y:  774 }, // (col 4, row 6) — yellow glowing panel (on)
  },
};

const TILESETS: Record<string, Tileset> = {
  default: {
    id: 'default',
    name: 'Dungeon Stone',
    tileW: 64,
    tileH: 37,
    wallH: 32,
    entityH: 20,
    sprites: KENNEY_SPRITES,
    colors: {
      floor:           { top: '#3a3d4a', left: '#272a35', right: '#30333e' },
      wall:            { top: '#52525e', left: '#1c1c28', right: '#2e2e3a' },
      weakWall:        { top: '#6a5a3a', left: '#3a3020', right: '#504028' },
      exit:            { top: '#1a504a', left: '#0e3430', right: '#143e3a' },
      hazard:          { top: '#5a1a2a', left: '#3c0e1a', right: '#4a1420' },
      interactableOff: { top: '#4a4a1a', left: '#2e2e10', right: '#3a3a14' },
      interactableOn:  { top: '#8a8a1a', left: '#5a5a0e', right: '#6e6e12' },
      itemDot:         '#ffcc00',
      player:          { top: '#00cc44', left: '#008830', right: '#00aa38' },
      enemyChase:      { top: '#cc2222', left: '#881616', right: '#aa1c1c' },
      enemyPatrol:     { top: '#cc6622', left: '#884416', right: '#aa521c' },
      enemyCharger:    { top: '#cccc22', left: '#888816', right: '#aaaa1c' },
      effectFire:      { top: '#cc5500', left: '#882200', right: '#aa3300' },
      effectOil:       'rgba(20, 20, 60, 0.55)',
    },
  },

  open: {
    id: 'open',
    name: 'Cavern',
    tileW: 64,
    tileH: 37,
    wallH: 32,
    entityH: 20,
    sprites: KENNEY_SPRITES,
    colors: {
      floor:           { top: '#4a3828', left: '#332618', right: '#3e2e20' },
      wall:            { top: '#5e4c3c', left: '#2a201a', right: '#3a2c24' },
      weakWall:        { top: '#6a5a3a', left: '#3a3020', right: '#504028' },
      exit:            { top: '#1a4a3a', left: '#0e3026', right: '#142e30' },
      hazard:          { top: '#5a2a1a', left: '#3c1c0e', right: '#4a2214' },
      interactableOff: { top: '#4a3a1a', left: '#2e2510', right: '#3c2e14' },
      interactableOn:  { top: '#8a6a1a', left: '#5a440e', right: '#6e5412' },
      itemDot:         '#ffcc00',
      player:          { top: '#00cc44', left: '#008830', right: '#00aa38' },
      enemyChase:      { top: '#cc3322', left: '#882216', right: '#aa2a1c' },
      enemyPatrol:     { top: '#cc7722', left: '#884e16', right: '#aa621c' },
      enemyCharger:    { top: '#ddcc22', left: '#909016', right: '#b0b01c' },
      effectFire:      { top: '#cc5500', left: '#882200', right: '#aa3300' },
      effectOil:       'rgba(20, 20, 60, 0.55)',
    },
  },

  maze: {
    id: 'maze',
    name: 'Crypt',
    tileW: 64,
    tileH: 37,
    wallH: 36,
    entityH: 20,
    sprites: KENNEY_SPRITES,
    colors: {
      floor:           { top: '#2a2838', left: '#1c1a26', right: '#22202e' },
      wall:            { top: '#3e3c52', left: '#1a1828', right: '#28263c' },
      weakWall:        { top: '#6a5a3a', left: '#3a3020', right: '#504028' },
      exit:            { top: '#1a3a4a', left: '#0e2430', right: '#142e3a' },
      hazard:          { top: '#4a1a3a', left: '#300e26', right: '#3c1430' },
      interactableOff: { top: '#3a3a2a', left: '#26261a', right: '#2e2e20' },
      interactableOn:  { top: '#6a6a2a', left: '#44441a', right: '#545420' },
      itemDot:         '#cc88ff',
      player:          { top: '#00cc44', left: '#008830', right: '#00aa38' },
      enemyChase:      { top: '#cc2244', left: '#881630', right: '#aa1c38' },
      enemyPatrol:     { top: '#8844cc', left: '#5a2e88', right: '#6e38aa' },
      enemyCharger:    { top: '#ccaaff', left: '#887799', right: '#aa88bb' },
      effectFire:      { top: '#cc5500', left: '#882200', right: '#aa3300' },
      effectOil:       'rgba(20, 20, 60, 0.55)',
    },
  },
};

export function getTileset(preset: string): Tileset {
  return TILESETS[preset] ?? TILESETS['default'];
}
