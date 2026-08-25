import * as THREE from 'three';
import { mesh, createPalmTree, createBush, makeTextTexture } from '../utils/geoBuilders.js';
import { PALETTE } from '../utils/colors.js';
import { seededRandom } from '../utils/rng.js';

const C = PALETTE.ileife;

function signTexture() {
  return makeTextTexture((ctx, w, h) => {
    ctx.fillStyle = '#0f3d1f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#e8ddb5'; ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#e8ddb5';
    ctx.font = '900 54px Rubik, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('OAU', w / 2, h * 0.38);
    ctx.font = '600 24px Rubik, Arial, sans-serif';
    ctx.fillText('Obafemi Awolowo University', w / 2, h * 0.62);
    ctx.font = '400 18px Rubik, Arial, sans-serif';
    ctx.fillText('Ile-Ife, Nigeria', w / 2, h * 0.8);
  }, 512, 300);
}

/** A stylized rotunda hall with the iconic wide conical OAU-style roof. */
function conicalHall({ radius = 9, height = 7, roofHeight = 6, color = C.building } = {}) {
  const g = new THREE.Group();
  const drum = mesh(new THREE.CylinderGeometry(radius, radius * 1.05, height, 20), color, { roughness: 0.85 });
  drum.position.y = height / 2;
  g.add(drum);
  // ring of columns
  const colCount = 16;
  for (let i = 0; i < colCount; i++) {
    const a = (i / colCount) * Math.PI * 2;
    const col = mesh(new THREE.CylinderGeometry(0.25, 0.28, height, 6), 0xf2ead0, { roughness: 0.8 });
    col.position.set(Math.sin(a) * (radius + 0.5), height / 2, Math.cos(a) * (radius + 0.5));
    g.add(col);
  }
  const roof = mesh(new THREE.ConeGeometry(radius * 1.35, roofHeight, 20), C.buildingAccent, { roughness: 0.7 });
  roof.position.y = height + roofHeight / 2 - 0.3;
  g.add(roof);
  const roofTip = mesh(new THREE.SphereGeometry(0.35, 8, 8), 0xe8ddb5, { roughness: 0.4, metalness: 0.3 });
  roofTip.position.y = height + roofHeight - 0.3;
  g.add(roofTip);
  // entrance steps
  const steps = mesh(new THREE.CylinderGeometry(radius + 1.4, radius + 2.2, 0.5, 20), 0xd8c9a0, { roughness: 0.9 });
  steps.position.y = 0.25;
  g.add(steps);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function laneriteRock({ scale = 1 } = {}) {
  const g = mesh(new THREE.DodecahedronGeometry(scale, 0), 0x9a5a35, { roughness: 1 });
  g.position.y = scale * 0.4;
  return g;
}

export function buildIleIfeWorld() {
  const group = new THREE.Group();
  const rand = seededRandom(19);
  const bounds = 66;

  const ground = mesh(new THREE.PlaneGeometry(160, 190), C.earth, { roughness: 1 });
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Darker earth patches for texture
  for (let i = 0; i < 26; i++) {
    const patch = mesh(new THREE.CircleGeometry(4 + rand() * 6, 10), C.earthDark, { roughness: 1, transparent: true, opacity: 0.5 });
    patch.rotation.x = -Math.PI / 2;
    patch.position.set((rand() - 0.5) * 140, 0.01, (rand() - 0.5) * 170);
    group.add(patch);
  }

  // Dirt road down the middle
  const road = mesh(new THREE.PlaneGeometry(9, 170), 0xc06a3a, { roughness: 1 });
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.015;
  group.add(road);

  // OAU entrance sign — set back from the road so it never blocks the lane,
  // angled toward the approaching driver and self-lit so it always reads.
  const signPost = new THREE.Group();
  const oauTex = signTexture();
  const signMat = new THREE.MeshStandardMaterial({
    map: oauTex, emissive: 0xffffff, emissiveMap: oauTex, emissiveIntensity: 0.55, roughness: 0.7,
  });
  const signPlane = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.75), signMat);
  signPlane.position.set(0, 4.2, 0);
  signPost.add(signPlane);
  for (const side of [-1, 1]) {
    const post = mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.2, 6), 0x5a3a20, { roughness: 0.9 });
    post.position.set(side * 2.7, 2.1, 0);
    signPost.add(post);
  }
  signPost.position.set(13, 0, 48);
  signPost.rotation.y = -0.45;
  group.add(signPost);

  // The OAU conical hall — the campus landmark, set beside the road so you
  // drive past it rather than into it.
  const HALL_X = -22;
  const hall = conicalHall({ radius: 9, height: 7, roofHeight: 6.5 });
  hall.position.set(HALL_X, 0, 0);
  group.add(hall);

  // Academic blocks along the opposite side of the road
  const blockSpots = [[22, -12], [28, 14], [24, -34]];
  for (const [bx, bz] of blockSpots) {
    const block = mesh(new THREE.BoxGeometry(10, 6, 8), C.building, { roughness: 0.85 });
    block.position.set(bx, 3, bz);
    group.add(block);
    const roof = mesh(new THREE.BoxGeometry(10.6, 0.5, 8.6), C.buildingAccent, { roughness: 0.7 });
    roof.position.set(bx, 6.25, bz);
    group.add(roof);
    for (let f = 0; f < 2; f++) {
      for (let w = -1; w <= 1; w++) {
        const win = mesh(new THREE.PlaneGeometry(1.2, 1.4), 0x1c2b33, { emissive: 0xfff2c9, emissiveIntensity: 0.2, roughness: 0.3, castShadow: false, receiveShadow: false });
        win.position.set(bx + w * 3, 1.6 + f * 2.4, bz - 4.02);
        group.add(win);
      }
    }
  }

  // Palm trees scattered generously
  let placed = 0, attempts = 0;
  while (placed < 60 && attempts < 400) {
    attempts++;
    const x = (rand() - 0.5) * 150;
    const z = (rand() - 0.5) * 175;
    if (Math.abs(x) < 10) continue;                          // keep the road clear
    if (Math.hypot(x - HALL_X, z) < 15) continue;            // clear of the hall
    if (blockSpots.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 10)) continue;
    if (Math.hypot(x - 13, z - 48) < 7) continue;            // clear of the OAU sign
    const palm = createPalmTree({ height: 5 + rand() * 3 });
    palm.position.set(x, 0, z);
    palm.rotation.y = rand() * Math.PI * 2;
    group.add(palm);
    placed++;
    if (rand() > 0.6) {
      const bush = createBush({ radius: 0.7 + rand() * 0.5, color: 0x4a8a3a });
      bush.position.set(x + (rand() - 0.5) * 2, 0, z + (rand() - 0.5) * 2);
      group.add(bush);
    }
  }
  for (let i = 0; i < 14; i++) {
    const rock = laneriteRock({ scale: 0.3 + rand() * 0.4 });
    rock.position.set((rand() - 0.5) * 140, 0, (rand() - 0.5) * 170);
    group.add(rock);
  }

  // Warm savanna lighting
  const hemi = new THREE.HemisphereLight(0xffe3b0, C.earthDark, 0.75);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdca0, 1.5);
  sun.position.set(50, 55, -20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006;
  group.add(sun, sun.target);

  // Bins along the dirt road's shoulders.
  const binSpots = [];
  for (let i = 0; i < 7; i++) {
    const z = -42 + i * 15;
    binSpots.push({ x: 6.4, z });
    binSpots.push({ x: -6.4, z: z + 7 });
  }

  return {
    group,
    name: '🌍 Ile-Ife',
    sky: C.sky,
    fog: C.fog,
    fogNear: 60,
    fogFar: 190,
    dustColor: 0xc4703c, // red laterite earth
    bounds,
    mapExtent: 85,
    mapViewRadius: 58,
    binSpots,
    depot: { x: 0, z: 56 },
    spawn: new THREE.Vector3(0, 0, 60),
    heading: Math.PI,
    portals: [
      { id: 'hub', label: 'Back to Nature World', icon: '🌿', color: PALETTE.portal.exit, position: new THREE.Vector3(0, 0, -60), heading: 0 },
    ],
    update() {},
    night: false,
  };
}
