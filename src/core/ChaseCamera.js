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
    minDistance = 4, maxDistance = 30,
    orbitSensitivity = 0.0065, zoomSensitivity = 0.012,
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

    // --- Roblox-style free look ---
    this.minDistance = minDistance;
    this.maxDistance = maxDistance;
    this.orbitSensitivity = orbitSensitivity;
    this.zoomSensitivity = zoomSensitivity;
    this.baseDistance = distance;
    // Offsets from the default behind-the-truck pose, not absolute angles, so
    // the camera still follows the truck's heading while you look around.
    this.yawOffset = 0;
    this.pitchOffset = 0;
    this.minPitch = -0.28;   // low, near ground level looking up at the truck
    this.maxPitch = 1.42;    // almost straight down
  }

  /** Instantly snap behind the target — used right after a world transition. */
  snapTo(target) {
    this._swingAmount = 0;
    this._shake = 0;
    this._recenterRequest = false;
    // Reset the look angles so you always spawn facing forward, but keep the
    // player's chosen zoom — that is a preference, not per-world framing.
    this.yawOffset = 0;
    this.pitchOffset = 0;
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

    // Camera sits on a sphere around the truck. Yaw is the truck's heading plus
    // whatever the player has dragged; pitch raises or lowers the eye.
    const yaw = target.heading + this.yawOffset;
    const basePitch = Math.atan2(this.height, this.distance);
    const pitch = THREE.MathUtils.clamp(basePitch + this.pitchOffset, this.minPitch, this.maxPitch);

    const horiz = Math.cos(pitch) * this.distance;
    const vert = Math.sin(pitch) * this.distance;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    this._desiredPos.set(
      target.position.x - sin * horiz + cos * lateral,
      target.position.y + Math.max(0.6, vert),
      target.position.z - cos * horiz - sin * lateral,
    );
  }

  /** Smoothly swings the view back behind the truck (bound to C). */
  requestRecenter() {
    this._recenterRequest = true;
  }

  /** Applies one frame of mouse orbit/zoom input. */
  applyPointer({ dx = 0, dy = 0, zoom = 0 }) {
    if (dx || dy) this._recenterRequest = false; // player takes back control
    if (dx) this.yawOffset -= dx * this.orbitSensitivity;
    if (dy) {
      // Subtract, so dragging up raises the camera over the truck — the same
      // direction as OrbitControls and most orbit viewers.
      this.pitchOffset = THREE.MathUtils.clamp(
        this.pitchOffset - dy * this.orbitSensitivity, -1.2, 1.4,
      );
    }
    if (zoom) {
      this.distance = THREE.MathUtils.clamp(
        this.distance + zoom * this.zoomSensitivity,
        this.minDistance, this.maxDistance,
      );
    }
    // Keep yaw in range so it never accumulates into large-float territory.
    this.yawOffset = Math.atan2(Math.sin(this.yawOffset), Math.cos(this.yawOffset));
  }

  update(delta, target) {
    const speedFrac = THREE.MathUtils.clamp(Math.abs(target.speed) / target.maxSpeed, 0, 1);

    // The camera stays exactly where the player put it. An earlier version
    // drifted back behind the truck a second or two after you let go of the
    // mouse, which made free-look feel like it never took — you would aim at
    // something and watch the view slide off it. Press C to recentre instead.
    if (this._recenterRequest) {
      const pull = 1 - Math.pow(0.008, delta);
      this.yawOffset = THREE.MathUtils.lerp(this.yawOffset, 0, pull);
      this.pitchOffset = THREE.MathUtils.lerp(this.pitchOffset, 0, pull);
      if (Math.abs(this.yawOffset) < 0.01 && Math.abs(this.pitchOffset) < 0.01) {
        this.yawOffset = 0;
        this.pitchOffset = 0;
        this._recenterRequest = false;
      }
    }

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
