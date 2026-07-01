# CLAUDE.md

Guidance for working in this repository.

## Project

**Reef Rumble** — an original isometric pixel-art shark ink-battle arena game, with
optional **4-player online free-for-all** multiplayer. Nearly everything lives in
**[index.html](index.html)** — HTML + CSS + vanilla JS, Canvas 2D, no build step, no
CDNs, no images/audio files. The **one deliberate exception** is `vendor/peerjs.min.js`
(bundled locally, not a CDN) for multiplayer's WebRTC signaling — everything else stays
dependency-free. Don't add further dependencies or split the game logic into multiple
files. Open `index.html` in any desktop or mobile browser to play (solo works fully
offline with zero network calls).

Small supporting folder structure (user-approved deviation from "single file"):
`vendor/peerjs.min.js` (bundled PeerJS), `manifest.webmanifest` + `sw.js` + `icon-*.png`
(PWA — offline install, auto-update), `tools/gen-icons.cjs` (regenerates the icons),
`tools/smoke-test.cjs` (the regression suite — see **Verifying changes** below).

There is also a `reference.png` — the original HUD/stage mock-up the art direction is
based on. It is reference only; do not ship or link it from the game.

## How it's organized

All code is in one `<script>` in `index.html`, split into clearly commented sections.
Find a section by its banner comment, e.g. `10. ENEMY AI`, `15. UI RENDERING`:

- **1 Constants** — tile sizes, speeds, ink/combat tuning, colors, layout names
- **2 Canvas setup** — draws directly to the visible `canvas`; `resize()` sets a
  device-pixel transform and `imageSmoothingEnabled = false` for crisp pixel art
  (see **Crispness** under Key conventions)
- **3 Utilities / 3b Audio** — `clamp/lerp/dist/rand/shade`; easing (`easeOutCubic`,
  `easeOutBack`, `revealAlpha`); procedural WebAudio `sfx()`
- **4 Input (desktop) / 5 Mobile controls** — keyboard, mouse, touch joysticks/buttons
- **6 Isometric projection** — `worldToScreen` / `screenToWorld`, and `project()` (adds
  camera + shake + screen centre)
- **7 Tile map generation** — `generateMap(layout)` builds 3 stages; `ensureConnectivity`
  guarantees every spawn is reachable
- **8 Entities** — `makeShark(faction, isBot)` (the one factory for every player/bot;
  `makePlayer`/`makeEnemy` are thin wrappers over it), object pools, `aStar()` pathfinding
- **9 Player / 10 Enemy AI / 11 Projectiles / 12 Ink splash / 12b Power-ups /
  13 Particles / 14 Camera**
- **15 UI rendering** — HUD, minimap, mobile controls (all scale with global `UI`)
- **16 Game states** — `drawTitle` / `drawWeaponSelect` / `drawSettings` / `drawHowTo` /
  `drawLobby` / `drawCountdown` / `drawPause` / `drawResult` screens (scale with `ovScale()`)
- **17 update() / 17b NETWORK / 18 render()** then `frame()` (rAF loop) and boot at the
  very bottom

### Multiplayer (faction model + host-authoritative netcode)
Every shark — human or bot — is one of **4 factions** (`FACTION_COLORS[0..3]`; solo =
faction 0 + 3 AI factions). `localFaction` is which faction *this* client renders as
`player` (0 in solo/host; whatever the host assigns for a joined client). Tiles carry
`team` (-1..3) instead of a binary owner. `sharks[]` indexes all 4 by faction id.
- **Lobby → match:** `netHost()`/`netJoin(code)` open a PeerJS `Peer`; the host is
  authoritative and assigns factions to joiners. `startMatch(opts)` takes
  `{ localFaction, humans, weapons, stage, netRole }` to boot solo, host, or client.
- **Host loop** (`update()`): human-controlled non-local factions run `driveHumanShark()`
  (reads `e.netInput` instead of AI); bots still run `updateEnemy`. `hostSnap()` streams
  `buildSnapshot()` (sharks/projectiles/pickups/tile deltas via `netDirty`/hit-death
  `netEvents`) to clients at `SNAP_HZ`.
