import * as THREE from 'three';
import { mesh, createPalmTree, createCanopyTree, createBush, makeTextTexture } from '../utils/geoBuilders.js';
import { PALETTE } from '../utils/colors.js';
import { seededRandom } from '../utils/rng.js';

const C = PALETTE.ileife;

/**
 * Obafemi Awolowo University, Ile-Ife.
 *
 * The first version of this world was a dirt road across bare red laterite,
 * sixty scattered palm trees, loose rocks, and a round drum under a cone roof
 * that a comment described as "the iconic wide conical OAU-style roof". None of
 * that is the place. Every other world in this game got its actual landmarks —
 * Haarlem its canal houses and windmill, Singapore its supertrees — and this
 * one got a generic idea of a continent instead of the specific thing that is
 * really there.
 *
 * OAU is one of the most architecturally significant modernist campuses in
 * Africa, laid out by Arieh Sharon from the early 1960s. Its language is
 * tropical modernism, and that is what is built here:
 *
 *   - long, low-rise concrete teaching slabs, raised on pilotis so air moves
 *     underneath them, with shaded undercrofts at ground level
 *   - deep egg-crate brise-soleil screens across the sunward facades, which are
 *     the campus's single most recognisable feature: the buildings are designed
 *     around shade rather than glass
 *   - covered walkways linking the blocks, so you can cross the campus in the
 *     rain or the sun without going through either
 *   - Oduduwa Hall, the assembly hall, as the landmark: a wide auditorium under
 *     a dramatic upswept folded roof, approached across a broad paved forecourt
 *   - wide paved boulevards and a planted roundabout, not a dirt track
 *   - heavily landscaped grounds: lawns and mature broad-canopy shade trees,
 *     with palms as an accent rather than the whole planting scheme
 *
 * The forms are stylised to match the game's flat-vector look, and the massing
 * is an impression rather than a survey — but it is an impression of THIS
 * campus, which the previous version was not.
 */

function signTexture() {
  return makeTextTexture((ctx, w, h) => {
    ctx.fillStyle = '#f2efe6';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#9c2b25';
    ctx.fillRect(0, 0, w, 14);
    ctx.fillStyle = '#1d2b1f';
    ctx.font = '900 52px Rubik, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('OBAFEMI AWOLOWO', w / 2, h * 0.36);
    ctx.fillText('UNIVERSITY', w / 2, h * 0.58);
    ctx.font = '600 24px Rubik, Arial, sans-serif';
    ctx.fillStyle = '#5a6b5e';
    ctx.fillText('ILE-IFE  ·  NIGERIA', w / 2, h * 0.82);
  }, 700, 300);
}

/**
 * An egg-crate sun screen: horizontal shelves crossed by vertical fins, standing
 * clear of the wall behind it. This is the detail that makes the campus read as
 * itself — the facades are shade structures, not curtain walls.
 */
function briseSoleil(width, height, cols, rows) {
  const g = new THREE.Group();
  const fin = 0.09, depth = 0.55;

  for (let r = 0; r <= rows; r++) {
    const shelf = mesh(new THREE.BoxGeometry(width, fin, depth), C.concrete);
    shelf.position.set(0, (r / rows - 0.5) * height, 0);
    g.add(shelf);
  }
  for (let c = 0; c <= cols; c++) {
    const rib = mesh(new THREE.BoxGeometry(fin, height, depth), C.concrete);
    rib.position.set((c / cols - 0.5) * width, 0, 0);
    g.add(rib);
  }
  // The wall sits behind, in shadow: that recess is what gives the screen depth.
  const back = mesh(new THREE.BoxGeometry(width, height, 0.12), C.concreteShade);
  back.position.z = -depth / 2 - 0.06;
  g.add(back);
  return g;
}

/**
 * A teaching block: a long slab lifted on pilotis, its sunward face covered by
 * a brise-soleil screen, with a deep roof slab oversailing the top.
 */
