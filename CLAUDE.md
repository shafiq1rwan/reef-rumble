# CLAUDE.md

Guidance for working in this repository.

## Project

**Reef Rumble** — an original isometric pixel-art shark ink-battle arena game.
Everything lives in a **single self-contained file: [index.html](index.html)** — HTML +
CSS + vanilla JS, Canvas 2D, no external libraries, assets, CDNs, images, or audio
files. It must stay that way: do not add dependencies or split into multiple files.
Open `index.html` in any desktop or mobile browser to play.

There is also a `reference.png` — the original HUD/stage mock-up the art direction is
based on. It is reference only; do not ship or link it from the game.

## How it's organized

All code is in one `<script>` in `index.html`, split into clearly commented sections.
Find a section by its banner comment, e.g. `10. ENEMY AI`, `15. UI RENDERING`:

- **1 Constants** — tile sizes, speeds, ink/combat tuning, colors, layout names
- **2 Canvas setup** — low-res offscreen `buffer` is drawn into, then blitted to the
  visible `canvas` with `present()` (nearest-neighbour). `ctx` = buffer context.
- **3 Utilities / 3b Audio** — `clamp/lerp/dist/rand/shade`; procedural WebAudio `sfx()`
- **4 Input (desktop) / 5 Mobile controls** — keyboard, mouse, touch joysticks/buttons
- **6 Isometric projection** — `worldToScreen` / `screenToWorld`, and `project()` (adds
  camera + shake + screen centre)
- **7 Tile map generation** — `generateMap(layout)` builds 3 stages; `ensureConnectivity`
  guarantees every spawn is reachable
- **8 Entities** — `makePlayer/makeEnemy`, object pools, `aStar()` pathfinding
- **9 Player / 10 Enemy AI / 11 Projectiles / 12 Ink splash / 12b Power-ups /
  13 Particles / 14 Camera**
- **15 UI rendering** — HUD, minimap, mobile controls (all scale with global `UI`)
- **16 Game states** — title / pause / result screens (scale with `ovScale()`)
- **17 update() / 18 render()** then `frame()` (rAF loop) and boot at the very bottom

## Key conventions (follow these)

- **Coordinates:** world/grid units are floats; tiles are `MAP_W`×`MAP_H` (24×24).
  Convert with `worldToScreen`; draw with `project()` for camera-relative screen pixels.
- **Rendering order** (in `drawArena`): tiles → ink overlays → reticle/impacts →
  depth-sorted (by `x+y`) decorations/entities/projectiles/pickups → flashes →
  particles → floaters. Then HUD on top.
- **Crispness:** never rely on CSS upscaling for sharpness — the game renders to the
  low-res `buffer` and `present()` blits it with `imageSmoothingEnabled = false`.
  Keep that pipeline; don't draw game content directly to the visible canvas.
- **Responsive UI:** HUD uses the global `UI` scale (set in `resize()`); overlay
  screens use `ovScale()`. New HUD/screen elements MUST scale with one of these and be
  positioned relative to `VIEW_W`/`VIEW_H`, never hard-coded pixels. Use `hudPanel`,
  `hudBar`, `hudFont`, and `fitFont` helpers for consistency.
- **Pixel-art look:** build sprites from `ctx.fillRect`/`poly()`; use `shade(hex, amt)`
  for lighter/darker tints (no smooth gradients). Avoid emoji glyphs in canvas text —
  they render inconsistently; use drawn shapes or plain ASCII.
- **Performance:** object pools for projectiles/particles; tile-level painting only (no
  per-pixel ops). Keep allocations out of the per-frame loop.
- **Buttons:** define a button's position once in a helper (e.g. `pauseBtn()`,
  `resumeBtn()`) and use it for BOTH drawing and hit-testing so they never drift apart.
- **Delta time:** all movement/timers are `dt`-scaled (seconds). `frame()` clamps `dt`.

## Tuning knobs

Most balance lives in section 1 constants: `PLAYER_SPEED_*`, `INK_MAX`, `SHOT_COST`,
`SPLASH_RADIUS`, `MATCH_TIME`, `*_MAX_HP`, `RESPAWN_DELAY`. Power-up frequency:
`pickupTimer`/`MAX_PICKUPS` in 12b. Stages: `LAYOUT_NAMES` + the `if (currentLayout…)`
blocks in `generateMap`. Camera shake amplitude is capped in `updateCamera`.

## Verifying changes (no test framework — use Node to smoke-test the script)

The script is browser-only, but you can load it under stubs to catch errors fast.
Extract the `<script>` body, wrap it in `new Function` with minimal DOM/`window`/
`navigator` stubs (canvas via a `Proxy` whose every property returns a function), and:

1. **Syntax:** `new Function(stub + code)` — throws on parse errors.
2. **Runtime:** append `; return { update, render, present, startMatch, game, … }` to the
   wrapped code, then call `startMatch()` and loop `update(0.016)` for a few hundred
   frames, calling `render()`/`present()`; also force-render TITLE/PAUSED/VICTORY/
   GAMEOVER states. Catch and print errors with a short stack.
3. **Map connectivity:** after `generateMap(L)` for each layout, BFS over walkable tiles
   (`terrain !== T_OBST`) from `PLAYER_SPAWN` and assert every `ENEMY_SPAWNS` entry and
   the centre are reached. All three layouts must be fully connected.

Always run the syntax + a short runtime sim after edits. Finally, open `index.html` in a
real browser (and device-emulation/touch) to confirm look, controls, and framerate.

## Controls (for reference)

Desktop: WASD/arrows move, mouse aim, click/Space shoot, Shift dive, **Q** ulti, **P**
pause, A/D or ◀▶ change stage on the title. Mobile: left stick move, right stick
aim+fire, FIRE/DIVE/ULTI buttons; tap title arrows to change stage.
