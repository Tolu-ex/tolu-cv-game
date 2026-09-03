import * as THREE from 'three';

/**
 * The truck's hydraulic mechanism: grabber arm, tailgate, packer, ejector.
 *
 * The previous implementation was thirty lines of `armState` strings with
 * literal angles inlined at each branch. It could only nudge three individual
 * meshes, because the authored model is FLAT — `arm-boom`, `gripper-mount` and
 * the jaws are all siblings under `arm`, with no parent/child chain. Rotating
 * the boom therefore swung the boom mesh alone and left the gripper hanging in
 * space, which is why the arm never read as a machine.
 *
 * Two things are fixed here.
 *
 * 1. A kinematic chain is built at load time (`buildMechanismChain`). Pivot
 *    groups are inserted at the real joint positions taken from the model's own
 *    parts — the boom hinges at `arm-pivot-boss`, the gripper rides the boom's
 *    far end, the tailgate hinges on its TOP edge — and the meshes are
 *    reparented into them with their local offsets rebased so nothing moves.
 *
 * 2. Motion is described as data rather than code. An `Actuator` maps a 0..1
 *    command onto one node's pose; a `Sequence` is a list of timed phases whose
 *    targets are interpolated. A collection cycle is then a table you can read
 *    and check against how the real machine works, instead of a chain of ifs.
 *
 * Anything the model does not provide binds to null and is skipped, so a model
 * without a packer or ejector still runs every cycle it can.
 */

const EPS = 1e-6;

/** Smoothstep. Hydraulics ease in and out; they do not start at full speed. */
const ease = (k) => k * k * (3 - 2 * k);

// ---------------------------------------------------------------------------
// Actuators
// ---------------------------------------------------------------------------

/**
 * One degree of freedom. `apply(v)` takes a normalised 0..1 command, where 0 is
 * the retracted/rest pose and 1 is fully extended.
 */
class Actuator {
  constructor(name, node, apply) {
    this.name = name;
    this.node = node;
    this._apply = apply;
    this.value = 0;
  }
  set(v) {
    if (!this.node) return;
    this.value = v;
    this._apply(v);
  }
}

/** Rotation about a local axis, between two angles in radians. */
function rotator(name, node, axis, restRad, endRad) {
  if (!node) return new Actuator(name, null, () => {});
  return new Actuator(name, node, (v) => {
    node.rotation[axis] = restRad + (endRad - restRad) * v;
  });
}

/**
 * Translation along an arbitrary direction, in metres.
 * Used for the ram rods, which stroke along their own barrel axis rather than
 * along a world axis.
 */
function slider(name, node, direction, restM, endM) {
  if (!node) return new Actuator(name, null, () => {});
  // Home is cached ON THE NODE, not in this closure. A new mechanism is built
  // every time the truck is re-bound (switching back from the bike, say), and
  // capturing position at construction meant a rebuild that happened mid-cycle
  // took the DISPLACED position as home. Each round trip then added the whole
  // stroke again: the arm ram walked 0.23 m per switch, 1.4 m after six, until
  // the rod had left its barrel entirely.
  if (!node.userData.mechHome) node.userData.mechHome = node.position.clone();
  const home = node.userData.mechHome;
  const dir = direction.clone().normalize();
  return new Actuator(name, node, (v) => {
    const d = restM + (endM - restM) * v;
    node.position.copy(home).addScaledVector(dir, d);
  });
}

// ---------------------------------------------------------------------------
// Sequences
// ---------------------------------------------------------------------------

/**
 * A timed list of phases. Each phase names the actuator values it is driving
 * TOWARDS; values not mentioned hold whatever the previous phase left them at.
 * An optional `event` is emitted once, when the phase begins — that is what the
 * audio hooks into, so the hydraulic noise lines up with the movement rather
 * than being triggered alongside it and drifting.
 */
class Sequence {
  constructor(name, phases) {
    this.name = name;
    this.phases = phases;
    this.duration = phases.reduce((s, p) => s + p.duration, 0);
    this.running = false;
    this.t = 0;
    this._phase = -1;
  }

  start() { this.running = true; this.t = 0; this._phase = -1; }
  cancel() { this.running = false; }

