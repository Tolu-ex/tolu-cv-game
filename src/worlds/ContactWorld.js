import * as THREE from 'three';
import { mesh, createWindmill, makeTextTexture } from '../utils/geoBuilders.js';
import { PALETTE } from '../utils/colors.js';

const C = PALETTE.contact;

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** Instanced tulip field — cheap enough to plant thousands of flowers. */
function createTulipField({ bands = 6, rowsPerBand = 6, perRow = 26, spacing = 1.1, startZ = -60, bandWidth = 6 } = {}) {
  const group = new THREE.Group();
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.026, 0.35, 4);
  const bulbGeo = new THREE.SphereGeometry(0.09, 6, 6);
  const stemMat = new THREE.MeshStandardMaterial({ color: C.field, roughness: 0.9, flatShading: true });
  const dummy = new THREE.Object3D();
  const rand = seededRandom(101);

  for (let band = 0; band < bands; band++) {
    const color = C.tulipColors[band % C.tulipColors.length];
    const bulbMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true });
    const count = rowsPerBand * perRow;
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, count);
    stems.castShadow = false; stems.receiveShadow = false;
    bulbs.castShadow = true; bulbs.receiveShadow = false;

    let i = 0;
    for (let r = 0; r < rowsPerBand; r++) {
      for (let c = 0; c < perRow; c++) {
        const x = -((perRow - 1) * spacing) / 2 + c * spacing + (rand() - 0.5) * 0.25;
        const z = startZ + band * bandWidth + r * (bandWidth / rowsPerBand) + (rand() - 0.5) * 0.3;

        dummy.position.set(x, 0.175, z);
        dummy.rotation.y = rand() * Math.PI;
        dummy.updateMatrix();
        stems.setMatrixAt(i, dummy.matrix);

        dummy.position.set(x, 0.4, z);
        dummy.scale.set(1, 1.3, 1);
        dummy.updateMatrix();
        bulbs.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(1, 1, 1);

        i++;
      }
    }
    stems.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    group.add(stems, bulbs);
  }
  return group;
}

function businessCard() {
  return makeTextTexture((ctx, w, h) => {
    ctx.fillStyle = '#0d1f12';
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, 24); ctx.fill();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(6, 6, w - 12, h - 12, 20); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 46px Rubik, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Toluwalase Awobusuyi', w / 2, h * 0.38);
    ctx.font = '600 30px Rubik, Arial, sans-serif';
    ctx.fillStyle = '#c9ff8a';
    ctx.fillText('Software Engineer', w / 2, h * 0.56);
    ctx.font = '400 26px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8ad0ff';
    ctx.fillText('Awobusuyitolu@gmail.com', w / 2, h * 0.76);
  }, 700, 380);
}

export function buildContactWorld() {
  const group = new THREE.Group();
  const rand = seededRandom(77);
  const bounds = 62;

  const ground = mesh(new THREE.PlaneGeometry(150, 180), 0x2f6f2f, { roughness: 1 });
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Central path through the fields
  const path = mesh(new THREE.PlaneGeometry(6, 170), 0xcabf98, { roughness: 1 });
  path.rotation.x = -Math.PI / 2;
  path.position.y = 0.012;
  group.add(path);

  // Tulip fields flanking the path — wide colour bands running the length of
  // the drive, plus an outer block on each side for depth.
  for (const side of [-1, 1]) {
    const inner = createTulipField({ bands: 10, rowsPerBand: 6, perRow: 26, spacing: 1.0, startZ: -56, bandWidth: 10 });
    inner.position.set(side * 17, 0, 0);
    group.add(inner);

    const outer = createTulipField({ bands: 8, rowsPerBand: 5, perRow: 22, spacing: 1.05, startZ: -50, bandWidth: 11 });
    outer.position.set(side * 44, 0, 4);
    group.add(outer);
  }

  // Grassy verges separating the flower blocks
  for (const side of [-1, 1]) {
    const verge = mesh(new THREE.PlaneGeometry(4, 170), 0x2a6a2a, { roughness: 1 });
    verge.rotation.x = -Math.PI / 2;
    verge.position.set(side * 31, 0.014, 0);
    group.add(verge);
  }

  // Windmill overlooking the fields
  const windmill = createWindmill({ height: 9, bodyColor: C.windmillBody, capColor: C.windmillCap, bladeSpan: 6.5 });
  windmill.position.set(-24, 0, -20);
  group.add(windmill);

  // Business-card billboard near the end of the field, facing the approach
  const cardTex = businessCard();
  const cardMat = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: cardTex, emissiveIntensity: 0.35 });
  const CARD_Z = -40;
  // Faces +Z, toward the player driving down the path from the spawn end.
  const card = new THREE.Mesh(new THREE.PlaneGeometry(11, 6), cardMat);
  card.position.set(0, 5.4, CARD_Z);
  group.add(card);
  const cardFrame = mesh(new THREE.BoxGeometry(11.4, 6.4, 0.2), 0x1c3a20, { roughness: 0.7 });
  cardFrame.position.set(0, 5.4, CARD_Z - 0.14);
  group.add(cardFrame);
  for (const side of [-1, 1]) {
    const post = mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.4, 6), 0x4a3826, { roughness: 0.9 });
    post.position.set(side * 4.6, 2.7, CARD_Z - 0.14);
    group.add(post);
  }
  const cardLight = new THREE.PointLight(0xfff2c9, 40, 22, 2);
  cardLight.position.set(0, 7, CARD_Z + 5);
  group.add(cardLight);

  // A handful of low bushes for framing
  for (let i = 0; i < 8; i++) {
    const bush = mesh(new THREE.IcosahedronGeometry(0.8 + rand() * 0.4, 0), 0x3f8f3f, { roughness: 0.9 });
    bush.position.set((rand() - 0.5) * 40, 0.5, -55 - rand() * 5);
    group.add(bush);
  }

  // Warm golden-hour lighting
  const hemi = new THREE.HemisphereLight(0xffd9a0, C.field, 0.7);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb877, 1.4);
  sun.position.set(-50, 35, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -85; sun.shadow.camera.right = 85;
  sun.shadow.camera.top = 85; sun.shadow.camera.bottom = -85;
  sun.shadow.camera.far = 210;
  sun.shadow.bias = -0.0006;
  group.add(sun, sun.target);

  return {
    group,
    name: '🌷 Contact',
    sky: C.sky,
    fog: C.fog,
    fogNear: 55,
    fogFar: 175,
    dustColor: 0xcabf98, // sandy field track
    bounds,
    mapExtent: 80,
    mapViewRadius: 55,
    spawn: new THREE.Vector3(0, 0, 55),
    heading: Math.PI,
    portals: [
      { id: 'hub', label: 'Back to Nature World', icon: '🌿', color: PALETTE.portal.exit, position: new THREE.Vector3(0, 0, -55), heading: 0 },
    ],
    update(delta) {
      if (windmill.userData.blades) windmill.userData.blades.rotation.z += delta * 0.45;
    },
    night: false,
  };
}
