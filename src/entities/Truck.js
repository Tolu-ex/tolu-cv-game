import * as THREE from 'three';

/**
 * The truck: physics rig plus whatever visual is attached to it.
 *
 * Geometry used to be assembled here from primitives — around 900 lines of
 * hand-placed boxes. It is now an authored GLB, attached via `attachModel`.
 * Everything in this file is independent of the visual: it drives a set of
 * named nodes and does not care where they came from.
 *
 * Structure matters for the driving feel — the rig is split so the sprung mass
 * moves independently of the wheels:
 *
 *   group      root: world position + heading
 *    ├ body    sprung mass: pitches under braking, rolls in corners
 *    └ wheels  unsprung: stay planted on the ground plane
 */
export class Truck {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);

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
    this.wheelRadius = 0.55;

    // ---- Suspension (spring-damper, integrated in update) ----
    this.pitch = 0; this.pitchVel = 0;
    this.roll = 0;  this.rollVel = 0;
    this._prevSpeed = 0;
    this._elapsed = 0;
    this.beta = 0;        // sideslip: angle between heading and course
    this.yawRate = 0;
    this.lateralAccel = 0;

    // ---- Arm cycle ----
    this.armState = 'idle';
    this.armPhase = 0;

    this.modelReady = false;
    this.wheels = { steerable: [], spinning: [] };
    this.lightsOn = false;

    this._buildLightRig();
  }

  /**
   * Headlamp and reversing beams. These live on the root rather than in the
   * model because they must not tilt with the body under braking — headlights
   * that dive into the road every time you brake read as a bug.
   */
  _buildLightRig() {
    this.headlights = [];
    for (const side of [-1, 1]) {
      const spot = new THREE.SpotLight(0xfff2c9, 0, 30, Math.PI / 5.5, 0.45, 1.1);
      spot.position.set(side * 0.85, 1.3, 3.2);
      const target = new THREE.Object3D();
      target.position.set(side * 0.95, 0, 16);
      this.group.add(target);
      spot.target = target;
      this.group.add(spot);
      this.headlights.push({ spot, target });
    }

    this.reverseLight = new THREE.SpotLight(0xffffff, 0, 12, Math.PI / 4, 0.6, 1.2);
    this.reverseLight.position.set(0, 1.2, -3.4);
    const revTarget = new THREE.Object3D();
    revTarget.position.set(0, 0, -9);
    this.group.add(revTarget);
    this.reverseLight.target = revTarget;
    this.group.add(this.reverseLight);
  }

  /** Attaches the loaded model and binds its named nodes to the rig. */
  attachModel(scene, rig) {
    this.model = scene;
    this.wheels = { steerable: rig.steerable, spinning: rig.spinning };
    this.wheelRadius = rig.wheelRadius || this.wheelRadius;
    this.parts = rig.parts;

    // Chassis geometry, measured off the model. The steering model is built
    // from these rather than from tuned constants, so the truck turns like the
    // vehicle it actually is.
    this.wheelbase = rig.wheelbase;
    this.track = rig.track;
    this.frontAxleZ = rig.frontAxleZ;
    this.rearAxleZ = rig.rearAxleZ;
    this.wheelInfo = rig.wheelInfo;
    this.frontWheels = rig.wheelInfo.filter((w) => w.isFront);

    this.armBoom = rig.armBoom;
    this.armCarriage = rig.armCarriage;
    this.gripperJaws = [rig.gripperJawA, rig.gripperJawB].filter(Boolean);
    this._armHomeRot = this.armBoom ? this.armBoom.rotation.x : 0;
    this._carriageHomeY = this.armCarriage ? this.armCarriage.position.y : 0;

    // Lamps, matched by the model's own material naming.
    const meshes = [...rig.parts.values()].filter((o) => o.isMesh && o.material);
    const byMat = (re) => meshes.filter((o) => re.test(o.material.name || ''));
    this.lampBrake = byMat(/lamp-red/i);
    this.lampReverse = byMat(/lamp-cool/i);
    this.lampIndicator = byMat(/amber/i);
    this.lampHead = byMat(/lamp-warm/i);

    this._brake = 0;
    this._rev = 0;
    this.modelReady = true;
    this.setHeadlights(this.lightsOn);
  }

  // --- Public API ----------------------------------------------------------

  playArmCycle() {
    if (this.armState !== 'idle') return false;
    this.armState = 'reach';
    this.armPhase = 0;
    return true;
  }

  get armBusy() { return this.armState !== 'idle'; }

  setHeadlights(on) {
    this.lightsOn = !!on;
    this.headlights.forEach(({ spot }) => { spot.intensity = on ? 110 : 0; });
    for (const m of this.lampHead || []) {
      const v = on ? 1.0 : 0.74;
      m.material.color.setRGB(v, v * 0.94, v * 0.76);
    }
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
    this.beta = this.yawRate = this.lateralAccel = 0;
    this._prevSpeed = 0;
    this.group.position.copy(position);
    this.group.rotation.y = heading;
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0;
  }

  get forwardSpeedKmh() { return Math.abs(this.speed) * 3.6; }

  // --- Simulation ----------------------------------------------------------

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
    this._steer(delta, steerInput, bounds);

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;

    this._updateSuspension(delta);
    this._updateWheels(delta);
    this._updateLights(delta, throttle, braking);
  }

  /**
   * Kinematic bicycle model.
   *
   * This replaced a model that rotated the truck about its own centre:
   *
   *     heading += steerInput * turnRate * speedFactor * delta
   *
   * which is how a tank turns, not a vehicle. A real vehicle pivots about a
   * point on the extension of its REAR axle, and the geometry gives three
   * things that no amount of tuning the old version could:
   *
   *   - turning radius R = wheelbase / tan(steer), so a long truck genuinely
   *     feels long and cannot be tuned to feel short
   *   - off-tracking: the rear wheels cut inside the fronts through a corner,
   *     which is the single most recognisable thing about watching a truck turn
   *   - yaw rate is proportional to speed, so the truck cannot pirouette on
   *     the spot — it has to be rolling to turn, exactly like the real thing
   *
   * Integrated at the rear axle because that is the point the model is defined
   * about; the body origin is then derived back from it so the visual does not
   * shift.
   */
  _steer(delta, steerInput, bounds) {
    const absV = Math.abs(this.speed);
    const speedFrac = THREE.MathUtils.clamp(absV / this.maxSpeed, 0, 1);

    // Speed-sensitive lock. Uses |v| so it behaves identically in reverse.
    const lockLimit = this.maxSteer * (1 - 0.5 * speedFrac);
    const target = THREE.MathUtils.clamp(steerInput * this.maxSteer, -lockLimit, lockLimit);
    const STEER_RATE = 1.9;                       // rad/s at the road wheels
    const dSteer = THREE.MathUtils.clamp(target - this.steerAngle, -STEER_RATE * delta, STEER_RATE * delta);
    this.steerAngle += dSteer;
    if (steerInput === 0) {
      this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, 0, 1 - Math.pow(0.02, delta));
    }

    const L = this.wheelbase;
    const lr = -this.rearAxleZ;                   // origin back to the rear axle
    const v = this.speed;

    // --- Sideslip -----------------------------------------------------------
    // A pure kinematic model points the velocity vector exactly along the
    // heading, so the path bends the same frame the body yaws. Real vehicles
    // do not do that: the body rotates first and the path follows a beat
    // later, and on corner exit they keep drifting outward after the wheels
    // straighten. That lag is most of what cornering mass looks like.
    //
    // Modelled as a first-order lag on the sideslip angle rather than a full
    // tyre model, which would be far more machinery than this game needs.
    // The relaxation LENGTH is roughly constant on a real tyre (~1 m of
    // travel), so the time constant falls as speed rises.
    const betaKin = Math.atan((lr / L) * Math.tan(this.steerAngle));
    const RELAX_LENGTH = 1.2;                     // metres of travel to settle
    const tau = THREE.MathUtils.clamp(RELAX_LENGTH / Math.max(absV, 0.75), 0.04, 0.45);
    this.beta += (betaKin - this.beta) * (1 - Math.exp(-delta / tau));

    // Exact kinematic yaw rate for the centre-referenced model. Reduces to
    // (v/L)tan(delta) when beta is zero, so steady-state radius is unchanged.
    this.yawRate = (v * Math.cos(this.beta) / L) * Math.tan(this.steerAngle);

    // --- Integration --------------------------------------------------------
    // Midpoint rather than explicit Euler. Euler rotated the heading first and
    // then translated along the NEW heading, which biases every frame the same
    // way — small per step, but systematic, and invisible to a steady-state
    // circle test while showing up on transients.
    const headingMid = this.heading + this.yawRate * delta * 0.5;
    const course = headingMid + this.beta;        // where it actually travels
    this.position.x += Math.sin(course) * v * delta;
    this.position.z += Math.cos(course) * v * delta;

    this.heading += this.yawRate * delta;
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));

    // True lateral acceleration, for the body roll to work from.
    this.lateralAccel = v * this.yawRate;

    this.position.x = THREE.MathUtils.clamp(this.position.x, -bounds, bounds);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -bounds, bounds);
  }

  /** Turning radius at the current lock, in metres. Infinite when straight. */
  get turnRadius() {
    const t = Math.tan(this.steerAngle);
    return Math.abs(t) < 1e-4 ? Infinity : Math.abs(this.wheelbase / t);
  }

  /**
   * Sprung-mass motion. Longitudinal acceleration drives pitch (nose dives
   * under braking, squats under power) and cornering drives roll, each through
   * a damped spring so the body settles instead of snapping.
   */
  _updateSuspension(delta) {
    const accel = (this.speed - this._prevSpeed) / Math.max(delta, 1e-4);
    this._prevSpeed = this.speed;

    // Coefficient chosen so ordinary throttle squats to roughly two-thirds of
    // travel while hard braking pegs the nose down. Larger values pin the body
    // at its clamp the whole time you hold W, which reads as permanently
    // nose-up.
    const pitchTarget = THREE.MathUtils.clamp(-accel * 0.004, -0.06, 0.06);

    // Roll follows real lateral acceleration (a = v * yawRate), not the raw
    // key press. Driving it from input made the body lean the instant a key
    // went down — before the truck had begun to turn — and snap upright the
    // instant it came up, while the truck was still arcing. The lean was
    // desynchronised from the actual corner, which is what read as wrong.
    const aLat = this.lateralAccel || 0;
    const rollTarget = THREE.MathUtils.clamp(aLat * 0.011, -0.09, 0.09);

    const stiffness = 120;
    const damping = 15;
    this.pitchVel += ((pitchTarget - this.pitch) * stiffness - this.pitchVel * damping) * delta;
    this.pitch += this.pitchVel * delta;
    this.rollVel += ((rollTarget - this.roll) * stiffness - this.rollVel * damping) * delta;
    this.roll += this.rollVel * delta;

    // No idle shake: a diesel vibrates at a standstill, an electric drivetrain
    // is dead still, and that stillness is part of how an EV reads.
    this.body.rotation.x = this.pitch;
    this.body.rotation.z = this.roll;
    this.body.position.y = -Math.abs(this.pitch) * 0.12;
  }

  /**
   * Wheel visuals, including true Ackermann geometry.
   *
   * Both front wheels turning by the same angle is wrong: they travel circles
   * of different radii, so the inner wheel has to turn MORE than the outer or
   * one of them scrubs. Visible on a truck at full lock, and free to compute
   * once the wheelbase and track are known.
   */
  _updateWheels(delta) {
    // Each wheel travels its own arc: in a turn the outer wheels cover more
    // ground than the inner ones, so spinning them all at v/r makes the inner
    // pair visibly over-rotate at lock. Ground speed at a point on a rigid
    // body is v_origin + omega x r.
    const w = this.yawRate || 0;
    const vx = this.speed * Math.sin(this.beta || 0);
    const vz = this.speed * Math.cos(this.beta || 0);
    for (const info of (this.wheelInfo || [])) {
      const px = vx + w * info.z;
      const pz = vz - w * info.x;
      const ground = Math.hypot(px, pz) * Math.sign(pz || vz || 1);
      info.pivot.rotation.x -= (ground * delta) / this.wheelRadius;
    }
    if (!this.wheelInfo) {
      const spin = (this.speed * delta) / this.wheelRadius;
      this.wheels.spinning.forEach((s) => { s.rotation.x -= spin; });
    }

    const d = this.steerAngle;
    if (!this.frontWheels || Math.abs(d) < 1e-4) {
      this.wheels.steerable.forEach((p) => { p.rotation.y = d; });
      return;
    }
    const L = this.wheelbase;
    const halfTrack = this.track / 2;
    const R = L / Math.tan(Math.abs(d));       // radius to the centreline
    const turningLeft = d > 0;                 // +X is the truck's left
    for (const w of this.frontWheels) {
      // A wheel on the inside of the turn sits closer to the centre of the
      // circle, so its radius is smaller and its angle larger.
      const inner = (w.side > 0) === turningLeft;
      const r = inner ? R - halfTrack : R + halfTrack;
      w.steer.rotation.y = Math.sign(d) * Math.atan(L / r);
    }
  }

  _updateLights(delta, throttle, braking) {
    if (!this.modelReady) return;

    // The model's lamps use flat unlit materials, so brightness is carried by
    // colour rather than an emissive term.
    const decelerating = braking || (throttle < 0 && this.speed > 0.1);
    this._brake = THREE.MathUtils.lerp(this._brake, decelerating ? 1 : 0, 0.25);
    for (const m of this.lampBrake) {
      m.material.color.setRGB(0.32 + this._brake * 0.68, 0.03, 0.02);
    }

    const reversing = this.speed < -0.15;
    this._rev = THREE.MathUtils.lerp(this._rev, reversing ? 1 : 0, 0.2);
    this.reverseLight.intensity = THREE.MathUtils.lerp(this.reverseLight.intensity, reversing ? 18 : 0, 0.2);
    for (const m of this.lampReverse) {
      const v = 0.5 + this._rev * 0.5;
      m.material.color.setRGB(v, v, v);
    }

    // Indicators blink at ~1.5 Hz, the real automotive rate, on whichever side
    // is being steered toward. +X is the truck's left, matching a positive
    // steer angle.
    const steering = Math.abs(this.steerAngle) > this.maxSteer * 0.12
      ? Math.sign(this.steerAngle) : 0;
    const blinkOn = steering !== 0 && (this._elapsed % 0.68) < 0.36;
    for (const m of this.lampIndicator) {
      const localX = m.userData._lx ?? (m.userData._lx = this._localX(m));
      const lit = blinkOn && Math.sign(localX) === steering;
      m.material.color.setRGB(lit ? 1 : 0.5, lit ? 0.42 : 0.2, 0.01);
    }

    this._updateArm(delta);
  }

  /** Cached body-space X of a node, used to tell left lamps from right. */
  _localX(mesh) {
    const p = new THREE.Vector3();
    mesh.getWorldPosition(p);
    this.body.worldToLocal(p);
    return p.x;
  }

  /** Idle breathing, or a reach / lift / stow collection cycle. */
  _updateArm(delta) {
    if (!this.armBoom) return;

    if (this.armState === 'idle') {
      const sway = Math.sin(this._elapsed * 0.7) * 0.02;
      this.armBoom.rotation.x = this._armHomeRot + sway;
      this.gripperJaws.forEach((j, i) => { j.rotation.y = (i ? 1 : -1) * (0.05 + sway); });
      return;
    }

    const DUR = { reach: 0.5, lift: 0.6, stow: 0.5 };
    this.armPhase += delta / DUR[this.armState];
    const k = Math.min(this.armPhase, 1);
    const ease = k * k * (3 - 2 * k);

    if (this.armState === 'reach') {
      this.armBoom.rotation.x = this._armHomeRot - ease * 0.5;
      this.gripperJaws.forEach((j, i) => { j.rotation.y = (i ? 1 : -1) * (0.05 + ease * 0.45); });
      if (k >= 1) { this.armState = 'lift'; this.armPhase = 0; }
    } else if (this.armState === 'lift') {
      this.armBoom.rotation.x = this._armHomeRot - 0.5 + ease * 0.3;
      if (this.armCarriage) this.armCarriage.position.y = this._carriageHomeY + ease * 1.1;
      this.gripperJaws.forEach((j, i) => { j.rotation.y = (i ? 1 : -1) * (0.5 - ease * 0.45); });
      if (k >= 1) { this.armState = 'stow'; this.armPhase = 0; }
    } else if (this.armState === 'stow') {
      this.armBoom.rotation.x = this._armHomeRot - 0.2 + ease * 0.2;
      if (this.armCarriage) this.armCarriage.position.y = this._carriageHomeY + (1 - ease) * 1.1;
      if (k >= 1) { this.armState = 'idle'; this.armPhase = 0; }
    }
  }
}
