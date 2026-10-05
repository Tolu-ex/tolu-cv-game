const BUTTONS = [
  ['touch-left', 'left'],
  ['touch-right', 'right'],
  ['touch-reverse', 'backward'],
  ['touch-brake', 'brake'],
  ['touch-gas', 'forward'],
];

/**
 * On-screen steering and pedal buttons for touch devices. The buttons
 * themselves are CSS-hidden on anything with a precise pointer (see
 * `#touch-controls` in style.css), so this class never has to detect the
 * device itself — it just wires presses into the same booleans a held key
 * would set, via InputController.setTouch.
 */
export class TouchControls {
  constructor(input) {
    this.input = input;
    for (const [id, control] of BUTTONS) this._bind(id, control);
  }

  _bind(id, control) {
    const el = document.getElementById(id);
    if (!el) return;
    const press = (e) => { e.preventDefault(); this.input.setTouch(control, true); };
    const release = (e) => { e.preventDefault(); this.input.setTouch(control, false); };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    // A thumb sliding off the button should let go, the way lifting off a
    // physical pedal would — otherwise the truck keeps the throttle held
    // after the finger has moved elsewhere.
    el.addEventListener('pointerleave', release);
  }
}
