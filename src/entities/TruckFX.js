import * as THREE from 'three';

/**
 * Particle effects for the truck.
 *
 * Only tyre dust: the truck is electric, so there is no exhaust to emit. Dust
 * is drivetrain-agnostic — rubber on a dry surface throws grit whatever is
 * turning the wheels.
 *
 * A fixed-size sprite pool recycled in place — no allocation per puff and a
 * single draw call, so this costs almost nothing.
 */

function softSpriteTexture(inner = 'rgba(255,255,255,0.9)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.35)'));
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class ParticlePool {
  constructor(count, { color, size, opacity, blending = THREE.NormalBlending }) {
    this.count = count;
    this.texture = softSpriteTexture();
    this.material = new THREE.SpriteMaterial({
      map: this.texture,
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending,
    });

    this.group = new THREE.Group();
    this.sprites = [];
    this.state = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(this.material.clone());
      s.scale.setScalar(size);
      s.visible = false;
      this.group.add(s);
      this.sprites.push(s);
      this.state.push({ life: 0, maxLife: 1, vel: new THREE.Vector3(), size });
    }
    this.cursor = 0;
    this.baseSize = size;
    this.baseOpacity = opacity;
  }

  emit(position, velocity, life, size = this.baseSize) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const s = this.sprites[i];
    const st = this.state[i];
    s.position.copy(position);
    s.visible = true;
    s.scale.setScalar(size);
    st.vel.copy(velocity);
    st.life = 0;
    st.maxLife = life;
    st.size = size;
  }

  update(delta) {
    for (let i = 0; i < this.count; i++) {
      const s = this.sprites[i];
      if (!s.visible) continue;
      const st = this.state[i];
      st.life += delta;
      const t = st.life / st.maxLife;
      if (t >= 1) { s.visible = false; continue; }
      s.position.addScaledVector(st.vel, delta);
      st.vel.multiplyScalar(1 - 1.4 * delta); // drag
      // Puffs expand and fade as they dissipate.
      s.scale.setScalar(st.size * (1 + t * 1.9));
      s.material.opacity = this.baseOpacity * (1 - t) * (1 - t);
    }
  }

  dispose() {
    this.sprites.forEach((s) => s.material.dispose());
    this.material.dispose();
    this.texture.dispose();
  }
}

export class TruckFX {
  constructor() {
    this.group = new THREE.Group(); // lives in world space, not on the truck

    this.dust = new ParticlePool(24, { color: 0xcfc4a8, size: 0.42, opacity: 0.3 });
    this.group.add(this.dust.group);

    this._dustTimer = 0;
    this._worldPos = new THREE.Vector3();
    this._vel = new THREE.Vector3();
  }

  /** Tints wheel dust to match whatever surface the current world uses. */
  setDustColor(color) {
    this.dust.sprites.forEach((s) => s.material.color.set(color));
  }

  update(delta, truck) {
    const speedFrac = Math.min(Math.abs(truck.speed) / truck.maxSpeed, 1);

    // --- Wheel dust: only once actually moving ---
    if (speedFrac > 0.18) {
      this._dustTimer -= delta;
      if (this._dustTimer <= 0) {
        this._dustTimer = 0.07;
        const side = Math.random() < 0.5 ? -1 : 1;
        const cos = Math.cos(truck.heading);
        const sin = Math.sin(truck.heading);
        // Rear axle position, rotated into world space.
        const lx = side * 1.06;
        const lz = -2.2;
        this._worldPos.set(
          truck.position.x + lx * cos + lz * sin,
          0.12,
          truck.position.z - lx * sin + lz * cos,
        );
        this._vel.set(
          (Math.random() - 0.5) * 0.6 - Math.sin(truck.heading) * truck.speed * 0.16,
          0.35 + Math.random() * 0.4,
          (Math.random() - 0.5) * 0.6 - Math.cos(truck.heading) * truck.speed * 0.16,
        );
        this.dust.emit(this._worldPos, this._vel, 0.75 + Math.random() * 0.4, 0.3 + speedFrac * 0.3);
      }
    }

    this.dust.update(delta);
  }

  dispose() {
    this.dust.dispose();
  }
}
