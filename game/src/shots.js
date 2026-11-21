// shots.js — deterministic scenes for the screenshots.
// ?shot=start|play|alert|win&seed=1 renders one frozen moment: no clock, no
// animation time, no randomness beyond the seed, so the same URL always
// paints the same frame. The cover (start) is the title over the first floor.

import { parseLevel, tileCenter } from './world.js';
import { createGuard } from './guards.js';

/** The four shots the maker takes, in the order they are filed. */
export const SHOT_NAMES = ['start', 'play', 'alert', 'win'];

function baseState(levelIndex, seed) {
  const level = parseLevel(levelIndex);
  const guards = level.guardDefs.map((def) => createGuard(def, level));
  return {
    phase: 'playing',
    level,
    levelIndex,
    player: {
      x: level.player.x,
      y: level.player.y,
      angle: 0,
      sneaking: false,
    },
    guards,
    coins: [],
    pings: [],
    alertFlash: 0,
    animTime: 0.7,
    time: 0,
    coinsLeft: 6,
    coinsTossed: 0,
    spotted: 0,
    totalTime: 0,
    seed,
  };
}

/**
 * Build the frozen state for one shot. Every position is fixed in the code,
 * so the render depends only on the shot name (and the seed, kept for the
 * record) — never on the time the page was opened.
 */
export function buildShot(shot, seed = 1) {
  if (shot === 'start') {
    const s = baseState(0, seed);
    s.phase = 'title';
    return s;
  }
  if (shot === 'play') {
    const s = baseState(0, seed);
    // Mid-heist: the thief sneaks behind a crate in the middle hall while the
    // guard's cone sweeps toward him; a tossed coin pings on the floor.
    const p = tileCenter(13, 9);
    s.player.x = p.x;
    s.player.y = p.y;
    s.player.angle = Math.PI;
    s.player.sneaking = true;
    const g = s.guards[0];
    const gp = tileCenter(20, 9);
    g.x = gp.x;
    g.y = gp.y;
    g.angle = Math.PI;
    g.detection = 0.32;
    g.state = 'patrol';
    const coin = tileCenter(17, 9);
    s.pings.push({ x: coin.x, y: coin.y, radius: 150, age: 0.45, life: 0.9 });
    s.coinsLeft = 5;
    s.coinsTossed = 1;
    s.time = 47;
    return s;
  }
  if (shot === 'alert') {
    const s = baseState(0, seed);
    // Nearly caught: the thief is out in the open, the guard is charging in
    // with a full detection ring and a red cone.
    const p = tileCenter(15, 9);
    s.player.x = p.x;
    s.player.y = p.y;
    s.player.angle = Math.PI;
    s.player.sneaking = false;
    const g = s.guards[0];
    const gp = tileCenter(19, 9);
    g.x = gp.x;
    g.y = gp.y;
    g.angle = Math.PI;
    g.detection = 1;
    g.state = 'chase';
    s.alertFlash = 1;
    s.spotted = 1;
    s.time = 83;
    return s;
  }
  if (shot === 'win') {
    const s = baseState(2, seed);
    // The heist done: the Star taken, the thief at the exit, final tally.
    s.phase = 'won';
    s.level.artifact.taken = true;
    const p = tileCenter(27, 1);
    s.player.x = p.x;
    s.player.y = p.y;
    s.player.angle = 0;
    s.totalTime = 247;
    s.spotted = 2;
    s.coinsTossed = 3;
    return s;
  }
  return null;
}
