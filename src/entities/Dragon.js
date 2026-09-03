import * as THREE from 'three';
import { posterMaterial } from '../utils/artDirection.js';

/**
 * The dragon that circles the hub.
 *
 * It stands in for the agent that works on this game between sessions: it is
 * always up there, always moving, and you can watch it without it getting in
 * your way. It has no collision and no effect on the round — it is scenery
 * with a pulse.
 *
 * The body is the interesting part. Rather than animating a skeleton, every
 * segment samples the SAME flight path at a progressively older time. Segment
 * n sits where the head was n·lag seconds ago, so the whole body inherits the
 * serpentine curve of the path for free, and it banks and climbs correctly
 * without a single hand-authored keyframe. Each segment then looks at the one
 * ahead of it, which orients the chain along its own travel direction.
 */

/** Length of the leading body link, before taper. Sets the segment spacing. */
const SEGMENT_LENGTH = 1.5;

const C = {
  scale:     0x2f7d6b,   // deep jade, distinct from the ROVA lime below it
  scaleDark: 0x235c4f,
  belly:     0xd9c98f,
  membrane:  0xc9713f,   // warm wing membrane, lit from behind by the sky
  horn:      0xe8ddc0,
  eye:       0xf2b134,
};

/** One body segment: a tapered block with a paler belly plate. */
function segment(width, height, length, colour) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, length),
    posterMaterial(colour),
  );
  g.add(body);
  const belly = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.62, height * 0.24, length * 0.94),
    posterMaterial(C.belly),
  );
  belly.position.y = -height * 0.42;
  g.add(belly);
  // A dorsal fin along the spine gives the silhouette a readable top edge.
  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.1, height * 0.5, length * 0.7),
    posterMaterial(C.scaleDark),
  );
  fin.position.y = height * 0.62;
  g.add(fin);
  return g;
}

function buildHead() {
  const g = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 2.1), posterMaterial(C.scale));
  g.add(skull);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.72, 1.3), posterMaterial(C.scale));
  snout.position.set(0, -0.16, 1.5);
  g.add(snout);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 1.2), posterMaterial(C.belly));
  jaw.position.set(0, -0.52, 1.45);
  g.add(jaw);

  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.19, 1.15, 5), posterMaterial(C.horn));
    horn.position.set(side * 0.48, 0.78, -0.42);
    horn.rotation.set(-0.5, 0, side * 0.24);
    g.add(horn);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.7), posterMaterial(C.scaleDark));
    brow.position.set(side * 0.5, 0.5, 0.5);
    g.add(brow);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), posterMaterial(C.eye));
    eye.position.set(side * 0.56, 0.24, 0.72);
    g.add(eye);
  }
  return g;
}

/**
 * A wing: two bones and one membrane.
 *
 * The first version stacked three overlapping triangles, which merged into a
 * single flat slab that read as a sail rather than a wing. What makes a dragon
 * wing recognisable is the SILHOUETTE — a straight leading edge and a trailing
 * edge scalloped between the finger bones — so it is now one shape carrying
 * that outline, drawn faceted to suit the flat-vector look.
 *
 * Shape coordinates are (span, fore/aft); rotating the panel by +90 degrees
 * about X lays it flat with negative shape-y trailing behind the creature,
 * since the head's local +Z is forward.
 */
function buildWing(side) {
  const pivot = new THREE.Group();

  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.36), posterMaterial(C.scaleDark));
  arm.position.x = side * 1.3;
  pivot.add(arm);

  const forearm = new THREE.Group();
  forearm.position.x = side * 2.6;
  pivot.add(forearm);

  const SPAN = 4.6;
  const bone = new THREE.Mesh(new THREE.BoxGeometry(SPAN, 0.18, 0.28), posterMaterial(C.scaleDark));
  bone.position.x = side * SPAN / 2;
  forearm.add(bone);

  // One membrane: straight along the leading edge to the tip, then scalloped
  // back to the body between each finger.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.1);
  shape.lineTo(side * SPAN, -0.1);                 // leading edge to the tip
  shape.lineTo(side * SPAN * 0.80, -2.5);          // first scallop, deepest
  shape.lineTo(side * SPAN * 0.66, -1.3);          // back up to a finger
  shape.lineTo(side * SPAN * 0.48, -3.1);
  shape.lineTo(side * SPAN * 0.36, -1.6);
  shape.lineTo(side * SPAN * 0.20, -3.0);
  shape.lineTo(side * SPAN * 0.10, -1.5);
  shape.lineTo(0, -1.9);
  shape.closePath();
  const membrane = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    posterMaterial(C.membrane, { side: THREE.DoubleSide }),
  );
  membrane.rotation.x = Math.PI / 2;
  forearm.add(membrane);

  // Finger spars along the ridges the scallops hang from.
  for (const [t, len] of [[0.80, 2.5], [0.48, 3.1], [0.20, 3.0]]) {
    const spar = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, len),
      posterMaterial(C.scaleDark),
    );
    spar.position.set(side * SPAN * t * 0.55, 0, -len / 2);
    spar.rotation.y = side * -0.28;
    forearm.add(spar);
  }

  return { pivot, forearm };
}

