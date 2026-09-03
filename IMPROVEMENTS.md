# Backlog

The working queue for the scheduled agent. It picks the **topmost unchecked
item**, does that one thing, and opens a pull request. It does not pick several.

## Rules for the agent

These are not style preferences. Each one exists because the opposite happened
in this repo and cost real work.

1. **Open a pull request. Never push to `main`.** Every change is reviewed by
   Toluwalase before it lands. The value of this loop is that it proposes and a
   human decides.
2. **Never invent biographical content.** `src/data/cvData.js` contains
   placeholder copy written by an assistant, not by Toluwalase. Do not "improve"
   it, extend it, or write new bullets. Only he can supply it. Inventing CV
   detail for a real person on a public repo under his name is the single worst
   thing this loop could do.
3. **Never depict a real place from assumption.** The Ile-Ife world was
   originally built as a dirt road, scattered palms and a hut silhouette, with a
   source comment calling a cone roof "the iconic wide conical OAU-style roof".
   Nobody had checked. It was a stereotype standing in for a specific modernist
   campus. If a world depicts somewhere real and you cannot verify what it looks
   like, leave it alone and say so in the PR.
4. **Verify in the browser, not by reading the diff.** This repo has a history
   of changes that looked right in source and were wrong on screen: a truck
   whose entire body rendered at 0.7% value variation, outlines that were being
   applied to the wrong material, a bin pickup point on the opposite flank from
   the arm. Run the dev server, drive it, screenshot it, measure pixels if the
   change is visual.
5. **Do not add dead code.** No speculative helpers, no options that the
   material path ignores, no "might be useful later" exports. The tree was
   audited; keep it that way.
6. **One item per PR**, with the verification evidence in the description.

## Blockers — these gate sharing the game at all

- [ ] **Touch controls.** `src/core/InputController.js` has zero touch handling.
      On a phone or tablet the game loads and cannot be played: touch orbits the
      camera, and there is no throttle or steering. Needs an on-screen
      throttle/brake and a steering control, and the title screen should stop
      advertising `WASD` on devices with no keyboard.
- [ ] **Deploy.** `vercel.json` is configured and has never been used. There is
      no live URL to send anyone.
- [ ] **Real CV copy.** `src/data/cvData.js` is placeholder. **Agent: skip this
      item — it is here to be visible, not to be done by you.** See rule 2.

## Truck mechanism

- [ ] **`packer-blade` and `ejector-panel`.** The mechanism already defines and
      sequences both; the current GLB has neither, so they bind to null and are
      reported in `rig.mechanismMissing`. When a model with those nodes lands,
      the pack and eject cycles light up with no code change. Verify by running
      a lift and a tip and confirming both actuators leave zero.
- [ ] **Load volume.** A `load-volume` node scaled on Y to show the hopper
      filling as the round progresses.

## Art direction

- [ ] **Outlines on the worlds.** `addOutlines` is applied to the truck and the
      bike only, so the vehicles are inked and their surroundings are not.
      Extending it to world props would make the whole thing read as one
      illustration. Watch the draw-call count — the truck alone adds 500.
- [ ] **The remaining `MeshStandardMaterial`s.** 13 survive on textured signage,
      tower windows and the Haarlem clock face, where `roughness` is live. They
      shade as smooth PBR in a cel-shaded scene, so the flat-vector conversion
      is unfinished on those surfaces.
- [ ] **Portals.** Still glowing volumetric arches with emissive membranes — a
      realism idiom that fights the flat poster direction everything else now
      follows.
- [ ] **Loading screen.** Still the old radial-gradient-and-emoji treatment, so
      there is a visible style break in the seconds before the title screen
      appears. It is the first thing anyone sees.

## Driving feel

- [ ] **Gearing with audible shifts.** A loaded refuse truck reaching 58 km/h in
      a few seconds is wrong. Stepped ratios with a torque break at each shift,
      and the audio following the steps.
- [ ] **Per-wheel suspension.** Currently one sprung body with pitch and roll.
      A ground raycast per wheel would let it react to kerbs and camber.
- [ ] **Skid marks and tyre smoke.** `TruckFX` already emits dust; locking the
      brakes should leave something behind.

## Done

- [x] World lighting rebalanced; toon ramp widened so form reads
- [x] Inked outlines and contact shadows on both vehicles
- [x] Truck hydraulics rebuilt as a real mechanism with a kinematic chain
- [x] Bicycle in the tulip field, with its own handling model
- [x] Ile-Ife rebuilt as the OAU campus it actually is
- [x] Title screen rebuilt as a poster over the living world
- [x] Synthesised title-screen music
- [x] Dead-code audit across the tree