  /**
   * Advances the sequence and writes every actuator it touches.
   * @returns {string|null} an event name if a phase just began
   */
  update(delta, actuators, startValues) {
    if (!this.running) return null;
    this.t += delta;

    // Locate the active phase and how far through it we are.
    let acc = 0, index = 0, local = 0;
    for (let i = 0; i < this.phases.length; i++) {
      const p = this.phases[i];
      if (this.t < acc + p.duration || i === this.phases.length - 1) {
        index = i;
        local = p.duration > EPS ? Math.min((this.t - acc) / p.duration, 1) : 1;
        break;
      }
      acc += p.duration;
    }

    // Everything an earlier phase set is the starting pose for this one.
    const from = { ...startValues };
    for (let i = 0; i < index; i++) Object.assign(from, this.phases[i].targets);

    const phase = this.phases[index];
    const k = ease(local);
    for (const [key, target] of Object.entries(phase.targets)) {
      const a = actuators[key];
      if (!a) continue;
      const start = from[key] ?? 0;
      a.set(start + (target - start) * k);
    }

    let event = null;
    if (index !== this._phase) {
      this._phase = index;
      event = phase.event || null;
    }

    if (this.t >= this.duration) this.running = false;
    return event;
  }
}

// ---------------------------------------------------------------------------
// Cycle definitions
// ---------------------------------------------------------------------------

/**
 * Automated side loader collection cycle.
 *
 * Ordered as the real machine runs: present the grabber at the cart, close on
 * it, lift and invert it over the body, shake it out, then put it back down and
 * let go. The packer fires afterwards, once the waste is actually in the body —
 * that separation is the point, since compaction is what lets one truck carry a
 * whole route (the trade quotes up to a sixfold reduction).
 *
 * Total ~5.5 s, which is in the range a real ASL takes per cart.
 */
const LIFT_CYCLE = new Sequence('lift', [
  { name: 'present', duration: 0.55, event: 'hydraulic', targets: { boom: 0.06, jaws: 1, ram: 0.06 } },
  { name: 'grip',    duration: 0.35, event: 'grip',      targets: { jaws: 0 } },
  { name: 'lift',    duration: 1.15, event: 'hydraulic', targets: { boom: 0.72, ram: 0.72 } },
  { name: 'invert',  duration: 0.70,                     targets: { boom: 1, ram: 1 } },
  { name: 'shake',   duration: 0.45, event: 'dump',      targets: { boom: 0.93 } },
  { name: 'shake2',  duration: 0.30,                     targets: { boom: 1 } },
  { name: 'return',  duration: 1.05, event: 'hydraulic', targets: { boom: 0.06, ram: 0.06 } },
  { name: 'release', duration: 0.35, event: 'grip',      targets: { jaws: 1 } },
  { name: 'stow',    duration: 0.55,                     targets: { boom: 0, jaws: 0.12, ram: 0 } },
]);

/**
 * Packer cycle: the blade sweeps the load out of the hopper and compresses it
 * against what is already in the body. Only runs if the model has a packer.
 */
const PACK_CYCLE = new Sequence('pack', [
  { name: 'sweep',   duration: 1.10, event: 'pack',  targets: { packer: 1 } },
  { name: 'hold',    duration: 0.25,                 targets: { packer: 1 } },
  { name: 'retract', duration: 1.30,                 targets: { packer: 0 } },
]);

/**
 * Tipping at the depot: raise the tailgate on its rams, push the load out with
 * the ejector panel, then bring both home. On a model with no ejector panel the
 * tailgate still opens and closes, which is the visible half of the operation.
 */
const TIP_CYCLE = new Sequence('tip', [
  { name: 'tailgate-up', duration: 1.60, event: 'tailgate', targets: { tailgate: 1, tailgateRam: 1 } },
  { name: 'eject',       duration: 2.20, event: 'eject',    targets: { ejector: 1 } },
  { name: 'settle',      duration: 0.60,                    targets: { ejector: 1 } },
  { name: 'retract',     duration: 1.80,                    targets: { ejector: 0 } },
  { name: 'tailgate-dn', duration: 1.50, event: 'tailgate', targets: { tailgate: 0, tailgateRam: 0 } },
]);

// ---------------------------------------------------------------------------
// Chain construction
// ---------------------------------------------------------------------------

