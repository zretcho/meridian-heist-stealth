// render.js — everything the player sees, drawn on one canvas.
// No images: floor tiles, walls, crates, bushes, guards and the thief are all
// painted from shapes. Vision cones are translucent wedges whose colour shows
// the guard's mood: pale yellow on patrol, orange when suspicious, red in a chase.

import { COLS, ROWS, TILE, VIEW_W, VIEW_H } from './world.js';
import { VIEW_HALF_ANGLE, VIEW_RANGE } from './guards.js';

const FLOOR_A = '#23202c';
const FLOOR_B = '#201d29';
const WALL_TOP = '#4a4360';
const WALL_FACE = '#322e44';
const CRATE = '#6b4f2a';
const CRATE_EDGE = '#8a6a38';
const BUSH = '#2c4a26';
const BUSH_LIGHT = '#3f6632';
const EXIT_GREEN = '#3ddc78';
const GOLD = '#e8c96a';

/** Paint the whole frame for a live game state. */
export function drawGame(ctx, s) {
  drawFloor(ctx, s.level);
  drawShadows(ctx, s.level);
  drawArtifact(ctx, s.level, s);
  drawCover(ctx, s.level);
  drawExit(ctx, s.level, s);
  drawCoins(ctx, s);
  drawGuards(ctx, s);
  drawThief(ctx, s);
  drawPings(ctx, s);
  if (s.phase === 'playing' || s.phase === 'paused') drawHud(ctx, s);
  if (s.phase === 'paused') drawPaused(ctx);
  if (s.alertFlash > 0) {
    ctx.fillStyle = `rgba(200, 30, 30, ${Math.min(0.22, s.alertFlash * 0.2)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawFloor(ctx, level) {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
  // Faint carpet runner down the middle halls, for a museum feel.
  ctx.fillStyle = 'rgba(120, 40, 50, 0.16)';
  ctx.fillRect(0, 9 * TILE + 6, VIEW_W, TILE - 12);
  ctx.fillRect(0, 4 * TILE + 6, VIEW_W, TILE - 12);
}

function drawShadows(ctx, level) {
  for (const s of level.shadows) {
    ctx.fillStyle = 'rgba(4, 6, 16, 0.55)';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = 'rgba(140, 160, 220, 0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
  }
}

function drawExit(ctx, level, s) {
  const e = level.exit;
  const pulse = 0.65 + 0.35 * Math.sin((s.animTime ?? 0) * 3);
  ctx.save();
  ctx.shadowColor = EXIT_GREEN;
  ctx.shadowBlur = 18 * pulse;
  ctx.fillStyle = '#0d2b18';
  ctx.fillRect(e.x - 15, e.y - 15, 30, 30);
  ctx.fillStyle = EXIT_GREEN;
  ctx.font = 'bold 15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', e.x, e.y);
  ctx.restore();
}

function drawArtifact(ctx, level, s) {
  const a = level.artifact;
  if (!a || a.taken) return;
  const bob = Math.sin((s.animTime ?? 0) * 2.2) * 3;
  ctx.save();
  ctx.translate(a.x, a.y + bob);
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 16;
  ctx.fillStyle = GOLD;
  drawStar(ctx, 0, 0, 5, 13, 6);
  ctx.restore();
  ctx.fillStyle = 'rgba(232, 201, 106, 0.9)';
  ctx.font = '11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('THE MERIDIAN STAR', a.x, a.y + 24 + bob);
}

function drawStar(ctx, cx, cy, spikes, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / spikes - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawCover(ctx, level) {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = level.grid[y][x];
      const px = x * TILE;
      const py = y * TILE;
      if (ch === '#') {
        ctx.fillStyle = WALL_FACE;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = WALL_TOP;
        ctx.fillRect(px, py, TILE, 6);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      } else if (ch === 'C') {
        ctx.fillStyle = CRATE;
        ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
        ctx.strokeStyle = CRATE_EDGE;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 3, py + 3, TILE - 6, TILE - 6);
        ctx.beginPath();
        ctx.moveTo(px + 3, py + 3);
        ctx.lineTo(px + TILE - 3, py + TILE - 3);
        ctx.moveTo(px + TILE - 3, py + 3);
        ctx.lineTo(px + 3, py + TILE - 3);
        ctx.stroke();
        ctx.lineWidth = 1;
      } else if (ch === 'B') {
        ctx.fillStyle = BUSH;
        ctx.beginPath();
        ctx.arc(px + 10, py + 12, 9, 0, Math.PI * 2);
        ctx.arc(px + 21, py + 10, 10, 0, Math.PI * 2);
        ctx.arc(px + 16, py + 21, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = BUSH_LIGHT;
        ctx.beginPath();
        ctx.arc(px + 12, py + 11, 4, 0, Math.PI * 2);
        ctx.arc(px + 22, py + 18, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawCoins(ctx, s) {
  for (const c of s.coins) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = '#d8b64a';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a6a20';
    ctx.stroke();
    ctx.restore();
  }
}

function coneColour(guard) {
  if (guard.state === 'chase') return 'rgba(220, 50, 40, 0.34)';
  if (guard.state === 'suspicious') return 'rgba(235, 140, 40, 0.30)';
  return 'rgba(240, 210, 90, 0.20)';
}

function drawGuards(ctx, s) {
  for (const g of s.guards) {
    // Vision cone.
    ctx.fillStyle = coneColour(g);
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.arc(g.x, g.y, VIEW_RANGE, g.angle - VIEW_HALF_ANGLE, g.angle + VIEW_HALF_ANGLE);
    ctx.closePath();
    ctx.fill();
    // Body: a night guard in a dark blue coat, facing his patrol direction.
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.angle);
    ctx.fillStyle = '#2e4a7a';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8d2c0';
    ctx.beginPath();
    ctx.arc(8, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c2f52';
    ctx.fillRect(10, -3, 8, 6);
    ctx.restore();
    // Detection ring over his head while he grows suspicious.
    if (g.detection > 0.05) {
      const frac = g.detection;
      ctx.strokeStyle = frac >= 1 ? '#ff4030' : frac >= 0.45 ? '#ff9a2a' : '#e8d24a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(g.x, g.y - 20, 9, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      if (frac >= 0.45) {
        ctx.fillStyle = frac >= 1 ? '#ff4030' : '#ff9a2a';
        ctx.font = 'bold 13px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(frac >= 1 ? '!' : '?', g.x, g.y - 32);
      }
    }
  }
}

function drawThief(ctx, s) {
  const p = s.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Soft shadow underfoot so the thief reads against the floor.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  ctx.fillStyle = '#20242e';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c96a';
  ctx.beginPath();
  ctx.arc(7, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242e';
  ctx.fillRect(9, -3, 7, 6);
  ctx.restore();
  if (p.sneaking) {
    ctx.fillStyle = 'rgba(216, 210, 192, 0.75)';
    ctx.font = '11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('sneaking', p.x, p.y - 20);
  }
}

function drawPings(ctx, s) {
  for (const ping of s.pings) {
    const age = ping.age / ping.life;
    ctx.strokeStyle = `rgba(232, 201, 106, ${1 - age})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ping.x, ping.y, 8 + age * ping.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function drawHud(ctx, s) {
  // Top bar.
  ctx.fillStyle = 'rgba(8, 8, 14, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, 34);
  ctx.fillStyle = '#e8c96a';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.level.name, 12, 17);
  ctx.fillStyle = '#d8d2c0';
  ctx.font = '13px Georgia, serif';
  const objective = s.level.artifact.taken
    ? 'Reach the green EXIT — unseen'
    : 'Steal the Meridian Star, then reach the EXIT';
  ctx.fillText(objective, 250, 17);
  // Detection meter: the highest guard's suspicion.
  const worst = Math.max(0, ...s.guards.map((g) => g.detection));
  ctx.fillStyle = '#3a3548';
  ctx.fillRect(700, 9, 130, 16);
  ctx.fillStyle = worst >= 1 ? '#ff4030' : worst >= 0.45 ? '#ff9a2a' : '#e8d24a';
  ctx.fillRect(700, 9, 130 * worst, 16);
  ctx.strokeStyle = '#8f887a';
  ctx.strokeRect(700.5, 9.5, 130, 16);
  ctx.fillStyle = '#d8d2c0';
  ctx.font = '12px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('SEEN', 668, 17);
  // Coins and clock.
  ctx.textAlign = 'right';
  ctx.fillText(`coins ${s.coinsLeft}   ${formatTime(s.time)}`, VIEW_W - 12, 17);
  ctx.textAlign = 'left';
  // Bottom hint line, only while playing.
  if (s.phase === 'playing') {
    ctx.fillStyle = 'rgba(216, 210, 192, 0.75)';
    ctx.font = '12px Georgia, serif';
    ctx.fillText(
      'Shift: sneak   Click: toss a coin   R: restart   P: pause',
      12,
      VIEW_H - 12,
    );
  }
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Dark overlay panel used by the menu screens. */
function panel(ctx, title, lines, accent) {
  ctx.fillStyle = 'rgba(6, 6, 12, 0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = accent;
  ctx.font = 'bold 44px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, VIEW_W / 2, 190);
  ctx.fillStyle = '#d8d2c0';
  ctx.font = '17px Georgia, serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, VIEW_W / 2, 260 + i * 30);
  });
}

