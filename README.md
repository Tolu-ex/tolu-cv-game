# ROVA CV Drive 🚛

A 3D driving game built with **Three.js + Vite**. You run a refuse round in a
ROVA electric collection truck — white cab, green body, hydraulic side-loading
arm — emptying wheelie bins along the kerb and tipping out at the depot. Six
worlds, reached through glowing portal archways, each drawn from a chapter of
Toluwalase Awobusuyi's CV.

## 🌍 The six worlds

| Portal | World |
|---|---|
| 🇳🇱 | **Haarlem** — canal houses with stepped gables, De Adriaan windmill, Grote Kerk tower, De Koepel dome, canal + bridges, bikes, street lamps |
| 🌍 | **Ile-Ife** — OAU-style conical hall, red earth, palm trees |
| 🏙️ | **Lagos** — city skyline, lagoon, market stalls |
| 👟 | **Street Market** — sneaker stalls, neon signs, string lights (night) |
| 🌏 | **Singapore** — Marina Bay Sands, supertrees, night skyline |
| 🌷 | **Contact** — tulip fields, windmill, name + email card |

Every world is **procedurally generated** from primitive geometry — no 3D
model files to download, so the game loads fast and deploys as a tiny static
bundle.

## 🎮 Controls

- **W / A / S / D** or **Arrow keys** — drive
- **Space** — brake
- **L** — headlights on/off
- **Drag** (left or right button) — orbit the camera freely, Roblox-style
- **Scroll** — zoom in/out (4–30 m)
- **C** — swing the camera back behind the truck
- **M** — mute / unmute
- Drive the truck through a glowing portal archway to enter that world's
  story card, then keep driving through the world's exit portal to return to
  the nature world.

## 🚛 The truck

The truck is the one thing on screen in every world, so it carries most of the
visual weight. It is built procedurally in
[`Truck.js`](src/entities/Truck.js) — roughly 135 meshes — and split into a
sprung/unsprung rig so the body can move independently of the wheels:

```
group      root: world position + heading
 ├ body    sprung mass — pitches under braking, rolls in corners
 └ wheels  unsprung — stay planted on the ground
```

**Materials.** The single biggest reason procedural geometry reads as "toy" is
that shiny surfaces have nothing to reflect: `metalness` without an environment
map just renders dark. [`materials.js`](src/utils/materials.js) generates a
PMREM environment from a small procedural scene (sky gradient + emissive
panels) and assigns it to `scene.environment`, then provides clearcoat car
paint, chrome, brushed metal, rubber, and glass.

A note on the glass: it deliberately does **not** use physical `transmission`.
Transmission renders whatever is behind the pane, and behind a game-truck
windscreen there is very little — so the glass goes black and reads as a hole.
A bright, strongly-reflective surface sells "glass" far better at this scale.

**Proportion.** Modelled on real refuse trucks: a **short, tall cab-over with a
near-vertical glasshouse**, and a body that stands well **proud of the cab
roof**. Matching cab and body heights — and making the cab long and raked like
a car — was the single biggest reason an earlier version looked wrong. White
cab against a green body, too; a silver-grey cab blended into the bodywork and
read as one muddy mass.

**Surfaces.** The cab and body are **extruded side profiles**, not stacked
boxes. A profile carries the whole silhouette in one surface — raked screen
flowing into a curved roof, wheel arches cut into the lower edge, a character
line running cab to tail — and the extrusion bevel rounds every edge of it at
once. Stacking rounded boxes can never produce a continuous surface, which is
exactly why the earlier version read as assembled rather than designed. Smaller
parts still use `RoundedBoxGeometry`, since nothing real has a sharp 90° corner.

Arch sizing is derived rather than eyeballed: at the body's lower edge a 0.58 m
tyre is `2·√(0.58² − 0.31²) ≈ 0.98` wide, so the opening has to exceed that.
Each arch also gets a liner — the extrusion cuts clean through the full width,
so without one you see daylight through the wheel wells.

**Lights.** Headlamps are real spotlights, switchable in every world with `L`,
not just on at night. Brake lamps respond to braking, reversing lamps throw a
pool of light behind the truck, and the indicators blink at ~1.5 Hz (the real
automotive rate) on whichever side you are steering toward.

