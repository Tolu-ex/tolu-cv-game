import * as THREE from 'three';

// Resolution of the top-down world snapshot. 512 still exceeds the on-screen
// radar's pixel density at every world's zoom level (the widest, the hub, works
// out at ~1.8 map px per world unit against ~1.6 on screen), while keeping the
// one-off GPU readback cheap.
const SNAPSHOT_SIZE = 512;

/**
 * GTA-style rotating radar.
 *
 * Rather than re-rendering the world every frame from a second camera, each
 * world is photographed once from directly above when it loads. The radar then
 * just draws that bitmap rotated under a fixed player arrow, with portal blips
 * composited on top — so the per-frame cost is one `drawImage` plus a handful
 * of vector shapes.
 *
 * Coordinate convention: the snapshot is rendered so that screen-right is
 * world +X and screen-down is world +Z. That makes map space and world space
 * the same thing (mapX = worldX, mapY = worldZ), which keeps the blip maths
 * trivial.
 */
export class MiniMap {
  constructor(renderer, canvas, captionEl) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.captionEl = captionEl;

    this.extent = 120;      // world half-size covered by the snapshot
    this.viewRadius = 60;   // world units from centre to radar edge
    this.mapImage = null;
    this._lastCaption = '';

    // --- offscreen plumbing for the snapshot ---
    this._target = new THREE.WebGLRenderTarget(SNAPSHOT_SIZE, SNAPSHOT_SIZE, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this._target.texture.colorSpace = THREE.SRGBColorSpace;

    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 500);
    this._camera.up.set(0, 0, -1); // screen-up = world -Z, so world +Z is down

