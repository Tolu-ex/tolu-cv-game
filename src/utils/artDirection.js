import * as THREE from 'three';

/**
 * Art direction: flat-vector travel-poster styling.
 *
 * The reference look is cel shading, not unlit. Distant mountains in a poster
 * of this kind carry two or three *discrete* flat tones, and buildings show a
 * lit face and a shade face — so form still reads, but there is no gradient
 * anywhere. `MeshToonMaterial` with a hard-stepped ramp does exactly that.
 *
 * Everything the renderer does to chase realism has to be switched off for
 * this to hold: no environment reflections, no tone mapping, no specular, no
 * cast shadows. Those fight flat colour rather than supporting it.
 */

// --- Toon ramp -------------------------------------------------------------
// A tiny 1-D texture sampled with NearestFilter. Each texel is one flat tone,
// so shading snaps between bands instead of blending.
let RAMP_CACHE = null;
export function toonRamp(steps = 3) {
  if (RAMP_CACHE) return RAMP_CACHE;
  // Values sit high and close together: poster shading is a gentle step from
  // "lit" to "slightly less lit", never to darkness.
  const stops = steps === 2 ? [0.72, 1.0] : [0.62, 0.82, 1.0];
  const data = new Uint8Array(stops.length * 4);
  stops.forEach((v, i) => {
    const c = Math.round(v * 255);
    data[i * 4] = c; data[i * 4 + 1] = c; data[i * 4 + 2] = c; data[i * 4 + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  RAMP_CACHE = tex;
  return tex;
}

/** Flat cel-shaded surface — the default for nearly everything. */
export function posterMaterial(color, opts = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonRamp(),
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

/** Wholly unlit fill — for water, sky planes and anything that must stay even. */
export function flatMaterial(color, opts = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
}

/**
 * Poster palette. Cool blues carry the atmosphere; warm neutrals carry the
 * built environment; dusty rose appears only as a small accent, never as a
 * field colour.
 */
export const POSTER = {
  // Atmosphere
  skyHigh:   0xbfd9e8,
  skyLow:    0xdcebf2,
  haze:      0xd6e6ee,
  water:     0x8fc0d6,
  waterDeep: 0x6fa8c4,

  // Distance bands — atmospheric perspective as discrete steps, which is how
  // a flat illustration conveys depth without a gradient.
  far1: 0xa8c6d8,
  far2: 0x93b7cd,
  far3: 0x7ea6c0,

  // Built environment
  ivory:   0xf4efe4,
  cream:   0xeae2d2,
  beige:   0xd9cdb8,
  stone:   0xc9c0b0,
  slate:   0x5d6b76,
  charcoal:0x3d4750,
  terracotta: 0xd9a284,
  roofTile:0xc98a6d,

  // Vegetation
  sage:     0xa8bfa8,
  greenMid: 0x7d9c82,
  greenDeep:0x55725f,
  pine:     0x415f4e,

  // Accents — used sparingly
  blush:  0xe0a8ac,
  rose:   0xd48b95,
  lemon:  0xe8d48a,
  sun:    0xf0d9a8,
};
