import * as THREE from 'three';
import { posterMaterial } from '../../utils/artDirection.js';

/**
 * A rideable Dutch omafiets, built procedurally.
 *
 * This is the player vehicle in the tulip field. It satisfies the same rig
 * contract as the truck GLB (see truck/model.js) so the physics in Truck.js
 * drives it unchanged — but two things about a bicycle are genuinely different
 * from a truck and are handled here:
 *
 *  1. It is single-track. Both wheels sit on x = 0, so the track width is zero
 *     and Ackermann collapses to "both front wheels take the steer angle" —
 *     which is correct, and falls out of the existing maths without a branch.
 *
 *  2. It leans INTO a corner instead of rolling out of one, and it leans as a
 *     rigid body: wheels, frame and rider all together. The truck rolls only
 *     its sprung mass. So everything here hangs off a `lean` group that the
 *     physics tilts, rather than off the body.
 */

const C = {
  frame:  0x7fbf2a,   // ROVA lime — same rider, different vehicle
  frameDark: 0x5d8f1c,
  tyre:   0x2b2f35,
  rim:    0xd8dde2,
  leather: 0x7a4a2c,
  wicker: 0xc9a86a,
  lamp:   0xffe9a8,
  skin:   0x8d5a3b,
  hair:   0x241a14,
  jacket: 0x2f6fb5,
  jacketDark: 0x23568c,
  trouser: 0x39414f,
  shoe:   0x22262e,
};

const WHEEL_R    = 0.35;
const WHEELBASE  = 1.08;
const FRONT_Z    =  WHEELBASE / 2;
const REAR_Z     = -WHEELBASE / 2;
const BB         = { z: -0.06, y: 0.30 };  // bottom bracket (crank centre)
const CRANK_R    = 0.17;
const HIP        = { z: -0.34, y: 0.96 };
const THIGH      = 0.40;
const SHIN       = 0.40;
const GEAR_RATIO = 2.75;                    // wheel turns per crank turn

/** Cylinder between two points in the z/y plane (the bike's side view). */
function tube(from, to, radius, color) {
  const dz = to.z - from.z, dy = to.y - from.y;
  const len = Math.hypot(dz, dy);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, len, 6),
    posterMaterial(color),
  );
  m.position.set(0, (from.y + to.y) / 2, (from.z + to.z) / 2);
  // Cylinder runs along +Y; rotate about X so it runs from `from` to `to`.
  m.rotation.x = -Math.atan2(dz, dy);
  return m;
}

function wheel() {
  const g = new THREE.Group();
  const spin = (mesh) => { mesh.rotation.y = Math.PI / 2; return mesh; };

  g.add(spin(new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_R, 0.034, 6, 22),
    posterMaterial(C.tyre),
  )));
  g.add(spin(new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_R - 0.05, 0.017, 5, 22),
    posterMaterial(C.rim),
  )));

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.10, 8),
    posterMaterial(C.rim),
  );
  hub.rotation.z = Math.PI / 2;
  g.add(hub);

  // Spokes read as a flat star from the side, which is all a poster needs.
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, (WHEEL_R - 0.05) * 2, 0.008),
      posterMaterial(C.rim),
    );
    s.rotation.x = (i / 6) * Math.PI;
    g.add(s);
  }
  return g;
}