**Steering.** A kinematic **bicycle model**, not direct heading rotation. The
earlier version did `heading += steerInput * turnRate * delta`, which is how a
tank turns — the truck pivoted about its own centre and could spin on the spot.

A real vehicle pivots about a point on the extension of its rear axle, and that
geometry gives three things no amount of tuning the old version could:

- turning radius `R = wheelbase / tan(steer)`, so a long truck genuinely *is*
  long and cannot be tuned to feel short
- **off-tracking** — the rear wheels cut inside the fronts through a corner,
  the most recognisable thing about watching a truck turn
- yaw rate proportional to speed, so it must be rolling to turn

Wheelbase (5.8 m) and track (2.37 m) are measured off the model at load rather
than hard-coded, and the front wheels use true **Ackermann** — the inner wheel
turns further than the outer, because they travel circles of different radii
and would otherwise scrub.

Verified against the geometry rather than by feel:

| test | result |
|---|---|
| turn on the spot | 0.0000° after 3 s at full lock, no throttle |
| circle radius | predicted 10.81 m, measured **10.76 m** (0.4% error) |
| off-tracking | front traces 12.19 m, rear **10.91 m** |
| Ackermann | outer 26.4°, inner **31.9°** |
| straight-line drift | exactly 0 over 50 m |

**Feel.** Longitudinal acceleration drives pitch and cornering drives roll,
each through a damped spring. Measured behaviour:

| state | pitch | roll | FOV |
|---|---|---|---|
| accelerating | −2.1° (squat) | 0° | 58 |
| cornering at speed | 0° | ±5.2° | 67 |
| hard braking | +3.5° (dive) | 0° | 64 |

The chase camera widens its FOV with speed, swings wide of turns to let you see
into the corner, and adds speed-scaled shake. Dragging orbits it around the
truck and the wheel zooms.

The orbit is stored as an *offset* from the behind-the-truck pose rather than an
absolute angle, so the camera keeps following your heading while you look
around — an absolute-yaw camera makes driving genuinely disorienting. The
camera then **holds whatever angle you set it to**. An earlier version drifted
back behind the truck a second or two after you released the mouse, which made
free-look feel like it never took: you would aim at something and watch the view
slide off it. `C` swings it back instead, and any drag cancels a recentre in
progress.
[`TruckFX.js`](src/entities/TruckFX.js) adds wheel dust from a recycled sprite
pool (one draw call, no per-puff allocation); dust is tinted per world via
`dustColor`, so Ile-Ife throws red laterite and Haarlem throws grey cobble grit.

**It's electric.** ROVA runs an electric refuse fleet, so the truck has no
exhaust stack and emits nothing — a charge port sits where the stack would
otherwise be, and the livery carries a `⚡ 100% ELEKTRISCH` strapline. The body
also has no idle vibration: a diesel shakes at a standstill, an electric
drivetrain is dead still, and that stillness is part of how an EV reads. Tyre
dust stays, since rubber on a dry surface throws grit whatever turns the
wheels.

## 🎯 The collection round

The game is a refuse round. Bins are set out along the kerbs of every world;
drive so the truck's **kerb side** passes one and the hydraulic arm swings out,
grabs it and tips it into the hopper.

The hopper holds **6 bins**. Once it is full you stop collecting and have to
drive back to the **depot** (the glowing pad, which only appears once you are
carrying something) to tip out. That capacity limit is the whole design: without
it you would simply hoover up every bin in one pass, and there would be no
decision to make. With it, every run is a choice between pushing on to the far
bins or banking what you already have.

- **100 pts** per bin, plus a **50 pt per-bin bonus** for banking a load at the depot
- Collection needs you under ~11 km/h — you have to actually slow down for the kerb
- Which side you work follows real practice: driving one way you service the
  right-hand kerb, driving back you service the other. The arm is mounted on the
  right, as a Dutch truck's is.

Bins carry the four Dutch waste streams as a colour scheme — restafval, GFT,
papier and PMD. [`Bin.js`](src/entities/Bin.js) owns its own lift-and-tip
animation so several can be mid-cycle without the truck tracking state per bin;
[`RoundManager.js`](src/core/RoundManager.js) owns score, load, the depot and
the pickup test.

