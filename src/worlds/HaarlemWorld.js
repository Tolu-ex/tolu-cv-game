import * as THREE from 'three';
import { mesh, createCanalHouse, createWindmill, createBike, createLampPost, makeTextTexture } from '../utils/geoBuilders.js';
import { PALETTE } from '../utils/colors.js';
import { seededRandom } from '../utils/rng.js';

const C = PALETTE.haarlem;

function clockTexture() {
  return makeTextTexture((ctx, w, h) => {
    ctx.fillStyle = '#2b2320';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9dfc4';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2b2320'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2, h * 0.28); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w * 0.68, h / 2); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.sin(a) * (w / 2 - 20), h / 2 - Math.cos(a) * (w / 2 - 20));
      ctx.lineTo(w / 2 + Math.sin(a) * (w / 2 - 14), h / 2 - Math.cos(a) * (w / 2 - 14));
      ctx.stroke();
    }
  }, 256, 256);
}

function towerBuilding({ width = 6.5, depth = 6.5, height = 22, spireHeight = 12, color = C.brick } = {}) {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(width, height, depth), color);
  body.position.y = height / 2;
  g.add(body);
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(width * 0.28, 20), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.6 }));
  clockFace.position.set(0, height * 0.78, depth / 2 + 0.05);
  g.add(clockFace);
  const spire = mesh(new THREE.ConeGeometry(width * 0.62, spireHeight, 4), C.roofSlate);
  spire.rotation.y = Math.PI / 4;
  spire.position.y = height + spireHeight / 2;
  g.add(spire);
  const finial = mesh(new THREE.SphereGeometry(0.3, 8, 8), 0xd4af37);
  finial.position.y = height + spireHeight + 0.3;
  g.add(finial);
  return g;
}

function domeBuilding({ radius = 6, height = 10, color = 0x8c3a24 } = {}) {
  const g = new THREE.Group();
  const drum = mesh(new THREE.CylinderGeometry(radius, radius, height, 16), color);
  drum.position.y = height / 2;
  g.add(drum);
  const dome = mesh(new THREE.SphereGeometry(radius * 1.02, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x5a4a3a);
  dome.position.y = height;
  g.add(dome);
  const lantern = mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 8), 0xe9dfc4);
  lantern.position.y = height + radius + 0.7;
  g.add(lantern);
  // ring of small windows around the drum
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const win = mesh(new THREE.PlaneGeometry(0.6, 1.4), 0x1c2b33, { emissive: 0xfff2c9, emissiveIntensity: 0.2 });
    win.position.set(Math.sin(a) * (radius + 0.02), height * 0.55, Math.cos(a) * (radius + 0.02));
    win.rotation.y = a;
    g.add(win);
  }
  return g;
}

