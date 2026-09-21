/**
 * On-screen throttle/brake and steering for touch devices. Only instantiated
 * when `isTouchDevice()` is true, so a desktop session never gets this DOM.
 *
 * Buttons drive the same forward/backward/left/right flags a keyboard would,
 * through InputController's own locked-aware setters — one InputController
 * stays the single source of truth for both input methods.
 */
export class TouchControls {
  constructor(input) {
    this.root = document.getElementById('touch-controls');
    this._releasers = [];

    this._bind('touch-left', (v) => input.setLeft(v));
    this._bind('touch-right', (v) => input.setRight(v));
    this._bind('touch-forward', (v) => input.setForward(v));
    this._bind('touch-brake', (v) => input.setBackward(v));

    // If the tab is backgrounded mid-press the matching pointerup never
    // arrives — the same gap InputController's own visibilitychange handler
    // covers for keyboard presses.
    this._onVisibility = () => { if (document.hidden) this._releaseAll(); };
    document.addEventListener('visibilitychange', this._onVisibility);

    this.root.classList.remove('hidden');
  }

  _bind(id, setter) {
    const el = document.getElementById(id);
    if (!el) return;
    const press = (e) => { e.preventDefault(); el.classList.add('is-active'); setter(true); };
    const release = (e) => { e.preventDefault(); el.classList.remove('is-active'); setter(false); };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    this._releasers.push(release);
  }

  _releaseAll() {
    for (const release of this._releasers) release(new Event('cancel'));
  }
}
