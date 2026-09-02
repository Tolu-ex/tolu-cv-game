import * as THREE from 'three';
import { mesh, createSupertree, createBuildingBlock, windowGridTexture } from '../utils/geoBuilders.js';
import { PALETTE } from '../utils/colors.js';
import { seededRandom } from '../utils/rng.js';

const C = PALETTE.singapore;

function marinaBaySands() {
  const g = new THREE.Group();
  const towerH = 30;
  const towerW = 4.2;
  const towerPositions = [-8, 0, 8]; // spaced so the three towers read distinctly
  const towers = [];
  for (const x of towerPositions) {
    const tex = windowGridTexture(4, 22, { lit: 0.55, base: '#7a8494', litColor: '#fff2c9', dimColor: '#2a3040' });
    const mat = new THREE.MeshStandardMaterial({ color: C.tower, roughness: 0.5, metalness: 0.3, flatShading: true, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.6 });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, 5), mat);
    tower.position.set(x, towerH / 2, 0);
    g.add(tower);
    towers.push(tower);
  }
  // Slight fan-out lean for the iconic silhouette
  towers[0].rotation.z = 0.05;
  towers[2].rotation.z = -0.05;

  // "Skypark" — the boat-shaped deck bridging all three towers
  const deckW = 8 * 2 + towerW + 2.5;
  const deck = mesh(new THREE.BoxGeometry(deckW, 1.2, 5.4), 0xb7bec9);
  deck.position.set(0, towerH + 1.0, 0);
  g.add(deck);
  const deckUnderside = mesh(new THREE.BoxGeometry(deckW - 0.8, 0.5, 4.8), 0x555b66);
  deckUnderside.position.set(0, towerH + 0.35, 0);
  g.add(deckUnderside);
  // The deck's overhanging "prow" at one end
  const prow = mesh(new THREE.BoxGeometry(3.4, 0.9, 4.6), 0xb7bec9);
  prow.position.set(deckW / 2 + 1.4, towerH + 1.0, 0);
  g.add(prow);
  // rails + rooftop lights along the deck
  for (let i = -deckW / 2 + 1; i <= deckW / 2 - 1; i += 2.4) {
    const rail = mesh(new THREE.BoxGeometry(0.12, 0.6, 5.2), 0xd8dde3);
    rail.position.set(i, towerH + 1.9, 0);
    g.add(rail);
  }
  const glow = new THREE.PointLight(C.towerGlow, 30, 34, 2);
  glow.position.set(0, towerH + 2.5, 0);
  g.add(glow);

  return g;
}

export function buildSingaporeWorld() {
  const group = new THREE.Group();
  const rand = seededRandom(64);
  const bounds = 66;

  const boardwalk = mesh(new THREE.PlaneGeometry(150, 190), C.boardwalk);
  boardwalk.rotation.x = -Math.PI / 2;
  group.add(boardwalk);

  // Bay water on the west side, reflective and dark
  const water = mesh(new THREE.PlaneGeometry(60, 190), C.water, {
    roughness: 0.05, metalness: 0.6, emissive: C.water, emissiveIntensity: 0.25,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.set(-58, 0.01, 0);
  group.add(water);

  // Central promenade path
  const path = mesh(new THREE.PlaneGeometry(8, 180), 0x3d3f4d);
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.015;
  group.add(path);
  for (let z = -80; z < 80; z += 4) {
    const tile = mesh(new THREE.PlaneGeometry(0.06, 3.4), 0x565a6c, { emissive: 0x8fa0ff, emissiveIntensity: 0.15 });
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(0, 0.02, z);
    group.add(tile);
  }

  // Marina Bay Sands landmark
  const mbs = marinaBaySands();
  mbs.position.set(-28, 0, 10);
  mbs.scale.setScalar(1.15);
  group.add(mbs);

  // Supertree grove on the east side
  const supertreePositions = [
    [16, -10], [22, 2], [15, 16], [26, -22], [12, 26], [24, -35],
  ];
  for (const [x, z] of supertreePositions) {
    const tree = createSupertree({ height: 11 + rand() * 6, canopyRadius: 2.4 + rand() * 1.2, canopyColor: C.supertreeCanopy });
    tree.position.set(x, 0, z);
    group.add(tree);
  }

  // Distant skyline silhouettes across the bay
  for (let i = 0; i < 14; i++) {
    const w = 5 + rand() * 5;
    const h = 16 + rand() * 30;
    const b = createBuildingBlock({ w, h, d: 5 + rand() * 5, color: 0x39415a, lit: true });
    b.position.set(-95 - rand() * 15, 0, -85 + i * 12 + (rand() - 0.5) * 4);
    group.add(b);
  }

  // A few more buildings flanking the promenade toward the exit
  for (let i = 0; i < 6; i++) {
    const b = createBuildingBlock({ w: 6, h: 20 + rand() * 12, d: 6, color: 0x4a5268, lit: true });
    b.position.set(30 + rand() * 8, 0, -30 - i * 12);
    group.add(b);
  }

  // Starfield
  const starGeo = new THREE.BufferGeometry();
  const starCount = 500;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (rand() - 0.5) * 300;
    starPos[i * 3 + 1] = 40 + rand() * 120;
    starPos[i * 3 + 2] = (rand() - 0.5) * 300;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: C.starlight, size: 0.6, sizeAttenuation: true }));
  stars.userData.excludeFromMap = true; // would speckle the radar image
  group.add(stars);

  // Night lighting — bright enough to read the landmarks against the bay
  const hemi = new THREE.HemisphereLight(0x4a63b0, 0x141a30, 0.24);
  group.add(hemi);
  group.add(new THREE.AmbientLight(0x7080c0, 0.16));
  const moon = new THREE.DirectionalLight(0xcfe0ff, 0.6);
  moon.position.set(30, 70, -30);
  group.add(moon, moon.target);

  // Bins along the promenade edges.
  const binSpots = [];
  for (let i = 0; i < 7; i++) {
    const z = -44 + i * 15;
    binSpots.push({ x: 5.6, z });
    binSpots.push({ x: -5.6, z: z + 7 });
  }

  return {
    group,
    name: '🌏 Singapore',
    sky: C.sky,
    fog: C.fog,
    fogNear: 50,
    fogFar: 190,
    dustColor: 0x4a5268, // wet boardwalk
    bounds,
    mapExtent: 90,
    mapViewRadius: 58,
    binSpots,
    depot: { x: -4, z: 56 },
    spawn: new THREE.Vector3(-4, 0, 60),
    heading: Math.PI,
    portals: [
      { id: 'hub', label: 'Back to Nature World', icon: '🌿', color: PALETTE.portal.exit, position: new THREE.Vector3(-4, 0, -60), heading: 0 },
    ],
    update(delta) {
      stars.rotation.y += delta * 0.002;
    },
    night: true,
  };
}