- **Client loop** (`netClientTick()`): never runs the sim. `predictLocalShark()` /
  `predictLocalFire()` move and fire the LOCAL shark immediately from input (using the
  same `speedForTile`/`moveEntity` primitives the host uses) for zero-lag feel; snapshots
  reconcile position (gentle correction, hard-snap on big error) and replay `netEvents`
  (`splashFX`/`deathBurst`) so hits look identical on every screen. Input is sent to the
  host at `INPUT_HZ` via `gatherNetInput()`.
- **Lobby UX:** `canStartMatch()` blocks START until ≥1 joiner AND everyone's readied
  (no force-start). `netRematch()` returns the whole room to `LOBBY` (room intact) after
  a match instead of tearing it down.
- Full protocol/message shapes: see the `17b. NETWORK` section banner in `index.html`.

### Screen flow & menus
States: `TITLE → WEAPONSELECT → PLAYING` (PLAYING opens with a `game.countdown`
3-2-1-GO freeze), plus `SETTINGS`, `HOWTO`, `CREDITS`, `LOBBY` (multiplayer host/join),
`PAUSED` (solo only — multiplayer is host-authoritative, no pause), `GAMEOVER`,
`VICTORY`. All non-gameplay taps/clicks route through one `menuTap(p)` (mouse + touch);
each draw function writes its clickable rects into a globals object (`titleBtns`,
`weaponUI`, `settingsUI`, `howtoUI`, `lobbyUI`, `resultUI`) which `menuTap` hit-tests
with `inR(p, rect)` — same "define the rect once, use it for draw AND hit-test" rule as
`pauseBtn()`. Use `drawBtn(rect, label, color, filled, fontPx[, alpha])`
for menu buttons. The result screen has a ~1.15s scripted reveal (`resultAnim`,
`RESULT_HOLD`) — `menuTap`/`handleEnter` are gated by `resultCanSkip()` so you can't
tap through it early.

### Weapons, audio, persistence
- `WEAPONS[]` (section 1) holds per-weapon stats; `weaponSel` is the chosen index,
  equipped as `player.weapon` in `startMatch`. Projectiles carry `directDmg` /
  `splashDmg` / `splashR` (defaults set in `spawnProjectile`, overridden per weapon).
- `settings { musicVol, sfxVol, colorblind, perf }` persists to `localStorage`
  (`saveSettings()`); `sfx()` is gated by `settings.sfxVol`. Background music is a synth
  step-sequencer (`updateMusic()` called each frame; `M_BASS`/`M_ARP` patterns) gated by
  `settings.musicVol`. `settings.colorblind` swaps `PALETTES` via `applyPalette()`.
  `settings.perf` trims rendering for low-end devices (1× device pixels, lighter
  background, capped particle pool — see `PERF_PARTICLE_CAP` and the `settings.perf`
  checks in `drawWaterBackground`/`resize`).
- `playerName` (persisted, `setPlayerName`/`sanitizeName`) is the multiplayer lobby
  display name.
- The chibi sprite lives in `drawChibiBody(...)`, shared by the in-game shark and the
  weapon-select character preview.

## Key conventions (follow these)

- **Coordinates:** world/grid units are floats; tiles are `MAP_W`×`MAP_H` (24×24).
  Convert with `worldToScreen`; draw with `project()` for camera-relative screen pixels.
- **Rendering order** (in `drawArena`): tiles → ink overlays → reticle/impacts →
  depth-sorted (by `x+y`) decorations/entities/projectiles/pickups → flashes →
  particles → floaters. Then HUD on top.
- **Crispness:** the game draws directly to the visible `canvas`, which is backed by
  real device pixels (`canvas.width/height = cssSize * devicePixelRatio`, capped in
  perf mode — see `resize()`). A single `ctx.setTransform(deviceScale,...)` maps logical
  `VIEW_W`/`VIEW_H` coordinates to device pixels and `ctx.imageSmoothingEnabled = false`,
  so everything rasterises crisp with no blurry CSS upscale. Don't reintroduce an
  offscreen low-res buffer — draw straight to `ctx`.
- **Responsive UI:** HUD uses the global `UI` scale (set in `resize()`); overlay
  screens use `ovScale()`. New HUD/screen elements MUST scale with one of these and be
  positioned relative to `VIEW_W`/`VIEW_H`, never hard-coded pixels. Use `hudPanel`,
  `hudBar`, `hudFont`, and `fitFont` helpers for consistency.