export function drawTitle(ctx, level) {
  drawFloor(ctx, level);
  drawCover(ctx, level);
  drawExit(ctx, level, { animTime: 0 });
  panel(
    ctx,
    'THE MERIDIAN HEIST',
    [
      'A quiet thief. A sleeping museum. Three floors of guards.',
      level.briefing,
      '',
      'WASD / arrows to move · Shift to sneak · Click to toss a coin',
      'Hide in the bushes. Mind the yellow cones. Take the Star, reach the EXIT.',
      '',
      'Press ENTER or click to begin',
    ],
    GOLD,
  );
}

export function drawCaught(ctx, s) {
  panel(
    ctx,
    'CAUGHT!',
    [
      'A guard laid a hand on your shoulder. The Star stays in its case.',
      `${s.level.name} · spotted ${s.spotted} time${s.spotted === 1 ? '' : 's'} · ${formatTime(s.time)}`,
      '',
      'Press R to try the floor again',
    ],
    '#ff5040',
  );
}

export function drawLevelDone(ctx, s) {
  panel(
    ctx,
    'FLOOR CLEARED',
    [
      `${s.level.name} — out the door, Star in hand.`,
      `Time ${formatTime(s.time)} · spotted ${s.spotted} time${s.spotted === 1 ? '' : 's'}`,
      '',
      'Get ready for the next floor…',
    ],
    EXIT_GREEN,
  );
}

export function drawWin(ctx, s) {
  panel(
    ctx,
    'THE HEIST IS DONE',
    [
      'Three floors. Six guards outwitted. The Meridian Star is yours.',
      `Total time ${formatTime(s.totalTime)} · spotted ${s.spotted} times · coins tossed ${s.coinsTossed}`,
      '',
      'Press ENTER to play again',
    ],
    GOLD,
  );
}

function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(6, 6, 12, 0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#d8d2c0';
  ctx.font = 'bold 32px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED — press P to continue', VIEW_W / 2, VIEW_H / 2);
}
