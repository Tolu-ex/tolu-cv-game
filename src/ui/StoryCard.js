/** Manages the DOM story-card overlay shown on portal entry. */
export class StoryCard {
  constructor() {
    this.wrap = document.getElementById('story-card-wrap');
    this.iconEl = document.getElementById('story-card-icon');
    this.titleEl = document.getElementById('story-card-title');
    this.subtitleEl = document.getElementById('story-card-subtitle');
    this.bodyEl = document.getElementById('story-card-body');
    this.continueBtn = document.getElementById('story-card-continue');
  }

  /** Resolves once the player clicks Continue (or presses Enter/Space). */
  show(data) {
    return new Promise((resolve) => {
      this.iconEl.textContent = data.icon ?? '✨';
      this.titleEl.textContent = data.title ?? '';
      this.subtitleEl.textContent = data.subtitle ?? '';

      const tags = (data.tags || []).map((t) => `<span class="story-tag">${t}</span>`).join('');
      const bullets = (data.bullets || []).map((b) => `<li>${b}</li>`).join('');
      this.bodyEl.innerHTML = `${tags ? `<div>${tags}</div>` : ''}<ul>${bullets}</ul>`;

      this.wrap.classList.remove('hidden');

      const finish = () => {
        this.continueBtn.removeEventListener('click', finish);
        window.removeEventListener('keydown', onKey);
        this.wrap.classList.add('hidden');
        resolve();
      };
      const onKey = (e) => {
        if (e.code === 'Enter' || e.code === 'Space') finish();
      };
      this.continueBtn.addEventListener('click', finish);
      window.addEventListener('keydown', onKey);
    });
  }
}
