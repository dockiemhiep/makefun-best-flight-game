// Keyboard & pointer input for SKYWARD RINGS.
// Continuous flight surfaces (pitch, roll, throttle, brake), UI one-shot actions,
// and tick-retained gear/flaps press queues so fast render frames never drop commands.

export const ACT_CONFIRM = 1;
export const ACT_PAUSE = 2;
export const ACT_GEAR = 4;
export const ACT_FLAPS = 8;
export const ACT_CAM = 16;
export const ACT_INVERT = 32;
export const ACT_MUTE = 64;
export const ACT_RESTART = 128;
export const ACT_TITLE = 256;

export function createInput(canvas, clientToLogical) {
  const held = new Set();
  let actions = 0;
  let gearPresses = 0;
  let flapPresses = 0;
  let coursePick = -1;
  let pointerClick = null;

  const preventKeys = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD',
  ]);

  window.addEventListener('keydown', (e) => {
    if (preventKeys.has(e.code)) e.preventDefault();
    held.add(e.code);
    if (e.repeat) return;

    if (e.code === 'Space' || e.code === 'Enter') actions |= ACT_CONFIRM;
    else if (e.code === 'KeyP' || e.code === 'Escape') actions |= ACT_PAUSE;
    else if (e.code === 'KeyG') gearPresses += 1;
    else if (e.code === 'KeyF') flapPresses += 1;
    else if (e.code === 'KeyC') actions |= ACT_CAM;
    else if (e.code === 'KeyI') actions |= ACT_INVERT;
    else if (e.code === 'KeyM') actions |= ACT_MUTE;
    else if (e.code === 'KeyR') actions |= ACT_RESTART;
    else if (e.code === 'KeyT') actions |= ACT_TITLE;
    else if (e.code === 'Digit1') coursePick = 0;
    else if (e.code === 'Digit2') coursePick = 1;
    else if (e.code === 'Digit3') coursePick = 2;
  });

  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
  });

  window.addEventListener('blur', () => {
    held.clear();
  });

  canvas.addEventListener('pointerdown', (e) => {
    pointerClick = clientToLogical(e.clientX, e.clientY);
  });

  return {
    readFlight(invertPitch) {
      const up = held.has('ArrowUp');
      const down = held.has('ArrowDown');
      const left = held.has('ArrowLeft') || held.has('KeyA');
      const right = held.has('ArrowRight') || held.has('KeyD');
      const thrUp = held.has('KeyW') || held.has('ShiftLeft') || held.has('ShiftRight') || held.has('Equal');
      const thrDn = held.has('KeyS') || held.has('ControlLeft') || held.has('ControlRight') || held.has('Minus');
      const brake = held.has('Space') || held.has('KeyB');
      const rawPitch = (up ? 1 : 0) - (down ? 1 : 0);
      return {
        pitch: invertPitch ? -rawPitch : rawPitch,
        roll: (right ? 1 : 0) - (left ? 1 : 0),
        throttleDelta: (thrUp ? 1 : 0) - (thrDn ? 1 : 0),
        brake,
      };
    },
    consumeGear() {
      if (gearPresses > 0) { gearPresses -= 1; return true; }
      return false;
    },
    consumeFlaps() {
      if (flapPresses > 0) { flapPresses -= 1; return true; }
      return false;
    },
    clearFlightQueue() {
      gearPresses = 0;
      flapPresses = 0;
    },
    takeActions() {
      const a = actions;
      actions = 0;
      return a;
    },
    takeCoursePick() {
      const c = coursePick;
      coursePick = -1;
      return c;
    },
    takePointerClick() {
      const p = pointerClick;
      pointerClick = null;
      return p;
    },
  };
}
