// Run with Node.js 20+: node tests/game-regression.mjs
// Private test instrumentation exists only inside this VM; the shipped game has no debug API.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const noop = () => {};
const gradient = { addColorStop: noop };
const paint = new Proxy(
  {
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
  },
  { get: (target, key) => target[key] ?? noop },
);
const elements = new Map();
function element(id) {
  if (!elements.has(id))
    elements.set(id, {
      hidden: true,
      disabled: false,
      innerHTML: "",
      textContent: "",
      dataset: {},
      classList: { add: noop, remove: noop, toggle: noop },
      style: { setProperty: noop },
      focus: noop,
      setAttribute: noop,
      addEventListener: noop,
      querySelectorAll: () => [
        element("heart1"),
        element("heart2"),
        element("heart3"),
      ],
      getContext: () => paint,
    });
  return elements.get(id);
}
const storage = new Map();
const sandbox = {
  console,
  atob,
  Uint8Array,
  Math: Object.create(Math),
  Image: class {
    complete = true;
    naturalWidth = 1962;
    naturalHeight = 802;
    get src() {
      return this.url || "";
    }
    addEventListener(type, callback) {
      (this.events ||= {})[type] = callback;
    }
    removeEventListener(type) {
      delete this.events?.[type];
    }
    set src(value) {
      this.url = value;
      queueMicrotask(() => this.events?.load?.());
      if (value.includes("platform")) {
        this.naturalWidth = 2172;
        this.naturalHeight = 230;
      }
    }
  },
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  CustomEvent: class {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
  matchMedia: () => ({ matches: false }),
  document: {
    hidden: false,
    body: element("body"),
    querySelector: element,
    getElementById: (id) => element("#" + id),
    createElement: () => element(Symbol()),
    addEventListener: noop,
    dispatchEvent: noop,
  },
  addEventListener: noop,
  requestAnimationFrame: (cb) => {
    sandbox.frame = cb;
  },
  setTimeout: noop,
};
sandbox.window = sandbox;
sandbox.Math.random = () => 0.5;
const context = vm.createContext(sandbox);
for (const file of ["animation-config.js", "collision-masks.js", "game.js"]) {
  let source = fs.readFileSync(path.join(root, file), "utf8");
  if (file === "game.js")
    source = source.replace(
      "  window.UgolnyGameAPI = Object.freeze({",
      "  window.__qa={game,reset,jump,update,speedAt,jumpTiming,collision,PLAYER_X,RUNWAY_Y,GROUND_ANCHOR,SPRITE_W,SPRITE_H,W};\n  window.UgolnyGameAPI = Object.freeze({",
    );
  vm.runInContext(source, context, { filename: file });
}
await new Promise((resolve) => setImmediate(resolve));
const q = sandbox.__qa,
  g = q.game;
assert.ok(q, "Test instrumentation must match game.js");
for (const [seconds, multiplier] of [
  [0, 1],
  [180, 2],
  [600, 5],
  [1800, 13],
  [3600, 13],
])
  assert.equal(q.speedAt(seconds), 355 * multiplier);
const duration = 1860;
const stress = [];
for (const fps of [15, 20, 30, 60, 120]) {
  sandbox.UgolnyGameAPI.begin();
  assert.equal(g.state, "running");
  g.invulnerable = 1e9; // Stress the timer, spawner and resource lifetime; survival is tested separately below.
  sandbox.frame(0);
  let maxObstacles = 0,
    maxParticles = 0;
  for (let frame = 1; frame <= duration * fps; frame++) {
    sandbox.frame((frame * 1000) / fps);
    maxObstacles = Math.max(maxObstacles, g.obstacles.length);
    maxParticles = Math.max(maxParticles, g.particles.length);
  }
  assert.ok(
    Math.abs(g.elapsed - duration) < 0.002,
    `Elapsed time at ${fps} FPS: ${g.elapsed}`,
  );
  assert.equal(g.speed, 4615);
  assert.equal(g.state, "running");
  assert.ok(
    maxObstacles < 30 && maxParticles < 150,
    "Objects must be retired, not accumulate forever",
  );
  stress.push({
    fps,
    seconds: Number(g.elapsed.toFixed(3)),
    maxObstacles,
    maxParticles,
  });
}
for (let frame = 0; frame < 12; frame++) {
  const catY = q.RUNWAY_Y - q.GROUND_ANCHOR;
  for (const clearance of [162, 168, 174]) {
    for (let offset = 0; offset < 316; offset += 6) {
      const jar = {
        x: q.PLAYER_X + offset,
        y: q.RUNWAY_Y - clearance - 174,
        w: (174 * 774) / 909,
        h: 174,
      };
      assert.equal(
        q.collision.touching(
          "run",
          frame,
          q.PLAYER_X,
          catY,
          jar,
          q.SPRITE_W,
          q.SPRITE_H,
        ),
        false,
        "Hanging jar must clear every running pose",
      );
    }
  }
}
const timeAtMultiplier = (k) =>
  k <= 2 ? (k - 1) * 180 : k <= 5 ? 180 + (k - 2) * 140 : 600 + (k - 5) * 150;
function isolatedFloor(multiplier, jumpAt = Infinity) {
  q.reset();
  g.state = "running";
  g.elapsed = timeAtMultiplier(multiplier);
  g.speed = q.speedAt(g.elapsed);
  g.nextSpawnGap = Infinity;
  g.nightNext = Infinity;
  const jar = {
    x: q.W + 35,
    y: q.RUNWAY_Y - 174,
    w: (174 * 774) / 909,
    h: 174,
    kind: "floor",
    hit: false,
  };
  g.obstacles = [jar];
  const duration = (jar.x + jar.w - q.PLAYER_X) / g.speed + 0.5;
  let jumped = false;
  for (let time = 0; time < duration; time += 1 / 240) {
    if (!jumped && time >= jumpAt) {
      q.jump();
      jumped = true;
    }
    q.update(1 / 240);
    if (g.health < 3) return { ok: false, hitAt: time };
  }
  return { ok: true };
}
const windows = [];
for (let multiplier = 1; multiplier <= 13; multiplier++) {
  const unprotected = isolatedFloor(multiplier);
  assert.equal(
    unprotected.ok,
    false,
    "A floor jar must collide without a jump",
  );
  let success = false;
  const pace = q.jumpTiming(355 * multiplier);
  for (
    let lead = pace.takeoff + pace.rise + 0.03;
    lead >= 0.005;
    lead -= 1 / 240
  ) {
    const jumpAt = Math.max(0, unprotected.hitAt - lead);
    if (isolatedFloor(multiplier, jumpAt).ok) {
      success = true;
      windows.push({ multiplier, jumpAt: Number(jumpAt.toFixed(4)) });
      break;
    }
  }
  assert.ok(success, `A floor jar must have a valid jump at ×${multiplier}`);
}
console.log(
  JSON.stringify(
    { stress, isolatedFloorJumps: windows, hangingMaskChecks: 12 * 3 * 53 },
    null,
    2,
  ),
);
