// world.js — the museum floors: tile maps, level data, and line-of-sight.
// One level is a grid of characters plus patrol routes and shadow patches.
//   '#' wall      '.' floor     'C' crate (solid, blocks sight)
//   'B' bush      'P' player    'E' exit      'A' the Meridian Star

export const TILE = 32;
export const COLS = 30;
export const ROWS = 20;
export const VIEW_W = COLS * TILE; // 960
export const VIEW_H = ROWS * TILE; // 640

/** A tiny seeded generator so a level can shuffle small details deterministically. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const L1_MAP = [
  '##############################',
  '#P....#.......#......#......E#',
  '#.....#.......#......#.......#',
  '#.C...#...B...#..C...#...B...#',
  '#.....#.......#......#.......#',
  '#.....#.......#......#.......#',
  '#.####....####....####.......#',
  '#............................#',
  '#....B.......C........B......#',
  '#............................#',
  '#.####....####....####.......#',
  '#............................#',
  '#.....#.......#......#...C...#',
  '#.C...#...B...#..C...#.......#',
  '#.....#.......#......#.......#',
  '#.....#.......#......#.......#',
  '#.####....####....####.......#',
  '#............................#',
  '#.......A....................#',
  '##############################',
];

const L2_MAP = [
  '##############################',
  '#P.....#.......#......#.....E#',
  '#......#.......#......#......#',
  '#..C...#...B...#..C...#..B...#',
  '#............................#',
  '#......#.......#......#......#',
  '#..B...#.......#..C...#......#',
  '#......#.......#......#..B...#',
  '#....C.........C.........C...#',
  '#............................#',
  '#......#.......#......#......#',
  '#..C...#...B...#......#..C...#',
  '#......#.......#..B...#......#',
  '#............................#',
  '#......#.......#......#......#',
  '#..B...#.......#......#..B...#',
  '#......#.......#......#......#',
  '#............................#',
  '#.........A..................#',
  '##############################',
];

const L3_MAP = [
  '##############################',
  '#P....#.......#......#......E#',
  '#.....#.......#......#.......#',
  '#.C...#...B...#..C...#...B...#',
  '#.....#.......#......#.......#',
  '#.....#.......#......#.......#',
  '#............................#',
  '#....B.......C........B......#',
  '#............................#',
  '#..C....#...B....#....C......#',
  '#.......#.......#............#',
  '#.......#.......#....B.......#',
  '#............................#',
  '#.....#.......#......#.......#',
  '#.C...#...B...#..C...#...B...#',
  '#.....#.......#......#.......#',
  '#.....#.......#......#.......#',
  '#............................#',
  '#......A.....................#',
  '##############################',
];

/**
 * The three floors of the Meridian Gallery. Each guard patrols a list of tile
 * waypoints; the route must stay on walkable tiles (checked by validateLevels).
 * Shadows are tile rectangles where a thief is harder to spot.
 */
export const LEVELS = [
  {
    name: 'Floor 1 — The Foyer',
    briefing: 'One guard walks the middle hall. Learn his rhythm, then slip past.',
    map: L1_MAP,
    guards: [{ waypoints: [[2, 9], [27, 9]], speed: 52 }],
    shadows: [
      { x: 1, y: 1, w: 4, h: 2 },
      { x: 24, y: 15, w: 5, h: 3 },
    ],
  },
  {
    name: 'Floor 2 — The Gallery',
    briefing: 'Two guards now, and their patrols cross. Bushes hide you; coins distract.',
    map: L2_MAP,
    guards: [
      { waypoints: [[2, 4], [27, 4]], speed: 58 },
      { waypoints: [[11, 2], [11, 17]], speed: 50 },
    ],
    shadows: [
      { x: 2, y: 6, w: 4, h: 2 },
      { x: 23, y: 13, w: 5, h: 3 },
    ],
  },
  {
    name: 'Floor 3 — The Vault Wing',
    briefing: 'Three guards, tight halls. Take the Star and vanish through the exit.',
    map: L3_MAP,
    guards: [
      { waypoints: [[2, 6], [27, 6]], speed: 62 },
      { waypoints: [[27, 13], [2, 13]], speed: 62 },
      { waypoints: [[15, 2], [15, 17]], speed: 56 },
    ],
    shadows: [
      { x: 2, y: 2, w: 3, h: 3 },
      { x: 24, y: 15, w: 5, h: 2 },
    ],
  },
];

/** Pixel centre of a tile. */
export function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