- **Pixel-art look:** build sprites from `ctx.fillRect`/`poly()`; use `shade(hex, amt)`
  for lighter/darker tints (no smooth gradients). Avoid emoji glyphs in canvas text —
  they render inconsistently; use drawn shapes or plain ASCII.
- **Performance:** object pools for projectiles/particles; tile-level painting only (no
  per-pixel ops). Keep allocations out of the per-frame loop. `settings.perf` exists for
  low-end devices — extend it (not a separate code path) when adding expensive VFX.
- **Buttons:** define a button's position once in a helper (e.g. `pauseBtn()`) or a UI
  rect object (e.g. `lobbyUI.start`, `resultUI.rematch`) and use it for BOTH drawing and
  hit-testing so they never drift apart.
- **Animated reveals:** derive progress from a single elapsed-time clock rather than
  per-frame mutation where possible (see `resultAnim`/`drawResultInkRain` — each
  element's state is a pure function of `t`), so scrubbing/skipping/null-fallback stay
  trivially correct.
- **Delta time:** all movement/timers are `dt`-scaled (seconds). `frame()` clamps `dt`.

## Tuning knobs

Most balance lives in section 1 constants: `PLAYER_SPEED_*`, `INK_MAX`, `SHOT_COST`,
`SPLASH_RADIUS`, `MATCH_TIME`, `*_MAX_HP`, `RESPAWN_DELAY`. Power-up frequency:
`pickupTimer`/`MAX_PICKUPS` in 12b. Stages: `LAYOUT_NAMES` + the `if (currentLayout…)`
blocks in `generateMap`. Camera shake amplitude is capped in `updateCamera`. Multiplayer:
`SNAP_HZ`/`INPUT_HZ` (netcode rate), `JOIN_TIMEOUT` (client give-up), and the client
prediction correction rate/hard-snap threshold inline in `netClientTick`, all in the
`17b. NETWORK` section. Result-screen reveal pacing: the `T` timing object + `RESULT_HOLD`
in/near `drawResult`.

## Verifying changes

There's no browser test framework, but **`node tools/smoke-test.cjs`** is a real,
committed regression suite — run it after every edit (it's fast, no deps). It extracts
the inline `<script>`, runs it in Node's `vm` module under DOM/canvas/PeerJS stubs (a
`Proxy` where unhandled canvas calls are no-ops), and exercises: solo play (240 frames +
territory tally), rendering every game state, host netcode (join/assign/start/snapshot/
disconnect→bot), client netcode (snapshot apply + input), client-side movement
prediction (hard-snap vs. gentle correction vs. dead), perf mode, the lobby start-guard,
lobby weapon/stage pickers, the rematch flow, hit/death VFX event replay, local-fire
prediction, connection robustness (join timeout, bad code, host-left), and the result
screen reveal timeline. It exits non-zero and prints `✗ <reason>` per failed check if
anything breaks — **when you add a feature, add a check for it in the matching section
(or a new one) rather than relying only on manual testing.**

If you touch map generation specifically, also sanity-check connectivity: after
`generateMap(L)` for each layout, BFS over walkable tiles (`terrain !== T_OBST`) from
`PLAYER_SPAWN` and confirm every `ENEMY_SPAWNS` entry and the centre are reached.

Always run `node tools/smoke-test.cjs` after edits. Finally, open `index.html` in a real
browser (and device-emulation/touch) to confirm look, controls, and framerate — the
smoke test catches thrown errors and logic regressions, not visual/feel issues. For
multiplayer changes specifically, a live 2-window test (`python -m http.server`, host +
join in two tabs/devices) is the only way to catch real latency/NAT issues.

## Controls (for reference)

Desktop: WASD/arrows move, mouse aim, click/Space shoot, Shift dive, **Q** ulti, **P**
pause (solo only), A/D or ◀▶ change stage on the title, **Enter** confirms menus /
starts a rematch (host). Mobile: left stick move, right stick aim+fire, FIRE/DIVE/ULTI
buttons; tap title arrows to change stage.
