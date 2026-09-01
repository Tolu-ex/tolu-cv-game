import * as THREE from 'three';
import { posterMaterial, flatMaterial } from './artDirection.js';
import { seededRandom } from './rng.js';

// Decorative scatter (foliage clumps, lit windows) runs off a seeded stream
// rather than Math.random, so a world is laid out identically every time it is
// entered. Game seeds this per world before building. Particle and camera
// randomness deliberately stays unseeded — those should vary.
let decorRand = seededRandom(1);

/** Reseeds the decorative scatter. Call before building a world. */
export function seedDecor(seed) {
  decorRand = seededRandom(seed);
}

// ---------------------------------------------------------------------------
// Shared low-poly building blocks used across every world. Keeping these in
// one place keeps the worlds visually consistent and the world files short.
// ---------------------------------------------------------------------------

const matCache = new Map();

/**
 * Shared surface for world scenery, cel-shaded to the poster art direction.
 *
 * The signature still accepts the old PBR options (roughness, metalness,
 * flat) so the seven world files did not all need rewriting, but those are
 * deliberately ignored: a flat-vector look has no gloss, no metal and no
 * specular. Only colour, emissive and transparency survive.
 */
export function stdMat(color, opts = {}) {
  const key = `${color}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 0}|${opts.transparent ?? false}|${opts.opacity ?? 1}|${opts.side ?? 'front'}|${opts.unlit ?? false}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = opts.unlit
    ? flatMaterial(color, opts)
    : posterMaterial(color, {
        emissive: opts.emissive ?? 0x000000,
        emissiveIntensity: opts.emissiveIntensity ?? 0,
        transparent: opts.transparent ?? false,
        opacity: opts.opacity ?? 1,
        side: opts.side ?? THREE.FrontSide,
      });
  matCache.set(key, m);
  return m;
}

export function mesh(geo, color, opts = {}) {
  const m = new THREE.Mesh(geo, stdMat(color, opts));
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = opts.receiveShadow !== false;
  return m;
}

/** Draws text/graphics to a canvas and returns a THREE.CanvasTexture. */
export function makeTextTexture(draw, w = 256, h = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function signTexture(text, { bg = '#111', fg = '#fff', accent = '#ffd23f', font = 'bold 46px Rubik, sans-serif', sub = '' } = {}) {
  return makeTextTexture((ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, sub ? h / 2 - 14 : h / 2);
    if (sub) {
      ctx.font = '24px Rubik, sans-serif';
      ctx.fillStyle = accent;
      ctx.fillText(sub, w / 2, h / 2 + 26);
    }
  }, 512, 256);
}

export function windowGridTexture(cols, rows, { lit = 0.4, base = '#2b2f38', litColor = '#ffe9a8', dimColor = '#151820' } = {}) {
  return makeTextTexture((ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        ctx.fillStyle = decorRand() < lit ? litColor : dimColor;
        ctx.fillRect(x * cw + cw * 0.18, y * ch + ch * 0.18, cw * 0.64, ch * 0.64);
      }
    }
  }, 128, 256);
}

// ---------------------------------------------------------------------------
// Nature props
// ---------------------------------------------------------------------------

export function createTree({ height = 4, radius = 1.4, trunkColor = 0x6b4a2f, leafColor = 0x2f9e4f } = {}) {
  const g = new THREE.Group();
  const trunkH = height * 0.42;
  const trunk = mesh(new THREE.CylinderGeometry(radius * 0.14, radius * 0.2, trunkH, 6), trunkColor);
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = radius * (1 - t * 0.45);
    const h = height * 0.5 * (1 - t * 0.25);
    const cone = mesh(new THREE.ConeGeometry(r, h, 7), leafColor);
    cone.position.y = trunkH + h * 0.42 + i * height * 0.24;
    cone.rotation.y = i * 0.6;
    g.add(cone);
  }
  return g;
}

export function createPalmTree({ height = 6, trunkColor = 0x8a6a42, leafColor = 0x3c9a4a } = {}) {
  const g = new THREE.Group();
  const segs = 6;
  let y = 0;
  let lean = 0;
  for (let i = 0; i < segs; i++) {
    const segH = height / segs;
    const seg = mesh(new THREE.CylinderGeometry(0.14 - i * 0.01, 0.17 - i * 0.01, segH, 5), trunkColor);
    seg.position.set(Math.sin(lean) * segH * 0.5, y + segH * 0.5, 0);
    seg.rotation.z = lean;
    g.add(seg);
    y += Math.cos(lean) * segH;
    lean += 0.05;
  }
  const crownX = Math.sin(lean) * 0.4;
  const frondCount = 7;
  for (let i = 0; i < frondCount; i++) {
    const a = (i / frondCount) * Math.PI * 2;
    const frond = mesh(new THREE.ConeGeometry(0.32, 2.6, 4), leafColor);
    frond.position.set(crownX + Math.cos(a) * 0.5, y + 0.2, Math.sin(a) * 0.5);
    frond.rotation.z = Math.PI / 2 + Math.cos(a) * 0.9;
    frond.rotation.x = Math.sin(a) * 0.9;
    frond.rotation.y = a;
    frond.scale.set(1, 1, 0.35);
    g.add(frond);
  }
  const coco = mesh(new THREE.SphereGeometry(0.35, 6, 5), 0x5b3a20);
  coco.position.set(crownX, y, 0);
  g.add(coco);
  return g;
}

export function createBush({ radius = 0.8, color = 0x3c9a4a } = {}) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = mesh(new THREE.IcosahedronGeometry(radius * (0.7 + decorRand() * 0.4), 0), color);
    s.position.set((decorRand() - 0.5) * radius, radius * 0.4 + decorRand() * 0.2, (decorRand() - 0.5) * radius);
    g.add(s);
  }
  return g;
}

export function createLampPost({ height = 4.2, color = 0x2b2d30, lampColor = 0xfff2b0, lit = true } = {}) {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.07, 0.09, height, 6), color);
  pole.position.y = height / 2;
  g.add(pole);
  const arm = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), color);
  arm.position.set(0.25, height - 0.1, 0);
  g.add(arm);
  const lampGeo = new THREE.SphereGeometry(0.16, 8, 8);
  const lamp = mesh(lampGeo, lampColor, { emissive: lampColor, emissiveIntensity: lit ? 1.4 : 0.1 });
  lamp.position.set(0.5, height - 0.14, 0);
  g.add(lamp);
  if (lit) {
    const pl = new THREE.PointLight(lampColor, 16, 13, 2);
    pl.position.copy(lamp.position);
    g.add(pl);
  }
  return g;
}

export function createCloud({ scale = 1, color = 0xffffff } = {}) {
  const g = new THREE.Group();
  const n = 4 + Math.floor(decorRand() * 3);
  for (let i = 0; i < n; i++) {
    const s = mesh(new THREE.SphereGeometry(scale * (0.6 + decorRand() * 0.5), 7, 6), color, { emissive: color, emissiveIntensity: 0.08 });
    s.position.set(i * scale * 1.1 - n * scale * 0.5, decorRand() * scale * 0.3, decorRand() * scale * 0.4);
    g.add(s);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Windmill (reused by Haarlem + Contact/tulip-field worlds)
// ---------------------------------------------------------------------------

export function createWindmill({ height = 9, bodyColor = 0xd9c9a3, capColor = 0x5b4636, bladeSpan = 6.5 } = {}) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(1.6, 2.4, height, 8), bodyColor);
  body.position.y = height / 2;
  g.add(body);
  const cap = mesh(new THREE.ConeGeometry(1.9, 2.2, 8), capColor);
  cap.position.y = height + 1.0;
  g.add(cap);
  for (let i = 0; i < 3; i++) {
    const r = 1.6 - i * (1.6 - 2.4) / 20;
    const ring = mesh(new THREE.CylinderGeometry(r, r, 0.4, 8, 1, true), 0xc9b98d, { side: THREE.DoubleSide });
    ring.position.y = height * (0.2 + i * 0.3);
    g.add(ring);
  }
  // Blade hub, offset forward so blades clear the tower
  const hub = new THREE.Group();
  hub.position.set(0, height + 0.4, 1.7);
  const hubCap = mesh(new THREE.SphereGeometry(0.35, 8, 8), 0x3a2c1e);
  hub.add(hubCap);
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Group();
    const beam = mesh(new THREE.BoxGeometry(0.18, bladeSpan, 0.06), 0x4a3826);
    beam.position.y = bladeSpan / 2;
    blade.add(beam);
    for (let s = 1; s < 5; s++) {
      const lat = mesh(new THREE.BoxGeometry(0.9, 0.05, 0.04), 0x4a3826);
      lat.position.y = (bladeSpan / 5) * s;
      blade.add(lat);
    }
    const sail = mesh(new THREE.PlaneGeometry(0.85, bladeSpan * 0.82), 0xece0c4, { side: THREE.DoubleSide, castShadow: false });
    sail.position.set(0.02, bladeSpan * 0.5, 0.02);
    blade.add(sail);
    blade.rotation.z = (Math.PI / 2) * i;
    blades.add(blade);
  }
  hub.add(blades);
  g.add(hub);
  g.userData.blades = blades; // rotate this in the update loop
  return g;
}

// ---------------------------------------------------------------------------
// Haarlem: stepped-gable canal house
// ---------------------------------------------------------------------------

const C_ROOF = 0x394650;

export function createCanalHouse({ width = 3.4, depth = 3.6, floors = 3, floorH = 1.5, color = 0xb5502e, trimColor = 0xe9dfc4, doorColor = 0x2b3a2e, awningColor = 0x8c3a24, steps = 3 } = {}) {
  const g = new THREE.Group();
  const wallH = floors * floorH;

  const body = mesh(new THREE.BoxGeometry(width, wallH, depth), color);
  body.position.y = wallH / 2;
  g.add(body);

  // Trim strip between floors
  for (let f = 1; f < floors; f++) {
    const trim = mesh(new THREE.BoxGeometry(width + 0.05, 0.08, depth + 0.05), trimColor);
    trim.position.y = f * floorH;
    g.add(trim);
  }

  // Stepped gable roof, front-facing (+Z)
  const stepW = (width / 2) / steps;
  const stepH = 0.55;
  for (let i = 0; i < steps; i++) {
    const stepWidth = width - i * stepW * 2;
    const block = mesh(new THREE.BoxGeometry(stepW * 1.02, stepH, 0.4), trimColor);
    block.position.set(0, wallH + i * stepH + stepH / 2, depth / 2 + 0.15);
    g.add(block);
    const blockL = mesh(new THREE.BoxGeometry(0.3, stepH, 0.42), trimColor);
    blockL.position.set(-stepWidth / 2 + 0.15, wallH + i * stepH + stepH / 2, depth / 2 + 0.16);
    g.add(blockL);
    const blockR = blockL.clone();
    blockR.position.x = stepWidth / 2 - 0.15;
    g.add(blockR);
  }
  const capH = steps * stepH + 0.9;
  const cap = mesh(new THREE.ConeGeometry(0.36, 0.7, 4), trimColor);
  cap.rotation.y = Math.PI / 4;
  cap.position.set(0, wallH + capH, depth / 2 + 0.15);
  g.add(cap);

  // Pitched roof behind the gable: ridge runs front-to-back, slopes to ±X
  const ridgeRise = steps * stepH * 0.85;
  const slopeAngle = Math.atan2(ridgeRise, width / 2);
  const slopeLen = Math.hypot(width / 2, ridgeRise);
  for (const side of [-1, 1]) {
    const slab = mesh(new THREE.BoxGeometry(slopeLen, 0.16, depth * 0.98), C_ROOF);
    slab.position.set(side * (width / 4), wallH + ridgeRise / 2, 0);
    slab.rotation.z = -side * slopeAngle;
    g.add(slab);
  }

  // Windows per floor
  const winMat = stdMat(0x1c2b33, { emissive: 0xfff2c9, emissiveIntensity: 0.15 });
  const frameMat = stdMat(0xffffff);
  for (let f = 0; f < floors; f++) {
    const cols = f === 0 ? 1 : 2;
    for (let c = 0; c < cols; c++) {
      const isDoor = f === 0 && c === 0 && cols === 1;
      const ww = isDoor ? width * 0.32 : width * 0.3;
      const wh = isDoor ? floorH * 0.82 : floorH * 0.62;
      const winGeo = new THREE.PlaneGeometry(ww, wh);
      const win = new THREE.Mesh(winGeo, isDoor ? stdMat(doorColor) : winMat);
      const xOff = cols === 1 ? 0 : (c - 0.5) * width * 0.42;
      win.position.set(xOff, f * floorH + (isDoor ? wh / 2 : floorH * 0.5), depth / 2 + 0.03);
      g.add(win);
      const frame = mesh(new THREE.BoxGeometry(ww + 0.08, wh + 0.08, 0.05), trimColor);
      frame.position.copy(win.position);
      frame.position.z -= 0.02;
      g.add(frame);
      // shutters
      if (!isDoor) {
        for (const side of [-1, 1]) {
          const shutter = mesh(new THREE.BoxGeometry(ww * 0.22, wh, 0.04), 0x2b4a3a);
          shutter.position.set(xOff + side * (ww / 2 + ww * 0.14), win.position.y, depth / 2 + 0.05);
          g.add(shutter);
        }
      }
    }
    // awning over the ground-floor shopfront
    if (f === 0) {
      const awning = mesh(new THREE.CylinderGeometry(0.34, 0.34, width * 0.78, 6, 1, false, 0, Math.PI), awningColor);
      awning.rotation.z = Math.PI / 2;
      awning.rotation.y = Math.PI / 2;
      awning.scale.set(1, 1, 0.55);
      awning.position.set(0, floorH * 0.9, depth / 2 + 0.26);
      g.add(awning);
    }
  }

  return g;
}

// ---------------------------------------------------------------------------
// Generic city building block (used by Lagos + Singapore skylines)
// ---------------------------------------------------------------------------

export function createBuildingBlock({ w = 6, h = 20, d = 6, color = 0xd8d8d8, lit = true } = {}) {
  const g = new THREE.Group();
  const tex = lit ? windowGridTexture(Math.max(2, Math.round(w / 1.5)), Math.max(4, Math.round(h / 2))) : null;
  const bodyMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.7, metalness: 0.15, flatShading: true,
    emissiveMap: tex || null, emissive: lit ? 0xffffff : 0x000000, emissiveIntensity: lit ? 0.55 : 0,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
  body.position.y = h / 2;
  g.add(body);
  const roof = mesh(new THREE.BoxGeometry(w * 1.02, 0.3, d * 1.02), 0x3a3a3f);
  roof.position.y = h + 0.15;
  g.add(roof);
  return g;
}

// ---------------------------------------------------------------------------
// Marina-bay style "supertree"
// ---------------------------------------------------------------------------

export function createSupertree({ height = 14, canopyRadius = 3.2, trunkColor = 0x3a2e22, canopyColor = 0x2fae6a } = {}) {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.5, 0.9, height, 8), trunkColor);
  trunk.position.y = height / 2;
  g.add(trunk);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = canopyRadius * (0.5 + t * 0.6);
    const ring = mesh(new THREE.CylinderGeometry(r, r * 0.85, 0.5, 10), canopyColor, { emissive: canopyColor, emissiveIntensity: 0.25 });
    ring.position.y = height * (0.55 + t * 0.4);
    g.add(ring);
    const pl = new THREE.PointLight(0x8fffc0, 14, 16, 2);
    pl.position.set(0, ring.position.y, 0);
    g.add(pl);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Tulip (instanced-friendly single flower)
// ---------------------------------------------------------------------------

export function createTulip({ color = 0xe5395a } = {}) {
  const g = new THREE.Group();
  const stem = mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.35, 4), 0x3f8f3f, { castShadow: false });
  stem.position.y = 0.175;
  g.add(stem);
  const bulb = mesh(new THREE.SphereGeometry(0.09, 6, 6), color, { castShadow: false });
  bulb.scale.set(1, 1.3, 1);
  bulb.position.y = 0.4;
  g.add(bulb);
  return g;
}

// ---------------------------------------------------------------------------
// Bike (Haarlem street prop)
// ---------------------------------------------------------------------------

export function createBike({ color = 0x2b2d30 } = {}) {
  const g = new THREE.Group();
  const wheelGeo = new THREE.TorusGeometry(0.32, 0.03, 6, 14);
  const w1 = mesh(wheelGeo, 0x111214, { castShadow: false });
  w1.rotation.y = Math.PI / 2;
  w1.position.set(-0.5, 0.32, 0);
  const w2 = w1.clone(); w2.position.x = 0.5;
  g.add(w1, w2);
  const frame = mesh(new THREE.BoxGeometry(1.05, 0.04, 0.04), color, { castShadow: false });
  frame.position.set(0, 0.5, 0);
  frame.rotation.z = 0.15;
  g.add(frame);
  const seatPost = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 5), color, { castShadow: false });
  seatPost.position.set(-0.35, 0.68, 0);
  g.add(seatPost);
  const handlePost = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5), color, { castShadow: false });
  handlePost.position.set(0.48, 0.68, 0);
  handlePost.rotation.z = -0.2;
  g.add(handlePost);
  return g;
}

// ---------------------------------------------------------------------------
// Cleanup helper — call when tearing down a world group
// ---------------------------------------------------------------------------
/**
 * Frees the GPU resources held by a world (or portal) subtree.
 *
 * Materials produced by `stdMat` are cached and shared across worlds, so they
 * are deliberately left alone — only per-instance materials (the ones built
 * inline with `new THREE.Material(...)`, which are the only ones carrying
 * canvas textures) get their maps released. Sprites are covered as well as
 * meshes, since the portal labels and icons are sprites.
 */
export function disposeObject3D(root) {
  const sharedMaterials = new Set(matCache.values());

  root.traverse((obj) => {
    // Shadow-casting lights own a render target that survives removal from the
    // scene graph — without this, every world transition leaks a shadow map.
    if (obj.isLight) {
      obj.shadow?.map?.dispose?.();
      obj.shadow?.mapPass?.dispose?.();
      if (obj.shadow) obj.shadow.map = null;
      obj.dispose?.();
      return;
    }

    if (!obj.isMesh && !obj.isSprite && !obj.isPoints && !obj.isLine) return;

    if (!obj.isSprite) obj.geometry?.dispose?.();

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m || sharedMaterials.has(m)) continue;
      m.map?.dispose?.();
      m.emissiveMap?.dispose?.();
      m.dispose?.();
    }
  });
}
