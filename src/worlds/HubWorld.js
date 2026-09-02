import * as THREE from 'three';
import { mesh, createTree, createBush, createCloud, createLampPost } from '../utils/geoBuilders.js';
import { PALETTE } from '../utils/colors.js';
import { seededRandom } from '../utils/rng.js';

const C = PALETTE.nature;
const P = PALETTE.portal;

const WORLD_BOUNDS = 130;
const HUB_PORTAL_RADIUS = 92;

// Six portals evenly spread in a ring around the spawn point.
export const HUB_PORTAL_DEFS = [
  { id: 'haarlem', label: 'Haarlem', icon: '🇳🇱', color: P.haarlem, angle: 0 },
  { id: 'ileife', label: 'Ile-Ife', icon: '🇳🇬', color: P.ileife, angle: (Math.PI * 2) / 6 },
  { id: 'lagos', label: 'Lagos', icon: '🏙️', color: P.lagos, angle: (Math.PI * 4) / 6 },
  { id: 'market', label: 'Street Market', icon: '👟', color: P.market, angle: Math.PI },
  { id: 'singapore', label: 'Singapore', icon: '🇸🇬', color: P.singapore, angle: (Math.PI * 8) / 6 },
  { id: 'contact', label: 'Say Hello', icon: '🌷', color: P.contact, angle: (Math.PI * 10) / 6 },
].map((p) => ({
  ...p,
  position: new THREE.Vector3(Math.sin(p.angle) * HUB_PORTAL_RADIUS, 0, Math.cos(p.angle) * HUB_PORTAL_RADIUS),
  // Face back toward the center so the truck naturally drives "into" it
  heading: p.angle + Math.PI,
}));

export function buildHubWorld() {
  const group = new THREE.Group();
  const rand = seededRandom(42);

  // Ground
  const groundGeo = new THREE.CircleGeometry(WORLD_BOUNDS + 40, 48);
  const ground = mesh(groundGeo, C.ground);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // Subtle darker rings for a bit of ground variation
  for (let r = 20; r < WORLD_BOUNDS + 30; r += 26) {
    const ring = mesh(new THREE.RingGeometry(r, r + 6, 40), C.groundDark, { transparent: true, opacity: 0.35 });
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    group.add(ring);
  }

  // Central plaza patch around spawn
  const plaza = mesh(new THREE.CircleGeometry(9, 24), C.path);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  group.add(plaza);

  // Dirt paths radiating out to each portal
  for (const p of HUB_PORTAL_DEFS) {
    const dist = HUB_PORTAL_RADIUS - 6;
    const path = mesh(new THREE.PlaneGeometry(4.6, dist), C.path);
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = -p.angle;
    path.position.set(Math.sin(p.angle) * dist * 0.5, 0.015, Math.cos(p.angle) * dist * 0.5);
    group.add(path);
  }

  // Scatter trees + bushes, avoiding the plaza, paths, and portal clearings
  const clearZones = [{ x: 0, z: 0, r: 12 }, ...HUB_PORTAL_DEFS.map((p) => ({ x: p.position.x, z: p.position.z, r: 14 }))];
  const isClear = (x, z) => {
    for (const zone of clearZones) {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.r) return false;
    }
    // keep clear of the radiating paths too
    for (const p of HUB_PORTAL_DEFS) {
      const dot = x * Math.sin(p.angle) + z * Math.cos(p.angle);
      const perp = Math.abs(x * Math.cos(p.angle) - z * Math.sin(p.angle));
      if (dot > 0 && dot < HUB_PORTAL_RADIUS - 6 && perp < 4) return false;
    }
    return true;
  };

  let placed = 0, attempts = 0;
  while (placed < 150 && attempts < 900) {
    attempts++;
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * (WORLD_BOUNDS - 10);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!isClear(x, z)) continue;
    const kind = rand();
    let obj;
    if (kind < 0.72) {
      obj = createTree({
        height: 3 + rand() * 3.5,
        radius: 1.1 + rand() * 0.9,
        leafColor: rand() < 0.5 ? C.treeLeaf : C.treeLeafLight,
      });
    } else {
      obj = createBush({ radius: 0.6 + rand() * 0.6, color: rand() < 0.5 ? C.treeLeaf : C.treeLeafLight });
    }
    obj.position.set(x, 0, z);
    obj.rotation.y = rand() * Math.PI * 2;
    const s = 0.8 + rand() * 0.5;
    obj.scale.setScalar(s);
    group.add(obj);
    placed++;
  }

  // A few lamp posts along the plaza edge
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const lamp = createLampPost({ height: 3.6 });
    lamp.position.set(Math.sin(a) * 10.5, 0, Math.cos(a) * 10.5);
    group.add(lamp);
  }

  // Drifting clouds
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const cloud = createCloud({ scale: 3 + rand() * 2.5 });
    cloud.position.set((rand() - 0.5) * 260, 30 + rand() * 20, (rand() - 0.5) * 260);
    cloud.userData.excludeFromMap = true; // would sit on top of the radar image
    group.add(cloud);
    clouds.push(cloud);
  }

  // Lighting for cel shading: mostly ambient so surfaces sit in the ramp's
  // upper band, with one soft directional to pick out which face is lit. A
  // strong key light would snap most faces to the dark band and read harsh.
  // Total incident light must land near 1.0. With tone mapping off, anything
  // much above that clips dark colours toward white — which is why the hopper
  // recess rendered pale instead of deep, and why the whole scene washed out.
  group.add(new THREE.AmbientLight(0xffffff, 0.22));
  group.add(new THREE.HemisphereLight(0xdcebf2, C.ground, 0.28));
  const sun = new THREE.DirectionalLight(0xfff6e8, 0.85);
  sun.position.set(60, 90, 40);
  group.add(sun, sun.target);

  return {
    group,
    name: '🌿 Nature World',
    sky: C.sky,
    fog: C.fog,
    fogNear: 45,
    fogFar: 165,
    dustColor: 0xcfc4a8, // dry path dust
    bounds: WORLD_BOUNDS,
    // Wide enough to hold the whole portal ring (radius 92) plus the treeline.
    mapExtent: 140,
    mapViewRadius: 78,
    spawn: new THREE.Vector3(0, 0, 0),
    heading: 0,
    portals: HUB_PORTAL_DEFS.map((p) => ({
      id: p.id, label: p.label, icon: p.icon, color: p.color, position: p.position.clone(), heading: p.heading,
    })),
    update(delta, elapsed) {
      clouds.forEach((c, i) => { c.position.x += Math.sin(i) * 0.4 * delta; });
    },
    night: false,
  };
}
