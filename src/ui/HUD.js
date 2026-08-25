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
}
