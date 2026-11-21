// main.js — The Meridian Heist: the game loop and the rules that tie it all
// together. The thief moves with WASD or the arrow keys, sneaks with Shift,
// and tosses a coin with a mouse click. Steal the Star, reach the green EXIT,
// and never let a guard's cone fill all the way — a full meter means a chase,
// and a chase that catches you ends the floor.

import { TILE, VIEW_W, VIEW_H, parseLevel, moveCircle, inBush, inShadow } from './world.js';
import { createGuard, updateGuard } from './guards.js';
import { drawGame, drawTitle, drawCaught, drawLevelDone, drawWin } from './render.js';
import { createInput } from './input.js';
import { initAudio, sfx } from './audio.js';
import { buildShot } from './shots.js';

const WALK_SPEED = 135;
const SNEAK_SPEED = 68;
const PLAYER_RADIUS = 12;
const NOISE_RADIUS = 115; // how far walking footsteps carry
const COIN_RANGE = 250; // how far a coin can be tossed
const COIN_FLY_TIME = 0.35;
const COIN_HEAR_RADIUS = 155;
const STARTING_COINS = 6;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);

function freshState(levelIndex) {
  const level = parseLevel(levelIndex);
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
    guards: level.guardDefs.map((def) => createGuard(def, level)),
    coins: [],
    pings: [],
    alertFlash: 0,
    animTime: 0,
    time: 0,
    coinsLeft: STARTING_COINS,
    coinsTossed: 0,
    spotted: 0,
    totalTime: 0,
    coinCooldown: 0,
    stepTimer: 0,
    levelDoneTimer: 0,
  };
}

// ---------------------------------------------------------------- screenshot mode

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
if (shotName) {
  const seed = Number(params.get('seed') ?? '1') || 1;
  const shot = buildShot(shotName, seed);
  if (shot) {
    if (shot.phase === 'title') drawTitle(ctx, shot.level);
    else if (shot.phase === 'won') drawWin(ctx, shot);
    else drawGame(ctx, shot);
  } else {
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#d8d2c0';
    ctx.font = '20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`unknown shot: ${shotName}`, VIEW_W / 2, VIEW_H / 2);
  }
  // A shot is one frozen frame: no loop, no clock, no sound.
} else {
  startGame();
}

// ---------------------------------------------------------------- the live game

function startGame() {
  let s = freshState(0);
  s.phase = 'title';
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    s.animTime += dt;
    if (s.alertFlash > 0) s.alertFlash = Math.max(0, s.alertFlash - dt * 1.4);
    s = step(s, dt);
    draw(s);
    requestAnimationFrame(frame);
  }

  function draw(state) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    if (state.phase === 'title') drawTitle(ctx, state.level);
    else if (state.phase === 'caught') {
      drawGame(ctx, state);
      drawCaught(ctx, state);
    } else if (state.phase === 'levelDone') {
      drawGame(ctx, state);
      drawLevelDone(ctx, state);
    } else if (state.phase === 'won') drawWin(ctx, state);
    else drawGame(ctx, state);
  }

  requestAnimationFrame(frame);
}

/** One tick: read input, move the thief, run the guards, check the goals. */
function step(s, dt) {
  const pressed = input.takePressed();
  for (const key of pressed) {
    initAudio();
    if (key === 'enter' && s.phase === 'title') {
      s = Object.assign(s, freshState(0));
      sfx.levelClear();
    } else if (key === 'enter' && s.phase === 'won') {
      s = Object.assign(s, freshState(0));
      s.phase = 'title';
    } else if (key === 'r' && (s.phase === 'caught' || s.phase === 'playing' || s.phase === 'paused')) {
      s = Object.assign(s, freshState(s.levelIndex));
      s.totalTime = 0;
    } else if (key === 'p' && (s.phase === 'playing' || s.phase === 'paused')) {
      s.phase = s.phase === 'playing' ? 'paused' : 'playing';
    }
  }

  // Clicks on the title screen start the game; in play they toss a coin.
  for (const click of input.takeClicks()) {
    initAudio();
    if (s.phase === 'title') {
      s = Object.assign(s, freshState(0));
    } else if (s.phase === 'playing') {
      tossCoin(s, click.x, click.y);
    }
  }

  if (s.phase !== 'playing') return s;
  s.time += dt;
  if (s.coinCooldown > 0) s.coinCooldown -= dt;

  moveThief(s, dt);
  updateCoins(s, dt);
  updatePings(s, dt);

  const events = [];
  for (const guard of s.guards) {
    updateGuard(guard, dt, s.level, thiefView(s), events);
  }
  for (const ev of events) handleGuardEvent(s, ev);

  return checkGoals(s, dt);
}

/** What the guards see of the thief: position, sneak, and hiding places. */
function thiefView(s) {
  return {
    x: s.player.x,
    y: s.player.y,
    sneaking: s.player.sneaking,
    inBush: inBush(s.level, s.player.x, s.player.y),
    inShadow: inShadow(s.level, s.player.x, s.player.y),
  };
}

