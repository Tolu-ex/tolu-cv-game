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
const WHEEL_R = 0.52;
const TRACK = 1.06;        // half-distance between left/right wheel centres
const AXLE_FRONT = 2.35;
const AXLE_REAR_A = -1.45;
const AXLE_REAR_B = -2.62;
const FRAME_Y = 0.74;

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
      cabPaint: paintMaterial(C.cab, { metalness: 0.6, roughness: 0.28 }),
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
      amber: lensMaterial(0xffa71a, 1.1),
      chargeLamp: lensMaterial(0x4dffa8, 1.6),
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
      const rim = part(rimGeo, M.metal);
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
  _buildCab() {
    const M = this.mats;
    const cab = new THREE.Group();
    cab.position.set(0, 0.86, 2.32);
    this.body.add(cab);
    this.cab = cab;

    // Cab-over-engine: near-vertical front face, glass in the upper third.
    // Local y=0 is the top of the chassis rail.
    const shell = part(rbox(2.36, 1.92, 1.95, 0.12), M.cabPaint);
    shell.position.y = 0.96;
    cab.add(shell);

    // Interior. Without something behind the glass the windscreen renders as a
    // black hole; a blocked-out cabin reads as a cab even at a glance.
    const cabin = part(rbox(2.0, 0.8, 1.3, 0.05), M.trim, { cast: false });
    cabin.position.set(0, 1.36, -0.1);
    cab.add(cabin);
    const dash = part(rbox(1.9, 0.22, 0.3, 0.04), M.trim, { cast: false });
    dash.position.set(0, 1.1, 0.6);
    cab.add(dash);
    for (const sx of [-0.52, 0.52]) {
      const seat = part(rbox(0.44, 0.5, 0.4, 0.08), M.trim, { cast: false });
      seat.position.set(sx, 1.2, 0.05);
      cab.add(seat);
    }
    const wheelRim = part(new THREE.TorusGeometry(0.17, 0.028, 8, 18), M.trim, { cast: false });
    wheelRim.position.set(-0.52, 1.32, 0.45);
    wheelRim.rotation.x = 1.15;
    cab.add(wheelRim);

    // Windscreen, lightly raked, set into a dark surround.
    const wsSurround = part(rbox(2.2, 0.72, 0.08, 0.03), M.trim);
    wsSurround.position.set(0, 1.45, 0.92);
    wsSurround.rotation.x = -0.1;
    cab.add(wsSurround);
    const windscreen = part(rbox(2.06, 0.66, 0.06, 0.02), M.glass, { cast: false });
    windscreen.position.set(0, 1.45, 0.98);
    windscreen.rotation.x = -0.1;
    cab.add(windscreen);
    // Wipers.
    for (const sx of [-0.5, 0.42]) {
      const wiper = part(rbox(0.68, 0.03, 0.03, 0.012), M.trim, { cast: false });
      wiper.position.set(sx, 1.13, 1.0);
      wiper.rotation.z = 0.16;
      cab.add(wiper);
    }

    for (const side of [-1, 1]) {
      // Side glass sits in the door aperture, above the shoulder line.
      const sideGlass = part(rbox(0.05, 0.58, 1.0, 0.02), M.glass, { cast: false });
      sideGlass.position.set(side * 1.17, 1.42, 0.05);
      cab.add(sideGlass);

      // Door shut-line, handle and a grab rail up the A-pillar.
      const shut = part(rbox(0.02, 1.8, 0.03, 0.008), M.trim);
      shut.position.set(side * 1.19, 0.95, -0.62);
      cab.add(shut);
      const handle = part(rbox(0.05, 0.06, 0.24, 0.02), M.chrome);
      handle.position.set(side * 1.2, 0.98, -0.2);
      cab.add(handle);
      const grab = part(new THREE.CylinderGeometry(0.026, 0.026, 0.9, 8), M.chrome);
      grab.position.set(side * 1.19, 0.85, 0.62);
      cab.add(grab);

      // Climbing steps, tucked inboard under the door.
      for (const [i, y] of [0.1, -0.28].entries()) {
        const step = part(rbox(0.46, 0.07, 0.34, 0.02), M.darkMetal);
        step.position.set(side * 0.98, y, 0.16 - i * 0.04);
        cab.add(step);
      }

      // Mirror head on a short arm, at windscreen height where it belongs.
      const stalk = part(new THREE.CylinderGeometry(0.024, 0.024, 0.3, 8), M.darkMetal);
      stalk.rotation.z = Math.PI / 2;
      stalk.position.set(side * 1.32, 1.62, 0.72);
      cab.add(stalk);
      const mirrorBody = part(rbox(0.08, 0.52, 0.19, 0.04), M.trim);
      mirrorBody.position.set(side * 1.46, 1.5, 0.72);
      cab.add(mirrorBody);
      const mirrorGlass = part(rbox(0.02, 0.44, 0.14, 0.01), M.chrome, { cast: false });
      mirrorGlass.position.set(side * 1.5, 1.5, 0.72);
      cab.add(mirrorGlass);
    }

    // Grille: recessed dark panel, horizontal slats, badge on the top bar.
    const grillePanel = part(rbox(2.0, 0.66, 0.1, 0.03), M.trim);
    grillePanel.position.set(0, 0.62, 0.97);
    cab.add(grillePanel);
    for (let i = 0; i < 4; i++) {
      const slat = part(rbox(1.86, 0.08, 0.07, 0.02), M.darkMetal);
      slat.position.set(0, 0.4 + i * 0.16, 1.0);
      cab.add(slat);
    }
    const badge = part(new THREE.PlaneGeometry(0.66, 0.26), M.decal, { cast: false, receive: false });
    badge.position.set(0, 1.02, 0.99);
    cab.add(badge);

    // Bumper with plate; headlamp clusters live in _buildLights.
    const bumper = part(rbox(2.4, 0.4, 0.4, 0.08), M.bumper);
    bumper.position.set(0, -0.02, 0.9);
    cab.add(bumper);
    const plate = part(new THREE.PlaneGeometry(0.46, 0.13), M.plate, { cast: false });
    plate.position.set(0.56, -0.02, 1.11);
    cab.add(plate);

    // Roof: sun visor, aero deflector.
    const visor = part(rbox(2.3, 0.08, 0.36, 0.03), M.cabPaint);
    visor.position.set(0, 1.87, 0.86);
    visor.rotation.x = 0.2;
    cab.add(visor);
    const deflector = part(rbox(2.2, 0.3, 0.5, 0.06), M.cabPaint);
    deflector.position.set(0, 2.02, -0.68);
    deflector.rotation.x = -0.34;
    cab.add(deflector);

    this.markerLamps = [];
    for (const x of [-0.82, -0.28, 0.28, 0.82]) {
      const lamp = part(rbox(0.14, 0.06, 0.1, 0.02), M.amber, { cast: false });
      lamp.position.set(x, 1.9, 0.98);
      cab.add(lamp);
      this.markerLamps.push(lamp);
    }

    // Charge port where a diesel truck would carry its exhaust stack. ROVA runs
    // electric refuse trucks, so there is no stack and nothing to emit.
    const portFlap = part(rbox(0.06, 0.34, 0.4, 0.03), M.cabPaint);
    portFlap.position.set(-1.21, 0.62, -0.45);
    cab.add(portFlap);
    const portRing = part(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 14), M.darkMetal);
    portRing.rotation.z = Math.PI / 2;
    portRing.position.set(-1.25, 0.62, -0.45);
    cab.add(portRing);
    const portGlow = part(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), M.chargeLamp, { cast: false });
    portGlow.rotation.z = Math.PI / 2;
    portGlow.position.set(-1.27, 0.62, -0.45);
    cab.add(portGlow);
    this.chargePortLamp = portGlow;
  }

  // --- Compactor body ------------------------------------------------------
  _buildContainer() {
    const M = this.mats;
    const box = new THREE.Group();
    box.position.set(0, 0.9, -1.1);
    this.body.add(box);

    const W = 2.36, HW = W / 2;
    const main = part(rbox(W, 2.0, 3.4, 0.09), M.bodyPaint);
    main.position.set(0, 1.04, 0.35);
    box.add(main);

    for (const side of [-1, 1]) {
      // Ribbed pressings on the rear half only — they must stand proud of the
      // panel to catch light, so they sit just outside the body half-width.
      for (let i = 0; i < 5; i++) {
        const rib = part(rbox(0.07, 1.72, 0.1, 0.025), M.bodyPaintDark);
        rib.position.set(side * (HW + 0.01), 1.04, -0.95 + i * 0.42);
        box.add(rib);
      }

      // Flat livery panel on the front half, slightly proud, with the decal
      // sitting on its face so the artwork never fights the ribs.
      const panel = part(rbox(0.05, 1.5, 1.9, 0.03), M.bodyPaint);
      panel.position.set(side * (HW + 0.01), 1.1, 1.05);
      box.add(panel);
      const decal = part(new THREE.PlaneGeometry(1.68, 0.66), M.decal, { cast: false, receive: false });
      decal.position.set(side * (HW + 0.05), 1.16, 1.05);
      decal.rotation.y = side * Math.PI / 2;
      box.add(decal);

      // Top rail and lower skirt frame the flank.
      const rail = part(rbox(0.12, 0.14, 3.4, 0.03), M.metal);
      rail.position.set(side * HW, 2.0, 0.35);
      box.add(rail);
      const skirt = part(rbox(0.09, 0.36, 3.2, 0.03), M.bodyPaintDark);
      skirt.position.set(side * HW, 0.14, 0.35);
      box.add(skirt);
    }

    // Slightly crowned roof.
    const roof = part(rbox(2.26, 0.13, 3.24, 0.04), M.bodyPaintDark);
    roof.position.set(0, 2.08, 0.35);
    box.add(roof);

    // Rear hopper and tailgate.
    const hopper = part(rbox(2.3, 1.76, 0.95, 0.08), M.bodyPaintDark);
    hopper.position.set(0, 0.9, -1.72);
    hopper.rotation.x = -0.07;
    box.add(hopper);

    const tailgate = part(rbox(2.04, 1.3, 0.14, 0.04), M.bodyPaint);
    tailgate.position.set(0, 0.98, -2.2);
    box.add(tailgate);

    // Tailgate rams — chrome rods against dark paint read as working hydraulics.
    for (const side of [-1, 1]) {
      const barrel = part(new THREE.CylinderGeometry(0.075, 0.075, 0.74, 12), M.darkMetal);
      barrel.rotation.x = 0.5;
      barrel.position.set(side * 0.94, 1.68, -1.62);
      box.add(barrel);
      const rod = part(new THREE.CylinderGeometry(0.038, 0.038, 0.68, 10), M.hydraulic);
      rod.rotation.x = 0.5;
      rod.position.set(side * 0.94, 1.4, -1.95);
      box.add(rod);
    }

    const chevrons = part(new THREE.PlaneGeometry(1.94, 0.42), M.chevron, { cast: false });
    chevrons.position.set(0, 0.42, -2.29);
    box.add(chevrons);
    const rearBumper = part(rbox(2.16, 0.22, 0.24, 0.05), M.bumper);
    rearBumper.position.set(0, 0.04, -2.3);
    box.add(rearBumper);

    this.containerGroup = box;
    this.containerHalfWidth = HW;
  }

  // --- Side-loading arm ----------------------------------------------------
  // Folded vertically against the front of the body, the way a zijlader stows
  // its arm in transit. Compact on purpose: a boom lying back along the flank
  // would cover the ROVA livery.
  _buildArm() {
    const M = this.mats;
    const HW = this.containerHalfWidth;

    const base = new THREE.Group();
    base.position.set(HW + 0.09, 0.95, 0.72);
    this.body.add(base);
    this.armBase = base;

    // Mast bolted to the body's front corner.
    const mast = part(rbox(0.22, 1.55, 0.34, 0.05), M.darkMetal);
    mast.position.y = 0.78;
    base.add(mast);
    const mastFoot = part(rbox(0.3, 0.14, 0.44, 0.04), M.metal);
    base.add(mastFoot);
    const mastCap = part(rbox(0.28, 0.12, 0.4, 0.04), M.metal);
    mastCap.position.y = 1.58;
    base.add(mastCap);

    // Boom folded up alongside the mast, carried on a pivot at the foot.
    const boom = new THREE.Group();
    boom.position.set(0.2, 0.2, 0);
    base.add(boom);

    const boomArm = part(rbox(0.15, 1.35, 0.24, 0.04), M.bodyPaintDark);
    boomArm.position.y = 0.66;
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
    grabber.position.set(0, 1.34, 0);
    boom.add(grabber);
    const carrier = part(rbox(0.28, 0.16, 0.34, 0.04), M.darkMetal);
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

    // Front clusters sit in the bumper line, as on a modern cab-over.
    this.headlampLenses = [];
    for (const side of [-1, 1]) {
      const housing = part(rbox(0.46, 0.3, 0.14, 0.04), M.trim);
      housing.position.set(side * 0.88, 0.14, 1.0);
      cab.add(housing);
      const lens = part(rbox(0.4, 0.24, 0.06, 0.03), M.headlight, { cast: false });
      lens.position.set(side * 0.88, 0.14, 1.07);
      cab.add(lens);
      this.headlampLenses.push(lens);

      // Daytime running strip under each lamp.
      const drl = part(rbox(0.38, 0.05, 0.05, 0.02), M.amber, { cast: false });
      drl.position.set(side * 0.88, -0.06, 1.09);
      cab.add(drl);
    }

    // Rear cluster on the tailgate face (tailgate front is at local z ≈ -2.27).
    const REAR_Z = -2.3;
    this.brakeLenses = [];
    for (const side of [-1, 1]) {
      const housing = part(rbox(0.22, 0.66, 0.1, 0.03), M.trim);
      housing.position.set(side * 0.88, 0.98, REAR_Z);
      this.containerGroup.add(housing);

      const brake = part(rbox(0.16, 0.22, 0.05, 0.02), M.tail, { cast: false });
      brake.position.set(side * 0.88, 1.18, REAR_Z - 0.06);
      this.containerGroup.add(brake);
      this.brakeLenses.push(brake);

      const indicator = part(rbox(0.16, 0.15, 0.05, 0.02), M.amber, { cast: false });
      indicator.position.set(side * 0.88, 0.96, REAR_Z - 0.06);
      this.containerGroup.add(indicator);

      const rev = part(rbox(0.16, 0.15, 0.05, 0.02), M.reverse, { cast: false });
      rev.position.set(side * 0.88, 0.77, REAR_Z - 0.06);
      this.containerGroup.add(rev);
    }

    // Amber beacon bar across the cab roof.
    this.beacons = [];
    for (const side of [-1, 1]) {
      const beacon = part(new THREE.CylinderGeometry(0.08, 0.09, 0.15, 12), M.amber.clone(), { cast: false });
      beacon.position.set(side * 0.62, 1.99, 0.1);
      cab.add(beacon);
      this.beacons.push(beacon);
    }
    const beaconBar = part(rbox(1.5, 0.07, 0.16, 0.03), M.darkMetal);
    beaconBar.position.set(0, 1.93, 0.1);
    cab.add(beaconBar);

    this.beaconLight = new THREE.PointLight(0xffa71a, 0, 8, 2);
    this.beaconLight.position.set(0, 3.0, 2.4);
    this.body.add(this.beaconLight);

    // Headlight beams, switched on in night worlds.
    this.headlights = [];
    for (const side of [-1, 1]) {
      const spot = new THREE.SpotLight(0xfff2c9, 0, 26, Math.PI / 5.5, 0.45, 1.1);
      spot.position.set(side * 0.85, 1.05, 3.4);
      const target = new THREE.Object3D();
      target.position.set(side * 0.95, 0, 16);
      this.group.add(target);
      spot.target = target;
      this.group.add(spot);
      this.headlights.push(spot);
    }
  }

  // --- Public API ----------------------------------------------------------

  setHeadlights(on) {
    this.headlights.forEach((s) => { s.intensity = on ? 90 : 0; });
    this.mats.headlight.emissiveIntensity = on ? 2.2 : 0.85;
    this.nightMode = on;
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
    // Brake lamps: full glow under braking, dim tail glow otherwise.
    const decelerating = braking || (throttle < 0 && this.speed > 0.1);
    this.mats.tail.emissiveIntensity = THREE.MathUtils.lerp(
      this.mats.tail.emissiveIntensity, decelerating ? 2.6 : 0.5, 0.25,
    );

    // Reverse lamps only when actually rolling backwards.
    this.mats.reverse.emissiveIntensity = THREE.MathUtils.lerp(
      this.mats.reverse.emissiveIntensity, this.speed < -0.15 ? 2.0 : 0.0, 0.2,
    );

    // Rotating beacons: two lamps pulsing out of phase reads as a rotating
    // strobe without needing a real rotating light.
    const t = this._elapsed * 5;
    this.beacons.forEach((b, i) => {
      const phase = Math.sin(t + i * Math.PI);
      b.material.emissiveIntensity = 0.35 + Math.max(0, phase) * 2.4;
    });
    this.beaconLight.intensity = 6 + Math.max(0, Math.sin(t)) * 12;

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
