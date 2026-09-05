import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Tilt-shift depth of field — the effect that makes a scene read as a model.
 *
 * A photograph looks miniature because of one thing above all others: the depth
 * of field is impossibly shallow for the apparent size of the subject. Our eyes
 * read "only a few centimetres of this is sharp" and conclude the whole thing
 * must be small. Colour, texture and geometry all matter far less than this.
 *
 * Photographers fake it by blurring a horizontal band, but that is a 2D trick
 * on a still image. Here the blur is driven by actual scene depth, so it stays
 * correct as the camera orbits and the truck drives — near ground blurs, the
 * subject stays sharp, the far treeline goes soft, all from the depth buffer.
 *
 * The focal plane tracks the vehicle, so the thing you are controlling is
 * always the sharp thing.
 */

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 600 },
    focusDistance: { value: 14 },   // metres from the camera
    focusRange: { value: 7 },       // metres either side that stay sharp
    maxBlur: { value: 0.0075 },     // blur radius, in UV
    aspect: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear, cameraFar;
    uniform float focusDistance, focusRange, maxBlur, aspect;
    varying vec2 vUv;

    // Depth buffer -> distance from the camera, in world units.
    float viewDistance(vec2 uv) {
      float depth = texture2D(tDepth, uv).x;
      float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
      return -viewZ;
    }

    // A 12-tap spiral. Enough samples to avoid banding on a soft blur, few
    // enough to stay cheap on integrated graphics.
    const int TAPS = 12;
    vec2 spiral(int i) {
      float f = float(i);
      float a = f * 2.39996;          // golden angle, so taps never line up
      float r = sqrt((f + 0.5) / float(TAPS));
      return vec2(cos(a), sin(a)) * r;
    }

    void main() {
      float dist = viewDistance(vUv);

      // Circle of confusion: zero inside the focal band, ramping to full blur
      // beyond it. Squared so the transition out of focus is gentle rather
      // than a visible edge.
      float coc = clamp((abs(dist - focusDistance) - focusRange) / (focusRange * 2.0), 0.0, 1.0);
      coc *= coc;

      if (coc < 0.003) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      float radius = coc * maxBlur;
      vec4 sum = texture2D(tDiffuse, vUv);
      float weight = 1.0;

      for (int i = 0; i < TAPS; i++) {
        vec2 offset = spiral(i) * radius;
        offset.x /= aspect;                       // keep the bokeh circular
        vec2 uv = vUv + offset;

        // Do not let a sharp foreground bleed outwards over a blurred
        // background: only accept a tap that is itself at least as defocused.
        float tapDist = viewDistance(uv);
        float tapCoc = clamp((abs(tapDist - focusDistance) - focusRange) / (focusRange * 2.0), 0.0, 1.0);
        float w = step(coc * 0.4, tapCoc * tapCoc);

        sum += texture2D(tDiffuse, uv) * w;
        weight += w;
      }
      gl_FragColor = sum / weight;
    }
  `,
};

export class TiltShiftRenderer {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.camera = camera;

    const size = renderer.getSize(new THREE.Vector2());
    const dpr = renderer.getPixelRatio();
    const target = this._makeTarget(size.x * dpr, size.y * dpr);

    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.dof = new ShaderPass(TiltShiftShader);
    this.dof.uniforms.tDepth.value = target.depthTexture;
    this.dof.uniforms.cameraNear.value = camera.near;
    this.dof.uniforms.cameraFar.value = camera.far;
    this.dof.uniforms.aspect.value = size.x / Math.max(size.y, 1);
    this.composer.addPass(this.dof);
  }

  _makeTarget(w, h) {
    const depthTexture = new THREE.DepthTexture(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    depthTexture.type = THREE.UnsignedIntType;
    return new THREE.WebGLRenderTarget(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), {
      depthBuffer: true,
      depthTexture,
    });
  }

  /** Points the focal plane at a world position — normally the player vehicle. */
  focusOn(worldPosition, { range = null } = {}) {
    const d = this.camera.position.distanceTo(worldPosition);
    this.dof.uniforms.focusDistance.value = d;
    if (range != null) this.dof.uniforms.focusRange.value = range;
  }

  setScene(scene) { this.renderPass.scene = scene; }

  setSize(width, height) {
    this.composer.setSize(width, height);
    const dpr = this.renderer.getPixelRatio();
    // The depth texture has to be resized with the colour target or the two
    // stop lining up and the blur samples the wrong distances.
    const t = this.composer.renderTarget1;
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.depthTexture) { rt.depthTexture.image.width = w; rt.depthTexture.image.height = h; rt.depthTexture.needsUpdate = true; }
    }
    this.dof.uniforms.tDepth.value = t.depthTexture;
    this.dof.uniforms.aspect.value = width / Math.max(height, 1);
  }

  render() { this.composer.render(); }

  dispose() {
    this.composer.renderTarget1?.dispose();
    this.composer.renderTarget2?.dispose();
  }
}
