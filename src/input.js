const bindings = [
  { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyJ: 'light', KeyK: 'medium', KeyL: 'heavy', KeyU: 'special', KeyI: 'assist', KeyO: 'super', Space: 'guard', ShiftLeft: 'dash' },
  { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Digit1: 'light', Digit2: 'medium', Digit3: 'heavy', Digit4: 'special', Digit5: 'assist', Digit6: 'super', Digit0: 'guard', Numpad1: 'light', Numpad2: 'medium', Numpad3: 'heavy', Numpad4: 'special', Numpad5: 'assist', Numpad6: 'super', Numpad0: 'guard', ShiftRight: 'dash' },
];
export class Input {
  constructor({ active, pause, reset }) {
    this.keys = new Set();
    this.pendingKeys = new Set();
    this.touch = new Map();
    this.pendingTouch = new Set();
    this.gamepadBlocked = false;
    window.addEventListener('keydown', event => {
      if (!active() || document.querySelector('dialog[open]')) return;
      if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); if (!event.repeat) pause(); return; }
      if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) reset(); return; }
      if (event.target.closest?.('input, select, textarea')) return;
      if (bindings.some(b => b[event.code])) { event.preventDefault(); this.keys.add(event.code); if (!event.repeat) this.pendingKeys.add(event.code); }
    });
    window.addEventListener('keyup', event => { this.keys.delete(event.code); });
    window.addEventListener('blur', () => { this.clear(); if (active()) pause(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.clear(); if (active()) pause(true); } });
    for (const button of document.querySelectorAll('[data-action]')) {
      button.addEventListener('pointerdown', event => {
        if (!active()) return;
        event.preventDefault(); button.setPointerCapture(event.pointerId);
        this.touch.set(event.pointerId, button.dataset.action); button.classList.add('active');
        this.pendingTouch.add(button.dataset.action);
      });
      const release = event => { this.touch.delete(event.pointerId); button.classList.remove('active'); };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('contextmenu', event => event.preventDefault());
    }
  }
  clear() { this.keys.clear(); this.pendingKeys.clear(); this.touch.clear(); this.pendingTouch.clear(); document.querySelectorAll('[data-action].active').forEach(b => b.classList.remove('active')); }
  read() {
    const result = bindings.map(map => {
      const state = {};
      for (const key of new Set([...this.keys, ...this.pendingKeys])) if (map[key]) state[map[key]] = true;
      return state;
    });
    for (const action of this.touch.values()) result[0][action] = true;
    for (const action of this.pendingTouch) result[0][action] = true;
    this.pendingKeys.clear(); this.pendingTouch.clear();
    // Embedded website previews may forbid the Gamepad API. Keyboard and touch
    // must keep running even when that optional permission is unavailable.
    let pads = [];
    if (!this.gamepadBlocked && navigator.getGamepads) {
      try { pads = [...navigator.getGamepads()].filter(p => p?.connected); }
      catch { this.gamepadBlocked = true; }
    }
    for (let i = 0; i < Math.min(2, pads.length); i++) {
      const pad = pads[i], state = result[i], buttons = pad.buttons;
      const pressed = n => !!buttons[n]?.pressed;
      if ((pad.axes[0] || 0) < -.28 || pressed(14)) state.left = true;
      if ((pad.axes[0] || 0) > .28 || pressed(15)) state.right = true;
      if ((pad.axes[1] || 0) < -.45 || pressed(12)) state.up = true;
      if ((pad.axes[1] || 0) > .45 || pressed(13)) state.down = true;
      for (const [index, name] of [[0, 'light'], [1, 'medium'], [2, 'heavy'], [3, 'special'], [4, 'guard'], [5, 'assist'], [6, 'dash'], [7, 'super']]) if (pressed(index)) state[name] = true;
    }
    return result;
  }
}