    this._pixels = new Uint8Array(SNAPSHOT_SIZE * SNAPSHOT_SIZE * 4);
    this._offscreen = document.createElement('canvas');
    this._offscreen.width = SNAPSHOT_SIZE;
    this._offscreen.height = SNAPSHOT_SIZE;
    this._offCtx = this._offscreen.getContext('2d');
    this._imageData = this._offCtx.createImageData(SNAPSHOT_SIZE, SNAPSHOT_SIZE);

    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssSize = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || 168));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssSize = cssSize;
    this.radius = cssSize / 2 - 3; // leave room for the bezel stroke
    this.canvas.width = Math.round(cssSize * dpr);
    this.canvas.height = Math.round(cssSize * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Photographs the world from above into `this.mapImage`.
   * Objects flagged `userData.excludeFromMap` (clouds, starfields) and anything
   * passed in `hide` are omitted — portals get drawn as blips instead.
   */
  capture(scene, { extent = 120, viewRadius = 60, night = false, hide = [] } = {}) {
    this.extent = extent;
    this.viewRadius = viewRadius;

    const cam = this._camera;
    cam.left = -extent; cam.right = extent;
    cam.top = extent; cam.bottom = -extent;
    cam.near = 1; cam.far = 520;
    cam.position.set(0, 260, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    // --- stash state we're about to trample ---
    const prevFog = scene.fog;
    const prevTarget = this.renderer.getRenderTarget();
    const hidden = [];

    scene.fog = null; // fog would wash the map out toward the edges
    for (const obj of hide) {
      if (obj) { hidden.push([obj, obj.visible]); obj.visible = false; }
    }
    scene.traverse((obj) => {
      if (obj.userData?.excludeFromMap) { hidden.push([obj, obj.visible]); obj.visible = false; }
    });

    // Flat fill so night worlds are legible as a map. Ambient light folds into
    // a single uniform, so this does not trigger a shader recompile.
    const fill = new THREE.AmbientLight(0xffffff, night ? 2.6 : 0.45);
    scene.add(fill);

    let captured = true;
    try {
      this.renderer.setRenderTarget(this._target);
      this.renderer.clear();
      this.renderer.render(scene, cam);
      this.renderer.readRenderTargetPixels(this._target, 0, 0, SNAPSHOT_SIZE, SNAPSHOT_SIZE, this._pixels);
    } catch (err) {
      // A failed snapshot only costs us the map backdrop — blips still work.
      console.warn('MiniMap: snapshot failed, falling back to blips only', err);
      captured = false;
    } finally {
      this.renderer.setRenderTarget(prevTarget);
      scene.remove(fill);
      scene.fog = prevFog;
      for (const [obj, vis] of hidden) obj.visible = vis;
    }

    if (!captured) { this.mapImage = null; return; }

    // WebGL hands back rows bottom-to-top; flip them into the offscreen canvas
    // and force alpha opaque so putImageData doesn't render a hole.
    const src = this._pixels;
    const dst = this._imageData.data;
    const rowBytes = SNAPSHOT_SIZE * 4;
    for (let y = 0; y < SNAPSHOT_SIZE; y++) {
      const srcStart = (SNAPSHOT_SIZE - 1 - y) * rowBytes;
      dst.set(src.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
    }
    for (let i = 3; i < dst.length; i += 4) dst[i] = 255;

    this._offCtx.putImageData(this._imageData, 0, 0);
    this.mapImage = this._offscreen;
  }

  /** Draws one radar frame. `portals` are the live Portal instances. */
  update(truck, portals) {
    const ctx = this.ctx;
    const R = this.radius;
    const size = this.cssSize;
    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);

    // The radar rotates so the truck's heading always points up the screen.
    // Deriving it: heading 0 faces world +Z, which is *down* in map space, so
    // the content needs a half-turn on top of the heading.
    const spin = truck.heading + Math.PI;
    const scale = R / this.viewRadius;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0b1710';
    ctx.fillRect(0, 0, size, size);

    if (this.mapImage) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(spin);
      ctx.scale(scale, scale);
      ctx.translate(-truck.position.x, -truck.position.z);
      ctx.drawImage(this.mapImage, -this.extent, -this.extent, this.extent * 2, this.extent * 2);
      ctx.restore();
    }

    // Blips are positioned by hand (same rotation as the canvas transform) so
    // their glyphs stay upright instead of spinning with the map.
    const cos = Math.cos(spin);
    const sin = Math.sin(spin);
    const edgeR = R - 9;

    let nearest = null;
    let nearestDist = Infinity;

    for (const p of portals) {
      const wx = p.position.x - truck.position.x;
      const wz = p.position.z - truck.position.z;
      const worldDist = Math.hypot(wx, wz);
      if (worldDist < nearestDist) { nearestDist = worldDist; nearest = p; }

      const dx = wx * scale;
      const dz = wz * scale;
      const rx = dx * cos - dz * sin;
      const ry = dx * sin + dz * cos;

      const dist = Math.hypot(rx, ry);
      const color = `#${p.color.toString(16).padStart(6, '0')}`;

      if (dist > edgeR) {
        // Off-radar: pin an arrow to the rim pointing the way to go.
        const k = edgeR / (dist || 1);
        this._drawEdgeArrow(ctx, cx + rx * k, cy + ry * k, Math.atan2(ry, rx), color);
      } else {
        this._drawBlip(ctx, cx + rx, cy + ry, color);
      }
    }

    this._drawPlayerArrow(ctx, cx, cy);
    ctx.restore();

    this._drawBezel(ctx, cx, cy, R, truck.heading);
    this._updateCaption(nearest, nearestDist);
  }

  _drawBlip(ctx, x, y, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 7;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(5,12,8,0.85)';
    ctx.stroke();
    ctx.restore();
  }

  _drawEdgeArrow(ctx, x, y, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-3.5, 4.3);
    ctx.lineTo(-3.5, -4.3);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(5,12,8,0.85)';
    ctx.stroke();
    ctx.restore();
  }

  _drawPlayerArrow(ctx, cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5.8);
    ctx.lineTo(0, 2.9);
    ctx.lineTo(-5, 5.8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#14301c';
    ctx.stroke();
    ctx.restore();
  }

  _drawBezel(ctx, cx, cy, R, heading) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R + 1, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(214,255,176,0.45)';
    ctx.stroke();

    // North tick. North is world +Z, so at heading 0 (facing +Z) it sits at the
    // top. Drawn as a slim notch on the bezel itself rather than a badge, so it
    // can never sit on top of a portal blip clamped to the rim.
    const nx = Math.sin(heading);
    const ny = -Math.cos(heading);
    ctx.beginPath();
    ctx.moveTo(cx + nx * (R - 3), cy + ny * (R - 3));
    ctx.lineTo(cx + nx * (R + 3), cy + ny * (R + 3));
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#eaff9a';
    ctx.stroke();
    ctx.restore();
  }

  _updateCaption(nearest, dist) {
    if (!this.captionEl) return;
    const text = nearest ? `${nearest.icon ?? '📍'} ${nearest.label} · ${Math.round(dist)}m` : '';
    if (text !== this._lastCaption) {
      this.captionEl.textContent = text;
      this._lastCaption = text;
    }
  }

  dispose() {
    this._target.dispose();
  }
}