function teachingSlab({ length = 26, floors = 3, facing = 1 } = {}) {
  const g = new THREE.Group();
  const floorH = 3.2;
  const height = floors * floorH;
  const depth = 9;
  const legH = 2.8;                       // the shaded undercroft beneath

  const body = mesh(new THREE.BoxGeometry(length, height, depth), C.concrete);
  body.position.y = legH + height / 2;
  g.add(body);

  // Pilotis: the block stands on columns, open underneath.
  const cols = Math.max(4, Math.round(length / 4.5));
  for (let i = 0; i <= cols; i++) {
    for (const dz of [-depth / 2 + 0.8, depth / 2 - 0.8]) {
      const col = mesh(new THREE.BoxGeometry(0.55, legH, 0.55), C.concreteShade);
      col.position.set((i / cols - 0.5) * (length - 1.2), legH / 2, dz);
      g.add(col);
    }
  }

  // Sun screen across the long sunward facade, one storey band per floor.
  for (let f = 0; f < floors; f++) {
    const screen = briseSoleil(length - 1.4, floorH - 0.5, Math.round(length / 2.1), 2);
    screen.position.set(0, legH + f * floorH + floorH / 2, facing * (depth / 2 + 0.3));
    if (facing < 0) screen.rotation.y = Math.PI;
    g.add(screen);
  }

  // Roof slab, oversailing to throw the top floor into shade.
  const roof = mesh(new THREE.BoxGeometry(length + 1.6, 0.45, depth + 2.2), C.concrete);
  roof.position.y = legH + height + 0.2;
  g.add(roof);

  // Stair tower at one end — a solid element against the long horizontal.
  const tower = mesh(new THREE.BoxGeometry(4.2, height + legH + 1.6, depth * 0.62), C.concreteShade);
  tower.position.set(length / 2 + 1.6, (height + legH + 1.6) / 2, 0);
  g.add(tower);

  return g;
}

/**
 * Oduduwa Hall: the campus assembly hall and its landmark.
 *
 * A wide auditorium under a folded roof that sweeps upward towards the
 * entrance, set behind a broad flight of steps and a paved forecourt. The old
 * version of this world put a cone on a drum here, which is a village motif and
 * is not remotely what this building is.
 */
function assemblyHall() {
  const g = new THREE.Group();
  const w = 30, d = 22;

  // Auditorium mass, splayed: wider at the stage end than at the entrance.
  const shell = new THREE.Shape();
  shell.moveTo(-w / 2, -d / 2);
  shell.lineTo(w / 2, -d / 2);
  shell.lineTo(w / 2 - 3.5, d / 2);
  shell.lineTo(-w / 2 + 3.5, d / 2);
  shell.closePath();
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shell, { depth: 9, bevelEnabled: false }),
    mesh(new THREE.BoxGeometry(1, 1, 1), C.concrete).material,
  );
  body.rotation.x = -Math.PI / 2;
  body.position.y = 9;
  g.add(body);

  // The folded roof: angled planes rising towards the entrance, which is the
  // building's defining gesture.
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const plate = mesh(new THREE.BoxGeometry(w / 6 + 0.3, 0.6, d + 5), C.concrete);
    plate.position.set((t - 0.5) * w, 9.4 + Math.sin(t * Math.PI) * 3.2, 1.5);
    plate.rotation.x = -0.16 + Math.sin(t * Math.PI) * 0.06;
    plate.rotation.z = (t - 0.5) * 0.10;
    g.add(plate);
  }

  // Glazed entrance wall under the lifted roof edge, behind a colonnade.
  const glass = mesh(new THREE.BoxGeometry(w - 8, 7.5, 0.3), 0x93b8c9, { transparent: true, opacity: 0.55 });
  glass.position.set(0, 4.6, d / 2 - 1.2);
  g.add(glass);
  for (let i = 0; i < 9; i++) {
    const col = mesh(new THREE.BoxGeometry(0.7, 9.2, 0.7), C.concrete);
    col.position.set((i / 8 - 0.5) * (w - 6), 4.6, d / 2 + 1.4);
    g.add(col);
  }

  // Forecourt steps, the full width of the entrance.
  for (let s = 0; s < 4; s++) {
    const step = mesh(new THREE.BoxGeometry(w - 2 + s * 1.6, 0.35, 1.5), C.paving);
    step.position.set(0, 0.9 - s * 0.28, d / 2 + 2.6 + s * 1.4);
    g.add(step);
  }
  return g;
}