function moveThief(s, dt) {
  const p = s.player;
  let dx = 0;
  let dy = 0;
  if (input.anyHeld('w', 'arrowup')) dy -= 1;
  if (input.anyHeld('s', 'arrowdown')) dy += 1;
  if (input.anyHeld('a', 'arrowleft')) dx -= 1;
  if (input.anyHeld('d', 'arrowright')) dx += 1;
  if (dx === 0 && dy === 0) return;

  p.sneaking = input.anyHeld('shift');
  const speed = p.sneaking ? SNEAK_SPEED : WALK_SPEED;
  const len = Math.hypot(dx, dy);
  const vx = (dx / len) * speed * dt;
  const vy = (dy / len) * speed * dt;
  p.angle = Math.atan2(vy, vx);
  moveCircle(s.level, p, vx, vy, PLAYER_RADIUS);

  // Footsteps: loud while walking, a whisper while sneaking. A guard close
  // enough to hear walking feet turns toward the sound.
  s.stepTimer -= dt;
  if (s.stepTimer <= 0) {
    s.stepTimer = p.sneaking ? 0.5 : 0.38;
    sfx.step(p.sneaking);
    if (!p.sneaking) {
      for (const guard of s.guards) {
        const d = Math.hypot(guard.x - p.x, guard.y - p.y);
        if (d < NOISE_RADIUS) guard.hearPoint = { x: p.x, y: p.y };
      }
    }
  }
}

function tossCoin(s, tx, ty) {
  if (s.coinsLeft <= 0 || s.coinCooldown > 0) return;
  const dx = tx - s.player.x;
  const dy = ty - s.player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 12) return;
  const reach = Math.min(dist, COIN_RANGE);
  s.coinsLeft -= 1;
  s.coinsTossed += 1;
  s.coinCooldown = 0.7;
  s.coins.push({
    x: s.player.x,
    y: s.player.y,
    fromX: s.player.x,
    fromY: s.player.y,
    toX: s.player.x + (dx / dist) * reach,
    toY: s.player.y + (dy / dist) * reach,
    t: 0,
  });
  sfx.coin();
}

function updateCoins(s, dt) {
  for (const coin of s.coins) {
    coin.t += dt / COIN_FLY_TIME;
    const t = Math.min(1, coin.t);
    coin.x = coin.fromX + (coin.toX - coin.fromX) * t;
    coin.y = coin.fromY + (coin.toY - coin.fromY) * t;
  }
  const landed = s.coins.filter((c) => c.t >= 1);
  s.coins = s.coins.filter((c) => c.t < 1);
  for (const coin of landed) {
    s.pings.push({ x: coin.toX, y: coin.toY, radius: COIN_HEAR_RADIUS, age: 0, life: 0.9 });
    sfx.coinLand();
    for (const guard of s.guards) {
      const d = Math.hypot(guard.x - coin.toX, guard.y - coin.toY);
      if (d < COIN_HEAR_RADIUS) guard.hearPoint = { x: coin.toX, y: coin.toY };
    }
  }
}

function updatePings(s, dt) {
  for (const ping of s.pings) ping.age += dt;
  s.pings = s.pings.filter((p) => p.age < p.life);
}

function handleGuardEvent(s, ev) {
  if (ev === 'alarm') {
    s.spotted += 1;
    s.alertFlash = 1;
    sfx.alarm();
  } else if (ev === 'suspicious') {
    sfx.suspicious();
  } else if (ev === 'caught') {
    s.phase = 'caught';
    sfx.caught();
  } else if (ev && typeof ev === 'object' && 'step' in ev) {
    sfx.guardStep(ev.step, ev.chase);
  }
}

function checkGoals(s, dt) {
  const p = s.player;
  const a = s.level.artifact;
  if (a && !a.taken && Math.hypot(p.x - a.x, p.y - a.y) < 26) {
    a.taken = true;
    sfx.pickup();
  }
  const e = s.level.exit;
  if (a?.taken && Math.hypot(p.x - e.x, p.y - e.y) < 26) {
    if (s.phase === 'playing') {
      s.phase = 'levelDone';
      s.levelDoneTimer = 1.8;
      s.totalTime += s.time;
      sfx.levelClear();
    }
  }
  if (s.phase === 'levelDone') {
    s.levelDoneTimer -= dt;
    if (s.levelDoneTimer <= 0) {
      if (s.levelIndex + 1 < 3) {
        const total = s.totalTime;
        const spotted = s.spotted;
        const tossed = s.coinsTossed;
        s = Object.assign(s, freshState(s.levelIndex + 1));
        s.totalTime = total;
        s.spotted = spotted;
        s.coinsTossed = tossed;
      } else {
        s.phase = 'won';
        sfx.win();
      }
    }
  }
  return s;
}
