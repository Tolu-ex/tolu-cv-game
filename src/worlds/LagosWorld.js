import * as THREE from 'three';
import { mesh, createBuildingBlock, makeTextTexture } from '../utils/geoBuilders.js';
import { PALETTE } from '../utils/colors.js';
import { seededRandom } from '../utils/rng.js';

const C = PALETTE.lagos;

function stallCanopy() {
  return makeTextTexture((ctx, w, h) => {
    ctx.fillStyle = '#d94f3d';
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#d94f3d' : '#f2f2f2';
      ctx.fillRect((i / 8) * w, 0, w / 8, h);
    }
  }, 256, 32);
}

function marketStall({ roofColor = C.stallRoof, goodsColor = 0xe0a83f } = {}) {
  const g = new THREE.Group();
  const canopyMat = new THREE.MeshStandardMaterial({ map: stallCanopy(), roughness: 0.8, flatShading: true });
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 1.8), canopyMat);
  canopy.position.y = 2.1;
  g.add(canopy);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2, 5), 0x4a3826);
    leg.position.set(sx * 1.15, 1, sz * 0.75);
    g.add(leg);
  }
  const counter = mesh(new THREE.BoxGeometry(2.4, 0.9, 1.4), 0x8a6a45);
  counter.position.y = 0.45;
  g.add(counter);
  for (let i = 0; i < 6; i++) {
    const good = mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), i % 2 === 0 ? roofColor : goodsColor);
    good.position.set(-0.9 + i * 0.32, 1.05, (i % 2) * 0.3 - 0.15);
    g.add(good);
  }
  return g;
}

export function buildLagosWorld() {
  const group = new THREE.Group();
  const rand = seededRandom(31);
  const bounds = 70;

  const ground = mesh(new THREE.PlaneGeometry(170, 200), C.plaza);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // Road down the middle
  const road = mesh(new THREE.PlaneGeometry(10, 190), 0x3a3a3f);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.015;
  group.add(road);
  for (let z = -85; z < 85; z += 6) {
    const dash = mesh(new THREE.PlaneGeometry(0.3, 3), 0xffe23f, { emissive: 0xffe23f, emissiveIntensity: 0.2 });
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.02, z);
    group.add(dash);
  }

  // Lagoon on the west side
  const lagoon = mesh(new THREE.PlaneGeometry(60, 200), C.lagoon, { emissive: C.lagoon, emissiveIntensity: 0.08 });
  lagoon.rotation.x = -Math.PI / 2;
  lagoon.position.set(-58, 0.01, 0);
  group.add(lagoon);

  // Skyline across the lagoon
  for (let i = 0; i < 16; i++) {
    const w = 5 + rand() * 5;
    const h = 14 + rand() * 34;
    const b = createBuildingBlock({ w, h, d: 5 + rand() * 5, color: C.skyline[Math.floor(rand() * C.skyline.length)], lit: true });
    b.position.set(-82 - rand() * 20, 0, -85 + i * 11 + (rand() - 0.5) * 4);
    group.add(b);
  }

  // A denser skyline further along the drive (Lagos Island feel) on the east side, past the market
  for (let i = 0; i < 10; i++) {
    const w = 6 + rand() * 4;
    const h = 16 + rand() * 26;
    const b = createBuildingBlock({ w, h, d: 6 + rand() * 4, color: C.skyline[Math.floor(rand() * C.skyline.length)], lit: true });
    b.position.set(30 + rand() * 20, 0, -30 - i * 10);
    group.add(b);
  }

  // Market stalls near the spawn end, east side
  for (let i = 0; i < 14; i++) {
    const stall = marketStall({});
    stall.position.set(14 + rand() * 12, 0, 60 - i * 9 + (rand() - 0.5) * 3);
    stall.rotation.y = -Math.PI / 2 + (rand() - 0.5) * 0.3;
    group.add(stall);
  }

  // Palm-less street trees for a bit of green
  for (let i = 0; i < 10; i++) {
    const trunk = mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.5, 6), 0x6b4a2f);
    trunk.position.set(9, 1.25, 55 - i * 12);
    const leaf = mesh(new THREE.IcosahedronGeometry(1.3, 0), 0x3f9f4f);
    leaf.position.set(9, 3, 55 - i * 12);
    group.add(trunk, leaf);
  }

  // Lighting — bright, slightly hazy tropical daylight
  group.add(new THREE.AmbientLight(0xffffff, 0.22));
  const hemi = new THREE.HemisphereLight(0xdcefff, 0x6a6a6a, 0.28);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2e0, 0.85);
  sun.position.set(40, 70, 20);
  group.add(sun, sun.target);

  // Bins along the roadside, on the market side and opposite.
  const binSpots = [];
  for (let i = 0; i < 7; i++) {
    const z = -46 + i * 16;
    binSpots.push({ x: 6.8, z });
    binSpots.push({ x: -6.8, z: z + 8 });
  }

  return {
    group,
    name: '🏙️ Lagos',
    sky: C.sky,
    fog: C.fog,
    fogNear: 65,
    fogFar: 200,
    dustColor: 0x9a9a9a, // city road dust
    bounds,
    mapExtent: 95,
    mapViewRadius: 58,
    binSpots,
    depot: { x: 5, z: 58 },
    spawn: new THREE.Vector3(5, 0, 62),
    heading: Math.PI,
    portals: [
      { id: 'hub', label: 'Back to Nature World', icon: '🌿', color: PALETTE.portal.exit, position: new THREE.Vector3(5, 0, -62), heading: 0 },
    ],
    update() {},
    night: false,
  };
}
