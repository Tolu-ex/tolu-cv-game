const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp']);
const BACKWARD_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);
const BRAKE_KEYS = new Set(['Space']);
const LIGHT_KEYS = new Set(['KeyL']);
const RECENTER_KEYS = new Set(['KeyC']);

/**
 * Keyboard + mouse input.
 *
 * Keyboard drives the truck; the mouse orbits the camera Roblox-style — drag to
 * swing the view around, wheel to zoom. Can be locked during transitions and
 * story cards.
 */
export class InputController {
  constructor(canvas) {
    this.forward = false;
    this.backward = false;
    this.left = false;
    this.right = false;
    this.brake = false;
    this.locked = false;

    // Camera-orbit state, drained by the game loop each frame.
    this.orbitDeltaX = 0;
    this.orbitDeltaY = 0;
    this.zoomDelta = 0;
    this.dragging = false;
    this.lastPointerAt = 0;

    this._lightToggleQueued = false;
    this._recenterQueued = false;

    this._down = (e) => {
      if (!this.locked && LIGHT_KEYS.has(e.code)) this._lightToggleQueued = true;
      if (!this.locked && RECENTER_KEYS.has(e.code)) this._recenterQueued = true;
      this._set(e.code, true);
    };
    this._up = (e) => this._set(e.code, false);
    // If the window loses focus mid-press the matching keyup never arrives,
    // which would leave the truck driving itself. Clear everything instead.
    this._clear = () => this.clearKeys();
    this._onVisibility = () => { if (document.hidden) this.clearKeys(); };

    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._clear);
    document.addEventListener('visibilitychange', this._onVisibility);

    this._bindPointer(canvas || window);
  }

  _bindPointer(el) {
    this._el = el;
    this._pointerId = null;
    this._lastX = 0;
    this._lastY = 0;

    this._onPointerDown = (e) => {
      if (this.locked) return;
      // Left or right drag both orbit: Roblox uses right-drag, but click-drag
      // is what most people try first.
      if (e.button !== 0 && e.button !== 2) return;
      this.dragging = true;
      this._pointerId = e.pointerId;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      el.setPointerCapture?.(e.pointerId);
    };

    this._onPointerMove = (e) => {
      if (!this.dragging || e.pointerId !== this._pointerId) return;
      this.orbitDeltaX += e.clientX - this._lastX;
      this.orbitDeltaY += e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.lastPointerAt = performance.now();
    };

    this._onPointerUp = (e) => {
      if (e.pointerId !== this._pointerId) return;
      this.dragging = false;
      this._pointerId = null;
      el.releasePointerCapture?.(e.pointerId);
      this.lastPointerAt = performance.now();
    };

    this._onWheel = (e) => {
      if (this.locked) return;
      e.preventDefault();
      this.zoomDelta += e.deltaY;
      this.lastPointerAt = performance.now();
    };

    // Right-drag would otherwise open the context menu mid-orbit.
    this._onContextMenu = (e) => e.preventDefault();

    el.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    el.addEventListener('wheel', this._onWheel, { passive: false });
    el.addEventListener('contextmenu', this._onContextMenu);
  }

  /** Returns and clears this frame's accumulated orbit/zoom input. */
  consumeCameraInput() {
    const out = { dx: this.orbitDeltaX, dy: this.orbitDeltaY, zoom: this.zoomDelta };
    this.orbitDeltaX = 0;
    this.orbitDeltaY = 0;
    this.zoomDelta = 0;
    return out;
  }

  /** True once per L press. */
  consumeLightToggle() {
    const q = this._lightToggleQueued;
    this._lightToggleQueued = false;
    return q;
  }

  /** True once per C press. */
  consumeRecenter() {
    const q = this._recenterQueued;
    this._recenterQueued = false;
    return q;
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
    this.dragging = false;
    this.orbitDeltaX = this.orbitDeltaY = this.zoomDelta = 0;
    this._lightToggleQueued = false;
    this._recenterQueued = false;
  }

  unlock() {
    this.locked = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._clear);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this._el?.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    this._el?.removeEventListener('wheel', this._onWheel);
    this._el?.removeEventListener('contextmenu', this._onContextMenu);
  }
}
