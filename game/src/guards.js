// guards.js — the museum guards: patrols, vision cones, suspicion and chase.
// A guard lives in one of four states:
//   patrol     walks his waypoints, pausing at each end
//   suspicious walks to the last thing that caught his eye and looks around
//   chase      runs at the thief he can see (or just saw)
//   return     walks back to his patrol route after losing the trail
// Detection is a meter per guard (0..1). It fills while the thief is inside
// the cone and drains when hidden. Half full makes a guard suspicious; full
// sounds the alarm and starts the chase.

import { TILE, hasLineOfSight, tileCenter } from './world.js';

export const VIEW_RANGE = 178; // pixels a guard can see, in the open
export const VIEW_HALF_ANGLE = (Math.PI * 75) / 360; // 75 degree cone, half is 37.5
export const PATROL_PAUSE = 0.7; // seconds a guard waits at each waypoint
export const SUSPICION_AT = 0.45; // detection level that turns a head
export const ALARM_AT = 1.0; // detection level that starts a chase
export const CHASE_SPEED = 118;
export const LOSE_SIGHT_AFTER = 2.6; // seconds unseen in a chase before giving up
export const CATCH_DISTANCE = 22; // pixels: the guard lays a hand on the thief

/** Build a live guard from one patrol definition. */
export function createGuard(def, level) {
  const [sx, sy] = def.waypoints[0];
  const start = tileCenter(sx, sy);
  const [nx, ny] = def.waypoints[1] ?? def.waypoints[0];
  const next = tileCenter(nx, ny);
  return {
    x: start.x,
    y: start.y,
    angle: Math.atan2(next.y - start.y, next.x - start.x),
    patrolSpeed: def.speed ?? 55,
    waypoints: def.waypoints.map(([wx, wy]) => tileCenter(wx, wy)),
    wpIndex: 1 % def.waypoints.length,
    waitTimer: 0,
    state: 'patrol',
    detection: 0,
    lastSeen: null,
    lookTimer: 0,
    lostTimer: 0,
    hearPoint: null,
    stepTimer: 0,
  };
}

/** Smallest signed turn from angle `from` to angle `to`. */
function angleDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Can this guard see the thief right now? The thief must be inside the
 * range, inside the cone, and in a clear line of sight. Returns the distance
 * when seen, so the caller can scale how fast detection fills.
 */
export function guardSeesThief(guard, level, thief) {
  const dx = thief.x - guard.x;
  const dy = thief.y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > VIEW_RANGE) return { seen: false, dist };
  const toThief = Math.atan2(dy, dx);
  if (Math.abs(angleDelta(guard.angle, toThief)) > VIEW_HALF_ANGLE) {
    return { seen: false, dist };
  }
  if (!hasLineOfSight(level, guard.x, guard.y, thief.x, thief.y)) {
    return { seen: false, dist };
  }
  return { seen: true, dist };
}

/**
 * How fast detection fills while the thief is seen: near is far worse than
 * far, sneaking halves it, and bushes and shadows hide the thief further.
 * Returns a per-second rate.
 */
export function detectionRate(guard, thief, seen) {
  if (!seen.seen) return 0;
  const closeness = 1 - seen.dist / (VIEW_RANGE + 40);
  let rate = 0.55 + closeness * 1.5;
  if (thief.sneaking) rate *= 0.55;
  if (thief.inBush) rate *= 0.25;
  if (thief.inShadow) rate *= 0.55;
  return rate;
}