/** Turn one level definition into a live level object. */
export function parseLevel(index) {
  const def = LEVELS[index];
  const grid = def.map.map((row) => row.split(''));
  let player = null;
  let exit = null;
  let artifact = null;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = grid[y][x];
      if (ch === 'P') {
        player = tileCenter(x, y);
        grid[y][x] = '.';
      } else if (ch === 'E') {
        exit = { ...tileCenter(x, y), tx: x, ty: y };
        grid[y][x] = '.';
      } else if (ch === 'A') {
        artifact = { ...tileCenter(x, y), tx: x, ty: y, taken: false };
        grid[y][x] = '.';
      }
    }
  }
  return {
    index,
    name: def.name,
    briefing: def.briefing,
    grid,
    player,
    exit,
    artifact,
    guardDefs: def.guards,
    shadows: def.shadows.map((s) => ({
      x: s.x * TILE,
      y: s.y * TILE,
      w: s.w * TILE,
      h: s.h * TILE,
    })),
  };
}

/** The character at a tile; outside the map counts as wall. */
export function tileAt(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
  return level.grid[ty][tx];
}

/** A tile a body cannot walk through: wall or crate. */
export function isSolid(level, tx, ty) {
  const ch = tileAt(level, tx, ty);
  return ch === '#' || ch === 'C';
}

/** A tile that blocks a guard's eyes: wall or crate (bushes do not). */
export function blocksSight(level, tx, ty) {
  return isSolid(level, tx, ty);
}

/** Whether a pixel point sits inside a bush (a hiding spot). */
export function inBush(level, x, y) {
  return tileAt(level, Math.floor(x / TILE), Math.floor(y / TILE)) === 'B';
}

/** Whether a pixel point sits inside a shadow patch (harder to spot). */
export function inShadow(level, x, y) {
  return level.shadows.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
}

/**
 * Line of sight between two pixel points: sample along the segment and fail
 * as soon as a sample lands inside a sight-blocking tile.
 */
export function hasLineOfSight(level, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor((x0 + dx * t) / TILE);
    const ty = Math.floor((y0 + dy * t) / TILE);
    if (blocksSight(level, tx, ty)) return false;
  }
  return true;
}

/**
 * Slide a circle (the player) against solid tiles: move one axis at a time so
 * the body glides along walls instead of sticking to them.
 */
export function moveCircle(level, body, dx, dy, radius) {
  const nx = body.x + dx;
  if (!circleHitsSolid(level, nx, body.y, radius)) body.x = nx;
  const ny = body.y + dy;
  if (!circleHitsSolid(level, body.x, ny, radius)) body.y = ny;
}

function circleHitsSolid(level, x, y, radius) {
  const x0 = Math.floor((x - radius) / TILE);
  const x1 = Math.floor((x + radius) / TILE);
  const y0 = Math.floor((y - radius) / TILE);
  const y1 = Math.floor((y + radius) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isSolid(level, tx, ty)) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      const ddx = x - cx;
      const ddy = y - cy;
      if (ddx * ddx + ddy * ddy < radius * radius) return true;
    }
  }
  return false;
}

/**
 * Developer check: every row is COLS wide, the map is ROWS tall, the player
 * can reach the Star and the exit on foot, and every patrol waypoint is
 * walkable and reachable from the player start. Run with node to fail loudly
 * instead of shipping a broken floor.
 */
export function validateLevels() {
  const problems = [];
  for (let li = 0; li < LEVELS.length; li++) {
    const def = LEVELS[li];
    if (def.map.length !== ROWS) problems.push(`L${li + 1}: ${def.map.length} rows, want ${ROWS}`);
    def.map.forEach((row, y) => {
      if (row.length !== COLS) problems.push(`L${li + 1} row ${y}: ${row.length} chars, want ${COLS}`);
    });
    const level = parseLevel(li);
    const reach = reachableTiles(level);
    const key = (tx, ty) => `${tx},${ty}`;
    if (!reach.has(key(level.artifact.tx, level.artifact.ty))) {
      problems.push(`L${li + 1}: Star is unreachable`);
    }
    if (!reach.has(key(level.exit.tx, level.exit.ty))) {
      problems.push(`L${li + 1}: exit is unreachable`);
    }
    for (const g of def.guards) {
      for (const [wx, wy] of g.waypoints) {
        if (isSolid(level, wx, wy)) problems.push(`L${li + 1}: patrol waypoint (${wx},${wy}) is solid`);
        if (!reach.has(key(wx, wy))) problems.push(`L${li + 1}: patrol waypoint (${wx},${wy}) is unreachable`);
      }
    }
  }
  return problems;
}

function reachableTiles(level) {
  const seen = new Set();
  const startTx = Math.floor(level.player.x / TILE);
  const startTy = Math.floor(level.player.y / TILE);
  const queue = [[startTx, startTy]];
  seen.add(`${startTx},${startTy}`);
  while (queue.length > 0) {
    const [tx, ty] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (isSolid(level, nx, ny)) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}
