import { makeTextTexture } from '../../utils/geoBuilders.js';

// Canvas-drawn livery and signage. Separated from geometry because this is 2D
// drawing code that merely ends up on a 3D surface.

export function rovaDecalTexture() {
  return makeTextTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(4, 4, w - 8, h - 8, 16); ctx.fill();
    ctx.fillStyle = '#3fae2f';
    ctx.font = '900 88px Rubik, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ROVA', w / 2, h / 2 - 8);
    ctx.font = '600 22px Rubik, Arial, sans-serif';
    ctx.fillStyle = '#4a4a4a';
    ctx.fillText('AFVAL & GRONDSTOFFEN', w / 2, h / 2 + 42);
    // Electric strapline, as the real Dutch electric refuse fleet carries.
    ctx.fillStyle = '#0f9d58';
    ctx.beginPath(); ctx.roundRect(w / 2 - 108, h / 2 + 56, 216, 34, 17); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 20px Rubik, Arial, sans-serif';
    ctx.fillText('\u26A1 100% ELEKTRISCH', w / 2, h / 2 + 74);
  }, 512, 220);
}

export function plateTexture() {
  return makeTextTexture((ctx, w, h) => {
    ctx.fillStyle = '#f5d800';
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, 10); ctx.fill();
    ctx.fillStyle = '#1a3a8f';
    ctx.fillRect(0, 0, w * 0.13, h);
    ctx.fillStyle = '#f5d800';
    ctx.font = '700 22px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NL', w * 0.065, h * 0.68);
    ctx.fillStyle = '#111';
    ctx.font = '900 54px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('ROVA-01', w * 0.57, h * 0.54);
  }, 320, 88);
}

/** Diagonal hazard chevrons for the tailgate. */
export function chevronTexture() {
  return makeTextTexture((ctx, w, h) => {
    ctx.fillStyle = '#f5e400';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e03a1f';
    const step = 54;
    for (let x = -h; x < w + h; x += step * 2) {
      ctx.beginPath();
      ctx.moveTo(x, h); ctx.lineTo(x + step, h);
      ctx.lineTo(x + step + h, 0); ctx.lineTo(x + h, 0);
      ctx.closePath(); ctx.fill();
    }
  }, 512, 96);
}
