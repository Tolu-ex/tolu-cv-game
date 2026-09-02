import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { posterMaterial } from '../utils/artDirection.js';

// One geometry/material set shared by every bin in the world. Bins are the
// most numerous object in the game, so they must not each allocate their own.
let SHARED = null;

function buildShared() {
  if (SHARED) return SHARED;
  SHARED = {
    body: new RoundedBoxGeometry(0.62, 0.9, 0.56, 2, 0.05),
    lid: new RoundedBoxGeometry(0.66, 0.09, 0.6, 2, 0.04),
    wheel: new THREE.CylinderGeometry(0.09, 0.09, 0.07, 10),
    bar: new THREE.CylinderGeometry(0.022, 0.022, 0.6, 8),
    matBody: {},   // filled per colour on demand
    matLid: {},
    matMetal: posterMaterial(0x4a4f55),
    matRubber: posterMaterial(0x16181c),
  };
  return SHARED;
}

function bodyMat(colour) {
  const S = buildShared();
  if (!S.matBody[colour]) S.matBody[colour] = posterMaterial(colour);
  return S.matBody[colour];
}
function lidMat(colour) {
  const S = buildShared();
  if (!S.matLid[colour]) S.matLid[colour] = posterMaterial(colour);
  return S.matLid[colour];
}

/**
 * A Dutch-style wheelie bin — the collectible.
 *
 * Bins own their pickup animation rather than the truck driving it, so many can
 * be mid-tip at once without the truck tracking any state per bin. The truck
 * only ever asks "are you close enough" and then "start tipping".
 */
export class Bin {
  constructor({ position, heading = 0, colour = 0x2f7d32, lidColour = 0x1f5c22, kind = 'rest' }) {
    const S = buildShared();
    this.kind = kind;             // which waste stream — purely cosmetic
    this.collected = false;
    this.state = 'idle';          // idle | lifting | tipping | done
    this.t = 0;
    this.position = position.clone();

    const g = new THREE.Group();
    g.position.copy(this.position);
    g.rotation.y = heading;
    this.group = g;

    // Pivot at the bin's base so the tip animation rotates about the ground,
    // the way a real bin hinges on its wheels.
    const pivot = new THREE.Group();
    g.add(pivot);
    this.pivot = pivot;

    const body = new THREE.Mesh(S.body, bodyMat(colour));
    body.position.y = 0.52;
    pivot.add(body);

    const lid = new THREE.Mesh(S.lid, lidMat(lidColour));
    lid.position.y = 1.0;
    pivot.add(lid);
    this.lid = lid;

    // Comb bar on the front — what a side-loader's grabber actually grips.
    const bar = new THREE.Mesh(S.bar, S.matMetal);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.92, 0.3);
    pivot.add(bar);

    for (const sx of [-0.24, 0.24]) {
      const w = new THREE.Mesh(S.wheel, S.matRubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx, 0.09, -0.18);
      pivot.add(w);
    }

    this._baseY = 0;
  }

  /** Distance from a world-space point, ignoring height. */
  distanceTo(p) {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  /** Kicks off the lift-and-tip. Returns false if already going. */
  startCollect() {
    if (this.state !== 'idle') return false;
    this.state = 'lifting';
    this.t = 0;
    return true;
  }

  /**
   * Advances the pickup. Returns 'emptied' on the single frame the bin's
   * contents land in the hopper, so the caller can score exactly once.
   */
  update(delta) {
    if (this.state === 'idle' || this.state === 'done') return null;
    this.t += delta;

    if (this.state === 'lifting') {
      // Rise and rotate toward the truck over ~0.55s.
      const k = Math.min(this.t / 0.55, 1);
      const ease = k * k * (3 - 2 * k);
      this.pivot.position.y = ease * 2.1;
      this.pivot.rotation.x = -ease * 0.5;
      if (k >= 1) { this.state = 'tipping'; this.t = 0; }
      return null;
    }

    if (this.state === 'tipping') {
      const k = Math.min(this.t / 0.45, 1);
      const ease = k * k * (3 - 2 * k);
      // Tip right over so the contents fall into the hopper.
      this.pivot.rotation.x = -0.5 - ease * 2.1;
      this.lid.rotation.x = ease * 1.5;       // lid flops open
      this.lid.position.z = ease * 0.28;
      if (k >= 1) {
        this.state = 'done';
        this.collected = true;
        this.group.visible = false;
        return 'emptied';
      }
    }
    return null;
  }

  /** Gentle idle bob so an un-collected bin reads as interactive. */
  idleBob(elapsed) {
    if (this.state !== 'idle') return;
    this.pivot.position.y = Math.sin(elapsed * 2 + this.position.x) * 0.015;
  }

  dispose() {
    // Geometry and materials are shared; only the group is per-bin.
    this.group.clear();
  }
}

/** Dutch waste streams, which double as the bin colour scheme. */
export const BIN_KINDS = [
  { kind: 'rest',    colour: 0x3c4045, lidColour: 0x26292d, label: 'Restafval' },
  { kind: 'gft',     colour: 0x2f7d32, lidColour: 0x1f5c22, label: 'GFT' },
  { kind: 'papier',  colour: 0x1f5fa8, lidColour: 0x164679, label: 'Papier' },
  { kind: 'plastic', colour: 0xd9a521, lidColour: 0xa87c15, label: 'PMD' },
];
