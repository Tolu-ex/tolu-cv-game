import * as THREE from 'three';
import { InputController } from './InputController.js';
import { ChaseCamera } from './ChaseCamera.js';
import { FadeTransition } from './FadeTransition.js';
import { Truck } from '../entities/Truck.js';
import { loadTruckModel, buildRigFromModel, applyToonShading } from '../entities/truck/model.js';
import { buildBike } from '../entities/bike/model.js';
import { addOutlines, createContactShadow } from '../utils/outline.js';
import { TruckFX } from '../entities/TruckFX.js';
import { Portal } from '../entities/Portal.js';
import { HUD } from '../ui/HUD.js';
import { StoryCard } from '../ui/StoryCard.js';
import { MiniMap } from '../ui/MiniMap.js';
import { RoundManager } from './RoundManager.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { CV_DATA } from '../data/cvData.js';
import { disposeObject3D, seedDecor } from '../utils/geoBuilders.js';
import { seededRandom } from '../utils/rng.js';

import { buildHubWorld, HUB_PORTAL_DEFS } from '../worlds/HubWorld.js';
import { buildHaarlemWorld } from '../worlds/HaarlemWorld.js';
import { buildIleIfeWorld } from '../worlds/IleIfeWorld.js';
import { buildLagosWorld } from '../worlds/LagosWorld.js';
import { buildStreetMarketWorld } from '../worlds/StreetMarketWorld.js';
import { buildSingaporeWorld } from '../worlds/SingaporeWorld.js';
import { buildContactWorld } from '../worlds/ContactWorld.js';

const WORLD_REGISTRY = {
  hub: buildHubWorld,
  haarlem: buildHaarlemWorld,
  ileife: buildIleIfeWorld,
  lagos: buildLagosWorld,
  market: buildStreetMarketWorld,
  singapore: buildSingaporeWorld,
  contact: buildContactWorld,
};

// The truck's handling. Kept here beside the bike's so the two are readable
// against each other; the bike supplies its own in bike/model.js.
const TRUCK_PROFILE = {
  maxSpeed: 16, maxReverse: 6, accel: 9, brakeDecel: 18, friction: 5,
  maxSteer: 0.6, rollCoeff: 0.011, rollClamp: 0.09,
  pitchCoeff: 0.004, pitchClamp: 0.06, hasReverseBeeper: true, audio: 'truck',
  camera: { distance: 12, height: 5.2, lookHeight: 1.6, swing: 2.4 },
};

// Fixed per-world seed for decorative scatter.
const WORLD_SEEDS = {
  hub: 42, haarlem: 7, ileife: 19, lagos: 31, market: 53, singapore: 64, contact: 88,
};

const THEMED_WORLD_IDS = ['haarlem', 'ileife', 'lagos', 'market', 'singapore', 'contact'];

