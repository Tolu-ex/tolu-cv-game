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
  // Poster shading needs the planes of a form to read as clearly different
  // flat colours. The previous stops sat between 0.62 and 1.0, which — with
  // most of the light coming from directionless ambient — put every face of
  // the truck in the same band: its roof and its flank measured 131.5 and
  // 130.8 out of 255, so 605 nodes of modelled detail rendered as one silhouette.
  // These are spread wide enough that a change of plane is a visible step.
  const stops = steps === 2 ? [0.55, 1.0] : [0.40, 0.70, 1.0];
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

