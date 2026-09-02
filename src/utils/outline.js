import * as THREE from 'three';

/**
 * Inked outlines, the missing half of the flat-vector look.
 *
 * A travel poster carries form in two ways: flat blocks of colour, and LINE.
 * The game had only the first. Measured on the truck's body, the roof and the
 * flank rendered at luma 131.5 and 130.8 out of 255 — a 0.7% difference — so
 * 605 nodes of modelled detail collapsed into one silhouette of one colour.
 * Widening the shading bands helped, but shading alone cannot draw an edge:
 * where two panels meet at a shallow angle there is simply no value change to
 * see. That is what reads as "blocks upon blocks".
 *
 * This is the inverted-hull technique: draw each mesh a second time, expanded
 * along its normals, with front faces culled so only the sliver protruding
 * past the original silhouette survives. It suits this model unusually well
 * because the model is built from hundreds of separate meshes — every rib,
 * shut line, step, lamp and mudflap gets its own contour, which is exactly the
 * interior line work a poster would have.
 *
 * The expansion happens in view space and is scaled by distance, so a line is
 * a constant width in PIXELS. That matters here: the model's parts carry wildly
 * different node scales (0.186 to 1.066), and expanding in local space would
 * make a gripper pad's outline five times heavier than the body's.
 */

const VERT = /* glsl */`
  uniform float thickness;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    // -mv.z is the view distance: scaling by it keeps the line a constant
    // width on screen instead of shrinking as the truck drives away.
    mv.xyz += n * thickness * max(-mv.z, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  uniform vec3 outlineColor;
  void main() { gl_FragColor = vec4(outlineColor, 1.0); }
`;

/**
 * Adds outline shells to every mesh under `root`.
 *
 * Each shell is parented to the mesh it outlines, so it inherits that mesh's
 * world transform for free and keeps following it when the mechanism animates
 * a joint — no per-frame bookkeeping, and nothing to keep in sync.
 *
 * @param root       object to outline
 * @param thickness  line width, roughly in pixels per unit of view distance
 * @param color      ink colour; a very dark tint of the subject reads better
 *                   than pure black against flat poster colour
 * @param minSize    skip parts smaller than this (in world units) — outlining
 *                   a wheel nut just muddies the silhouette
 */
export function addOutlines(root, { thickness = 0.0026, color = 0x16240a, minSize = 0.06 } = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      thickness: { value: thickness },
      outlineColor: { value: new THREE.Color(color) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,      // only the expanded backfaces survive
    depthWrite: true,
  });

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const targets = [];
  root.traverse((o) => {
    if (o.isMesh && o.geometry && !o.userData.isOutline) targets.push(o);
  });

  let added = 0, skipped = 0;
  for (const mesh of targets) {
    // Transparent things (glass, lamp lenses) must not be inked — an outline
    // around a window makes it read as a solid panel.
    if (mesh.material?.transparent) { skipped++; continue; }

    box.setFromObject(mesh);
    box.getSize(size);
    if (Math.max(size.x, size.y, size.z) < minSize) { skipped++; continue; }

    const shell = new THREE.Mesh(mesh.geometry, material);
    shell.userData.isOutline = true;
    // Identity transform: as a child of the mesh it shares its frame exactly.
    shell.renderOrder = (mesh.renderOrder || 0) - 1;
    shell.frustumCulled = mesh.frustumCulled;
    mesh.add(shell);
    added++;
  }

  return { material, added, skipped };
}

/**
 * A soft contact shadow.
 *
 * Real shadows are off for this art direction, which left every vehicle
 * floating a few centimetres above its own world. This is the poster
 * equivalent: one unlit ellipse on the ground, drawn with a radial falloff
 * baked into the shader rather than a texture.
 */
export function createContactShadow({ radiusX = 1.7, radiusZ = 4.6, opacity = 0.18 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: opacity } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        float d = distance(vUv, vec2(0.5)) * 2.0;
        // Cubic falloff keeps the darkness tight under the axles and gone
        // well before the edge, so it never reads as a drawn grey disc.
        // Nothing else in these worlds casts a shadow, so this has to register
        // as weight under the vehicle rather than as a lighting effect.
        float a = clamp(1.0 - d, 0.0, 1.0);
        gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * a * opacity);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;          // just clear of the ground plane
  mesh.renderOrder = -2;
  mesh.userData.isOutline = true;  // never outline the shadow itself
  return mesh;
}