function buildRider(parts) {
  const g = new THREE.Group();

  const pelvis = new THREE.Mesh(
    new THREE.BoxGeometry(0.30, 0.18, 0.26),
    posterMaterial(C.trouser),
  );
  pelvis.position.set(0, HIP.y + 0.04, HIP.z + 0.02);
  g.add(pelvis);

  // Torso leans forward to the bars — upright, as a Dutch bike is ridden.
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.46, 0.28),
    posterMaterial(C.jacket),
  );
  torso.position.set(0, HIP.y + 0.30, HIP.z + 0.10);
  torso.rotation.x = -0.28;
  g.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.125, 10, 8),
    posterMaterial(C.skin),
  );
  head.position.set(0, HIP.y + 0.62, HIP.z + 0.22);
  g.add(head);

  // No helmet: nobody in the Netherlands wears one on an omafiets.
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.132, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
    posterMaterial(C.hair),
  );
  hair.position.copy(head.position);
  hair.rotation.x = -0.25;
  g.add(hair);

  const legs = [];
  for (const side of [-1, 1]) {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.11, HIP.y, HIP.z);
    g.add(hipPivot);

    const thigh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.05, THIGH, 6),
      posterMaterial(C.trouser),
    );
    thigh.geometry.translate(0, -THIGH / 2, 0);   // pivot at the hip
    hipPivot.add(thigh);

    const kneePivot = new THREE.Group();
    hipPivot.add(kneePivot);

    const shin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.04, SHIN, 6),
      posterMaterial(C.trouser),
    );
    shin.geometry.translate(0, -SHIN / 2, 0);
    kneePivot.add(shin);

    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.05, 0.20),
      posterMaterial(C.shoe),
    );
    foot.position.set(0, -SHIN, 0.03);
    kneePivot.add(foot);

    legs.push({ side, hipPivot, kneePivot });

    // Arm: shoulder to grip. Static — the hands stay on the bars.
    const shoulder = new THREE.Vector3(side * 0.16, HIP.y + 0.50, HIP.z + 0.16);
    const grip = new THREE.Vector3(side * 0.24, 1.04, 0.30);
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.038, shoulder.distanceTo(grip), 6),
      posterMaterial(C.jacketDark),
    );
    arm.position.copy(shoulder).lerp(grip, 0.5);
    arm.lookAt(grip);
    arm.rotateX(Math.PI / 2);
    g.add(arm);
  }

  parts.set('rider', g);
  return { group: g, legs };
}

/**
 * Builds the bike and binds it to a physics rig.
 *
 * @param rootGroup  the vehicle root (carries world position + heading)
 * @returns { scene, rig, profile }
 */
