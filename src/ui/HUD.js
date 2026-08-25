/** Thin wrapper around the HUD DOM elements (speed, world name, progress). */
export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.worldNameEl = document.getElementById('world-name');
    this.progressEl = document.getElementById('portal-progress');
    this.speedValueEl = document.getElementById('speed-value');
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setWorldName(text) { this.worldNameEl.textContent = text; }

  setProgress(visited, total) {
    const dots = Array.from({ length: total }, (_, i) => (i < visited ? '●' : '○')).join(' ');
    this.progressEl.textContent = `${dots}  ${visited}/${total} portals visited`;
  }

  setSpeed(kmh) {
    this.speedValueEl.textContent = Math.round(kmh);
  }

  /** Score, hopper load and bin progress for the collection round. */
  setRound({ score = 0, load = 0, capacity = 6, collected = 0, total = 0 } = {}) {
    if (!this._roundEl) {
      this._roundEl = document.createElement('div');
      this._roundEl.id = 'round-panel';
      this._roundEl.innerHTML = `
        <div class="round-score"><span id="round-score">0</span><small>pts</small></div>
        <div class="round-load">
          <div class="round-load-label">HOPPER <span id="round-load-text">0/6</span></div>
          <div class="round-load-bar"><div class="round-load-fill" id="round-load-fill"></div></div>
        </div>
        <div class="round-bins" id="round-bins">0/0 bins</div>`;
      this.root.appendChild(this._roundEl);
      this._scoreEl = this._roundEl.querySelector('#round-score');
      this._loadTextEl = this._roundEl.querySelector('#round-load-text');
      this._loadFillEl = this._roundEl.querySelector('#round-load-fill');
      this._binsEl = this._roundEl.querySelector('#round-bins');
    }
    this._roundEl.style.display = total > 0 ? '' : 'none';
    this._scoreEl.textContent = score;
    this._loadTextEl.textContent = `${load}/${capacity}`;
    const pct = capacity ? (load / capacity) * 100 : 0;
    this._loadFillEl.style.width = `${pct}%`;
    this._loadFillEl.classList.toggle('full', load >= capacity);
    this._binsEl.textContent = `${collected}/${total} bins`;
  }

  /** Transient message, e.g. a bin collected or the hopper filling up. */
  toast(text) {
    if (!this._toastEl) {
      this._toastEl = document.createElement('div');
      this._toastEl.id = 'game-toast';
      this.root.appendChild(this._toastEl);
    }
    this._toastEl.textContent = text;
    this._toastEl.classList.remove('show');
    void this._toastEl.offsetWidth;   // restart the animation
    this._toastEl.classList.add('show');
  }

  /** Brief on-screen confirmation when the headlamps are toggled. */
  flashLights(on) {
    if (!this._lightsEl) {
      this._lightsEl = document.createElement('div');
      this._lightsEl.id = 'lights-toast';
      this.root.appendChild(this._lightsEl);
    }
    this._lightsEl.textContent = on ? '💡 Headlights ON' : '🌑 Headlights OFF';
    this._lightsEl.classList.remove('show');
    // Restart the CSS animation rather than letting it no-op on a re-add.
    void this._lightsEl.offsetWidth;
    this._lightsEl.classList.add('show');
  }
}