## 🔊 Audio

Every sound is **synthesised at runtime** in WebAudio — there are no audio
files, so it adds nothing to the download.

The brief is an *electric* refuse truck, which sounds genuinely different to a
diesel: no combustion rumble, no exhaust bark. Instead a rising inverter whine
over a low torque hum, with tyre roar taking over at speed. Two whine
oscillators sit a few Hz apart so they beat against each other — a single tone
sounds like a test oscillator.

Motor level tracks **load**, not just speed: holding the throttle sounds like
effort and lifting off audibly relaxes before the truck has slowed. Measured on
the master bus, coasting at 41 km/h is quieter than full throttle at 53 km/h.

Also synthesised: air-brake release when coming to rest, hydraulic groan on the
arm cycle, bin knock-and-rattle, the depot dump, a portal whoosh, the
indicator relay tick, and the reversing beeper every real truck is required to
carry.

One thing worth knowing if you edit `AudioEngine.js`: a bandpass filter
discards far more energy than a highpass, so the same nominal `gain` through
different filters lands at wildly different loudness — measured, a bandpass
burst came out ~9x quieter. `_noiseBurst` compensates for this so callers can
think in relative loudness rather than filter physics.

`M` mutes (persisted to localStorage, and it works during story cards), and
audio ducks to 15% under transitions.

## 🧭 Minimap

A GTA-style rotating radar sits in the bottom-right. The map turns with the
truck so your heading is always "up", a white arrow marks you, and each portal
shows as a coloured blip — pinned to the rim as an arrow when it's off-radar,
so you always know which way to drive. A caption under the dial names the
nearest portal and its distance; a tick on the bezel points north.

Each world is photographed once from directly above when it loads
([`MiniMap.capture`](src/ui/MiniMap.js)) rather than re-rendered every frame,
so the per-frame cost is a single `drawImage`. Worlds can tune their radar via
`mapExtent` (how much of the world the snapshot covers) and `mapViewRadius`
(how far you can see from the centre of the dial). Scenery that would clutter a
top-down view — clouds, starfields — is flagged `userData.excludeFromMap`.

## 🗂️ Project structure

```
src/
  core/            Game orchestration, camera, input, fade transition
    Game.js
    RoundManager.js
    ChaseCamera.js
    InputController.js
    FadeTransition.js
  entities/        The truck, its effects, bins + portal archways
    Truck.js
    TruckFX.js
    Bin.js
    Portal.js
  worlds/          One builder function per world (returns a THREE.Group + metadata)
    HubWorld.js
    HaarlemWorld.js
    IleIfeWorld.js
    LagosWorld.js
    StreetMarketWorld.js
    SingaporeWorld.js
    ContactWorld.js
  ui/              DOM-based HUD, story card overlay + radar
    HUD.js
    StoryCard.js
    MiniMap.js
  data/
    cvData.js      ← Edit this file to personalize the story-card copy
  utils/
    colors.js      Shared color palette per world
    materials.js   Environment map + vehicle-grade PBR materials
    geoBuilders.js Shared low-poly geometry builders (trees, houses, signs…)
  main.js          Entry point — boot sequence, intro screen, start button
  style.css
index.html
```

## ✏️ Personalizing your CV content

Open [`src/data/cvData.js`](src/data/cvData.js) and edit the `bullets`,
`tags`, `title` and `subtitle` fields for each world — that's the only file
you need to touch to make the story cards reflect your real experience.

## 🚀 Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`).

### Build for production

```bash
npm run build
npm run preview   # sanity-check the production build locally
```

## ▲ Deploying to Vercel

This repo already includes a `vercel.json` configured for a static Vite
build. Either:

**Option A — Vercel CLI**

```bash
npm i -g vercel
vercel
```

**Option B — Vercel dashboard**

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Framework preset: **Vite** (auto-detected). Build command `npm run
   build`, output directory `dist` — already set via `vercel.json`.
4. Deploy.

## 🛠️ Tech

- [Three.js](https://threejs.org/) r185
- [Vite](https://vitejs.dev/) for dev server + bundling
- No other runtime dependencies — everything (buildings, trees, the truck,
  signage) is built from primitive geometry and `<canvas>`-generated
  textures at runtime.