/** Covered walkway: a flat canopy on slim columns, linking the blocks. */
function coveredWalk(length, along = 'z') {
  const g = new THREE.Group();
  const canopy = mesh(
    along === 'z' ? new THREE.BoxGeometry(3.4, 0.28, length) : new THREE.BoxGeometry(length, 0.28, 3.4),
    C.concrete,
  );
  canopy.position.y = 3.3;
  g.add(canopy);
  const n = Math.max(2, Math.round(length / 5));
  for (let i = 0; i <= n; i++) {
    const t = (i / n - 0.5) * length;
    for (const side of [-1.4, 1.4]) {
      const col = mesh(new THREE.BoxGeometry(0.28, 3.3, 0.28), C.concreteShade);
      if (along === 'z') col.position.set(side, 1.65, t);
      else col.position.set(t, 1.65, side);
      g.add(col);
    }
  }
  return g;
}

export function buildIleIfeWorld() {
  const group = new THREE.Group();
  const rand = seededRandom(19);
  const bounds = 66;

  // Landscaped grounds, not bare earth.
  const ground = mesh(new THREE.PlaneGeometry(180, 200), C.lawn);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  for (let i = 0; i < 22; i++) {
    const patch = mesh(new THREE.CircleGeometry(5 + rand() * 7, 12), C.lawnDark, { transparent: true, opacity: 0.4 });
    patch.rotation.x = -Math.PI / 2;
    patch.position.set((rand() - 0.5) * 150, 0.01, (rand() - 0.5) * 180);
    group.add(patch);
  }

  // A paved boulevard, with a kerbed verge either side.
  const road = mesh(new THREE.PlaneGeometry(11, 190), C.road);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  group.add(road);
  for (const side of [-1, 1]) {
    const kerb = mesh(new THREE.BoxGeometry(0.5, 0.22, 190), C.paving);
    kerb.position.set(side * 5.7, 0.11, 0);
    group.add(kerb);
    const walk = mesh(new THREE.PlaneGeometry(3.2, 190), C.paving);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(side * 7.6, 0.03, 0);
    group.add(walk);
  }
  // Centre line, dashed.
  for (let i = 0; i < 38; i++) {
    const dash = mesh(new THREE.PlaneGeometry(0.28, 2.6), 0xdcd8c8);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.03, -92 + i * 5);
    group.add(dash);
  }

  // Planted roundabout, which the campus road network is built around.
  const island = mesh(new THREE.CylinderGeometry(7.5, 7.8, 0.35, 24), C.lawnDark);
  island.position.set(0, 0.17, -34);
  group.add(island);
  const islandKerb = mesh(new THREE.TorusGeometry(7.7, 0.22, 6, 24), C.paving);
  islandKerb.rotation.x = -Math.PI / 2;
  islandKerb.position.set(0, 0.34, -34);
  group.add(islandKerb);
  const ring = mesh(new THREE.RingGeometry(7.9, 13.5, 28), C.road);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.021, -34);
  group.add(ring);
  for (let i = 0; i < 4; i++) {
    const palm = createPalmTree({ height: 6 + rand() * 1.5 });
    palm.position.set(Math.sin(i * 1.57) * 3.4, 0.3, -34 + Math.cos(i * 1.57) * 3.4);
    group.add(palm);
  }

  // Entrance sign, set back on the verge.
  const signPost = new THREE.Group();
  const tex = signTexture();
  const signMat = new THREE.MeshStandardMaterial({
    map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.8,
  });
  const signPlane = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4.3), signMat);
  signPlane.position.set(0, 4.0, 0);
  signPost.add(signPlane);
  const signWall = mesh(new THREE.BoxGeometry(8.4, 1.4, 0.8), C.concrete);
  signWall.position.set(0, 0.7, -0.3);
  signPost.add(signWall);
  for (const side of [-1, 1]) {
    const pier = mesh(new THREE.BoxGeometry(0.7, 5.6, 0.7), C.concrete);
    pier.position.set(side * 3.5, 2.8, -0.2);
    signPost.add(pier);
  }
  signPost.position.set(13.5, 0, 52);
  signPost.rotation.y = -0.42;
  group.add(signPost);

  // Oduduwa Hall, set back across its forecourt on the west side.
  const hall = assemblyHall();
  hall.position.set(-30, 0, -2);
  hall.rotation.y = Math.PI / 2;
  group.add(hall);
  const forecourt = mesh(new THREE.PlaneGeometry(26, 34), C.paving);
  forecourt.rotation.x = -Math.PI / 2;
  forecourt.position.set(-14, 0.025, -2);
  group.add(forecourt);

  // Teaching slabs down the east side, parallel to the boulevard, with a
  // covered walk running the length of them.
  const slabSpots = [[27, 20], [27, -6], [27, -32]];
  for (const [sx, sz] of slabSpots) {
    const slab = teachingSlab({ length: 26, floors: 3, facing: -1 });
    slab.position.set(sx, 0, sz);
    slab.rotation.y = Math.PI / 2;
    group.add(slab);
  }
  const walk = coveredWalk(78, 'z');
  walk.position.set(15.5, 0, -6);
  group.add(walk);
  const crossWalk = coveredWalk(16, 'x');
  crossWalk.position.set(21, 0, 20);
  group.add(crossWalk);

  // A taller administrative block closing the north end of the axis.
  const senate = teachingSlab({ length: 18, floors: 5, facing: 1 });
  senate.position.set(-16, 0, -56);
  group.add(senate);

  // Planting: mature broad-canopy shade trees are the dominant species here,
  // with palms as punctuation along the road rather than scattered everywhere.
  let placed = 0, attempts = 0;
  while (placed < 46 && attempts < 400) {
    attempts++;
    const x = (rand() - 0.5) * 160;
    const z = (rand() - 0.5) * 185;
    if (Math.abs(x) < 11) continue;                                   // road
    if (Math.hypot(x, z + 34) < 15) continue;                          // roundabout
    if (x < -12 && Math.abs(z + 2) < 24) continue;                     // hall + forecourt
    if (slabSpots.some(([sx, sz]) => Math.abs(x - sx) < 12 && Math.abs(z - sz) < 16)) continue;
    if (Math.hypot(x - 13.5, z - 52) < 8) continue;                    // sign
    if (Math.abs(x - 15.5) < 4 && Math.abs(z + 6) < 42) continue;      // covered walk
    const tree = createCanopyTree({ height: 7 + rand() * 3, radius: 2.8 + rand() * 1.4, leafColor: C.canopy });
    tree.position.set(x, 0, z);
    tree.rotation.y = rand() * Math.PI * 2;
    group.add(tree);
    placed++;
    if (rand() > 0.72) {
      const bush = createBush({ radius: 0.7 + rand() * 0.5, color: 0x4a8a3a });
      bush.position.set(x + (rand() - 0.5) * 3, 0, z + (rand() - 0.5) * 3);
      group.add(bush);
    }
  }
  // Palms lining the boulevard verge, evenly spaced as an avenue.
  for (let i = 0; i < 14; i++) {
    for (const side of [-1, 1]) {
      const palm = createPalmTree({ height: 6.5 + rand() * 1.2 });
      palm.position.set(side * 10.2, 0, -84 + i * 12.5);
      group.add(palm);
    }
  }

  group.add(new THREE.AmbientLight(0xfff2e0, 0.22));
  const hemi = new THREE.HemisphereLight(0xffe3b0, C.lawnDark, 0.28);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdca0, 0.88);
  sun.position.set(50, 55, -20);
  group.add(sun, sun.target);

  // Bins along the boulevard's paved shoulders.
  const binSpots = [];
  for (let i = 0; i < 7; i++) {
    const z = -42 + i * 15;
    binSpots.push({ x: 7.4, z });
    binSpots.push({ x: -7.4, z: z + 7 });
  }

  return {
    group,
    name: '🇳🇬 Ile-Ife',
    sky: C.sky,
    fog: C.fog,
    fogNear: 65,
    fogFar: 200,
    dustColor: 0xb8b2a0, // paved roads, not laterite
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