export class Dragon {
  /**
   * @param radiusX/radiusZ  the ellipse it patrols
   * @param height           cruising altitude
   * @param period           seconds for one full circuit
   * @param segments         body links behind the head
   */
  constructor({ radiusX = 70, radiusZ = 56, height = 30, period = 70, segments = 13, size = 1.8 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'dragon';
    this.radiusX = radiusX;
    this.radiusZ = radiusZ;
    this.height = height;
    this.period = period;
    this.size = size;

    // The gap between links is lag x speed, so the lag cannot be picked by eye:
    // guess it and the body flies apart into a string of separate blocks, which
    // is exactly what the first version did. Derive it instead, from how long
    // one segment's length takes to travel at the path's own speed.
    const circumference = Math.PI * 2 * ((radiusX + radiusZ) / 2);
    this.speed = circumference / period;
    // 0.82 rather than 1.0: links overlap a little, so the body reads as one
    // creature instead of a row of separate blocks.
    this.lag = (SEGMENT_LENGTH * size * 0.82) / this.speed;

    this.head = new THREE.Group();
    this.head.name = 'dragon-head';
    // Scaling the head (and the wings parented to it) leaves the flight path in
    // world units — scaling the root group would inflate the orbit as well.
    this.head.scale.setScalar(size);
    this.head.add(buildHead());
    this.group.add(this.head);

    // Wings ride on the head group so they bank with the body's leading link.
    this.wings = [buildWing(-1), buildWing(1)];
    this.wingRoot = new THREE.Group();
    this.wingRoot.position.z = -1.6;
    for (const w of this.wings) this.wingRoot.add(w.pivot);
    this.head.add(this.wingRoot);

    this.segments = [];
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      // Taper from a thick shoulder to a thin tail tip.
      const w = 1.5 * size * (1 - t * 0.82);
      const h = 1.25 * size * (1 - t * 0.78);
      const seg = segment(w, h, SEGMENT_LENGTH * size * (1 - t * 0.35), t > 0.7 ? C.scaleDark : C.scale);
      this.group.add(seg);
      this.segments.push(seg);
    }

    // Tail fin, carried by the last segment.
    const fluke = new THREE.Mesh(
      new THREE.ConeGeometry(0.72 * size, 2.1 * size, 4),
      posterMaterial(C.membrane, { side: THREE.DoubleSide }),
    );
    fluke.rotation.x = -Math.PI / 2;
    fluke.scale.set(1, 1, 0.22);
    this.segments[this.segments.length - 1].add(fluke);

    this._tmp = new THREE.Vector3();
  }

  /** Position on the flight path at time t, in seconds. */
  _pathAt(t, out) {
    const a = (t / this.period) * Math.PI * 2;
    return out.set(
      Math.sin(a) * this.radiusX,
      // Two out-of-phase bobs so the climb never feels metronomic.
      this.height + Math.sin(a * 2.3) * 5.5 + Math.sin(a * 0.7 + 1.2) * 3.0,
      Math.cos(a) * this.radiusZ,
    );
  }

  update(delta, elapsed) {
    const head = this._tmp;
    this._pathAt(elapsed, head);
    this.head.position.copy(head);

    // Face where it is going: sample slightly ahead on the same path.
    const ahead = new THREE.Vector3();
    this._pathAt(elapsed + 0.35, ahead);
    this.head.lookAt(ahead);

    // Bank into the turn. The path is an ellipse, so the turn rate is the rate
    // of change of heading — approximated from two samples either side.
    const back = new THREE.Vector3();
    this._pathAt(elapsed - 0.35, back);
    const cross = new THREE.Vector3().subVectors(ahead, head)
      .cross(new THREE.Vector3().subVectors(head, back));
    this.head.rotateZ(THREE.MathUtils.clamp(cross.y * 0.35, -0.5, 0.5));

    // Body: each link is where the head was, a little further back in time.
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < this.segments.length; i++) {
      const t = elapsed - (i + 1) * this.lag;
      this._pathAt(t, p);
      this._pathAt(t + 0.3, q);
      const seg = this.segments[i];
      seg.position.copy(p);
      seg.lookAt(q);
      // A slow roll travelling down the body reads as a swimming motion.
      seg.rotateZ(Math.sin(elapsed * 1.1 - i * 0.5) * 0.14);
    }

    // Wingbeat: a fast down-stroke and a slower recovery, not a sine wave.
    const beat = (elapsed * 0.62) % 1;
    const flap = beat < 0.35
      ? Math.sin((beat / 0.35) * Math.PI * 0.5)          // drive down
      : Math.cos(((beat - 0.35) / 0.65) * Math.PI * 0.5); // ease back up
    for (const w of this.wings) {
      const side = w.pivot.children[0].position.x > 0 ? 1 : -1;
      w.pivot.rotation.z = side * (0.22 - flap * 0.52);
      w.forearm.rotation.z = side * (-0.16 + flap * 0.34);
      w.pivot.rotation.y = side * flap * 0.10;
    }
  }
}