/** Step the guard one frame. `events` collects sounds the game should play. */
export function updateGuard(guard, dt, level, thief, events) {
  const seen = guardSeesThief(guard, level, thief);
  const was = guard.detection;

  if (seen.seen) {
    guard.detection = Math.min(1, guard.detection + detectionRate(guard, thief, seen) * dt);
    guard.lastSeen = { x: thief.x, y: thief.y };
    guard.lostTimer = 0;
  } else {
    guard.detection = Math.max(0, guard.detection - 0.45 * dt);
  }

  if (guard.detection >= ALARM_AT && guard.state !== 'chase') {
    guard.state = 'chase';
    guard.lostTimer = 0;
    events.push('alarm');
  } else if (
    guard.detection >= SUSPICION_AT &&
    (guard.state === 'patrol' || guard.state === 'return')
  ) {
    guard.state = 'suspicious';
    guard.lookTimer = 0;
    events.push('suspicious');
  }

  if (guard.hearPoint && guard.state === 'patrol') {
    guard.state = 'suspicious';
    guard.lastSeen = { ...guard.hearPoint };
    guard.hearPoint = null;
    guard.lookTimer = 0;
  }

  switch (guard.state) {
    case 'patrol':
      walkRoute(guard, dt, guard.patrolSpeed);
      break;
    case 'suspicious': {
      const target = guard.lastSeen ?? guard.waypoints[guard.wpIndex];
      if (moveToward(guard, target, 82, dt)) {
        guard.lookTimer += dt;
        guard.angle += Math.sin(guard.lookTimer * 2.4) * 1.6 * dt;
        if (guard.lookTimer > 1.6) {
          guard.state = 'return';
          guard.detection = Math.max(0, guard.detection - 0.2);
        }
      }
      break;
    }
    case 'chase': {
      const target = seen.seen ? { x: thief.x, y: thief.y } : guard.lastSeen;
      if (!seen.seen) {
        guard.lostTimer += dt;
        if (guard.lostTimer > LOSE_SIGHT_AFTER) {
          guard.state = 'suspicious';
          guard.lookTimer = 0;
          guard.detection = SUSPICION_AT;
        }
      }
      if (target) moveToward(guard, target, CHASE_SPEED, dt);
      const d = Math.hypot(thief.x - guard.x, thief.y - guard.y);
      if (d < CATCH_DISTANCE) events.push('caught');
      break;
    }
    case 'return': {
      const home = nearestWaypoint(guard);
      if (moveToward(guard, home, guard.patrolSpeed, dt)) {
        guard.state = 'patrol';
        guard.wpIndex = guard.waypoints.indexOf(home);
      }
      break;
    }
  }

  // Footsteps: a soft tick the player can track by ear.
  guard.stepTimer -= dt;
  if (guard.stepTimer <= 0 && (guard.state === 'patrol' || guard.state === 'chase')) {
    guard.stepTimer = 0.55;
    const d = Math.hypot(thief.x - guard.x, thief.y - guard.y);
    if (d < 320) events.push({ step: Math.max(0, 1 - d / 320), chase: guard.state === 'chase' });
  }

  return was;
}

/** Walk the patrol loop, pausing briefly at each waypoint. */
function walkRoute(guard, dt, speed) {
  if (guard.waitTimer > 0) {
    guard.waitTimer -= dt;
    return;
  }
  const target = guard.waypoints[guard.wpIndex];
  if (moveToward(guard, target, speed, dt)) {
    guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
    guard.waitTimer = PATROL_PAUSE;
  }
}

/**
 * Step toward a point at a speed, turning to face the walk direction.
 * Returns true when the point is reached this frame.
 */
function moveToward(guard, target, speed, dt) {
  const dx = target.x - guard.x;
  const dy = target.y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 3) return true;
  const step = Math.min(dist, speed * dt);
  guard.x += (dx / dist) * step;
  guard.y += (dy / dist) * step;
  const want = Math.atan2(dy, dx);
  guard.angle += angleDelta(guard.angle, want) * Math.min(1, 10 * dt);
  return dist - step < 3;
}

function nearestWaypoint(guard) {
  let best = guard.waypoints[0];
  let bestD = Infinity;
  for (const wp of guard.waypoints) {
    const d = Math.hypot(wp.x - guard.x, wp.y - guard.y);
    if (d < bestD) {
      bestD = d;
      best = wp;
    }
  }
  return best;
}
