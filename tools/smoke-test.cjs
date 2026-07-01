// Node smoke test for Reef Rumble — extracts the inline game <script>, stubs the
// browser (canvas/DOM/PeerJS), and exercises solo + host + client code paths.
// Run: node tools/smoke-test.cjs
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// Grab the LAST <script> block that has no src= (the inline game script).
const scripts = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const code = scripts.sort((a, b) => b.length - a.length)[0];
if (!code || code.length < 5000) { console.error("FAIL: could not extract game script"); process.exit(1); }

// ---- stubs ----
function ctxStub() {
  return new Proxy({}, {
    get(_, k) {
      if (k === "measureText") return () => ({ width: 42 });
      if (k === "createRadialGradient" || k === "createLinearGradient")
        return () => ({ addColorStop() {} });
      if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (k === "canvas") return { width: 800, height: 450 };
      if (k === "save" || k === "restore") return () => {};
      return () => {};
    },
    set() { return true; },
  });
}
function canvasStub() {
  return {
    width: 800, height: 450, style: {},
    getContext: () => ctxStub(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    addEventListener() {}, removeEventListener() {},
    setAttribute() {},
  };
}
const elStub = () => new Proxy({
  style: {}, classList: { add() {}, remove() {}, toggle() {} },
  addEventListener() {}, removeEventListener() {}, appendChild() {},
  setAttribute() {}, getContext: () => ctxStub(), focus() {}, getBoundingClientRect: () => ({ left:0, top:0, width:800, height:450 }),
  width: 800, height: 450,
}, { get(t, k) { return k in t ? t[k] : (typeof k === "string" ? (() => {}) : undefined); }, set() { return true; } });

const documentStub = {
  getElementById: (id) => (id === "game" || id === "c" || id === "canvas") ? canvasStub() : elStub(),
  querySelector: () => elStub(),
  createElement: (t) => (t === "canvas" ? canvasStub() : elStub()),
  addEventListener() {}, removeEventListener() {},
  body: elStub(), documentElement: elStub(),
  visibilityState: "visible",
  fonts: { ready: Promise.resolve(), load: () => Promise.resolve() },
};

// PeerJS stub — captures handlers so we can drive host/client paths.
const peers = [];
class FakeConn {
  constructor(peerId) { this.peer = peerId; this.open = true; this._h = {}; this.sent = []; }
  on(ev, fn) { this._h[ev] = fn; return this; }
  emit(ev, d) { if (this._h[ev]) this._h[ev](d); }
  send(d) { this.sent.push(d); }
  close() { this.open = false; this.emit("close"); }
}
class FakePeer {
  constructor(id) { this.id = id || ("rand-" + peers.length); this._h = {}; peers.push(this); }
  on(ev, fn) { this._h[ev] = fn; if (ev === "open") setTimeout(() => fn(this.id), 0); return this; }
  emit(ev, d) { if (this._h[ev]) this._h[ev](d); }
  connect() { return new FakeConn(this.id); }
  destroy() { this.destroyed = true; }
}

const sandbox = {
  window: {}, document: documentStub,
  navigator: { userAgent: "node", maxTouchPoints: 0, serviceWorker: undefined },
  location: { href: "http://localhost/", origin: "http://localhost", reload() {} },
  localStorage: { _d: {}, getItem(k){ return this._d[k] ?? null; }, setItem(k,v){ this._d[k]=""+v; }, removeItem(k){ delete this._d[k]; } },
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => 0 },
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, isFinite,
  parseInt, parseFloat, Float32Array, Uint8ClampedArray, Uint8Array, Set, Map, Symbol,
  Peer: FakePeer, prompt: () => "ABCDE", alert: () => {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  innerWidth: 800, innerHeight: 450, devicePixelRatio: 1, matchMedia: () => ({ matches: false, addListener(){}, addEventListener(){} }),
};
// deeply permissive proxy for the Web Audio API (every access/call returns another)
function anyProxy() {
  const f = function () { return anyProxy(); };
  return new Proxy(f, {
    get(t, k) { if (k === "value" || k === "currentTime" || k === "gain" || k === "destination") return anyProxy(); if (k === Symbol.toPrimitive) return () => 0; return anyProxy(); },
    apply() { return anyProxy(); }, set() { return true; }, construct() { return anyProxy(); },
  });
}
sandbox.AudioContext = function () { return anyProxy(); };
sandbox.webkitAudioContext = sandbox.AudioContext;
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.createContext(sandbox);

// expose internals: append a hook that pushes the functions/vars we want onto window
const harness = code + "\n;window.__T = { startMatch, update, render, game, tallyTerritory, " +
  "netHost, netStartHost, netJoin, buildSnapshot, netApply, gatherNetInput, driveHumanShark, lobbyTap, hostOnConnect, hostOnData, allPlayersReady, canStartMatch, netRematch, clientOnData, clientLostHost, onSplash, deathBurst, resultCanSkip, menuTap, handleEnter, " +
  "get resultAnim(){return resultAnim;}, " +
  "get sharks(){return sharks;}, get net(){return net;}, get localFaction(){return localFaction;}, get player(){return player;}, get enemies(){return enemies;}, get netEvents(){return netEvents;}, get localProj(){return localProj;} };\n";

try {
  vm.runInContext(harness, sandbox, { filename: "index.inline.js" });
} catch (e) {
  console.error("FAIL: script threw on load:\n", e && e.stack || e); process.exit(1);
}

const T = sandbox.__T;
let ok = true;
const check = (c, m) => { if (!c) { ok = false; console.error("  ✗ " + m); } else console.log("  ✓ " + m); };

// ---- 1) SOLO ----
console.log("[solo]");
T.startMatch();
check(sandbox.__T.sharks.length === 4, "4 sharks created");
check(sandbox.__T.player.faction === 0, "player is faction 0");
check(sandbox.__T.enemies.every(e => e.isBot), "3 enemy bots");
for (let i = 0; i < 240; i++) T.update(0.016);
const tally = T.tallyTerritory();
check(tally.reduce((a, b) => a + b, 0) > 0, "tiles painted: [" + tally.join(",") + "]");

// render every state
const states = ["TITLE","WEAPONSELECT","SETTINGS","HOWTO","CREDITS","LOBBY","PLAYING","PAUSED","GAMEOVER","VICTORY"];
for (const s of states) {
  sandbox.__T.game.state = s;
  try { T.render(); console.log("  ✓ render " + s); }
  catch (e) { ok = false; console.error("  ✗ render " + s + ": " + (e && e.message)); }
}

// ---- 2) HOST ----
console.log("[host]");
sandbox.__T.game.state = "TITLE";
T.netHost();
const hp = peers[peers.length - 1];
check(!!hp, "host Peer created");
// simulate a client connecting
const conn = new FakeConn(hp.id);
// trigger host's "connection" handler
hp.emit("connection", conn);
conn.emit("open");
check(sandbox.__T.net.players.length === 2, "host roster has 2 after join");
check(conn.sent.some(m => m.t === "assign"), "host sent assign");
conn.emit("data", { t: "join", name: "Bob", weaponIdx: 1 });
conn.emit("data", { t: "ready", ready: true });
T.netStartHost();
check(sandbox.__T.game.state === "PLAYING", "host match started");
check(!sandbox.__T.sharks[1].isBot, "joined faction is human-controlled");
// feed input + run host frames
conn.emit("data", { t: "input", in: { ix: 1, iy: 0, aim: 0, fire: 1, dive: 0, ulti: 0 } });
sandbox.__T.game.countdown = -1;  // skip countdown
for (let i = 0; i < 120; i++) T.update(0.016);
check(conn.sent.some(m => m.t === "snap"), "host broadcast snapshots");
const snap = T.buildSnapshot();
check(snap.s.length === 4 && Array.isArray(snap.tiles), "snapshot well-formed (sharks+tiles)");
// disconnect → faction reverts to bot
conn.close();
check(sandbox.__T.sharks[1].isBot, "disconnected faction reverted to bot");

// ---- 3) CLIENT ----
console.log("[client]");
sandbox.__T.net.role = null; sandbox.__T.game.state = "TITLE";
T.netJoin("ABCDE");
const cp = peers[peers.length - 1];
check(!!cp, "client Peer created");
// host assigns us faction 2 + start
sandbox.__T.net.hostConn = { open: true, send(){}, on(){} };
// directly drive client message handler via a crafted snapshot apply
sandbox.__T.game.state = "PLAYING";
// build a snapshot as if from host (reuse current sharks), then apply on a fresh client setup
T.startMatch({ localFaction: 2, humans: [0, 2], weapons: {}, stage: 0, netRole: "client" });
check(sandbox.__T.localFaction === 2, "client localFaction = 2");
check(sandbox.__T.player.faction === 2, "client player = faction 2 shark");
const fakeSnap = T.buildSnapshot();  // shape-compatible
fakeSnap.s[0].x = 5.5; fakeSnap.s[0].hp = 33;
T.netApply(fakeSnap);
check(sandbox.__T.sharks[0].netX === 5.5, "client applied shark netX");
check(sandbox.__T.sharks[0].hp === 33, "client applied shark hp");
const inp = T.gatherNetInput();
check(typeof inp.aim === "number" && "fire" in inp, "client gathered input");
for (let i = 0; i < 60; i++) T.update(0.016);  // client tick (no sim)
check(true, "client frames ran without error");

// ---- 3b) CLIENT-SIDE PREDICTION ----
console.log("[prediction]");
// still net.role === "client", localFaction 2, game.state PLAYING
sandbox.__T.game.countdown = -1;                 // past the freeze
const me = sandbox.__T.player;
me.dead = false;
// start in the open plaza (map centre) so movement isn't wall-blocked
me.x = me.y = 12; me.netX = 12; me.netY = 12;
const px0 = me.x, py0 = me.y;
vm.runInContext('keys["w"] = true;', sandbox);   // hold "up"
for (let i = 0; i < 20; i++) { me.netX = me.x; me.netY = me.y; T.update(0.016); }  // no real snapshots
vm.runInContext('keys["w"] = false;', sandbox);
const moved = Math.hypot(me.x - px0, me.y - py0);
check(moved > 0.3, "prediction: held input moved local shark without a snapshot (" + moved.toFixed(2) + ")");
// a far-off authoritative position → hard snap (respawn / knockback)
me.netX = me.x + 6; me.netY = me.y + 6;
T.update(0.016);
check(Math.abs(me.x - me.netX) < 0.01 && Math.abs(me.y - me.netY) < 0.01, "prediction: big error hard-snaps to authoritative");
// a tiny offset → gentle correction, NOT a teleport
me.x = me.netX; me.y = me.netY;
me.netX = me.x + 0.4; me.netY = me.y;
const before = me.x;
T.update(0.016);
check(me.x > before && Math.abs(me.x - me.netX) > 0.0, "prediction: small error corrects gently (no teleport)");
// dead → no prediction, snaps to authoritative
me.dead = true; me.x = 2; me.y = 2; me.netX = 9; me.netY = 9;
T.update(0.016);
check(me.x === 9 && me.y === 9, "prediction: dead shark snaps (no predicted movement)");
me.dead = false;

// ---- 4) PERF MODE ----
console.log("[perf]");
sandbox.__T.net.role = null;
sandbox.__T.game.state = "PLAYING";
// flip perf on via the live settings object inside the sandbox
vm.runInContext("settings.perf = true; resize();", sandbox);
T.startMatch();
sandbox.__T.game.countdown = -1;
let perfErr = null;
try {
  for (let i = 0; i < 180; i++) { T.update(0.016); T.render(); }
  for (const s of ["TITLE","LOBBY","PLAYING"]) { sandbox.__T.game.state = s; T.render(); }
} catch (e) { perfErr = e; }
check(!perfErr, perfErr ? ("perf render: " + perfErr.message) : "perf-mode frames + render OK");
const pcount = vm.runInContext("particles.length", sandbox);
check(pcount <= 70, "particle pool bounded in perf mode (" + pcount + " <= 70)");
vm.runInContext("settings.perf = false; resize();", sandbox);

// ---- 5) START GUARD: host can't start until ready ----
console.log("[start-guard]");
// (a) host ALONE (no joiners) cannot start
vm.runInContext("netReset();", sandbox);
sandbox.__T.game.state = "LOBBY";
T.netHost();
check(sandbox.__T.net.players.length === 1, "guard: host alone in room");
check(vm.runInContext("canStartMatch()", sandbox) === false, "guard: canStartMatch false with no joiners");
T.render();
let startRect = vm.runInContext("lobbyUI.start", sandbox);
T.lobbyTap({ x: startRect.x + 2, y: startRect.y + 2 });
check(sandbox.__T.game.state === "LOBBY", "guard: host-alone START is blocked");
check(/waiting for players to join/i.test(sandbox.__T.net.status), "guard: 'waiting to join' status set");

// (b) joiner present but NOT ready → blocked, even on repeated taps (no force start)
const hp2 = peers[peers.length - 1];
const c2 = new FakeConn(hp2.id);
hp2.emit("connection", c2); c2.emit("open");
check(sandbox.__T.net.players.length === 2, "guard: player joined (not ready)");
check(vm.runInContext("canStartMatch()", sandbox) === false, "guard: canStartMatch false while joiner pending");
T.render();
startRect = vm.runInContext("lobbyUI.start", sandbox);
T.lobbyTap({ x: startRect.x + 2, y: startRect.y + 2 });
check(sandbox.__T.game.state === "LOBBY", "guard: not-ready START blocked (tap 1)");
T.lobbyTap({ x: startRect.x + 2, y: startRect.y + 2 });
check(sandbox.__T.game.state === "LOBBY", "guard: not-ready START still blocked (tap 2, no force start)");
check(/can't start/i.test(sandbox.__T.net.status), "guard: 'can't start' status set");

// (c) joiner readies → START allowed
c2.emit("data", { t: "ready", ready: true });
check(vm.runInContext("canStartMatch()", sandbox) === true, "guard: canStartMatch true once joiner readies");
T.render();
startRect = vm.runInContext("lobbyUI.start", sandbox);
T.lobbyTap({ x: startRect.x + 2, y: startRect.y + 2 });
check(sandbox.__T.game.state === "PLAYING", "guard: START allowed when joined + all ready");

// ---- 6) LOBBY POLISH: weapon picker, host stage broadcast, client weapon msg ----
console.log("[lobby-polish]");
// host changes stage in lobby → broadcasts {t:"stage"} to the joined client
vm.runInContext("netReset();", sandbox);
sandbox.__T.game.state = "LOBBY";
T.netHost();
const hp4 = peers[peers.length - 1];
const c4 = new FakeConn(hp4.id);
hp4.emit("connection", c4); c4.emit("open");
c4.sent.length = 0;  // clear assign
T.render();  // populate selector rects
const sNext = vm.runInContext("lobbyUI.sNext", sandbox);
check(!!sNext, "polish: host has STAGE arrows");
const stageBefore = vm.runInContext("currentLayout", sandbox);
T.lobbyTap({ x: sNext.x + 2, y: sNext.y + 2 });
const stageAfter = vm.runInContext("currentLayout", sandbox);
check(stageAfter !== stageBefore, "polish: host stage cycled");
check(c4.sent.some(m => m.t === "stage" && m.stage === stageAfter), "polish: host broadcast {stage}");
// host changes own weapon → reflected in roster[0].weaponIdx (used at start)
const wNext = vm.runInContext("lobbyUI.wNext", sandbox);
const wBefore = vm.runInContext("weaponSel", sandbox);
T.lobbyTap({ x: wNext.x + 2, y: wNext.y + 2 });
const wAfter = vm.runInContext("weaponSel", sandbox);
check(wAfter !== wBefore, "polish: host weapon cycled");
check(sandbox.__T.net.players[0].weaponIdx === wAfter, "polish: host roster weapon updated");
// a 2nd client joins (faction 2) and sends a weapon pick → host records it
const c5 = new FakeConn(hp4.id);
hp4.emit("connection", c5); c5.emit("open");
const p2before = sandbox.__T.net.players.find(p => p.faction === 2);
check(!!p2before, "polish: 2nd client assigned faction 2");
c5.emit("data", { t: "weapon", weaponIdx: 3 });
const p2 = sandbox.__T.net.players.find(p => p.faction === 2);
check(p2 && p2.weaponIdx === 3, "polish: client weapon msg updates host roster");

// ---- 7) REMATCH FLOW ----
console.log("[rematch]");
vm.runInContext("netReset();", sandbox);
sandbox.__T.game.state = "LOBBY";
T.netHost();
const hpR = peers[peers.length - 1];
const cR = new FakeConn(hpR.id);
hpR.emit("connection", cR); cR.emit("open");
cR.emit("data", { t: "ready", ready: true });
T.netStartHost();
check(sandbox.__T.game.state === "PLAYING", "rematch: match started");
cR.sent.length = 0;
// run the clock to 0 → host endMatch → result + {t:'end'}
sandbox.__T.game.countdown = -1; sandbox.__T.game.time = 0.01;
T.update(0.05);
check(["VICTORY", "GAMEOVER"].includes(sandbox.__T.game.state), "rematch: match ended to result");
check(cR.sent.some(m => m.t === "end"), "rematch: host broadcast {end}");
// host taps PLAY AGAIN
cR.sent.length = 0;
T.netRematch();
check(sandbox.__T.game.state === "LOBBY", "rematch: host returned to LOBBY (room intact)");
check(sandbox.__T.net.started === false, "rematch: started flag cleared");
const j = sandbox.__T.net.players.find(p => p.faction === 1);
check(j && j.ready === false, "rematch: joiner readiness reset");
check(cR.sent.some(m => m.t === "rematch"), "rematch: host broadcast {rematch}");
// host can start a fresh match again with the same room
cR.emit("data", { t: "ready", ready: true });
T.netStartHost();
check(sandbox.__T.game.state === "PLAYING", "rematch: same room starts a new match");
// client receiving a rematch message returns to its lobby
sandbox.__T.net.role = "client"; sandbox.__T.game.state = "VICTORY";
T.clientOnData({ t: "rematch" });
check(sandbox.__T.game.state === "LOBBY", "rematch: client returns to lobby on {rematch}");

// ---- 8) HIT/DEATH VFX EVENTS (host emits, client replays) ----
console.log("[vfx-events]");
vm.runInContext("netReset();", sandbox);
sandbox.__T.game.state = "LOBBY";
T.netHost();
const hpV = peers[peers.length - 1];
const cV = new FakeConn(hpV.id); hpV.emit("connection", cV); cV.emit("open");
cV.emit("data", { t: "ready", ready: true });
T.netStartHost();
sandbox.__T.game.countdown = -1;
// host produces a bullet splash (hit) + a death burst → buffered as events
T.onSplash(6, 6, 0, "#2ccada", "#157f90", 2.2, 12);
T.deathBurst(7, 7, "#d94bc0");
const snapV = T.buildSnapshot();
check(Array.isArray(snapV.ev) && snapV.ev.length >= 2, "vfx: snapshot carries events (" + snapV.ev.length + ")");
check(snapV.ev.some(e => e.k === 1) && snapV.ev.some(e => e.k === 2), "vfx: both splash + death events present");
// client replays them through the same VFX without error
sandbox.__T.net.role = "client";
let evErr = null; try { T.netApply(snapV); } catch (e) { evErr = e; }
check(!evErr, evErr ? ("vfx replay: " + evErr.message) : "vfx: client replays events without error");
check(sandbox.__T.netEvents.length === 0, "vfx: event buffer drained by snapshot");

// ---- 9) LOCAL FIRE PREDICTION (client) ----
console.log("[fire-predict]");
vm.runInContext("netReset();", sandbox);
sandbox.__T.net.role = "client";
sandbox.__T.localFaction = 0;
T.startMatch({ localFaction: 0, humans: [0], weapons: {}, stage: 0, netRole: "client" });
sandbox.__T.game.state = "PLAYING"; sandbox.__T.game.countdown = -1;
const meF = sandbox.__T.player;
meF.dead = false; meF.diving = false; meF.ink = 100; meF.shootCd = 0;
meF.netX = meF.x; meF.netY = meF.y;
vm.runInContext('keys[" "] = true;', sandbox);   // hold fire
T.update(0.016);
vm.runInContext('keys[" "] = false;', sandbox);
check(sandbox.__T.localProj.length > 0, "fire: pressing fire spawns a predicted projectile");
check(meF.ink < 100, "fire: predicted shot consumed local ink estimate");
let fpErr = null; try { for (let i = 0; i < 200; i++) T.update(0.016); } catch (e) { fpErr = e; }
check(!fpErr, fpErr ? ("fire update: " + fpErr.message) : "fire: predicted projectiles travel + expire without error");

// ---- 10) CONNECTION ROBUSTNESS ----
console.log("[robustness]");
// (a) join timeout: never opens → fails back to the choice screen after JOIN_TIMEOUT
vm.runInContext("netReset();", sandbox);
sandbox.__T.game.state = "LOBBY";
T.netJoin("ZZZZZ");
check(sandbox.__T.net.connecting === true && sandbox.__T.net.role === "client", "robust: join sets connecting");
for (let i = 0; i < 110; i++) T.update(0.1);   // ~11s of frames (> JOIN_TIMEOUT)
check(sandbox.__T.net.connecting === false, "robust: connecting cleared after timeout");
check(sandbox.__T.net.role === null && sandbox.__T.net.mode === null, "robust: timeout returns to choice screen");
check(/couldn't connect/i.test(sandbox.__T.net.status), "robust: timeout sets a clear status");

// (b) bad code: peer 'peer-unavailable' error → 'Room not found'
vm.runInContext("netReset();", sandbox);
sandbox.__T.game.state = "LOBBY";
T.netJoin("NOPE1");
const badPeer = peers[peers.length - 1];
badPeer.emit("error", { type: "peer-unavailable" });
check(/room not found/i.test(sandbox.__T.net.status), "robust: bad code → 'room not found'");
check(sandbox.__T.net.role === null, "robust: bad code returns to choice screen");

// (c) host leaves mid-match: conn close → back to lobby with a reason (not silent)
vm.runInContext("netReset();", sandbox);
vm.runInContext('net.role = "client"; net.started = true;', sandbox);
sandbox.__T.game.state = "PLAYING";
T.clientLostHost();
check(/host left/i.test(sandbox.__T.net.status), "robust: lost host → 'host left' message");
check(sandbox.__T.game.state === "LOBBY" && sandbox.__T.net.role === null, "robust: lost host returns to lobby choice");

// (d) assign clears the connecting flag
vm.runInContext('netReset(); net.role = "client"; net.connecting = true;', sandbox);
T.clientOnData({ t: "assign", faction: 1, code: "ABCDE" });
check(sandbox.__T.net.connecting === false, "robust: assign clears connecting flag");

// ---- 11) RESULT SCREEN REVEAL ANIMATION ----
console.log("[result-anim]");
vm.runInContext("netReset();", sandbox);
T.startMatch();
sandbox.__T.game.countdown = -1; sandbox.__T.game.time = 0.01;
T.update(0.05);   // clock hits 0 -> endMatch() -> startResultAnim()
check(["VICTORY", "GAMEOVER"].includes(sandbox.__T.game.state), "anim: match ended to a result state");
check(!!sandbox.__T.resultAnim, "anim: startResultAnim populated resultAnim");
check(Array.isArray(sandbox.__T.resultAnim.drops) && sandbox.__T.resultAnim.drops.length > 0, "anim: ink-rain drops generated");
check(sandbox.__T.resultAnim.t === 0, "anim: reveal clock starts at 0");
// too early to skip: tapping/Enter must NOT leave the result screen yet
check(T.resultCanSkip() === false, "anim: resultCanSkip false immediately after match end");
const stateBefore = sandbox.__T.game.state;
T.menuTap({ x: -9999, y: -9999 });   // miss all rects; solo branch would normally always fire
check(sandbox.__T.game.state === stateBefore, "anim: early tap does not skip the reveal");
T.handleEnter();
check(sandbox.__T.game.state === stateBefore, "anim: early Enter does not skip the reveal");
// render mid-reveal at a few timestamps without throwing (panel bounce / ink rain / clip paths)
let animErr = null;
try {
  for (const tt of [0.05, 0.2, 0.45, 0.7, 1.0]) { sandbox.__T.resultAnim.t = tt; T.render(); }
} catch (e) { animErr = e; }
check(!animErr, animErr ? ("mid-reveal render: " + animErr.message) : "anim: renders cleanly through the reveal timeline");
// advance past RESULT_HOLD -> now skippable, and a tap actually leaves the screen
vm.runInContext("resultAnim.t = 5;", sandbox);
check(T.resultCanSkip() === true, "anim: resultCanSkip true once the reveal has played out");
T.render();   // populate any button rects at full reveal
T.menuTap({ x: -9999, y: -9999 });
check(sandbox.__T.game.state === "TITLE", "anim: post-reveal tap returns to TITLE (solo)");
// leaving VICTORY/GAMEOVER clears resultAnim (updateResultAnim resets it)
T.update(0.016);
check(sandbox.__T.resultAnim === null, "anim: resultAnim cleared after leaving the result state");
// drawResult must also tolerate resultAnim being null (state forced directly, as in the render-every-state loop above)
sandbox.__T.game.state = "VICTORY";
let nullAnimErr = null;
try { T.render(); } catch (e) { nullAnimErr = e; }
check(!nullAnimErr, nullAnimErr ? ("null-resultAnim render: " + nullAnimErr.message) : "anim: renders fine with no resultAnim (fully-revealed fallback)");

console.log(ok ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
process.exit(ok ? 0 : 1);