/**
 * Inserts a pivot group at `pivot` (expressed in the parent's local space) and
 * moves `nodes` into it, rebasing their offsets so nothing appears to move.
 */
function joint(parent, pivot, nodes) {
  const g = new THREE.Group();
  g.position.copy(pivot);
  parent.add(g);
  for (const n of nodes) {
    if (!n || n.parent === g) continue;
    n.position.sub(pivot);
    g.add(n);
  }
  return g;
}

const get = (parts, name) => parts.get(name) || null;
const many = (parts, prefix) =>
  [...parts.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);

/**
 * Builds the kinematic chain from a flat authored model and returns the joints
 * plus a report of what was found. Safe to call on a model that already has a
 * hierarchy: nodes already parented to a joint are left alone.
 */
export function buildMechanismChain(parts) {
  const arm = get(parts, 'arm');
  const body = get(parts, 'body');
  const missing = [];
  const joints = {};

  if (arm) {
    // The boom hinges on its pivot boss. Everything outboard of the hinge —
    // boom, gripper, jaws, hoses — has to travel with it.
    const boss = get(parts, 'arm-pivot-boss');
    const pivot = boss
      ? boss.position.clone()
      : new THREE.Vector3(1.41, 1.34, 0.72);   // measured fallback

    const outboard = [
      get(parts, 'arm-boom'),
      get(parts, 'arm-pivot-pin'),
      get(parts, 'gripper-mount'),
      ...many(parts, 'gripper-jaw'),
      ...many(parts, 'gripper-pad'),
      ...many(parts, 'arm-hose'),
    ].filter(Boolean);

    joints.boom = joint(arm, pivot, outboard);

    // Jaws hinge on the gripper so they can open across the cart. Their own
    // authored rotation is the closed pose, kept as the rest angle.
    const jawA = get(parts, 'gripper-jaw-a');
    const jawB = get(parts, 'gripper-jaw-b');
    const padA = get(parts, 'gripper-pad-a');
    const padB = get(parts, 'gripper-pad-b');
    if (jawA) joints.jawA = joint(joints.boom, jawA.position.clone(), [jawA, padA].filter(Boolean));
    if (jawB) joints.jawB = joint(joints.boom, jawB.position.clone(), [jawB, padB].filter(Boolean));
  } else {
    missing.push('arm');
  }

  if (body) {
    const tg = get(parts, 'tailgate');
    if (tg) {
      // A rear tailgate hinges along its TOP edge and swings up and back. Its
      // authored origin is the panel centre, so the hinge is half its height
      // above that. Height comes from the geometry times the node scale — the
      // model uses shared unit geometry scaled per part, so the raw bounding
      // box alone would be wrong.
      if (!tg.geometry.boundingBox) tg.geometry.computeBoundingBox();
      const bb = tg.geometry.boundingBox;
      const halfH = ((bb.max.y - bb.min.y) / 2) * (tg.scale.y || 1);
      const hinge = tg.position.clone().add(new THREE.Vector3(0, halfH, 0));

      const withGate = [tg,
        get(parts, 'tail-tape'),
        ...many(parts, 'taillamp'),
        ...many(parts, 'reverse-lamp'),
      ].filter(Boolean);
      joints.tailgate = joint(body, hinge, withGate);
    } else {
      missing.push('tailgate');
    }
  } else {
    missing.push('body');
  }

  if (!get(parts, 'packer-blade')) missing.push('packer-blade');
  if (!get(parts, 'ejector-panel')) missing.push('ejector-panel');

  return { joints, missing };
}

// ---------------------------------------------------------------------------
// Mechanism
// ---------------------------------------------------------------------------