// How far in front of a hub portal the truck reappears after coming back.
// Kept comfortably above the chase camera's follow distance so the camera
// never ends up behind the portal it just came through.
const HUB_REENTRY_OFFSET = 22;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Flat-vector art direction: every realism feature is off on purpose.
    // Cast shadows put soft gradients under objects, and filmic tone mapping
    // rolls off exactly the pale, high-key colours the poster look depends on.
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600);

    this.clock = new THREE.Clock();
    this.input = new InputController(canvas);
    this.input.lock(); // locked until the player presses Start Engine
    this.chaseCam = new ChaseCamera(this.camera);
    this.fade = new FadeTransition(document.getElementById('fade-overlay'));
    this.hud = new HUD();
    this.storyCard = new StoryCard();
    this.miniMap = new MiniMap(
      this.renderer,
      document.getElementById('minimap'),
      document.getElementById('minimap-caption'),
    );

    this.truck = new Truck();
    this.scene.add(this.truck.group);
    // Hydraulic sound is driven by the mechanism's phase boundaries, so a ram
    // is heard when it actually starts moving rather than when the cycle was
    // requested.
    this.truck.onMechanismEvent = (event) => this._onMechanismEvent(event);

    // Exhaust + dust live in world space so puffs stay where they were emitted
    // instead of being dragged along with the truck.
    this.truckFX = new TruckFX();
    this.scene.add(this.truckFX.group);

    // The collection round: bins, hopper load, depot, score.
    this.round = new RoundManager(this.scene);
    this.round.onEvent = (e) => this._onRoundEvent(e);

    this.audio = new AudioEngine();

    this.currentWorldId = null;
    this.currentWorldGroup = null;
    this.currentWorldUpdate = null;
    this.currentBounds = 120;
    this.currentEntryHubId = null; // which hub portal the player used to leave the hub
    this.portals = [];
    this.visited = new Set();
    this.transitioning = false;
    this.running = false;

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.miniMap?.resize();
  }

  /** Builds the hub world synchronously — call once before showing the intro screen. */
  async preload() {
    this._onResize();

    // The truck is an authored GLB, so it has to arrive before the first
    // frame. Everything else in the game is procedural and needs no fetch.
    try {
      const scene = await loadTruckModel();
      this.truck.registerVehicle('truck', ({ group, body }) => {
        const rig = buildRigFromModel(scene, { bodyGroup: body, rootGroup: group });
        applyToonShading(scene);
        // Line work last, so the shells copy the final geometry set. Outlines
        // are what make the modelled ribs and shut lines read at all: flat
        // shading alone gives two adjacent panels the same colour.
        const ink = addOutlines(group, { thickness: 0.0026, color: 0x16240a });
        console.info(`[truck] outlined ${ink.added} parts (${ink.skipped} skipped)`);
        group.add(createContactShadow({ radiusX: 1.7, radiusZ: 4.8, opacity: 0.20 }));
        return { rig, profile: TRUCK_PROFILE };
      });
    } catch (err) {
      console.error('Truck model failed to load', err);
    }

    // The bicycle is procedural, so it costs nothing to build up front and sit
    // hidden until the tulip field asks for it.
    this.truck.registerVehicle('bike', ({ group }) => {
      const built = buildBike({ rootGroup: group });
      addOutlines(built.scene, { thickness: 0.0026, color: 0x1d2416, minSize: 0.03 });
      built.scene.add(createContactShadow({ radiusX: 0.45, radiusZ: 1.0, opacity: 0.18 }));
      return built;
    });
    this.truck.setVehicle('truck');

    this._loadWorldSync('hub');
    this.hud.setProgress(0, THEMED_WORLD_IDS.length);
  }

  start() {
    this.running = true;
    // Browsers refuse to open an AudioContext outside a user gesture, and the
    // Start Engine click is the only one guaranteed before play begins.
    this.audio.start();
    this.input.unlock();
    this.hud.show();
    this.clock.start();
    this._tick();
  }

  /** Dev/testing helper: jump straight to a world without driving there. */
  jumpTo(id) {
    return this._transitionTo(id, { fromPortal: id === 'hub' ? null : id, showStory: false });
  }

  _clearCurrentWorld() {
    if (this.currentWorldGroup) {
      this.scene.remove(this.currentWorldGroup);
      disposeObject3D(this.currentWorldGroup);
    }
    for (const p of this.portals) {
      this.scene.remove(p.group);
      disposeObject3D(p.group); // portal labels/icons are canvas-textured sprites
    }
    this.portals = [];
  }

  _loadWorldSync(id, { fromPortal = null } = {}) {
    const builder = WORLD_REGISTRY[id];
    // Decorative scatter is seeded from the world id, so leaving a world and
    // driving back in rebuilds exactly the same foliage and lit windows.
    seedDecor(WORLD_SEEDS[id] ?? 1);
    const desc = builder();

    this._clearCurrentWorld();
    this.scene.add(desc.group);
    this.currentWorldGroup = desc.group;
    this.currentWorldUpdate = desc.update || null;
    this.currentBounds = desc.bounds || 120;
    this.currentWorldId = id;

    this.scene.background = new THREE.Color(desc.sky);
    this.scene.fog = new THREE.Fog(desc.fog, desc.fogNear ?? 40, desc.fogFar ?? 200);

    // Some worlds are ridden rather than driven.
    this.truck.setVehicle(desc.vehicle || 'truck');
    this.truck.mechanism?.reset();   // never arrive with the arm stuck mid-cycle
    this.audio.setVehicle(this.truck.audioProfile);
    this.chaseCam.setFraming(this.truck.cameraFraming);
    this.truck.setHeadlights(!!desc.night);
    this.truckFX.setDustColor(desc.dustColor ?? 0xcfc4a8);

    // Spawn placement
    let spawnPos = desc.spawn.clone();
    let spawnHeading = desc.heading ?? 0;
    if (id === 'hub' && fromPortal) {
      const hubPortal = HUB_PORTAL_DEFS.find((p) => p.id === fromPortal);
      if (hubPortal) {
        const forward = new THREE.Vector3(Math.sin(hubPortal.heading), 0, Math.cos(hubPortal.heading));
        // Must exceed the chase camera's follow distance, or the camera lands
        // behind the portal and the screen fills with its glow.
        spawnPos = hubPortal.position.clone().addScaledVector(forward, HUB_REENTRY_OFFSET);
        spawnHeading = hubPortal.heading;
      }
    }
    this.truck.teleport(spawnPos, spawnHeading);
    this.chaseCam.snapTo(this.truck);

    // Build portal archways for this world
    for (const p of desc.portals) {
      const portal = new Portal({ id: p.id, label: p.label, icon: p.icon, color: p.color, position: p.position, heading: p.heading });
      this.scene.add(portal.group);
      this.portals.push(portal);
    }

    // Seeded from the world id so each bin keeps its waste stream — and so its
    // colour — every time the player drives back into this world.
    this.round.build(desc, seededRandom(WORLD_SEEDS[id] ?? 1));
    this.hud.setRound({
      score: this.round.score,
      load: this.round.load,
      capacity: this.round.capacity,
      collected: this.round.collectedThisWorld,
      total: this.round.totalThisWorld,
    });

    this.hud.setWorldName(desc.name || id);
    if (THEMED_WORLD_IDS.includes(id)) this.currentEntryHubId = id;

    // Photograph the finished world from above for the radar. Done once here
    // rather than per frame, and with the truck and portal arches hidden since
    // those are drawn as blips.
    this.miniMap.capture(this.scene, {
      extent: desc.mapExtent ?? Math.round(this.currentBounds * 1.15),
      viewRadius: desc.mapViewRadius ?? 60,
      night: !!desc.night,
      hide: [this.truck.group, this.truckFX.group, ...this.portals.map((p) => p.group)],
    });
  }

  async _transitionTo(id, { fromPortal = null, showStory = false } = {}) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.input.lock();

    this.audio.whoosh();
    this.audio.duck(true);
    await this.fade.fadeOut(550);

    if (showStory) {
      const data = CV_DATA[id];
      if (data) await this.storyCard.show(data);
    }

    this._loadWorldSync(id, { fromPortal });

    if (THEMED_WORLD_IDS.includes(id)) {
      this.visited.add(id);
      this.hud.setProgress(this.visited.size, THEMED_WORLD_IDS.length);
    }

    await this.fade.fadeIn(550);
    this.audio.duck(false);
    this.input.unlock();
    this.transitioning = false;
  }

  _onRoundEvent(e) {
    if (e.type === 'pickupStarted') {
      this.truck.playArmCycle();
      return;
    }
    if (e.type === 'collected') {
      this.audio.binTip();
      this.hud.setRound(e);
      this.hud.toast(e.full
        ? `🗑️ Hopper full — return to the depot`
        : `🗑️ +100  ·  ${e.collected}/${e.total} bins`);
      if (e.collected >= e.total && e.total > 0) {
        this.hud.toast('✅ Every bin on the route collected!');
      }
      return;
    }
    if (e.type === 'emptied') {
      // Raise the tailgate and run the ejector, rather than the load simply
      // vanishing. The audio now follows the mechanism's own phases.
      this.truck.playTipCycle();
      this.audio.depotDump();
      this.hud.setRound(e);
      this.hud.toast(`♻️ Tipped ${e.tipped} bins  ·  +${e.tipped * 50} bonus`);
    }
  }

  _onMechanismEvent(event) {
    switch (event) {
      case 'hydraulic':
      case 'tailgate':
      case 'eject':
        this.audio.hydraulic(true);
        break;
      case 'grip':
        this.audio.binTip();
        break;
      case 'dump':
      case 'pack':
        this.audio.depotDump();
        break;
      default:
        break;
    }
  }

  _checkPortals() {
    if (this.transitioning) return;
    for (const portal of this.portals) {
      const d = portal.distanceTo(this.truck.position);
      if (d < portal.triggerDistance) {
        if (portal.id === 'hub') {
          this._transitionTo('hub', { fromPortal: this.currentEntryHubId, showStory: false });
        } else {
          this._transitionTo(portal.id, { fromPortal: portal.id, showStory: true });
        }
        break;
      }
    }
  }

  _tick() {
    if (!this.running) return;
    requestAnimationFrame(() => this._tick());

    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;

    this.truck.update(delta, this.input, this.currentBounds);
    // Mouse orbit. The camera holds whatever angle the player set — C asks it
    // to swing back behind the truck.
    // Pointer drag and held-key orbit feed the same path, so the camera is
    // fully controllable with no pointer gesture at all.
    const pointerCam = this.input.consumeCameraInput();
    const keyCam = this.input.cameraKeyDelta(delta);
    this.chaseCam.applyPointer({
      dx: pointerCam.dx + keyCam.dx,
      dy: pointerCam.dy + keyCam.dy,
      zoom: pointerCam.zoom,
    });
    if (this.input.consumeRecenter()) this.chaseCam.requestRecenter();
    this.chaseCam.update(delta, this.truck);

    if (this.input.consumeLightToggle()) {
      const on = this.truck.toggleHeadlights();
      this.hud.flashLights(on);
    }

    this.truckFX.update(delta, this.truck);
    this.audio.update(delta, this.truck, this.input);
    if (this.input.consumeMuteToggle()) {
      const muted = this.audio.toggleMute();
      this.hud.flashLights(muted ? '🔇 Sound off' : '🔊 Sound on');
    }
    if (!this.transitioning) this.round.update(delta, this.truck);
    this.hud.setSpeed(this.truck.forwardSpeedKmh);
    this.miniMap.update(this.truck, this.portals);

    for (const p of this.portals) p.update(delta, elapsed);
    if (this.currentWorldUpdate) this.currentWorldUpdate(delta, elapsed);

    this._checkPortals();

    this.renderer.render(this.scene, this.camera);
  }
}
