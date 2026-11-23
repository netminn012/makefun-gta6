// input.js — keyboard and mouse state for the game: held keys for movement, one-shot action
// flags for the keys a press (not a hold) should trigger, and mouse-drag camera orbit. The game
// loop reads `keys` every step and consumes actions with takeActions(), so a press is never
// seen twice and never missed between frames.

/** Action bits takeActions() hands out once per press. */
export const ACTION_ENTER = 1; // F or E: enter / leave a car
export const ACTION_ATTACK = 2; // J or Space on foot: shove; Space in a car: handbrake
export const ACTION_PAUSE = 4; // P or Esc: pause / resume
export const ACTION_CONFIRM = 8; // Enter or Space: start, restart, dismiss a screen

/** Create the input reader bound to the window and the canvas the mouse drags on. */
export function createInput(canvas) {
  const keys = new Set();
  let pending = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  // Camera orbit the mouse has dragged for, in radians; the player module owns the base yaw.
  const orbit = { dx: 0, dy: 0 };
  let wheel = 0;

  const ACTION_KEYS = {
    KeyF: ACTION_ENTER,
    KeyE: ACTION_ENTER,
    KeyJ: ACTION_ATTACK,
    Space: ACTION_ATTACK | ACTION_CONFIRM,
    KeyP: ACTION_PAUSE,
    Escape: ACTION_PAUSE,
    Enter: ACTION_CONFIRM,
  };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    const action = ACTION_KEYS[event.code];
    if (action) {
      pending |= action;
      event.preventDefault(); // Space must not scroll the page mid-chase.
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbit.dx += event.clientX - lastX;
    orbit.dy += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
    pending |= ACTION_CONFIRM; // a click also dismisses title and end screens
  });
  canvas.addEventListener('wheel', (event) => {
    wheel += Math.sign(event.deltaY);
    event.preventDefault();
  }, { passive: false });

  return {
    /** Is this KeyboardEvent.code currently held? */
    down: (code) => keys.has(code),
    /** Read and clear the one-shot actions pressed since the last call. */
    takeActions() {
      const actions = pending;
      pending = 0;
      return actions;
    },
    /** Read and clear the mouse drag accumulated since the last call. */
    takeOrbit() {
      const taken = { dx: orbit.dx, dy: orbit.dy, wheel };
      orbit.dx = 0;
      orbit.dy = 0;
      wheel = 0;
      return taken;
    },
  };
}
