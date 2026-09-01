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
    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / this.maxSpeed, 0.15, 1);
    const dir = this.speed < 0 ? -1 : 1;
    if (Math.abs(this.speed) > 0.02) {
      this.heading += steerInput * this.turnRate * speedFactor * dir * delta;
      this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    }
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, steerInput * this.maxSteer, 0.15);

    this.position.x += Math.sin(this.heading) * this.speed * delta;
    this.position.z += Math.cos(this.heading) * this.speed * delta;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -bounds, bounds);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -bounds, bounds);

    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;

    this._updateSuspension(delta, steerInput);
    this._updateWheels(delta);
    this._updateLights(delta, throttle, braking);
  }

  /**
   * Sprung-mass motion. Longitudinal acceleration drives pitch (nose dives
   * under braking, squats under power) and cornering drives roll, each through
   * a damped spring so the body settles instead of snapping.
   */
  _updateSuspension(delta, steerInput) {
    const accel = (this.speed - this._prevSpeed) / Math.max(delta, 1e-4);
    this._prevSpeed = this.speed;

    // Coefficient chosen so ordinary throttle squats to roughly two-thirds of
    // travel while hard braking pegs the nose down. Larger values pin the body
    // at its clamp the whole time you hold W, which reads as permanently
    // nose-up.
    const pitchTarget = THREE.MathUtils.clamp(-accel * 0.004, -0.06, 0.06);
    const lateral = steerInput * (this.speed / this.maxSpeed);
    const rollTarget = THREE.MathUtils.clamp(lateral * 0.10, -0.09, 0.09);

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

  _updateWheels(delta) {
    const spin = (this.speed * delta) / this.wheelRadius;
    this.wheels.spinning.forEach((s) => { s.rotation.x -= spin; });
    this.wheels.steerable.forEach((pivot) => { pivot.rotation.y = this.steerAngle; });
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
