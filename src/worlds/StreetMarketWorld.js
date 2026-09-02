import * as THREE from 'three';
import { mesh, makeTextTexture } from '../utils/geoBuilders.js';
import { PALETTE } from '../utils/colors.js';
import { seededRandom } from '../utils/rng.js';

const C = PALETTE.market;

function neonTexture(text, color) {
  return makeTextTexture((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = '900 64px "Rubik", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = color; ctx.shadowBlur = 30;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2);
  }, 512, 160);
}

function neonSign({ text, color, width = 4.2, height = 1.3 } = {}) {
  const g = new THREE.Group();
  const tex = neonTexture(text, `#${color.toString(16).padStart(6, '0')}`);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: color, emissiveMap: tex, emissiveIntensity: 1.4, roughness: 0.4 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  g.add(plane);
  const backing = mesh(new THREE.BoxGeometry(width + 0.2, height + 0.2, 0.08), 0x0c0c10, { castShadow: false });
  backing.position.z = -0.06;
  g.add(backing);
  const light = new THREE.PointLight(color, 14, 12, 2);
  light.position.z = 0.6;
  g.add(light);
  return g;
}

function sneakerBox(color) {
  const g = new THREE.Group();
  const box = mesh(new THREE.BoxGeometry(0.42, 0.26, 0.3), 0xf2f0e8);
  g.add(box);
  const lid = mesh(new THREE.BoxGeometry(0.44, 0.05, 0.32), color, { emissive: color, emissiveIntensity: 0.15 });
  lid.position.y = 0.15;
  g.add(lid);
  return g;
}

function sneakerStall({ rand }) {
  const g = new THREE.Group();
  const stallBody = mesh(new THREE.BoxGeometry(3.4, 2, 1.6), C.stall);
  stallBody.position.y = 1;
  g.add(stallBody);
  const canopy = mesh(new THREE.BoxGeometry(3.8, 0.12, 2), 0x2e3242);
  canopy.position.y = 2.15;
  g.add(canopy);
  for (const side of [-1, 0, 1]) {
    const leg = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 5), 0x3d4256);
    leg.position.set(side * 1.7, 1.05, 0.95);
    g.add(leg);
  }
  // shelves of sneaker boxes
  for (let shelf = 0; shelf < 3; shelf++) {
    for (let i = 0; i < 5; i++) {
      const box = sneakerBox(C.sneakerColors[Math.floor(rand() * C.sneakerColors.length)]);
      box.position.set(-1.3 + i * 0.65, 0.4 + shelf * 0.55, -0.55);
      g.add(box);
    }
  }
  // hanging strip light under the canopy
  const strip = mesh(new THREE.BoxGeometry(3.4, 0.06, 0.06), 0xffe22f, { emissive: 0xffe22f, emissiveIntensity: 1.6 });
  strip.position.set(0, 2.02, 0.85);
  g.add(strip);
  const stripLight = new THREE.PointLight(0xffe9a0, 11, 9, 2);
  stripLight.position.set(0, 1.9, 0.85);
  g.add(stripLight);
  return g;
}

export function buildStreetMarketWorld() {
  const group = new THREE.Group();
  const rand = seededRandom(53);
  const bounds = 58;

  const ground = mesh(new THREE.PlaneGeometry(140, 170), C.asphalt);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // Puddly asphalt sheen strips
  for (let i = 0; i < 10; i++) {
    const strip = mesh(new THREE.PlaneGeometry(2 + rand() * 4, 20 + rand() * 20), 0x33384a, { transparent: true, opacity: 0.4 });
    strip.rotation.x = -Math.PI / 2;
    strip.position.set((rand() - 0.5) * 100, 0.005, (rand() - 0.5) * 140);
    group.add(strip);
  }

  // Central walking lane
  const lane = mesh(new THREE.PlaneGeometry(9, 150), 0x36384a);
  lane.rotation.x = -Math.PI / 2;
  lane.position.y = 0.01;
  group.add(lane);

  // Stalls lining both sides
  const neonTexts = [['KICKS', C.neonPink], ['FRESH', C.neonCyan], ['SNEAKS', C.neonYellow], ['ROVA', C.neonCyan], ['DROP', C.neonPink]];
  let idx = 0;
  for (const side of [-1, 1]) {
    let z = 55;
    while (z > -55) {
      const stall = sneakerStall({ rand });
      stall.position.set(side * 8, 0, z);
      stall.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
      group.add(stall);

      if (rand() > 0.35) {
        const [text, color] = neonTexts[idx % neonTexts.length]; idx++;
        const sign = neonSign({ text, color, width: 3.4, height: 1.1 });
        sign.position.set(side * 8, 3.2, z);
        sign.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
        group.add(sign);
      }
      z -= 8 + rand() * 3;
    }
  }

  // Big overhead neon marquee near spawn
  const marquee = neonSign({ text: 'STREET MARKET', color: C.neonPink, width: 9, height: 1.8 });
  marquee.position.set(0, 5.5, 48);
  marquee.rotation.y = Math.PI;
  group.add(marquee);

  // String lights across the lane
  for (let z = 45; z > -50; z -= 10) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-8, 3.4, z),
      new THREE.Vector3(0, 2.6, z + 1),
      new THREE.Vector3(8, 3.4, z),
    ]);
    const points = curve.getPoints(10);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x444444 }));
    group.add(line);
    for (let i = 1; i < points.length - 1; i += 2) {
      const bulbColor = [C.neonPink, C.neonCyan, C.neonYellow][i % 3];
      const bulb = mesh(new THREE.SphereGeometry(0.06, 6, 6), bulbColor, { emissive: bulbColor, emissiveIntensity: 1.6, castShadow: false });
      bulb.position.copy(points[i]);
      group.add(bulb);
    }
  }

  // A few crates / props scattered
  for (let i = 0; i < 12; i++) {
    const crate = mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), 0x3a2e20);
    crate.position.set((rand() - 0.5) * 10, 0.3, (rand() - 0.5) * 90);
    crate.rotation.y = rand() * Math.PI;
    group.add(crate);
  }

  // Night lighting — enough fill to read shapes, with the neon doing the mood
  const hemi = new THREE.HemisphereLight(0x7a88d0, 0x2a2e44, 0.24);
  group.add(hemi);
  group.add(new THREE.AmbientLight(0x8d95c8, 0.16));
  const moon = new THREE.DirectionalLight(0xaebaff, 0.6);
  moon.position.set(-30, 50, -20);
  group.add(moon, moon.target);

  // Bins between the stalls and the lane, where a real market's waste sits.
  const binSpots = [];
  for (let i = 0; i < 7; i++) {
    const z = -40 + i * 14;
    binSpots.push({ x: 5.6, z });
    binSpots.push({ x: -5.6, z: z + 7 });
  }

  return {
    group,
    name: '👟 Street Market',
    sky: C.sky,
    fog: C.fog,
    fogNear: 30,
    fogFar: 130,
    dustColor: 0x4a4f63, // damp night asphalt
    bounds,
    mapExtent: 75,
    mapViewRadius: 48,
    binSpots,
    depot: { x: 0, z: 48 },
    spawn: new THREE.Vector3(0, 0, 52),
    heading: Math.PI,
    portals: [
      { id: 'hub', label: 'Back to Nature World', icon: '🌿', color: PALETTE.portal.exit, position: new THREE.Vector3(0, 0, -52), heading: 0 },
    ],
    update() {},
    night: true,
  };
}
