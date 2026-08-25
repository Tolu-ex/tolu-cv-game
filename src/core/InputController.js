const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp']);
const BACKWARD_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);
const BRAKE_KEYS = new Set(['Space']);

/** Keyboard input for driving. Can be locked during transitions/story cards. */
export class InputController {
  constructor() {
    this.forward = false;
    this.backward = false;
    this.left = false;
    this.right = false;
    this.brake = false;
    this.locked = false;

    this._down = (e) => this._set(e.code, true);
    this._up = (e) => this._set(e.code, false);
    // If the window loses focus mid-press the matching keyup never arrives,
    // which would leave the truck driving itself. Clear everything instead.
    this._clear = () => this.clearKeys();
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._clear);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearKeys();
    });
  }

  clearKeys() {
    this.forward = this.backward = this.left = this.right = this.brake = false;
  }

  _set(code, value) {
    if (this.locked && value) return; // ignore new presses while locked
    if (FORWARD_KEYS.has(code)) this.forward = value;
    else if (BACKWARD_KEYS.has(code)) this.backward = value;
    else if (LEFT_KEYS.has(code)) this.left = value;
    else if (RIGHT_KEYS.has(code)) this.right = value;
    else if (BRAKE_KEYS.has(code)) this.brake = value;
  }

  lock() {
    this.locked = true;
    this.clearKeys();
  }

  unlock() {
    this.locked = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._clear);
  }
}
