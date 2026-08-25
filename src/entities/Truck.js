import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeTextTexture } from '../utils/geoBuilders.js';
import {
  paintMaterial, chromeMaterial, metalMaterial, glassMaterial,
  rubberMaterial, plasticMaterial, lensMaterial, reflectiveMaterial,
} from '../utils/materials.js';
import { PALETTE } from '../utils/colors.js';

const C = PALETTE.truck;

// --- Layout constants (Z+ is forward) ---------------------------------------
const WHEEL_R = 0.62;      // sized to fill the arches under the taller body
const TRACK = 1.09;        // half-distance between left/right wheel centres
const AXLE_FRONT = 2.46;
const AXLE_REAR_A = -1.44;
const AXLE_REAR_B = -2.74;
const FRAME_Y = 0.82;

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------

function rovaDecalTexture() {
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

function plateTexture() {
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
function chevronTexture() {
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

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Bevelled box — real panels have an edge radius, sharp corners read as toy. */
function rbox(w, h, d, radius = 0.035, segments = 2) {
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
function extrudeProfile(shape, width, { bevel = 0.045, curveSegments = 10 } = {}) {
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

function part(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Lathed tyre with a bulged sidewall and rounded shoulders. */
function tyreGeometry(radius, width, rimR) {
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
function rimGeometry(rimR, width) {
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
export class Truck {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();   // everything that leans
    this.group.add(this.body);
    this.wheelRadius = WHEEL_R;

    // ---- Kinematics ----
    this.position = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.maxSpeed = 16;
    this.maxReverse = 6;
    this.accel = 9;
    this.brakeDecel = 18;
    this.friction = 5;
    this.maxSteer = 0.6;
    this.turnRate = 2.4;
    this.steerAngle = 0;

    // ---- Suspension state (spring-damper, integrated in update) ----
    this.pitch = 0; this.pitchVel = 0;
    this.roll = 0;  this.rollVel = 0;
    this._prevSpeed = 0;
    this._elapsed = 0;

    this._buildMaterials();
    this._build();
  }

  _buildMaterials() {
    const decalTex = rovaDecalTexture();
    this.mats = {
      cabPaint: paintMaterial(C.cab, { metalness: 0.15, roughness: 0.3 }),
      bodyPaint: paintMaterial(C.container, { metalness: 0.45, roughness: 0.38 }),
      bodyPaintDark: paintMaterial(C.containerDark, { metalness: 0.45, roughness: 0.42 }),
      chrome: chromeMaterial(),
      metal: metalMaterial(),
      darkMetal: metalMaterial(0x33373c, { roughness: 0.5 }),
      glass: glassMaterial(),
      rubber: rubberMaterial(),
      bumper: plasticMaterial(0x2e3237, { roughness: 0.6 }),
      trim: plasticMaterial(0x1c1f23, { roughness: 0.75 }),
      hydraulic: chromeMaterial(0xd8dde2, { roughness: 0.05 }),
      armPaint: paintMaterial(C.arm, { metalness: 0.25, roughness: 0.45 }),
      amber: lensMaterial(0xffa71a, 1.1),
      chargeLamp: lensMaterial(0x4dffa8, 1.6),
      indicator: lensMaterial(0xff8c1a, 0.12),
      arch: plasticMaterial(0x15181c, { roughness: 0.95 }),
      rim: new THREE.MeshStandardMaterial({
        color: 0xe4e9ee, metalness: 0.45, roughness: 0.3, envMapIntensity: 1.2,
      }),
      stripeRed: reflectiveMaterial(0xd42a1a),
      stripeWhite: reflectiveMaterial(0xf2f2f2),
      drl: lensMaterial(0xdfefff, 1.5),
      headlight: lensMaterial(0xfff6de, 1.0),
      tail: lensMaterial(0xff2a1f, 0.55),
      reverse: lensMaterial(0xffffff, 0.0),
      reflective: reflectiveMaterial(0xf5e400),
      decal: new THREE.MeshStandardMaterial({
        map: decalTex, transparent: true, roughness: 0.45, metalness: 0.0,
        envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2,
      }),
      plate: new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.5, metalness: 0.1 }),
      chevron: new THREE.MeshStandardMaterial({
        map: chevronTexture(), roughness: 0.45, metalness: 0.2,
        emissiveMap: chevronTexture(), emissive: 0xffffff, emissiveIntensity: 0.25,
      }),
    };
  }

  _build() {
    this._buildChassis();
    this._buildWheels();
    this._buildCab();
    this._buildContainer();
    this._buildArm();
    this._buildLights();
  }

  // --- Frame ---------------------------------------------------------------
  _buildChassis() {
    const M = this.mats;

    // Two ladder rails rather than one slab — visible under the body and
    // between the wheels, which is a big part of reading as a real truck.
    for (const side of [-1, 1]) {
      const rail = part(rbox(0.16, 0.3, 6.9, 0.03), M.darkMetal);
      rail.position.set(side * 0.62, FRAME_Y, -0.15);
      this.body.add(rail);
    }
    for (const z of [2.6, 1.2, -0.4, -2.0, -3.2]) {
      const cross = part(rbox(1.3, 0.14, 0.16, 0.03), M.darkMetal);
      cross.position.set(0, FRAME_Y, z);
      this.body.add(cross);
    }

    // Fuel tank + air tanks slung under the left rail.
    const fuel = part(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 18), M.chrome);
    fuel.rotation.x = Math.PI / 2;
    fuel.position.set(-0.86, 0.66, 0.55);
    this.body.add(fuel);
    for (const [i, z] of [0.05, -0.55].entries()) {
      const air = part(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 14), M.metal);
      air.rotation.z = Math.PI / 2;
      air.position.set(0.88, 0.6, z - i * 0.1);
      this.body.add(air);
    }

    // Battery box on the right.
    const batt = part(rbox(0.34, 0.36, 0.6, 0.03), M.darkMetal);
    batt.position.set(0.86, 0.66, 1.15);
    this.body.add(batt);
  }

  // --- Wheels --------------------------------------------------------------
  _buildWheels() {
    const M = this.mats;
    const rimR = WHEEL_R * 0.6;
    const width = 0.4;

    // One geometry, reused by every wheel.
    const tyreGeo = tyreGeometry(WHEEL_R, width, rimR * 0.98);
    const rimGeo = rimGeometry(rimR, width);

    this.wheels = { steerable: [], spinning: [] };

    const spec = [
      { x: -TRACK, z: AXLE_FRONT, steer: true, dual: false },
      { x: TRACK, z: AXLE_FRONT, steer: true, dual: false },
      { x: -TRACK, z: AXLE_REAR_A, steer: false, dual: true },
      { x: TRACK, z: AXLE_REAR_A, steer: false, dual: true },
      { x: -TRACK, z: AXLE_REAR_B, steer: false, dual: true },
      { x: TRACK, z: AXLE_REAR_B, steer: false, dual: true },
    ];

    for (const s of spec) {
      // Steering pivot: rotates in Y, stays at ground level.
      const pivot = new THREE.Group();
      pivot.position.set(s.x, WHEEL_R, s.z);
      this.group.add(pivot);

      // Spinner: rotates in X. Nested inside the pivot so steer and spin
      // compose correctly instead of fighting each other.
      const spinner = new THREE.Group();
      pivot.add(spinner);

      const flip = s.x < 0 ? -1 : 1;
      const tyre = part(tyreGeo, M.rubber);
      tyre.scale.x = flip;
      spinner.add(tyre);
      const rim = part(rimGeo, M.rim);
      rim.scale.x = flip;
      spinner.add(rim);

      // Rear axles are twin-tyred, like the real thing.
      if (s.dual) {
        const inner = part(tyreGeo, M.rubber);
        inner.scale.x = flip;
        inner.position.x = -flip * width * 1.02;
        spinner.add(inner);
      }

      if (s.steer) this.wheels.steerable.push(pivot);
      this.wheels.spinning.push(spinner);
    }

    // Axle tubes + differential housings.
    for (const z of [AXLE_FRONT, AXLE_REAR_A, AXLE_REAR_B]) {
      const axle = part(new THREE.CylinderGeometry(0.09, 0.09, TRACK * 2, 10), this.mats.darkMetal);
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, WHEEL_R, z);
      this.group.add(axle);
      if (z !== AXLE_FRONT) {
        const diff = part(new THREE.SphereGeometry(0.22, 12, 10), this.mats.darkMetal);
        diff.position.set(0, WHEEL_R, z);
        this.group.add(diff);
      }
    }

    // Mudflaps hang behind the rearmost axle.
    for (const side of [-1, 1]) {
      const flap = part(new THREE.PlaneGeometry(0.44, 0.42), this.mats.trim, { receive: false });
      flap.material.side = THREE.DoubleSide;
      flap.position.set(side * TRACK, 0.26, AXLE_REAR_B - 0.5);
      this.body.add(flap);
    }
  }

  // --- Cab -----------------------------------------------------------------
  // Built from an extruded side profile rather than stacked boxes, so the
  // screen rake, roof crown and lower fascia are one continuous surface.
  _buildCab() {
    const M = this.mats;
    const cab = new THREE.Group();
    const CAB_Z = 1.40;   // cab rear plane, world Z
    const CAB_Y = 0.82;   // cab floor, world Y
    const CAB_W = 2.42;
    cab.position.set(0, CAB_Y, CAB_Z);
    this.body.add(cab);
    this.cab = cab;
    this.cabDims = { CAB_Z, CAB_Y, CAB_W, len: 1.95 };

    // Profile coords: u forward from the cab's rear plane, v up from the floor.
    const p = new THREE.Shape();
    // Front axle sits at world 2.46, i.e. u = 2.46 - CAB_Z = 1.06.
    const fArch = 1.06, fArchR = 0.62;
    p.moveTo(0, 0.04);
    p.lineTo(fArch - fArchR, 0.04);
    p.absarc(fArch, 0.04, fArchR, Math.PI, 0, true);  // front wheel arch
    p.lineTo(1.78, 0.04);
    p.quadraticCurveTo(1.90, 0.06, 1.92, 0.26);
    p.lineTo(1.94, 0.9);                       // flat, upright front face
    p.quadraticCurveTo(1.96, 1.05, 1.91, 1.14); // cowl radius into the screen
    p.lineTo(1.85, 2.0);                       // windscreen, near-vertical
    p.quadraticCurveTo(1.82, 2.07, 1.62, 2.09); // roof front radius
    p.lineTo(0.36, 2.09);                      // roof
    p.quadraticCurveTo(0.10, 2.09, 0.06, 1.90); // roof rear radius
    p.lineTo(0.02, 1.2);
    p.lineTo(0, 0.04);
    p.closePath();

    const shell = part(extrudeProfile(p, CAB_W), M.cabPaint);
    cab.add(shell);
    this.cabProfile = p;

    // Greenhouse taper: a slightly narrower cap over the glass band makes the
    // roof read as tapered instead of slab-sided.
    const capShape = new THREE.Shape();
    capShape.moveTo(0.12, 1.5);
    capShape.lineTo(1.88, 1.5);
    capShape.lineTo(1.85, 1.96);
    capShape.quadraticCurveTo(1.81, 2.06, 1.62, 2.09);
    capShape.lineTo(0.36, 2.09);
    capShape.quadraticCurveTo(0.10, 2.09, 0.06, 1.90);
    capShape.closePath();
    const cap = part(extrudeProfile(capShape, CAB_W - 0.1), M.cabPaint);
    cap.position.y = 0.005;
    cab.add(cap);

    // --- Glazing -----------------------------------------------------------
    // Interior first: glass with nothing behind it reads as a hole.
    const cabin = part(rbox(2.06, 0.86, 1.24, 0.06), M.trim, { cast: false });
    cabin.position.set(0, 1.62, 0.98);
    cab.add(cabin);
    const dash = part(rbox(2.0, 0.2, 0.44, 0.05), M.trim, { cast: false });
    dash.position.set(0, 1.42, 1.5);
    cab.add(dash);
    for (const sx of [-0.54, 0.54]) {
      const seat = part(rbox(0.46, 0.54, 0.44, 0.09), M.trim, { cast: false });
      seat.position.set(sx, 1.44, 1.04);
      cab.add(seat);
    }
    const steer = part(new THREE.TorusGeometry(0.18, 0.03, 8, 20), M.trim, { cast: false });
    steer.position.set(-0.54, 1.56, 1.38);
    steer.rotation.x = 1.2;
    cab.add(steer);

    // Windscreen laid on the raked face, angle taken from the profile so the
    // glass and the surface agree rather than being eyeballed.
    const wsA = new THREE.Vector2(1.91, 1.14);
    const wsB = new THREE.Vector2(1.85, 2.0);
    const wsMid = wsA.clone().add(wsB).multiplyScalar(0.5);
    const wsLen = wsA.distanceTo(wsB);
    const wsRake = Math.atan2(wsA.x - wsB.x, wsB.y - wsA.y); // from vertical
    const screen = part(rbox(2.16, wsLen * 1.02, 0.05, 0.02), M.glass, { cast: false });
    screen.position.set(0, wsMid.y, wsMid.x + 0.03);
    screen.rotation.x = -wsRake;
    cab.add(screen);
    // Blacked-out surround, marginally larger and just behind.
    const surround = part(rbox(2.3, wsLen * 1.12, 0.05, 0.02), M.trim);
    surround.position.set(0, wsMid.y, wsMid.x - 0.01);
    surround.rotation.x = -wsRake;
    cab.add(surround);
    for (const sx of [-0.5, 0.44]) {
      const wiper = part(rbox(0.7, 0.03, 0.03, 0.012), M.trim, { cast: false });
      wiper.position.set(sx, wsMid.y - wsLen * 0.38, wsMid.x + 0.08);
      wiper.rotation.z = 0.15;
      wiper.rotation.x = -wsRake;
      cab.add(wiper);
    }

    const HW = CAB_W / 2;
    for (const side of [-1, 1]) {
      // Door aperture: a shaped opening, not a rectangle stuck on the flank.
      const doorGlass = part(rbox(0.05, 0.6, 1.02, 0.03), M.glass, { cast: false });
      doorGlass.position.set(side * (HW - 0.03), 1.66, 0.92);
      cab.add(doorGlass);
      // Quarter-light ahead of the door, angled to follow the A-pillar.
      const quarter = part(rbox(0.05, 0.44, 0.26, 0.02), M.glass, { cast: false });
      quarter.position.set(side * (HW - 0.03), 1.62, 1.52);
      quarter.rotation.x = 0.3;
      cab.add(quarter);

      // Character line: one crease running the cab's length, picked up again on
      // the body so the eye reads a single vehicle.
      const crease = part(rbox(0.045, 0.07, 1.7, 0.02), M.cabPaint);
      crease.position.set(side * (HW + 0.005), 1.16, 1.0);
      cab.add(crease);

      const shut = part(rbox(0.025, 1.5, 0.035, 0.01), M.trim);
      shut.position.set(side * (HW + 0.01), 0.95, 0.42);
      cab.add(shut);
      const handle = part(rbox(0.055, 0.07, 0.26, 0.025), M.chrome);
      handle.position.set(side * (HW + 0.02), 1.22, 0.8);
      cab.add(handle);
      const grab = part(new THREE.CylinderGeometry(0.026, 0.026, 0.94, 8), M.chrome);
      grab.position.set(side * (HW + 0.01), 1.0, 1.42);
      cab.add(grab);

      // Steps recessed into the sill rather than bolted underneath.
      const stepBox = part(rbox(0.42, 0.62, 0.5, 0.05), M.trim, { cast: false });
      stepBox.position.set(side * (HW - 0.16), -0.02, 0.94);
      cab.add(stepBox);
      for (const [i, v] of [0.08, -0.24].entries()) {
        const tread = part(rbox(0.44, 0.06, 0.4, 0.02), M.darkMetal);
        tread.position.set(side * (HW - 0.14), v, 0.94 - i * 0.03);
        cab.add(tread);
      }

      // Mirror: twin-stalk arm at screen height.
      const stalkU = part(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 8), M.darkMetal);
      stalkU.rotation.z = Math.PI / 2;
      stalkU.position.set(side * (HW + 0.12), 1.9, 1.62);
      cab.add(stalkU);
      const stalkL = part(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 8), M.darkMetal);
      stalkL.rotation.z = Math.PI / 2;
      stalkL.position.set(side * (HW + 0.12), 1.5, 1.62);
      cab.add(stalkL);
      const mirrorBody = part(rbox(0.075, 0.62, 0.2, 0.045), M.trim);
      mirrorBody.position.set(side * (HW + 0.25), 1.7, 1.62);
      cab.add(mirrorBody);
      const mirrorGlass = part(rbox(0.02, 0.54, 0.15, 0.01), M.chrome, { cast: false });
      mirrorGlass.position.set(side * (HW + 0.29), 1.7, 1.62);
      cab.add(mirrorGlass);
    }

    // Front arch liner, same reasoning as the rear ones.
    const fLinerGeo = new THREE.CylinderGeometry(fArchR, fArchR, CAB_W - 0.03, 18, 1, true, 0, Math.PI);
    fLinerGeo.rotateZ(Math.PI / 2);
    const fLiner = part(fLinerGeo, M.arch, { cast: false });
    fLiner.material.side = THREE.DoubleSide;
    fLiner.position.set(0, 0.04, fArch);
    cab.add(fLiner);

    // --- Front fascia ------------------------------------------------------
    // Grille as a shaped identity element, inset into the front face.
    const grilleSurround = part(rbox(2.1, 0.82, 0.1, 0.05), M.cabPaint);
    grilleSurround.position.set(0, 0.88, 1.92);
    cab.add(grilleSurround);
    const grilleWell = part(rbox(1.88, 0.68, 0.08, 0.03), M.trim);
    grilleWell.position.set(0, 0.88, 1.96);
    cab.add(grilleWell);
    for (let i = 0; i < 3; i++) {
      const slat = part(rbox(1.76, 0.1, 0.06, 0.025), M.darkMetal);
      slat.position.set(0, 0.7 + i * 0.19, 1.99);
      cab.add(slat);
    }
    const badge = part(new THREE.PlaneGeometry(0.68, 0.29), M.decal, { cast: false, receive: false });
    badge.position.set(0, 1.24, 1.97);
    cab.add(badge);

    // Bumper wrapping into the corners, with a valance under it.
    const bumper = part(rbox(2.46, 0.42, 0.42, 0.1), M.bumper);
    bumper.position.set(0, 0.3, 1.92);
    cab.add(bumper);
    for (const side of [-1, 1]) {
      const corner = part(rbox(0.3, 0.5, 0.5, 0.12), M.bumper);
      corner.position.set(side * 1.12, 0.32, 1.8);
      cab.add(corner);
    }
    const valance = part(rbox(2.0, 0.18, 0.3, 0.06), M.trim);
    valance.position.set(0, 0.05, 1.9);
    cab.add(valance);
    const plate = part(new THREE.PlaneGeometry(0.5, 0.14), M.plate, { cast: false });
    plate.position.set(0.58, 0.3, 2.14);
    cab.add(plate);

    // Roof: visor integrated into the crown, plus marker lamps.
    const visor = part(rbox(2.36, 0.09, 0.34, 0.04), M.cabPaint);
    visor.position.set(0, 2.1, 1.78);
    visor.rotation.x = 0.26;
    cab.add(visor);

    this.markerLamps = [];
    for (const x of [-0.84, -0.3, 0.3, 0.84]) {
      const lamp = part(rbox(0.15, 0.06, 0.1, 0.02), M.amber, { cast: false });
      lamp.position.set(x, 2.12, 1.68);
      cab.add(lamp);
      this.markerLamps.push(lamp);
    }

    // Charge port where a diesel would carry its stack.
    const portFlap = part(rbox(0.06, 0.34, 0.4, 0.03), M.cabPaint);
    portFlap.position.set(-(HW + 0.01), 0.86, 0.42);
    cab.add(portFlap);
    const portRing = part(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 14), M.darkMetal);
    portRing.rotation.z = Math.PI / 2;
    portRing.position.set(-(HW + 0.05), 0.86, 0.42);
    cab.add(portRing);
    const portGlow = part(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), M.chargeLamp, { cast: false });
    portGlow.rotation.z = Math.PI / 2;
    portGlow.position.set(-(HW + 0.07), 0.86, 0.42);
    cab.add(portGlow);
    this.chargePortLamp = portGlow;
  }

  // --- Compactor body ------------------------------------------------------
  // Also an extruded profile: the rear taper, roof crown and the twin rear
  // wheel arches are cut into one surface.
  _buildContainer() {
    const M = this.mats;
    const BODY_Z = -3.5;   // rear plane, world Z
    const BODY_Y = 0.84;
    const W = 2.44;
    const HW = W / 2;

    const box = new THREE.Group();
    box.position.set(0, BODY_Y, BODY_Z);
    this.body.add(box);
    this.containerGroup = box;
    this.containerHalfWidth = HW;
    this.bodyDims = { BODY_Z, BODY_Y, W };

    // Profile: u forward from the rear plane, v up from the frame.
    // Rear axles sit at world -2.74 and -1.44 -> u = 0.76 and 2.06.
    // Arch sizing is derived, not eyeballed. At the body's lower edge (0.05
    // above the frame) a 0.58 m tyre is 2*sqrt(0.58² - 0.31²) ≈ 0.98 wide, so
    // the opening must exceed that; the radius also sets how far it arcs over
    // the tyre's crown.
    const archR = 0.6;
    const p2 = new THREE.Shape();
    p2.moveTo(0, 0.3);                         // rear, above the bumper
    p2.lineTo(0, 0.05);
    p2.lineTo(0.02, 0.05);
    // Twin rear arches scalloped into the lower edge.
    p2.lineTo(0.76 - archR, 0.05);
    p2.absarc(0.76, 0.05, archR, Math.PI, 0, true);
    p2.lineTo(2.06 - archR, 0.05);
    p2.absarc(2.06, 0.05, archR, Math.PI, 0, true);
    p2.lineTo(4.85, 0.05);                     // forward, up against the cab
    // The body stands well proud of the cab roof — on a real refuse truck the
    // hopper towers over the driver, and matching their heights was the single
    // biggest reason the old shape read wrong.
    p2.lineTo(4.85, 2.46);
    p2.quadraticCurveTo(4.85, 2.64, 4.64, 2.66); // front roof radius
    p2.lineTo(0.36, 2.66);                     // roof
    p2.quadraticCurveTo(0.06, 2.66, 0.02, 2.4); // rear roof radius
    p2.lineTo(0, 0.3);
    p2.closePath();

    const shell = part(extrudeProfile(p2, W), M.bodyPaint);
    box.add(shell);

    for (const side of [-1, 1]) {
      const x = side * (HW + 0.005);

      // Character line continued from the cab at the same height, which is
      // what makes cab and body read as one vehicle instead of two objects.
      const crease = part(rbox(0.05, 0.08, 4.5, 0.025), M.bodyPaintDark);
      crease.position.set(x, 1.14, 2.5);
      box.add(crease);

      // Ribbed pressings above the crease, on the rear half only.
      for (let i = 0; i < 5; i++) {
        const rib = part(rbox(0.06, 1.1, 0.11, 0.025), M.bodyPaintDark);
        rib.position.set(x, 1.86, 0.72 + i * 0.46);
        box.add(rib);
      }

      // Livery panel on the front half, proud of the surface.
      const panel = part(rbox(0.05, 1.6, 2.1, 0.04), M.bodyPaint);
      panel.position.set(x, 1.72, 3.5);
      box.add(panel);
      const decal = part(new THREE.PlaneGeometry(1.86, 0.8), M.decal, { cast: false, receive: false });
      decal.position.set(side * (HW + 0.045), 1.76, 3.5);
      decal.rotation.y = side * Math.PI / 2;
      box.add(decal);

      // Conspicuity striping along the lower flank, as required on a real
      // refuse truck and clearly visible in the reference photos.
      for (let i = 0; i < 9; i++) {
        const seg = part(rbox(0.045, 0.12, 0.34, 0.015),
          i % 2 === 0 ? M.stripeRed : M.stripeWhite, { cast: false });
        seg.position.set(x, 0.78, 0.5 + i * 0.36);
        box.add(seg);
      }

      // Top rail and a sill that follows the arches.
      const rail = part(rbox(0.13, 0.15, 4.6, 0.035), M.metal);
      rail.position.set(side * HW, 2.6, 2.4);
      box.add(rail);
      const sill = part(rbox(0.1, 0.2, 1.1, 0.03), M.bodyPaintDark);
      sill.position.set(side * HW, 0.14, 4.1);
      box.add(sill);
    }

    // Arch liners. The extrusion cuts each arch clean through the body, so
    // without an inner surface you see daylight through the wheel wells.
    for (const u of [0.76, 2.06]) {
      const linerGeo = new THREE.CylinderGeometry(archR, archR, W - 0.03, 18, 1, true, 0, Math.PI);
      linerGeo.rotateZ(Math.PI / 2);   // axis across the vehicle, open side down
      const liner = part(linerGeo, M.arch, { cast: false });
      liner.material.side = THREE.DoubleSide;
      liner.position.set(0, 0.05, u);
      box.add(liner);
    }

    // Rear hopper: sloped loading section, then the tailgate.
    const hopper = part(rbox(2.36, 2.2, 0.9, 0.09), M.bodyPaintDark);
    hopper.position.set(0, 1.2, 0.52);
    hopper.rotation.x = 0.06;
    box.add(hopper);
    const tailgate = part(rbox(2.1, 1.64, 0.16, 0.05), M.bodyPaint);
    tailgate.position.set(0, 1.24, 0.04);
    box.add(tailgate);

    // Tailgate rams.
    for (const side of [-1, 1]) {
      const barrel = part(new THREE.CylinderGeometry(0.075, 0.075, 0.76, 12), M.darkMetal);
      barrel.rotation.x = -0.5;
      barrel.position.set(side * 0.96, 2.16, 0.62);
      box.add(barrel);
      const rod = part(new THREE.CylinderGeometry(0.038, 0.038, 0.7, 10), M.hydraulic);
      rod.rotation.x = -0.5;
      rod.position.set(side * 0.96, 1.88, 0.28);
      box.add(rod);
    }

    const chevrons = part(new THREE.PlaneGeometry(2.0, 0.44), M.chevron, { cast: false });
    chevrons.position.set(0, 0.5, -0.05);
    box.add(chevrons);
    const rearBumper = part(rbox(2.2, 0.24, 0.26, 0.06), M.bumper);
    rearBumper.position.set(0, 0.12, -0.06);
    box.add(rearBumper);
    // Underrun bar, as required on a real refuse truck.
    for (const side of [-1, 1]) {
      const stay = part(rbox(0.12, 0.4, 0.12, 0.03), M.darkMetal);
      stay.position.set(side * 0.8, -0.1, 0.12);
      box.add(stay);
    }
  }

  // --- Side-loading arm ----------------------------------------------------
  // Folded vertically against the front of the body, the way a zijlader stows
  // its arm in transit. Compact on purpose: a boom lying back along the flank
  // would cover the ROVA livery.
  _buildArm() {
    const M = this.mats;
    const HW = this.containerHalfWidth;

    const base = new THREE.Group();
    base.position.set(HW + 0.09, 0.95, 0.86);
    this.body.add(base);
    this.armBase = base;

    // Mast bolted to the body's front corner.
    const mast = part(rbox(0.3, 1.72, 0.46, 0.06), M.armPaint);
    mast.position.y = 0.86;
    base.add(mast);
    const mastFoot = part(rbox(0.38, 0.16, 0.56, 0.04), M.darkMetal);
    base.add(mastFoot);
    const mastCap = part(rbox(0.36, 0.14, 0.52, 0.04), M.darkMetal);
    mastCap.position.y = 1.76;
    base.add(mastCap);

    // Boom folded up alongside the mast, carried on a pivot at the foot.
    const boom = new THREE.Group();
    boom.position.set(0.26, 0.2, 0);
    base.add(boom);

    const boomArm = part(rbox(0.22, 1.5, 0.32, 0.05), M.armPaint);
    boomArm.position.y = 0.74;
    boom.add(boomArm);

    // Hydraulic ram: barrel low, bright rod extending up out of it.
    const ramBarrel = part(new THREE.CylinderGeometry(0.058, 0.058, 0.62, 12), M.darkMetal);
    ramBarrel.position.set(0.15, 0.36, 0);
    boom.add(ramBarrel);
    const ramRod = part(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 10), M.hydraulic);
    ramRod.position.set(0.15, 0.92, 0);
    boom.add(ramRod);

    const pin = part(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 12), M.hydraulic);
    pin.rotation.z = Math.PI / 2;
    boom.add(pin);

    // Grabber head at the top of the folded boom, jaws hanging down.
    const grabber = new THREE.Group();
    grabber.position.set(0, 1.5, 0);
    boom.add(grabber);
    const carrier = part(rbox(0.36, 0.2, 0.42, 0.05), M.armPaint);
    grabber.add(carrier);

    this.grabberArms = [];
    for (const side of [-1, 1]) {
      const jaw = new THREE.Group();
      jaw.position.set(0, -0.1, side * 0.11);
      grabber.add(jaw);
      const jawArm = part(rbox(0.08, 0.38, 0.07, 0.02), M.hydraulic);
      jawArm.position.y = -0.18;
      jaw.add(jawArm);
      const jawTip = part(rbox(0.1, 0.08, 0.18, 0.02), M.darkMetal);
      jawTip.position.set(0, -0.36, side * 0.05);
      jaw.add(jawTip);
      jaw.userData.side = side;
      this.grabberArms.push(jaw);
    }

    this.armBoom = boom;
    this.armGrabber = grabber;
  }

  // --- Lighting ------------------------------------------------------------
  _buildLights() {
    const M = this.mats;
    const cab = this.cab;
    const HW = this.cabDims.CAB_W / 2;

    // Front clusters recessed into the fascia beside the bumper.
    this.headlampLenses = [];
    this.frontIndicators = [];
    for (const side of [-1, 1]) {
      const housing = part(rbox(0.5, 0.34, 0.16, 0.05), M.trim);
      housing.position.set(side * 0.86, 0.56, 1.94);
      cab.add(housing);
      const lens = part(rbox(0.42, 0.26, 0.07, 0.03), M.headlight, { cast: false });
      lens.position.set(side * 0.86, 0.56, 2.02);
      cab.add(lens);
      this.headlampLenses.push(lens);

      // Separate indicator lens beside each headlamp.
      const ind = part(rbox(0.16, 0.2, 0.06, 0.025), M.indicator.clone(), { cast: false });
      ind.position.set(side * 1.12, 0.56, 1.98);
      cab.add(ind);
      this.frontIndicators.push({ mesh: ind, side });

      // DRL strip along the top of the cluster.
      const drl = part(rbox(0.4, 0.05, 0.05, 0.02), M.drl, { cast: false });
      drl.position.set(side * 0.86, 0.73, 2.03);
      cab.add(drl);
    }

    // Side repeaters on the cab flanks.
    this.sideIndicators = [];
    for (const side of [-1, 1]) {
      const rep = part(rbox(0.05, 0.09, 0.22, 0.02), M.indicator.clone(), { cast: false });
      rep.position.set(side * (HW + 0.02), 1.16, 0.3);
      cab.add(rep);
      this.sideIndicators.push({ mesh: rep, side });
    }

    // Rear cluster on the tailgate (tailgate face sits at body-local z ≈ -0.04).
    const REAR_Z = -0.06;
    this.brakeLenses = [];
    this.rearIndicators = [];
    for (const side of [-1, 1]) {
      const housing = part(rbox(0.24, 0.8, 0.12, 0.04), M.trim);
      housing.position.set(side * 0.9, 1.16, REAR_Z);
      this.containerGroup.add(housing);

      const brake = part(rbox(0.17, 0.24, 0.06, 0.025), M.tail, { cast: false });
      brake.position.set(side * 0.9, 1.42, REAR_Z - 0.07);
      this.containerGroup.add(brake);
      this.brakeLenses.push(brake);

      const ind = part(rbox(0.17, 0.17, 0.06, 0.025), M.indicator.clone(), { cast: false });
      ind.position.set(side * 0.9, 1.16, REAR_Z - 0.07);
      this.containerGroup.add(ind);
      this.rearIndicators.push({ mesh: ind, side });

      const rev = part(rbox(0.17, 0.17, 0.06, 0.025), M.reverse, { cast: false });
      rev.position.set(side * 0.9, 0.9, REAR_Z - 0.07);
      this.containerGroup.add(rev);
    }

    // Amber beacon bar across the cab roof.
    this.beacons = [];
    const beaconBar = part(rbox(1.6, 0.08, 0.18, 0.03), M.darkMetal);
    beaconBar.position.set(0, 2.12, 0.8);
    cab.add(beaconBar);
    for (const side of [-1, 1]) {
      const beacon = part(new THREE.CylinderGeometry(0.08, 0.09, 0.16, 12), M.amber.clone(), { cast: false });
      beacon.position.set(side * 0.64, 2.22, 0.8);
      cab.add(beacon);
      this.beacons.push(beacon);
    }
    this.beaconLight = new THREE.PointLight(0xffa71a, 0, 8, 2);
    this.beaconLight.position.set(0, 3.3, 2.3);
    this.body.add(this.beaconLight);

    // --- Beams -------------------------------------------------------------
    // Headlamps are real spotlights that light the road. They are switchable in
    // every world, not just at night, and dipped/main beam differ in reach.
    this.headlights = [];
    for (const side of [-1, 1]) {
      const spot = new THREE.SpotLight(0xfff2c9, 0, 30, Math.PI / 5.5, 0.45, 1.1);
      spot.position.set(side * 0.86, 1.3, 3.2);
      const target = new THREE.Object3D();
      target.position.set(side * 0.98, 0, 16);
      this.group.add(target);
      spot.target = target;
      this.group.add(spot);
      this.headlights.push({ spot, target });
    }

    // Reversing lamps throw a short pool of light behind the truck.
    this.reverseLight = new THREE.SpotLight(0xffffff, 0, 12, Math.PI / 4, 0.6, 1.2);
    this.reverseLight.position.set(0, 1.2, -3.4);
    const revTarget = new THREE.Object3D();
    revTarget.position.set(0, 0, -9);
    this.group.add(revTarget);
    this.reverseLight.target = revTarget;
    this.group.add(this.reverseLight);
  }

  // --- Public API ----------------------------------------------------------

  /** Turns the headlamps on/off. Works in every world, not just at night. */
  setHeadlights(on) {
    this.lightsOn = !!on;
    this.headlights.forEach(({ spot }) => { spot.intensity = on ? 110 : 0; });
    this.mats.headlight.emissiveIntensity = on ? 2.4 : 0.7;
    this.mats.drl.emissiveIntensity = on ? 2.0 : 1.2;
  }

  toggleHeadlights() {
    this.setHeadlights(!this.lightsOn);
    return this.lightsOn;
  }

  teleport(position, heading = 0) {
    this.position.copy(position);
    this.heading = heading;
    this.speed = 0;
    this.pitch = this.pitchVel = this.roll = this.rollVel = 0;
    this._prevSpeed = 0;
    this.group.position.copy(position);
    this.group.rotation.y = heading;
    this.body.rotation.set(0, 0, 0);
  }

  update(delta, input, bounds = 60) {
    this._elapsed += delta;

    const throttle = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const braking = input.brake;

    if (throttle > 0) this.speed += this.accel * delta;
    else if (throttle < 0) this.speed -= this.accel * delta;
    else {
      if (this.speed > 0) this.speed = Math.max(0, this.speed - this.friction * delta);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + this.friction * delta);
    }
    if (braking) {
      if (this.speed > 0) this.speed = Math.max(0, this.speed - this.brakeDecel * delta);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + this.brakeDecel * delta);
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxReverse, this.maxSpeed);

    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / this.maxSpeed, 0.15, 1);
    const dir = this.speed < 0 ? -1 : 1;
    if (Math.abs(this.speed) > 0.02) {
      this.heading += steerInput * this.turnRate * speedFactor * dir * delta;
      this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    }
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, steerInput * this.maxSteer, 0.15);

    this.position.x += Math.sin(this.heading) * this.speed * delta;
    this.position.z += Math.cos(this.heading) * this.speed * delta;

    const b = bounds;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -b, b);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -b, b);

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;

    this._updateSuspension(delta, steerInput);
    this._updateWheels(delta);
    this._updateLights(delta, throttle, braking);
  }

  /**
   * Sprung-mass motion. Longitudinal acceleration drives pitch (nose dives
   * under braking, squats under power) and cornering drives roll, each through
   * a critically-ish damped spring so the body settles instead of snapping.
   */
  _updateSuspension(delta, steerInput) {
    const accel = (this.speed - this._prevSpeed) / Math.max(delta, 1e-4);
    this._prevSpeed = this.speed;

    // Targets, clamped so hard inputs can't fold the body over.
    // Coefficient chosen so ordinary throttle (accel 9) squats to roughly
    // two-thirds of travel, while hard braking (decel 18) pegs the nose down.
    // A larger value pins the body at its clamp the entire time you hold W,
    // which just reads as a permanently nose-up truck.
    const pitchTarget = THREE.MathUtils.clamp(-accel * 0.004, -0.06, 0.06);
    const lateral = steerInput * (this.speed / this.maxSpeed);
    const rollTarget = THREE.MathUtils.clamp(lateral * 0.10, -0.09, 0.09);

    const stiffness = 120;
    const damping = 15;
    this.pitchVel += ((pitchTarget - this.pitch) * stiffness - this.pitchVel * damping) * delta;
    this.pitch += this.pitchVel * delta;
    this.rollVel += ((rollTarget - this.roll) * stiffness - this.rollVel * damping) * delta;
    this.roll += this.rollVel * delta;

    // No idle shake. A diesel vibrates at a standstill; an electric drivetrain
    // is dead still, and that stillness is part of how an EV reads.
    this.body.rotation.x = this.pitch;
    this.body.rotation.z = this.roll;
    // Body sinks very slightly with the spring travel.
    this.body.position.y = -Math.abs(this.pitch) * 0.12;
  }

  _updateWheels(delta) {
    const spin = (this.speed * delta) / this.wheelRadius;
    this.wheels.spinning.forEach((s) => { s.rotation.x -= spin; });
    this.wheels.steerable.forEach((pivot) => { pivot.rotation.y = this.steerAngle; });
  }

  _updateLights(delta, throttle, braking) {
    const M = this.mats;

    // Brake lamps: full glow while slowing under command, dim tail glow otherwise.
    const decelerating = braking || (throttle < 0 && this.speed > 0.1);
    M.tail.emissiveIntensity = THREE.MathUtils.lerp(
      M.tail.emissiveIntensity, decelerating ? 2.8 : 0.5, 0.25,
    );

    // Reversing lamps plus a real pool of light behind the truck.
    const reversing = this.speed < -0.15;
    M.reverse.emissiveIntensity = THREE.MathUtils.lerp(
      M.reverse.emissiveIntensity, reversing ? 2.2 : 0.0, 0.2,
    );
    this.reverseLight.intensity = THREE.MathUtils.lerp(
      this.reverseLight.intensity, reversing ? 18 : 0, 0.2,
    );

    // Indicators blink at ~1.5 Hz on whichever side you are steering toward,
    // and only the lamps on that side light.
    const steering = Math.abs(this.steerAngle) > this.maxSteer * 0.12
      ? Math.sign(this.steerAngle) : 0;
    // steerAngle is positive when steering left, and +X is the truck's left.
    const activeSide = steering;
    const blinkOn = steering !== 0 && (this._elapsed % 0.68) < 0.36;
    const setInd = ({ mesh, side }) => {
      const lit = blinkOn && side === activeSide;
      mesh.material.emissiveIntensity = THREE.MathUtils.lerp(
        mesh.material.emissiveIntensity, lit ? 3.0 : 0.12, 0.45,
      );
    };
    this.frontIndicators.forEach(setInd);
    this.rearIndicators.forEach(setInd);
    this.sideIndicators.forEach(setInd);

    // Rotating beacons: two lamps pulsing out of phase read as a strobe.
    const t = this._elapsed * 5;
    this.beacons.forEach((b, i) => {
      const phase = Math.sin(t + i * Math.PI);
      b.material.emissiveIntensity = 0.35 + Math.max(0, phase) * 2.4;
    });
    this.beaconLight.intensity = 6 + Math.max(0, Math.sin(t)) * 12;

    // Charge port pulses slowly, like a vehicle sitting at a charger.
    if (this.chargePortLamp) {
      this.chargePortLamp.material.emissiveIntensity = 1.0 + Math.sin(this._elapsed * 1.6) * 0.6;
    }

    // The arm idles with a slow hydraulic breathing motion.
    if (this.armBoom) {
      const sway = Math.sin(this._elapsed * 0.7);
      this.armBoom.rotation.z = -0.04 + sway * 0.03;
      this.armGrabber.rotation.z = 0.02 - sway * 0.02;
      this.grabberArms.forEach((jaw) => {
        jaw.rotation.x = jaw.userData.side * (0.1 + Math.sin(this._elapsed * 0.7 + 1) * 0.07);
      });
    }
  }

  get forwardSpeedKmh() {
    return Math.abs(this.speed) * 3.6;
  }
}