export function buildBike({ rootGroup }) {
  const parts = new Map();

  // Everything leans together, so the lean group is the real chassis.
  const lean = new THREE.Group();
  rootGroup.add(lean);

  // ---- wheels -------------------------------------------------------------
  const rearPivot = wheel();
  rearPivot.position.set(0, WHEEL_R, REAR_Z);
  lean.add(rearPivot);

  // The fork steers; the front wheel spins inside it.
  const fork = new THREE.Group();
  fork.position.set(0, WHEEL_R, FRONT_Z);
  lean.add(fork);

  const frontPivot = wheel();
  fork.add(frontPivot);

  // Rear wheel has no steering group of its own, but wheelInfo expects one.
  const rearSteer = new THREE.Group();
  rearSteer.position.set(0, WHEEL_R, REAR_Z);
  lean.add(rearSteer);

  // ---- frame --------------------------------------------------------------
  const headTop = { z: 0.40, y: 1.00 };
  const headBot = { z: 0.46, y: 0.55 };
  const seatTop = { z: -0.42, y: 0.94 };
  const rearAxle = { z: REAR_Z, y: WHEEL_R };

  lean.add(tube(BB, seatTop, 0.024, C.frame));                 // seat tube
  lean.add(tube(headBot, BB, 0.026, C.frame));                 // down tube
  // Step-through top tube: two segments through a low midpoint give the
  // omafiets dip without needing a curve.
  const dip = { z: 0.0, y: 0.86 };
  lean.add(tube(headTop, dip, 0.021, C.frame));
  lean.add(tube(dip, seatTop, 0.021, C.frame));
  lean.add(tube(BB, rearAxle, 0.018, C.frame));                // chain stay
  lean.add(tube(seatTop, rearAxle, 0.016, C.frame));           // seat stay
  lean.add(tube(headTop, headBot, 0.028, C.frameDark));        // head tube

  // Fork legs, parented to the steering group so they swing with the wheel.
  const forkLeg = tube({ z: 0.06, y: 0.55 - WHEEL_R }, { z: 0, y: 0 }, 0.018, C.frameDark);
  fork.add(forkLeg);

  // ---- cockpit ------------------------------------------------------------
  const bars = new THREE.Mesh(
    new THREE.CylinderGeometry(0.017, 0.017, 0.52, 6),
    posterMaterial(C.frameDark),
  );
  bars.rotation.z = Math.PI / 2;
  bars.position.set(0, 1.04 - 0.55 + WHEEL_R, -0.06);
  fork.add(bars);
  for (const side of [-1, 1]) {
    // Swept back towards the rider, which is the omafiets signature.
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.14, 6),
      posterMaterial(C.leather),
    );
    grip.position.set(side * 0.24, 1.04 - 0.55 + WHEEL_R, -0.13);
    grip.rotation.x = Math.PI / 2;
    fork.add(grip);
  }

  const basket = new THREE.Group();
  const basketBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.26),
    posterMaterial(C.wicker),
  );
  basket.add(basketBox);
  // A few tulips riding in the basket — this is a tulip field, after all.
  for (let i = 0; i < 5; i++) {
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4),
      posterMaterial(0x3f8f3f),
    );
    const bx = (i - 2) * 0.06, bz = (i % 2) * 0.05 - 0.02;
    stem.position.set(bx, 0.17, bz);
    basket.add(stem);
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 7, 6),
      posterMaterial([0xe5395a, 0xf2b134, 0xe86ca4, 0xd94f2b, 0xf5e04a][i]),
    );
    bloom.position.set(bx, 0.30, bz);
    bloom.scale.set(0.8, 1.25, 0.8);
    basket.add(bloom);
  }
  basket.position.set(0, 0.92 - 0.55 + WHEEL_R, 0.02);
  fork.add(basket);

  // Dynamo lamp, toggled by the lights key.
  const lampMat = posterMaterial(C.lamp, { emissive: C.lamp, emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.07, 8), lampMat);
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, 0.70 - 0.55 + WHEEL_R, 0.14);
  fork.add(lamp);
  parts.set('lamp', lamp);

  const saddle = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.06, 0.30),
    posterMaterial(C.leather),
  );
  saddle.position.set(0, seatTop.y + 0.04, seatTop.z - 0.02);
  lean.add(saddle);

  // Rear rack and chain guard: the details that say "Dutch bike".
  const rack = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.03, 0.38),
    posterMaterial(C.frameDark),
  );
  rack.position.set(0, 0.72, REAR_Z + 0.04);
  lean.add(rack);

  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.16, 0.42),
    posterMaterial(C.frameDark),
  );
  guard.position.set(0.09, BB.y + 0.03, BB.z - 0.16);
  lean.add(guard);

  // Mudguards over both wheels.
  for (const [z, r] of [[FRONT_Z, fork], [REAR_Z, lean]]) {
    const guardArc = new THREE.Mesh(
      new THREE.TorusGeometry(WHEEL_R + 0.05, 0.018, 4, 12, Math.PI * 0.55),
      posterMaterial(C.frame),
    );
    guardArc.rotation.y = Math.PI / 2;
    guardArc.rotation.z = Math.PI * 0.22;
    if (r === fork) guardArc.position.set(0, 0, 0);
    else guardArc.position.set(0, WHEEL_R, z);
    r.add(guardArc);
  }

  // ---- crank + rider ------------------------------------------------------
  const cranks = [];
  for (const side of [-1, 1]) {
    const crank = new THREE.Group();
    crank.position.set(side * 0.09, BB.y, BB.z);
    lean.add(crank);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, CRANK_R, 0.03),
      posterMaterial(C.frameDark),
    );
    arm.geometry.translate(0, -CRANK_R / 2, 0);
    crank.add(arm);
    const pedal = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.02, 0.13),
      posterMaterial(C.shoe),
    );
    pedal.position.set(0, -CRANK_R, 0);
    crank.add(pedal);
    cranks.push({ side, crank });
  }

  const chainring = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.10, 0.012, 12),
    posterMaterial(C.rim),
  );
  chainring.rotation.z = Math.PI / 2;
  chainring.position.set(0.05, BB.y, BB.z);
  lean.add(chainring);

  const rider = buildRider(parts);
  lean.add(rider.group);

  parts.set('lean', lean);
  parts.set('frame', lean);

  // ---- rig ----------------------------------------------------------------
  const rig = {
    steerable: [fork],
    spinning: [frontPivot, rearPivot],
    wheelInfo: [
      { steer: fork,      pivot: frontPivot, isFront: true,  side: 1, x: 0, z: FRONT_Z },
      { steer: rearSteer, pivot: rearPivot,  isFront: false, side: 1, x: 0, z: REAR_Z },
    ],
    wheelRadius: WHEEL_R,
    wheelbase: WHEELBASE,
    track: 0,                 // single-track: Ackermann collapses correctly
    frontAxleZ: FRONT_Z,
    rearAxleZ: REAR_Z,
    leanGroup: lean,          // physics tilts this, not the body
    parts,
    armBoom: null, armCarriage: null,

    /** Pedals, and freewheels when the rider stops driving. */
    onUpdate(delta, vehicle) {
      const speed = vehicle.speed;
      const pedalling = Math.abs(vehicle.throttleInput ?? 0) > 0 && Math.abs(speed) > 0.2;
      if (pedalling) {
        this._crank = (this._crank ?? 0) + (speed * delta / WHEEL_R) / GEAR_RATIO;
      }
      const theta = this._crank ?? 0;

      for (const { side, crank } of cranks) {
        // Cranks are 180 degrees apart.
        crank.rotation.x = -(theta + (side > 0 ? 0 : Math.PI));
      }

      // Two-bone IK per leg: the foot is pinned to its pedal, and the knee
      // follows. Without this the legs read as stiff pegs and the whole
      // bicycle looks like a prop being dragged along.
      for (const { side, hipPivot, kneePivot } of rider.legs) {
        const phase = theta + (side > 0 ? 0 : Math.PI);
        const fz = BB.z + CRANK_R * Math.sin(phase);
        const fy = BB.y + CRANK_R * Math.cos(phase);
        const dz = fz - HIP.z, dy = fy - HIP.y;
        const d = Math.min(Math.hypot(dz, dy), THIGH + SHIN - 1e-3);
        const dirAngle = Math.atan2(dz, -dy);
        const cosA = Math.min(1, Math.max(-1,
          (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d)));
        const alpha = Math.acos(cosA);
        const thighAngle = dirAngle + alpha;           // knee leads forward
        hipPivot.rotation.x = -thighAngle;

        const kz = HIP.z + THIGH * Math.sin(thighAngle);
        const ky = HIP.y - THIGH * Math.cos(thighAngle);
        const shinAngle = Math.atan2(fz - kz, -(fy - ky));
        // kneePivot is a child of hipPivot, so its rotation is relative.
        kneePivot.position.set(0, -THIGH, 0);
        kneePivot.rotation.x = -(shinAngle - thighAngle);
      }
    },
  };

  // A bicycle is not a truck: lower top speed, gentler acceleration, a much
  // tighter steering lock, and a lean instead of a body roll.
  const profile = {
    maxSpeed: 7.2,        // ~26 km/h, a brisk but plausible cycling pace
    maxReverse: 1.6,      // walking it backwards
    accel: 3.4,
    brakeDecel: 7,
    friction: 2.4,
    maxSteer: 0.62,
    wheelRadius: WHEEL_R,
    // Lean is the physical bank angle, atan(a_lat / g), and negated so the
    // bike falls INTO the corner rather than rolling out of it like a truck.
    leanFromLateral: (aLat) => -Math.atan(aLat / 9.81),
    leanClamp: 0.44,      // ~25 degrees, past which a real rider would slide
    // Steering lock capped by the lean the rider can actually carry, so the
    // bars go nearly straight at speed and the bike turns by banking. Without
    // this it corners at over 1.5 g, which no bicycle can do.
    steerLimitFromSpeed: (v) => {
      if (v < 0.6) return 0.62;                       // walking pace: full lock
      const aMax = 9.81 * Math.tan(0.44);             // ~4.6 m/s^2
      return Math.atan((WHEELBASE * aMax) / (v * v));
    },
    pitchCoeff: 0.002,    // barely any dive; there is no suspension to speak of
    pitchClamp: 0.03,
    hasReverseBeeper: false,
    audio: 'bike',
    // Framed much closer: a bike is about a fifth of the truck's length.
    camera: { distance: 5.6, height: 2.5, lookHeight: 1.15, swing: 1.2 },
  };

  return { scene: lean, rig, profile };
}
