// audio.js — every sound is synthesized with WebAudio: no audio files.
// A short envelope helper keeps each effect to a few lines, and nothing
// plays until the player first presses a key or clicks (browsers require a
// gesture before sound). All calls are safe before init: they no-op.

let ctx = null;
let master = null;

function ensure() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    return true;
  } catch {
    return false;
  }
}

/** Call from the first key or click so later effects have a context. */
export function initAudio() {
  if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

/** One oscillator note with a quick fade. */
function tone(freq, dur, type, vol, when = 0, slideTo = null) {
  if (!ensure()) return;
  try {
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch {
    // Sound is garnish; a failure must never break the game.
  }
}

export const sfx = {
  /** A soft step; quieter and lower while sneaking. */
  step(sneaking, volume = 1) {
    tone(sneaking ? 110 : 170, 0.06, 'triangle', 0.25 * volume);
  },
  /** A guard's step, heard from a distance: volume falls with range. */
  guardStep(volume, chasing) {
    tone(chasing ? 150 : 120, 0.07, 'sine', 0.3 * volume);
  },
  /** The metallic clink of a tossed coin. */
  coin() {
    tone(2100, 0.09, 'square', 0.12);
    tone(2600, 0.12, 'square', 0.1, 0.07);
  },
  /** A coin landing: a short ping that draws a guard's ear. */
  coinLand() {
    tone(1400, 0.25, 'sine', 0.2, 0, 900);
  },
  /** A guard's head turns: two rising notes. */
  suspicious() {
    tone(520, 0.12, 'sine', 0.22);
    tone(660, 0.16, 'sine', 0.22, 0.11);
  },
  /** The alarm: a sharp three-note sting. */
  alarm() {
    tone(880, 0.14, 'sawtooth', 0.22);
    tone(740, 0.14, 'sawtooth', 0.22, 0.13);
    tone(980, 0.22, 'sawtooth', 0.26, 0.26);
  },
  /** The Star leaves its case: a bright little arpeggio. */
  pickup() {
    tone(660, 0.12, 'sine', 0.25);
    tone(880, 0.12, 'sine', 0.25, 0.09);
    tone(1320, 0.22, 'sine', 0.25, 0.18);
  },
  /** A floor cleared: a warm major run. */
  levelClear() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.22, i * 0.1));
  },
  /** The whole heist done. */
  win() {
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.24, 'triangle', 0.22, i * 0.11));
  },
  /** Caught: a low falling thud. */
  caught() {
    tone(220, 0.5, 'sawtooth', 0.25, 0, 70);
    tone(110, 0.6, 'triangle', 0.2, 0.05, 55);
  },
};
