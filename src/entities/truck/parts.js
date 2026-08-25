import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Bevelled box — real panels have an edge radius, sharp corners read as toy. */
export function rbox(w, h, d, radius = 0.035, segments = 2) {
  const r = Math.min(radius, Math.min(w, h, d) / 2 - 1e-4);
  return new RoundedBoxGeometry(w, h, d, segments, r);
}

/**
 * Extrudes a 2D side-profile across the vehicle's width.
 *
 * This is the difference between a designed body and a pile of boxes. A profile
 * carries the whole silhouette in one surface — raked screen flowing into a
 * curved roof, wheel arches cut into the lower edge, a character line — and the
 * extrusion bevel rounds every edge of it at once. Stacking rounded boxes can
 * never produce a continuous surface, which is exactly why it reads as a toy.
 *
 * Shape space: +X is forward (world +Z), +Y is up. The result is rotated so the
 * extrusion runs across the vehicle, and centred on X.
 */
export function extrudeProfile(shape, width, { bevel = 0.045, curveSegments = 10 } = {}) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, width - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  geo.rotateY(-Math.PI / 2);        // shape +X -> world +Z
  geo.computeBoundingBox();         // centre across the width
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

export function part(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Lathed tyre with a bulged sidewall and rounded shoulders. */
export function tyreGeometry(radius, width, rimR) {
  const hw = width / 2;
  const pts = [
    new THREE.Vector2(rimR, -hw * 0.98),
    new THREE.Vector2(radius * 0.80, -hw * 1.02),
    new THREE.Vector2(radius * 0.95, -hw * 0.86),
    new THREE.Vector2(radius, -hw * 0.52),
    new THREE.Vector2(radius, hw * 0.52),
    new THREE.Vector2(radius * 0.95, hw * 0.86),
    new THREE.Vector2(radius * 0.80, hw * 1.02),
    new THREE.Vector2(rimR, hw * 0.98),
  ];
  const g = new THREE.LatheGeometry(pts, 26);
  g.rotateZ(Math.PI / 2); // axis along X
  return g;
}

/** Rim barrel + face + spokes + lug nuts, merged into one draw call. */
export function rimGeometry(rimR, width) {
  const parts = [];
  const barrel = new THREE.CylinderGeometry(rimR, rimR, width * 0.96, 20);
  parts.push(barrel);

  const face = new THREE.CylinderGeometry(rimR * 0.99, rimR * 0.99, 0.05, 20);
  face.translate(0, width * 0.42, 0);
  parts.push(face);

  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.BoxGeometry(rimR * 0.26, 0.06, rimR * 1.55);
    spoke.rotateY((i / 6) * Math.PI);
    spoke.translate(0, width * 0.45, 0);
    parts.push(spoke);
  }

  const hub = new THREE.CylinderGeometry(rimR * 0.34, rimR * 0.3, 0.14, 12);
  hub.translate(0, width * 0.5, 0);
  parts.push(hub);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lug = new THREE.CylinderGeometry(0.028, 0.028, 0.06, 6);
    lug.translate(Math.cos(a) * rimR * 0.5, width * 0.52, Math.sin(a) * rimR * 0.5);
    parts.push(lug);
  }

  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.rotateZ(Math.PI / 2);
  return merged;
}

// ---------------------------------------------------------------------------
// Truck
// ---------------------------------------------------------------------------

/**
 * ROVA side-loading refuse truck: DAF-style silver cab, lime compactor body and
 * a hydraulic side arm.
 *
 * Structure matters for the driving feel — the rig is split so the sprung mass
 * can move independently of the wheels:
 *
 *   group      root: world position + heading
 *    ├ body    sprung mass: pitches under braking, rolls in corners
 *    └ wheels  unsprung: stay planted on the ground plane
 */
