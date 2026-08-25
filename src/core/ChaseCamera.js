import * as THREE from 'three';

/**
 * Chase camera that follows the truck from behind and slightly above.
 *
 * Beyond simple following, three things sell speed:
 *  - FOV widens as you accelerate, so the world stretches past you
 *  - the camera swings wide of the turn, letting you see into the corner
 *  - a small amount of shake, scaled by speed, keeps it from feeling glassy
 */
export class ChaseCamera {
  constructor(camera, {
    distance = 12, height = 5.2, lookHeight = 1.6, stiffness = 4.5,
    baseFov = 58, maxFovBoost = 9, swing = 2.4,
  } = {}) {
    this.camera = camera;
    this.distance = distance;
    this.height = height;
    this.lookHeight = lookHeight;
    this.stiffness = stiffness;
    this.baseFov = baseFov;
    this.maxFovBoost = maxFovBoost;
    this.swing = swing;

    this._desiredPos = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._currentLookAt = new THREE.Vector3();
    this._swingAmount = 0;
    this._shake = 0;
  }

  /** Instantly snap behind the target — used right after a world transition. */
  snapTo(target) {
    this._swingAmount = 0;
    this._shake = 0;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this._computeDesired(target);
    this.camera.position.copy(this._desiredPos);
    this._currentLookAt.set(target.position.x, target.position.y + this.lookHeight, target.position.z);
    this.camera.lookAt(this._currentLookAt);
  }

  _computeDesired(target) {
    // Lateral offset opposite the turn, so the camera looks into the corner.
    const lateral = this._swingAmount * this.swing;
    const back = -this.distance;
    const cos = Math.cos(target.heading);
    const sin = Math.sin(target.heading);

    this._desiredPos.set(
      target.position.x + sin * back + cos * lateral,
      target.position.y + this.height,
      target.position.z + cos * back - sin * lateral,
    );
  }

  update(delta, target) {
    const speedFrac = THREE.MathUtils.clamp(Math.abs(target.speed) / target.maxSpeed, 0, 1);

    // Swing trails the steering input rather than snapping to it.
    const steerFrac = (target.steerAngle / target.maxSteer) * speedFrac;
    this._swingAmount = THREE.MathUtils.lerp(this._swingAmount, steerFrac, 1 - Math.pow(0.02, delta));

    this._computeDesired(target);

    const t = THREE.MathUtils.clamp(1 - Math.pow(0.001, delta * this.stiffness * 0.25), 0, 1);
    this.camera.position.lerp(this._desiredPos, t);

    // Speed shake — subtle, and it dies away completely at a standstill.
    this._shake = speedFrac * speedFrac * 0.055;
    if (this._shake > 0.0005) {
      const s = this._shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    // Look slightly ahead of the truck so fast driving reads as purposeful.
    const lead = speedFrac * 3.2;
    this._lookAt.set(
      target.position.x + Math.sin(target.heading) * lead,
      target.position.y + this.lookHeight,
      target.position.z + Math.cos(target.heading) * lead,
    );
    this._currentLookAt.lerp(this._lookAt, THREE.MathUtils.clamp(t * 1.4, 0, 1));
    this.camera.lookAt(this._currentLookAt);

    // Widening FOV is the single strongest cue for acceleration.
    const targetFov = this.baseFov + this.maxFovBoost * speedFrac * speedFrac;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.pow(0.05, delta));
      this.camera.updateProjectionMatrix();
    }
  }
}
