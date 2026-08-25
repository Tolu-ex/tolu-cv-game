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
