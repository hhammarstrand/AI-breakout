// Game state, persisted in localStorage. Nothing here is a secret: answers
// are never stored client-side, only the fragments a team already earned.
// Editing it only lies to yourself — receipts are verified by the facilitator.

const KEY = "blackout-ctf.v1"; // distinct from the main game on the same origin
export const MISSIONS = ["A", "B", "C", "F"];
const BASE_POINTS = 250;
const HINT_COST = 25;
const WRONG_COST = 10;
const DECOY_COST = 50;
const MIN_POINTS = 50;

const zero = () => Object.fromEntries(MISSIONS.map((m) => [m, 0]));

const initial = () => ({
  build: null,
  team: null,
  mission: null,         // active mission id, null = hub
  containmentStart: null,
  audio: true,
  solved: {},            // id -> { points, receipt, at }
  fragments: {},         // "A" | "B" | "C" -> token
  hints: zero(),
  wrong: zero(),
  decoys: zero(),
});

let cache = initial();

export const state = {
  load(build) {
    try {
      const raw = localStorage.getItem(KEY);
      cache = raw ? { ...initial(), ...JSON.parse(raw) } : initial();
    } catch {
      cache = initial();
    }
    if (cache.build !== build) cache = { ...initial(), build, audio: cache.audio };
    this.save();
    return cache;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
  },
  reset() {
    cache = { ...initial(), build: cache.build };
    this.save();
  },
  get() { return cache; },

  bump(kind, id) { cache[kind][id] += 1; this.save(); },

  points(id) {
    const paidHints = Math.max(0, cache.hints[id] - 1);
    const wrong = id === "C" ? 0 : cache.wrong[id];
    return Math.max(MIN_POINTS, BASE_POINTS - HINT_COST * paidHints - WRONG_COST * wrong - DECOY_COST * cache.decoys[id]);
  },

  score() {
    return Object.values(cache.solved).reduce((a, s) => a + s.points, 0);
  },

  costs: { HINT_COST, WRONG_COST, DECOY_COST },

  containmentRemainingMs(durationMs = 60 * 60 * 1000) {
    if (!cache.containmentStart) return durationMs;
    return Math.max(0, durationMs - (Date.now() - cache.containmentStart));
  },

  toggleAudio() { cache.audio = !cache.audio; this.save(); return cache.audio; },
};
