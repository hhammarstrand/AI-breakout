// Deterministic RNG derived from the secret seed + a label, so every
// puzzle is reproducible from BLACKOUT_SEED alone (build + verify agree).

import { createHash } from "node:crypto";

export function makeRng(seed, label) {
  const h = createHash("sha256").update(`${seed}::${label}`).digest();
  let a = h.readUInt32LE(0), b = h.readUInt32LE(4), c = h.readUInt32LE(8), d = h.readUInt32LE(12);
  // sfc32
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int(lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
    shuffle(arr) {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
    hex(n) { let s = ""; for (let i = 0; i < n; i++) s += "0123456789ABCDEF"[Math.floor(next() * 16)]; return s; },
    token(n) {
      const al = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let s = ""; for (let i = 0; i < n; i++) s += al[Math.floor(next() * al.length)]; return s;
    },
    gauss(mu = 0, sd = 1) {
      const u = Math.max(1e-12, next()), v = next();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
  return rng;
}

export const fmtTime = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
};