export function buildHaarlemWorld() {
  const group = new THREE.Group();
  const rand = seededRandom(7);
  const bounds = 66;

  // Cobblestone plaza ground
  const ground = mesh(new THREE.PlaneGeometry(160, 190), C.cobble);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // Canal running north-south
  const canal = mesh(new THREE.PlaneGeometry(11, 150), C.canal, { emissive: C.canal, emissiveIntensity: 0.08 });
  canal.rotation.x = -Math.PI / 2;
  canal.position.y = 0.02;
  group.add(canal);
  const canalEdgeMat = 0xb9b2a0;
  for (const side of [-1, 1]) {
    const edge = mesh(new THREE.BoxGeometry(0.4, 0.3, 150), canalEdgeMat);
    edge.position.set(side * 5.7, 0.15, 0);
    group.add(edge);

    // Cobbled street between the canal edge and the house fronts
    const street = mesh(new THREE.PlaneGeometry(6.6, 150), 0x7e848c);
    street.rotation.x = -Math.PI / 2;
    street.position.set(side * 9.2, 0.025, 0);
    group.add(street);

    // Sidewalk strip in front of the houses
    const walk = mesh(new THREE.PlaneGeometry(1.2, 150), 0xa8a49a);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(side * 13.1, 0.03, 0);
    group.add(walk);
  }

  // Bridges crossing the canal
  for (const z of [-22, 24]) {
    const deck = mesh(new THREE.BoxGeometry(14, 0.4, 6), 0x8a6a45);
    deck.position.set(0, 0.35, z);
    group.add(deck);
    for (const side of [-1, 1]) {
      const rail = mesh(new THREE.BoxGeometry(14, 0.5, 0.12), 0x4a3826);
      rail.position.set(0, 0.75, z + side * 2.9);
      group.add(rail);
    }
    const arch = mesh(new THREE.TorusGeometry(5.2, 0.35, 6, 16, Math.PI), 0x8a6a45);
    arch.rotation.x = Math.PI / 2;
    arch.rotation.z = Math.PI;
    arch.position.set(0, -0.4, z);
    group.add(arch);
  }

  // Rows of canal houses on both banks
  const houseColors = [C.brick, C.brickAlt, C.cream, C.blue];
  const awningColors = [0x8c3a24, 0x2b5a3a, 0x2f4a6b, 0xc4442e, 0x6b4a2f];
  for (const side of [-1, 1]) {
    let z = -58;
    while (z < 58) {
      if (Math.abs(z - (-22)) < 5 || Math.abs(z - 24) < 5) { z += 6; continue; } // skip bridge gaps
      const width = 3.2 + rand() * 0.8;
      const house = createCanalHouse({
        width,
        depth: 3.4 + rand() * 0.6,
        floors: 2 + Math.floor(rand() * 2),
        color: houseColors[Math.floor(rand() * houseColors.length)],
        awningColor: awningColors[Math.floor(rand() * awningColors.length)],
        steps: 2 + Math.floor(rand() * 3),
      });
      house.position.set(side * (13 + width / 2 + rand() * 0.5), 0, z);
      house.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
      group.add(house);
      z += width + 1.4 + rand() * 0.6;
    }
  }

  // De Adriaan windmill — south end, beyond the house row
  const windmill = createWindmill({ height: 8.5, bodyColor: C.windmillBody, capColor: C.windmillCap, bladeSpan: 6 });
  windmill.position.set(-24, 0, -58);
  group.add(windmill);

  // Grote Kerk tower — north plaza
  const kerk = towerBuilding({ width: 7, depth: 7, height: 24, spireHeight: 13, color: C.brick });
  kerk.position.set(24, 0, 50);
  group.add(kerk);

  // De Koepel dome — near the kerk
  const koepel = domeBuilding({ radius: 6.5, height: 9, color: C.brickAlt });
  koepel.position.set(-24, 0, 50);
  group.add(koepel);

  // Street lamps + parked bikes along the sidewalks (in the drivable lane
  // between the canal and the house fronts)
  for (let i = -5; i <= 5; i++) {
    const z = i * 10;
    for (const side of [-1, 1]) {
      const lamp = createLampPost({ height: 3.8 });
      lamp.position.set(side * 6.4, 0, z + 3); // on the canal-side kerb
      group.add(lamp);
      if (rand() > 0.4) {
        const cluster = new THREE.Group();
        const n = 1 + Math.floor(rand() * 3);
        for (let b = 0; b < n; b++) {
          const bike = createBike({ color: [0x2b2d30, 0x8c3a24, 0x3d5a73][Math.floor(rand() * 3)] });
          bike.position.set(b * 0.42, 0, 0);
          bike.rotation.y = Math.PI / 2;
          cluster.add(bike);
        }
        cluster.position.set(side * 12.9, 0, z); // parked on the sidewalk
        group.add(cluster);
      }
    }
  }

  // Lighting — soft, slightly overcast Dutch daylight
  group.add(new THREE.AmbientLight(0xffffff, 0.22));
  const hemi = new THREE.HemisphereLight(0xd9e6ee, 0x8a8f78, 0.28);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2df, 0.85);
  sun.position.set(-40, 60, 30);
  group.add(sun, sun.target);

  // Bins set out along the house fronts on both banks, clear of the canal
  // (x = +-5.7) and the parked bikes.
  const binSpots = [];
  for (let i = 0; i < 7; i++) {
    const z = -44 + i * 15;
    binSpots.push({ x: 11.9, z, heading: -Math.PI / 2 });
    binSpots.push({ x: -11.9, z: z + 7, heading: Math.PI / 2 });
  }

  return {
    group,
    name: '🇳🇱 Haarlem',
    sky: C.sky,
    fog: C.fog,
    fogNear: 55,
    fogFar: 180,
    dustColor: 0x9aa0a6, // grey cobble grit
    bounds,
    mapExtent: 80,
    mapViewRadius: 52,
    binSpots,
    depot: { x: 2, z: 56 },
    spawn: new THREE.Vector3(9, 0, 60),
    heading: Math.PI,
    portals: [
      { id: 'hub', label: 'Back to Nature World', icon: '🌿', color: PALETTE.portal.exit, position: new THREE.Vector3(9, 0, -60), heading: 0 },
    ],
    update(delta) {
      if (windmill.userData.blades) windmill.userData.blades.rotation.z += delta * 0.5;
    },
    night: false,
  };
}
