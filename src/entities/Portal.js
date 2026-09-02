import * as THREE from 'three';
import { mesh, makeTextTexture } from '../utils/geoBuilders.js';

function iconTexture(icon) {
  return makeTextTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${h * 0.7}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, w / 2, h * 0.55);
  }, 128, 128);
}

function labelTexture(text, color) {
  return makeTextTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(6,14,8,0.72)';
    ctx.beginPath();
    ctx.roundRect(0, h * 0.28, w, h * 0.44, 14);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(2, h * 0.28, w - 4, h * 0.44, 14);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 40px Rubik, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h * 0.5);
  }, 512, 128);
}

/**
 * A glowing portal archway. Standing/driving through the trigger radius
 * fires `onEnter` (handled by Game.js) exactly once per approach.
 */
export class Portal {
  constructor({ id, label, icon = '✨', color = 0xffffff, position = new THREE.Vector3(), heading = 0, radius = 3.6, triggerDistance = 4.2 }) {
    this.id = id;
    this.label = label;
    this.icon = icon;
    this.color = color;
    this.position = position.clone();
    this.heading = heading;
    this.radius = radius;
    this.triggerDistance = triggerDistance;
    this.group = this._build(icon);
    this.group.position.copy(this.position);
    this.group.rotation.y = heading;
  }

  _build(icon) {
    const g = new THREE.Group();
    const ringColor = this.color;

    const legGeo = new THREE.CylinderGeometry(0.35, 0.4, this.radius * 2, 8);
    for (const side of [-1, 1]) {
      const leg = mesh(legGeo, 0x1c1e22);
      leg.position.set(side * this.radius * 0.62, this.radius, 0);
      g.add(leg);
      const glowStrip = mesh(new THREE.CylinderGeometry(0.42, 0.46, this.radius * 1.9, 8), ringColor, {
        emissive: ringColor, emissiveIntensity: 1.4, transparent: true, opacity: 0.9 });
      glowStrip.position.copy(leg.position);
      g.add(glowStrip);
    }

    const archGeo = new THREE.TorusGeometry(this.radius * 0.66, 0.42, 8, 20, Math.PI);
    const arch = mesh(archGeo, 0x1c1e22);
    arch.position.set(0, this.radius * 1.62, 0);
    arch.rotation.z = Math.PI;
    g.add(arch);
    const archGlow = mesh(new THREE.TorusGeometry(this.radius * 0.66, 0.5, 8, 20, Math.PI), ringColor, {
      emissive: ringColor, emissiveIntensity: 1.4, transparent: true, opacity: 0.85 });
    archGlow.position.copy(arch.position);
    archGlow.rotation.z = Math.PI;
    g.add(archGlow);

    // Portal "membrane" — translucent glowing plane filling the archway
    const membrane = mesh(new THREE.CircleGeometry(this.radius * 0.66, 24, 0, Math.PI), ringColor, {
      emissive: ringColor, emissiveIntensity: 0.9, transparent: true, opacity: 0.28 });
    membrane.rotation.z = Math.PI;
    membrane.position.set(0, this.radius * 1.62, 0);
    membrane.material.side = THREE.DoubleSide;
    g.add(membrane);
    this.membrane = membrane;

    const rectMembrane = mesh(new THREE.PlaneGeometry(this.radius * 1.24, this.radius * 1.62), ringColor, {
      emissive: ringColor, emissiveIntensity: 0.5, transparent: true, opacity: 0.14 });
    rectMembrane.material.side = THREE.DoubleSide;
    rectMembrane.position.set(0, this.radius * 0.81, 0);
    g.add(rectMembrane);

    // Icon sprite floating above the arch
    const iconTex = iconTexture(icon);
    const iconMat = new THREE.SpriteMaterial({ map: iconTex, transparent: true });
    const iconSprite = new THREE.Sprite(iconMat);
    iconSprite.position.set(0, this.radius * 1.62, 0);
    iconSprite.scale.set(2.4, 2.4, 1);
    g.add(iconSprite);
    this.iconSprite = iconSprite;

    // Label plaque
    const labelTex = labelTexture(this.label, `#${ringColor.toString(16).padStart(6, '0')}`);
    const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.position.set(0, this.radius * 0.15, 0);
    labelSprite.scale.set(6.5, 1.6, 1);
    g.add(labelSprite);

    // Point light for local glow
    const light = new THREE.PointLight(ringColor, 4, this.radius * 3, 2);
    light.position.set(0, this.radius * 1.4, 0);
    g.add(light);
    this.light = light;

    return g;
  }

  /** Distance (XZ plane) from a world-space point to the portal center. */
  distanceTo(point) {
    return Math.hypot(point.x - this.position.x, point.z - this.position.z);
  }

  update(delta, elapsed) {
    const pulse = 1.1 + Math.sin(elapsed * 2 + this.position.x) * 0.35;
    if (this.light) this.light.intensity = 3.2 * pulse;
    if (this.membrane) this.membrane.material.opacity = 0.22 + Math.sin(elapsed * 2.4) * 0.08;
    if (this.iconSprite) {
      this.iconSprite.position.y = this.radius * 1.62 + Math.sin(elapsed * 1.6 + this.position.z) * 0.4;
    }
    this.group.rotation.y = this.heading; // static, but kept for potential wobble
  }
}
