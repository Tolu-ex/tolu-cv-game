/** Controls the black CSS fade overlay used between world transitions. */
export class FadeTransition {
  constructor(el) {
    this.el = el;
  }

  fadeOut(duration = 600) {
    return new Promise((resolve) => {
      this.el.style.transition = `opacity ${duration}ms ease`;
      this.el.style.pointerEvents = 'auto';
      // Force reflow so the transition reliably fires
      // eslint-disable-next-line no-unused-expressions
      this.el.offsetHeight;
      this.el.style.opacity = '1';
      setTimeout(resolve, duration);
    });
  }

  fadeIn(duration = 600) {
    return new Promise((resolve) => {
      this.el.style.transition = `opacity ${duration}ms ease`;
      this.el.style.opacity = '0';
      setTimeout(() => {
        this.el.style.pointerEvents = 'none';
        resolve();
      }, duration);
    });
  }
}
