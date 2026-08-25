# ROVA CV Drive 🚛

A 3D driving game built with **Three.js + Vite**. Hop in a detailed, low-poly
ROVA electric refuse truck (DAF-style silver-grey cab, lime-green compactor
body, robotic side-loading arm) and roam a green nature world. Drive through any of
the six glowing portal archways to teleport into a chapter of Toluwalase
Awobusuyi's CV, complete with a story card and a fade transition.

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

**Edges.** Every panel uses `RoundedBoxGeometry`. Nothing in the real world has
a perfectly sharp 90° corner, and the bevel highlight is most of what separates
a "box" from a "panel".

**Feel.** Longitudinal acceleration drives pitch and cornering drives roll,
each through a damped spring. Measured behaviour:

| state | pitch | roll | FOV |
|---|---|---|---|
| accelerating | −2.1° (squat) | 0° | 58 |
| cornering at speed | 0° | ±5.2° | 67 |
| hard braking | +3.5° (dive) | 0° | 64 |

The chase camera widens its FOV with speed, swings wide of turns to let you see
into the corner, and adds speed-scaled shake.
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
    ChaseCamera.js
    InputController.js
    FadeTransition.js
  entities/        The truck, its effects, + portal archways
    Truck.js
    TruckFX.js
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
