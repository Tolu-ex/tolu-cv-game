import * as THREE from 'three';
import { Bin, BIN_KINDS } from '../entities/Bin.js';

/**
 * The collection round — the actual game.
 *
 * Loop: bins are scattered along the drivable routes. Drive so the truck's
 * kerb side passes a bin and the arm empties it. The hopper has a finite
 * capacity, so once it fills you must drive back to the depot to tip out
 * before collecting again.
 *
 * The capacity is what makes this a game rather than a collectathon: it forces
 * a route decision (push on to the far bins, or bank what you have?) instead of
 * just hoovering everything up in one pass.
 */

const PICKUP_RANGE = 4.2;     // how close the kerb side must pass a bin
const DEPOT_RANGE = 7.0;

export class RoundManager {
  constructor(scene) {
    this.scene = scene;
    this.bins = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    this.capacity = 6;
    this.load = 0;
    this.score = 0;
    this.collectedThisWorld = 0;
    this.totalThisWorld = 0;
    this.depot = null;
    this.depotMesh = null;
    this._elapsed = 0;
    this._cooldown = 0;
    this.onEvent = () => {};      // Game subscribes for HUD + truck reactions
  }

  /** Clears the previous world's bins and lays out a new round. */
  build(worldDesc, rand = Math.random) {
    this.clear();

    const spots = worldDesc.binSpots;
    if (!spots || !spots.length) {
      this.totalThisWorld = 0;
      return;
    }

    for (const spot of spots) {
      const k = BIN_KINDS[Math.floor(rand() * BIN_KINDS.length) % BIN_KINDS.length];
      const bin = new Bin({
        position: new THREE.Vector3(spot.x, 0, spot.z),
        heading: spot.heading ?? 0,
        colour: k.colour,
        lidColour: k.lidColour,
        kind: k.kind,
      });
      this.group.add(bin.group);
      this.bins.push(bin);
    }
    this.totalThisWorld = this.bins.length;
    this.collectedThisWorld = 0;
    this.load = 0;

    // Depot: where you tip out. Placed at the world's spawn so it is always
    // somewhere you have already been and can find again.
    this.depot = worldDesc.depot
      ? new THREE.Vector3(worldDesc.depot.x, 0, worldDesc.depot.z)
      : worldDesc.spawn.clone();
    this._buildDepotMarker();
  }

  _buildDepotMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4.2, 5.4, 32),
      new THREE.MeshStandardMaterial({
        color: 0x8fd400, emissive: 0x8fd400, emissiveIntensity: 0.9,
        transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);

    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 32),
      new THREE.MeshStandardMaterial({
        color: 0x2b5a1a, emissive: 0x4e8f1c, emissiveIntensity: 0.35,
        transparent: true, opacity: 0.35,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.04;
    g.add(pad);

    g.position.copy(this.depot);
    g.visible = false;   // only shown once you actually need it
    this.depotMesh = g;
    this.depotRing = ring;
    this.group.add(g);
  }

  clear() {
    for (const b of this.bins) {
      this.group.remove(b.group);
      b.dispose();
    }
    this.bins = [];
    if (this.depotMesh) {
      this.group.remove(this.depotMesh);
      this.depotMesh.traverse((o) => {
        if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
      });
      this.depotMesh = null;
    }
  }

  get isFull() { return this.load >= this.capacity; }
  get remaining() { return this.totalThisWorld - this.collectedThisWorld; }

  update(delta, truck) {
    this._elapsed += delta;
    this._cooldown = Math.max(0, this._cooldown - delta);

    // Where the arm actually reaches: out to the truck's kerb side (-X local),
    // slightly ahead of the mast.
    const cos = Math.cos(truck.heading);
    const sin = Math.sin(truck.heading);
    const armLocalX = -1.5, armLocalZ = 0.9;
    const armX = truck.position.x + armLocalX * cos + armLocalZ * sin;
    const armZ = truck.position.z - armLocalX * sin + armLocalZ * cos;
    const armPoint = { x: armX, z: armZ };

    let anyCollecting = false;

    for (const bin of this.bins) {
      bin.idleBob(this._elapsed);
      const result = bin.update(delta);
      if (bin.state === 'lifting' || bin.state === 'tipping') anyCollecting = true;

      if (result === 'emptied') {
        this.load += 1;
        this.score += 100;
        this.collectedThisWorld += 1;
        this.onEvent({
          type: 'collected',
          load: this.load, capacity: this.capacity,
          score: this.score,
          collected: this.collectedThisWorld, total: this.totalThisWorld,
          full: this.isFull,
        });
      }

      // Only start a new pickup when there is room and nothing else is mid-lift,
      // so the arm animation never overlaps itself.
      if (bin.state === 'idle' && !this.isFull && !anyCollecting && this._cooldown <= 0) {
        const d = bin.distanceTo(armPoint);
        const movingSlowEnough = Math.abs(truck.speed) < 11;
        if (d < PICKUP_RANGE && movingSlowEnough) {
          if (bin.startCollect()) {
            this._cooldown = 0.9;
            anyCollecting = true;
            this.onEvent({ type: 'pickupStarted' });
          }
        }
      }
    }

    // Depot only matters once you are carrying something.
    if (this.depotMesh) {
      const show = this.load > 0;
      this.depotMesh.visible = show;
      if (show) {
        const pulse = this.isFull ? 1.5 + Math.sin(this._elapsed * 5) * 0.7 : 0.7;
        this.depotRing.material.emissiveIntensity = pulse;
        const d = Math.hypot(truck.position.x - this.depot.x, truck.position.z - this.depot.z);
        if (d < DEPOT_RANGE && Math.abs(truck.speed) < 3) {
          const tipped = this.load;
          this.load = 0;
          this.score += tipped * 50;   // bonus for banking a full run
          this.onEvent({
            type: 'emptied', tipped, score: this.score,
            load: 0, capacity: this.capacity,
            collected: this.collectedThisWorld, total: this.totalThisWorld,
          });
        }
      }
    }

    return anyCollecting;
  }
}

export { PICKUP_RANGE };