export class TruckMechanism {
  /**
   * @param parts  Map of node name -> Object3D from the loaded model
   * @param joints result of buildMechanismChain
   */
  constructor(parts, joints) {
    this.parts = parts;
    this.joints = joints;
    this.onEvent = () => {};

    const jawA = joints.jawA, jawB = joints.jawB;
    const ramRod = get(parts, 'arm-ram-rod');
    const ramBarrel = get(parts, 'arm-ram-barrel');
    const tgRodL = get(parts, 'tailgate-ram-rod-l');
    const tgRodR = get(parts, 'tailgate-ram-rod-r');
    const tgBarrelL = get(parts, 'tailgate-ram-barrel-l');

    // Ram rods stroke along the axis of their own barrel, which is tilted.
    const armRamAxis = ramRod && ramBarrel
      ? ramRod.position.clone().sub(ramBarrel.position)
      : new THREE.Vector3(0, -1, 0);
    const tgRamAxis = tgRodL && tgBarrelL
      ? tgRodL.position.clone().sub(tgBarrelL.position)
      : new THREE.Vector3(0, -1, 0);

    this.actuators = {
      // Boom swings from stowed through to fully inverted over the body.
      boom: rotator('boom', joints.boom, 'x', 0, 2.15),
      // Jaws: 0 closed (the authored pose), 1 open.
      jaws: new Actuator('jaws', jawA || jawB, (v) => {
        if (jawA) jawA.rotation.x = v * 0.42;
        if (jawB) jawB.rotation.x = v * -0.42;
      }),
      ram: slider('ram', ramRod, armRamAxis, 0, 0.42),
      tailgate: rotator('tailgate', joints.tailgate, 'x', 0, 0.92),
      tailgateRam: new Actuator('tailgateRam', tgRodL || tgRodR, (v) => {
        const d = tgRamAxis.clone().normalize().multiplyScalar(-v * 0.30);
        if (tgRodL) { if (!tgRodL.userData.mechHome) tgRodL.userData.mechHome = tgRodL.position.clone(); tgRodL.position.copy(tgRodL.userData.mechHome).add(d); }
        if (tgRodR) { if (!tgRodR.userData.mechHome) tgRodR.userData.mechHome = tgRodR.position.clone(); tgRodR.position.copy(tgRodR.userData.mechHome).add(d); }
      }),
      packer: slider('packer', get(parts, 'packer-blade'), new THREE.Vector3(0, 0, 1), 0, 2.4),
      ejector: slider('ejector', get(parts, 'ejector-panel'), new THREE.Vector3(0, 0, -1), 0, 4.2),
    };

    this._values = {};
    for (const k of Object.keys(this.actuators)) this._values[k] = 0;

    this.lift = LIFT_CYCLE;
    this.pack = PACK_CYCLE;
    this.tipCycle = TIP_CYCLE;
    this._packQueued = false;
    this._elapsed = 0;
  }

  /**
   * Returns every actuator to rest and cancels any running cycle. Called on a
   * world change: driving into a portal mid-lift used to leave the arm frozen
   * in the air in the next world, because nothing ever cancelled the sequence.
   */
  reset() {
    this.lift.cancel();
    this.pack.cancel();
    this.tipCycle.cancel();
    this._packQueued = false;
    for (const a of Object.values(this.actuators)) a.set(0);
    for (const k of Object.keys(this._values)) this._values[k] = 0;
  }

  get busy() { return this.lift.running || this.tipCycle.running; }
  get tipping() { return this.tipCycle.running; }

  /** Starts a bin lift. Returns false if the mechanism is already working. */
  liftBin() {
    if (this.busy) return false;
    this._snapshot();
    this.lift.start();
    this._packQueued = true;
    return true;
  }

  /** Starts the depot tipping cycle. */
  tip() {
    if (this.busy) return false;
    this._snapshot();
    this.tipCycle.start();
    return true;
  }

  _snapshot() {
    for (const [k, a] of Object.entries(this.actuators)) this._values[k] = a.value;
  }

  update(delta) {
    this._elapsed += delta;

    for (const seq of [this.lift, this.pack, this.tipCycle]) {
      if (!seq.running) continue;
      const event = seq.update(delta, this.actuators, this._values);
      if (event) this.onEvent(event);
      // Pack once the load is actually in the body, not when the cycle began.
      if (seq === this.lift && this._packQueued && seq.t > 3.2) {
        this._packQueued = false;
        if (this.actuators.packer.node) {
          this._values.packer = this.actuators.packer.value;
          this.pack.start();
        }
      }
    }

    // Idle: a parked hydraulic arm settles, it does not sit dead still. Only
    // when nothing else is driving the boom.
    if (!this.busy) {
      const settle = Math.sin(this._elapsed * 0.7) * 0.006;
      if (this.joints.boom) this.joints.boom.rotation.x = settle;
    }
  }
}
