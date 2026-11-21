// input.js — keyboard and mouse, translated into game intent.
// The game reads `keys` every frame for movement; single presses (restart,
// pause, start) arrive through `pressed`, a queue the game drains once.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = [];
  const clicks = [];

  const GAME_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    ' ',
    'w',
    'a',
    's',
    'd',
    'W',
    'A',
    'S',
    'D',
  ]);

  function keyName(e) {
    return e.key.toLowerCase();
  }

  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.key)) e.preventDefault();
    const k = keyName(e);
    if (!e.repeat) pressed.push(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(keyName(e));
  });
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    clicks.push({ x, y });
  });

  return {
    keys,
    /** Take and clear every key pressed since the last call. */
    takePressed() {
      return pressed.splice(0, pressed.length);
    },
    /** Take and clear every click since the last call. */
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
    /** Is any of these keys held right now? */
    anyHeld(...names) {
      return names.some((n) => keys.has(n));
    },
  };
}
