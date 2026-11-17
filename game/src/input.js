// Keyboard and mouse input for Solara City. Held keys are read every frame;
// single presses are queued and consumed by the game loop once.
import { KEYS } from './config.js';

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const input = {
    dragDX: 0,
    dragDY: 0,
    mouseDown: false,
    mouseClicked: false,
  };
  let dragging = false;

  function isDown(list) {
    for (const code of list) if (keys.has(code)) return true;
    return false;
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    input.mouseDown = true;
    input.mouseClicked = true;
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    input.mouseDown = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    input.dragDX += e.movementX || 0;
    input.dragDY += e.movementY || 0;
  });

  /** Snapshot of held movement keys for this frame. */
  input.read = function read() {
    return {
      up: isDown(KEYS.up),
      down: isDown(KEYS.down),
      left: isDown(KEYS.left),
      right: isDown(KEYS.right),
      jump: isDown(KEYS.jump),
      run: isDown(KEYS.run),
      handbrake: isDown(KEYS.jump),
      shootKey: isDown(KEYS.shoot),
    };
  };

  /** True once for the frame the key was pressed. */
  input.wasPressed = function wasPressed(code) {
    return pressed.has(code);
  };

  input.wasPressedAny = function wasPressedAny(list) {
    for (const code of list) if (pressed.has(code)) return true;
    return false;
  };

  /** Consume the camera drag accumulated since the last frame. */
  input.consumeDrag = function consumeDrag() {
    const d = { dx: input.dragDX, dy: input.dragDY };
    input.dragDX = 0;
    input.dragDY = 0;
    return d;
  };

  input.consumeClick = function consumeClick() {
    const c = input.mouseClicked;
    input.mouseClicked = false;
    return c;
  };

  /** Call at the end of each frame so presses fire exactly once. */
  input.endFrame = function endFrame() {
    pressed.clear();
  };

  return input;
}
