import * as THREE from 'three';
import { posterMaterial, flatMaterial } from './artDirection.js';

// ---------------------------------------------------------------------------
// Vehicle-grade materials.
//
// The single biggest reason procedural geometry reads as "toy" is that shiny
// surfaces have nothing to reflect: metalness without an environment map just
// renders dark. Everything here assumes `scene.environment` has been set (see
// createEnvironment below), which is what makes chrome look like chrome and
// glass look like glass.
// ---------------------------------------------------------------------------

/**
 * Builds a PMREM environment map from a small procedural scene: a sky-to-ground
 * gradient plus a few bright emissive panels standing in for sun and sky
 * highlights. Cheap to generate, and it gives every reflective surface
 * something believable to mirror.
 */
export function createEnvironment(renderer, { sky = 0x9fd8ff, ground = 0x4a4a4a, sun = 0xfff4e0 } = {}) {
  const scene = new THREE.Scene();

  // Inside-out box painted with a vertical gradient = sky dome.
  const gradient = new THREE.CanvasTexture(gradientCanvas(sky, ground));
  gradient.colorSpace = THREE.SRGBColorSpace;
  gradient.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = gradient;

  const panel = (w, h, d, color, intensity) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color }),
    );
    m.material.color.multiplyScalar(intensity);
    return m;
  };

  // Key light overhead — this becomes the bright streak that slides along the
  // cab roof and tank barrels as the truck turns.
  const key = panel(12, 0.5, 12, sun, 4.5);
  key.position.set(0, 8, 0);
  scene.add(key);

  // Softer fills at angles, so reflections aren't a single boring hotspot.
  const fillA = panel(8, 6, 0.5, sky, 1.6);
  fillA.position.set(-7, 3, 3);
  scene.add(fillA);
  const fillB = panel(0.5, 5, 8, 0xffffff, 1.1);
  fillB.position.set(7, 3, -3);
  scene.add(fillB);
  const rim = panel(6, 0.5, 6, sun, 2.0);
  rim.position.set(3, 1, -7);
  scene.add(rim);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(scene, 0.04);

  // The source scene is disposable; only the PMREM cubemap is kept.
  scene.traverse((o) => {
    if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
  });
  gradient.dispose();
  pmrem.dispose();

  return envRT.texture;
}

function gradientCanvas(skyHex, groundHex) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 128;
  const ctx = c.getContext('2d');
  const skyCol = new THREE.Color(skyHex);
  const groundCol = new THREE.Color(groundHex);
  const horizon = new THREE.Color().lerpColors(skyCol, groundCol, 0.5);
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0.0, `#${skyCol.getHexString()}`);
  grad.addColorStop(0.48, `#${horizon.getHexString()}`);
  grad.addColorStop(0.52, `#${groundCol.getHexString()}`);
  grad.addColorStop(1.0, `#${groundCol.getHexString()}`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}


// ---------------------------------------------------------------------------
// Truck / prop materials.
//
// These were physically-based: clearcoat paint, real chrome, transmissive
// glass, all reflecting a generated environment map. The art direction is now
// flat-vector, where none of that applies — a poster has no specular
// highlight and no reflection. Each factory keeps its name and signature so
// call sites did not have to change, but they now return cel-shaded surfaces
// and the options that describe gloss are ignored.
// ---------------------------------------------------------------------------

/** Vehicle paint: one flat colour with a single soft shade step. */
export function paintMaterial(color) {
  return posterMaterial(color);
}

/** Bright trim. Flat, slightly lifted — chrome cannot exist without reflections. */
export function chromeMaterial(color = 0xdfe4e8) {
  return posterMaterial(color);
}

/** Structural metal. */
export function metalMaterial(color = 0x6e7378) {
  return posterMaterial(color);
}

/**
 * Glass. In a flat illustration glazing is drawn as a pale, slightly
 * transparent shape — never as a reflection — so this is an even fill.
 */
export function glassMaterial(color = 0xbcd6e4) {
  return flatMaterial(color, { transparent: true, opacity: 0.78 });
}

export function rubberMaterial(color = 0x3d4750) {
  return posterMaterial(color);
}

export function plasticMaterial(color) {
  return posterMaterial(color);
}

/**
 * Self-lit lens (headlamps, indicators, brake lights).
 *
 * Toon rather than basic: the truck animates `emissiveIntensity` on these to
 * blink indicators and brighten brake lamps, and `MeshBasicMaterial` has no
 * emissive uniform at all — assigning one makes the renderer throw when it
 * tries to refresh it.
 */
export function lensMaterial(color, intensity = 1.0) {
  return posterMaterial(color, { emissive: color, emissiveIntensity: intensity });
}

/** Retro-reflective safety tape. */
export function reflectiveMaterial(color) {
  return flatMaterial(color);
}
