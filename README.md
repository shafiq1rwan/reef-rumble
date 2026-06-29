# Reef Rumble - Shark Ink Arena

An original isometric **pixel-art shark ink-battle** game. Play a cheerful chibi
shark street-warrior in a neon reef city: cover the arena in your cyan sea-ink,
splat rival shark gangs, dive into your own ink to zip around, and control the
most territory before the timer runs out.

Built around a **single self-contained `index.html`** - pure HTML, CSS, and vanilla
JavaScript with Canvas 2D. **No build step, and no external assets, images, or audio
files** - everything (art, sound, physics) is generated procedurally in code. The
only dependency is **PeerJS** (bundled locally in `vendor/`) for the optional online
multiplayer; single-player makes no network calls at all.

> Original work - not affiliated with or derived from any existing game. All
> characters, names, art, UI, and sounds are made from scratch.

---

## Play

Just open the file - there is nothing to install or build.

1. Download / clone this repo.
2. Double-click **`index.html`** (or drag it into any modern browser).
3. Pick a stage on the title screen and start splatting.

Works on desktop and mobile browsers, in landscape (preferred) and portrait.

*(Optional: serve it with any static server, e.g. `python -m http.server`, then
open the shown URL - handy for testing on a phone over your local network.)*

### Install as an app (PWA)

The game ships as an installable, offline-capable **PWA**. To use those features it
must be **served over http(s)** (a service worker can't run from a `file://` page):

1. From the project folder run a static server, e.g. `python -m http.server 8080`.
2. Open `http://localhost:8080/` (or your `https://` deploy, e.g. GitHub Pages).
3. Use the browser's **Install** option (address-bar icon / "Add to Home Screen").

Once installed it launches **fullscreen/standalone**, runs **offline**, and
**auto-updates**: a new build is fetched on load/focus and the app reloads itself to
apply it. PWA files: `manifest.webmanifest`, `sw.js`, and the `icon-*.png` /
`apple-touch-icon.png` set (regenerate the icons with `node tools/gen-icons.cjs`).

> Just want to play? Opening `index.html` directly still works — you only lose the
> install/offline extras.

---

## Multiplayer (online)

Up to **4 players in a free-for-all** — every human is a colored faction, bots
fill any empty slots, and whoever holds the most reef at `0:00` wins.

1. On the title screen tap **MULTIPLAYER**.
2. One player taps **HOST GAME** and shares the 5-character **room code**.
3. The others tap **JOIN GAME** and enter that code.
4. The host taps **START** — empty factions become bots.

It runs **peer-to-peer over WebRTC** (via [PeerJS](https://peerjs.com/)). Only the
one-time connection handshake uses PeerJS's free public broker; actual gameplay is
direct between players, so it works from static hosting like **GitHub Pages**. The
host is authoritative (simulates the match and streams ~18 snapshots/sec); clients
send their input and render the synced world. PeerJS is bundled locally at
`vendor/peerjs.min.js` (no CDN/runtime dependency, and it's offline-cached by the
service worker). There's no TURN relay, so very strict/symmetric NATs may fail to
connect — fine for most home and mobile networks.

> Solo play is unchanged and fully offline — multiplayer is purely additive.

---

## Controls

### Desktop
| Action | Key / Input |
| --- | --- |
| Move | `W A S D` or arrow keys |
| Aim | Mouse |
| Shoot ink | Left mouse button or `Space` |
| Dive / swim | `Shift` (hold, on your own ink) |
| Special "Ink Storm" | `Q` (when the SP meter is full) |
| Pause | `P` |
| Change stage (title) | `A` / `D` or the on-screen arrows |

### Mobile (touch - auto-detected)
- **Left stick** - move
- **Right stick** - aim & fire
- **FIRE / DIVE / ULTI** buttons
- Tap the title-screen arrows to change stage; tap the pause button to pause.

---

## How to play

- **Paint territory.** Your ink projectiles splash cyan ink across the floor.
  Tiles you cover count toward your score; rivals paint over yours and you paint
  over theirs.
- **Ink tank.** Shooting costs ink. Stand on your own ink to refill slowly -
  **dive** into it to refill fast, move quicker, and stay hidden from rivals.
  You can't shoot while diving, and you auto-surface if you leave your ink.
- **Speed depends on the floor.** You're fastest on your own ink, slow on enemy
  ink (which also drains your health), normal on bare reef.
- **Fight the gangs.** Splash rivals to splat them (they respawn). Splatting and
  shooting charge your **Special** meter - unleash the **Ink Storm** to blast a
  huge ring of ink, damage nearby rivals, and refill your tank.
- **Grab power-ups.** Floating pickups spawn in the arena - and rivals will fight
  you for them:
  - **Ink** - instant full tank
  - **Speed** - temporary speed boost
  - **Shield** - blocks all damage for a few seconds
  - **Special** - instantly fills your Ink Storm meter
- **Win condition.** When the match timer hits `0:00`, whoever controls the most
  reef wins. Bonus score for coverage and splats.

---

## Stages

Three hand-designed, symmetric arenas (pick on the title screen):

- **Reef City** - corner forts around a sunken central ink-pool plaza.
- **Open Lagoon** - wide open water with a central reef island and light cover.
- **Coral Maze** - tight reef corridors and chambers for cat-and-mouse play.

---

## Features

- Isometric 2.5D arena rendered with crisp, chunky pixel art (Canvas 2D).
- Animated ocean: drifting waves, sparkles, rising bubbles, ink-reflection glow,
  and foam framing the floating stage.
- Procedural chibi shark warriors with goggles, coral-shell armor, and a wagging
  tail; rivals come in distinct, numbered gang colors.
- Rival AI with **A\*** pathfinding, territory painting, chasing, recharging, and
  diving.
- Juicy game feel: muzzle flashes, ink-splat decals, particles, hit flashes,
  gentle screen shake, tile pulses, and squash/stretch.
- Procedural **WebAudio** sound effects (no audio files).
- Responsive HUD, minimap, and title/pause/victory/defeat screens that scale to
  any viewport; full desktop **and** mobile controls.

---

## Tech notes

- **One file:** all code lives in `index.html`. Keep it dependency-free.
- **Rendering:** the game draws into a low-resolution offscreen buffer, then
  blits it to a device-resolution canvas with image smoothing off - guaranteed
  crisp pixels instead of a blurry browser upscale.
- **Performance:** tile-level painting (no per-pixel ops), object pools for
  projectiles/particles, seeded background effects, and `requestAnimationFrame`
  with delta-time movement - tuned to stay smooth on mobile.
- Developer / architecture guidance for editing the code lives in
  [`CLAUDE.md`](CLAUDE.md).

---

## Project structure

```
.
├── index.html              # the entire game (HTML + CSS + JS, incl. netcode)
├── vendor/peerjs.min.js    # bundled PeerJS (WebRTC signaling for multiplayer)
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # service worker (offline + auto-update)
├── icon-*.png              # PWA icons (regen: node tools/gen-icons.cjs)
├── reference.png           # original HUD/stage art mock-up (reference only)
├── CLAUDE.md               # contributor / code-structure notes
└── README.md               # this file
```

---

## Possible next steps

- More weapon types and a charge/roller alternate fire.
- Additional arenas and selectable difficulty.
- Background music (also synthesized, no files).
- Multiplayer polish: client-side prediction, a TURN fallback for strict NATs,
  and in-lobby stage/weapon selection.

---

## License

No license specified yet. Add one (e.g. MIT) if you intend to share or accept
contributions.
