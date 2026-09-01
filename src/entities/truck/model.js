import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { toonRamp } from '../../utils/artDirection.js';

const MODEL_URL = `${import.meta.env.BASE_URL}rova-truck.glb`;

/**
 * Loads the truck once and hands back the parsed scene.
 *
 * The shipped model is meshopt-compressed (5.5 MB -> 767 KB), so the decoder
 * has to be registered before the loader will touch it.
 */
export function loadTruckModel() {
  return new Promise((resolve, reject) => {
    new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .load(MODEL_URL, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

/**
 * Re-parents a node so it rotates about its own centre.
 *
 * The wheel groups in the model all sit at the origin with their geometry
 * baked in truck space, so spinning one in place would swing it around the
 * truck's centre instead. This measures where the wheel actually is, puts a
 * pivot there, and shifts the geometry to be relative to it.
 */
function repivot(node, parent) {
  const box = new THREE.Box3().setFromObject(node);
  const centre = box.getCenter(new THREE.Vector3());

  const pivot = new THREE.Group();
  pivot.position.copy(centre);
  parent.add(pivot);

  node.position.sub(centre);
  pivot.add(node);
  return { pivot, centre, radius: (box.max.y - box.min.y) / 2 };
}

/**
 * Splits the loaded model into the rig the game drives.
 *
 * The truck is a sprung/unsprung system: the body leans under braking and
 * cornering while the wheels stay planted. The model arrives as one hierarchy,
 * so it has to be taken apart along that line.
 */
export function buildRigFromModel(scene, { bodyGroup, rootGroup }) {
  const byName = new Map();
  scene.traverse((o) => { if (o.name) byName.set(o.name, o); });

  const wheelsGroup = byName.get('wheels');
  const rig = {
    steerable: [], spinning: [], wheelInfo: [],
    wheelRadius: 0.5, wheelbase: 4.5, track: 2.2, frontAxleZ: 2.4, rearAxleZ: -2.1,
    arm: null, parts: byName,
  };

  // Wheels are unsprung: they hang off the root so the body can lean
  // independently of them.
  if (wheelsGroup) {
    const wheelNodes = [...wheelsGroup.children];
    for (const wheel of wheelNodes) {
      const { pivot, centre, radius } = repivot(wheel, rootGroup);
      rig.wheelRadius = Math.max(rig.wheelRadius, radius);

      // Steering pivot wraps the spin pivot, so steer and roll compose rather
      // than overwrite one another.
      const steer = new THREE.Group();
      steer.position.copy(pivot.position);
      pivot.position.set(0, 0, 0);
      rootGroup.add(steer);
      steer.add(pivot);

      const isFront = /front/i.test(wheel.name);
      // Left/right from the geometry rather than the name, so a renamed part
      // cannot silently flip a wheel to the wrong side.
      const side = Math.sign(centre.x) || 1;
      if (isFront) rig.steerable.push(steer);
      rig.spinning.push(pivot);
      rig.wheelInfo.push({ steer, pivot, isFront, side, x: centre.x, z: centre.z });
    }
    wheelsGroup.parent?.remove(wheelsGroup);

    // Measure the chassis rather than hard-coding it: the steering model needs
    // a real wheelbase, and a tandem rear bogie behaves like a single axle
    // midway between its two.
    const fronts = rig.wheelInfo.filter((w) => w.isFront);
    const rears = rig.wheelInfo.filter((w) => !w.isFront);
    if (fronts.length && rears.length) {
      const avg = (a, k) => a.reduce((s, w) => s + w[k], 0) / a.length;
      rig.frontAxleZ = avg(fronts, 'z');
      rig.rearAxleZ = avg(rears, 'z');
      rig.wheelbase = rig.frontAxleZ - rig.rearAxleZ;
      rig.track = Math.max(...fronts.map((w) => Math.abs(w.x))) * 2;
    }
  }

  // Everything else is sprung mass.
  bodyGroup.add(scene);

  rig.arm = byName.get('arm') || null;
  rig.armBoom = byName.get('arm-boom') || null;
  rig.armCarriage = byName.get('arm-carriage') || null;
  rig.gripperJawA = byName.get('gripper-jaw-a') || null;
  rig.gripperJawB = byName.get('gripper-jaw-b') || null;

  return rig;
}

/**
 * Converts the model's PBR materials to the game's cel shading.
 *
 * The model ships with standard materials; the worlds are flat-shaded toon.
 * Left as-is the truck would look lit by a different sun than everything
 * around it. Base colours and textures are kept — only the shading model
 * changes.
 */
export function applyToonShading(scene) {
  const converted = new Map();
  const ramp = toonRamp();
  scene.updateMatrixWorld(true);

  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const src = Array.isArray(o.material) ? o.material : [o.material];
    const out = src.map((m) => {
      if (converted.has(m)) return converted.get(m);

      const isGlass = /glass/i.test(m.name || '');
      const isLamp = /lamp|amber/i.test(m.name || '');
      let next;
      if (isLamp) {
        // Lamps must stay a constant flat colour at any angle.
        next = new THREE.MeshBasicMaterial({ color: m.color ? m.color.clone() : 0xffffff, map: m.map || null });
      } else if (isGlass) {
        next = new THREE.MeshBasicMaterial({
          color: m.color ? m.color.clone() : 0x5b7382,
          transparent: true, opacity: 0.72,
        });
      } else {
        next = new THREE.MeshToonMaterial({
          color: m.color ? m.color.clone() : 0xffffff,
          map: m.map || null,
          gradientMap: ramp,
          transparent: m.transparent,
          opacity: m.opacity,
          side: m.side,
        });
      }
      next.name = m.name;
      converted.set(m, next);
      return next;
    });
    o.material = Array.isArray(o.material) ? out : out[0];

    // Mirrored nodes flip their texture with them. The model builds each
    // left-hand livery panel by mirroring the right one (scale -1,1,1), so
    // any text baked into the decal comes out backwards. Give those nodes
    // their own texture flipped back on U.
    if (o.matrixWorld.determinant() < 0) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map((m) => {
        if (!m.map) return m;
        const fixed = m.clone();
        fixed.map = m.map.clone();
        fixed.map.wrapS = THREE.RepeatWrapping;
        fixed.map.repeat.x = -1;
        fixed.map.offset.x = 1;
        fixed.map.needsUpdate = true;
        return fixed;
      });
      if (!Array.isArray(o.material)) o.material = o.material[0];
      else if (o.material.length === 1) o.material = o.material[0];
    }

    o.castShadow = false;
    o.receiveShadow = false;
  });
  return converted.size;
}
