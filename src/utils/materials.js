import * as THREE from 'three';

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

// --- Material factories -----------------------------------------------------
// Each returns a fresh material; the truck keeps its own instances so it can
// animate emissive values (brake lights) without touching shared state.

/** Automotive paint: coloured basecoat under a glossy clear lacquer. */
export function paintMaterial(color, { metalness = 0.55, roughness = 0.32, clearcoat = 1.0 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.15,
  });
}

/** Polished metal — exhaust stacks, tanks, trim. */
export function chromeMaterial(color = 0xdfe4e8, { roughness = 0.08 } = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 1.0, roughness, envMapIntensity: 1.4,
  });
}

/** Brushed / cast metal — chassis rails, brackets, hydraulic bodies. */
export function metalMaterial(color = 0x6e7378, { roughness = 0.45 } = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.9, roughness, envMapIntensity: 0.9,
  });
}

/**
 * Vehicle glass. Deliberately NOT using `transmission` here: physical
 * transmission renders whatever is behind the pane, and behind a game-truck
 * windscreen there is very little, so the glass goes black and reads as a hole.
 * A bright, strongly-reflective surface sells "glass" far better at this scale.
 */
export function glassMaterial(color = 0x5b7382) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.25,
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    envMapIntensity: 2.6,
    transparent: true,
    opacity: 0.72,
  });
}

/** Tyre rubber — matte, non-metallic, drinks light. */
export function rubberMaterial(color = 0x14161a) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.0, roughness: 0.92, envMapIntensity: 0.35,
  });
}

/** Matte structural plastic — bumpers, mudflaps, trim. */
export function plasticMaterial(color, { roughness = 0.7 } = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.05, roughness, envMapIntensity: 0.6,
  });
}

/** Self-lit lens (headlights, indicators, beacon). */
export function lensMaterial(color, intensity = 1.0) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.0,
    roughness: 0.25,
    envMapIntensity: 0.8,
  });
}

/** Retro-reflective safety tape — reads bright from any angle. */
export function reflectiveMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.45,
    metalness: 0.35,
    roughness: 0.35,
    envMapIntensity: 1.2,
  });
}
