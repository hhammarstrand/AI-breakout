// Mission C — door agent. Ten chained rounds of time-dependent routing.
//
// Rules (shown to players):
//   - At tick 0 the drone is in `start`. Each tick it either WAITS or passes
//     through one door that is open at that tick, arriving at tick+1.
//   - Door is open at tick t  iff  (t + phase) % period < open.
//   - Never enter a hostile room.
//   - Answer: the door sequence that reaches `goal` at the earliest tick.
// The generator guarantees exactly one door sequence achieves it, and for
// timed rounds that naive static BFS gives a different (wrong) answer.

import { makeRng } from "../rng.mjs";

const TMAX = 400;
export const ROUNDS = 10;

function earliest(sc) {
  const adj = adjacency(sc);
  const hostile = new Set(sc.hostile);
  let frontier = new Set([sc.start]);
  for (let t = 0; t < TMAX; t++) {
    if (frontier.has(sc.goal)) return t;
    const next = new Set(frontier); // waiting
    for (const room of frontier) {
      for (const e of adj.get(room) || []) {
        if (hostile.has(e.to)) continue;
        if ((t + e.d.phase) % e.d.period < e.d.open) next.add(e.to);
      }
    }
    frontier = next;
  }
  return -1;
}

function adjacency(sc) {
  const adj = new Map();
  for (const d of sc.doors) {
    if (!adj.has(d.a)) adj.set(d.a, []);
    if (!adj.has(d.b)) adj.set(d.b, []);
    adj.get(d.a).push({ d, to: d.b });
    adj.get(d.b).push({ d, to: d.a });
  }
  return adj;
}

// Distinct door sequences that reach goal exactly at T (capped at 2).
function sequences(sc, T) {
  const adj = adjacency(sc);
  const hostile = new Set(sc.hostile);
  const memo = new Map();
  const go = (room, t) => {
    if (room === sc.goal && t === T) return [""];
    if (t >= T) return [];
    const k = room + "@" + t;
    if (memo.has(k)) return memo.get(k);
    const out = new Set(go(room, t + 1));
    for (const e of adj.get(room) || []) {
      if (out.size > 2) break;
      if (hostile.has(e.to) || (t + e.d.phase) % e.d.period >= e.d.open) continue;
      for (const s of go(e.to, t + 1)) { out.add(s ? `${e.d.id} ${s}` : e.d.id); if (out.size > 2) break; }
    }
    const res = [...out].slice(0, 3);
    memo.set(k, res);
    return res;
  };
  return go(sc.start, 0);
}

function staticBfs(sc) {
  const adj = adjacency(sc);
  const hostile = new Set(sc.hostile);
  const prev = new Map([[sc.start, null]]);
  const q = [sc.start];
  while (q.length) {
    const r = q.shift();
    if (r === sc.goal) break;
    for (const e of adj.get(r) || []) {
      if (hostile.has(e.to) || prev.has(e.to)) continue;
      prev.set(e.to, [r, e.d.id]);
      q.push(e.to);
    }
  }
  const seq = [];
  for (let r = sc.goal; prev.get(r); r = prev.get(r)[0]) seq.unshift(prev.get(r)[1]);
  return seq.join(" ");
}

function makeScenario(rng, round) {
  const timed = round > 3;
  const n = timed ? 30 + round * 5 : 14 + round * 5;
  const ids = rng.shuffle([...Array(900)].map((_, i) => 100 + i)).slice(0, n).map((x) => `R${x}`);
  const doorIds = rng.shuffle([...Array(900)].map((_, i) => 100 + i));
  const pairs = new Set();
  const doors = [];
  const add = (a, b) => {
    const key = a < b ? a + b : b + a;
    if (a === b || pairs.has(key)) return;
    pairs.add(key);
    const period = timed && !rng.chance(0.25) ? rng.int(2, 7) : 1;
    const open = period === 1 ? 1 : rng.int(1, period - 1);
    doors.push({ id: `D${doorIds[doors.length]}`, a, b, period, open, phase: period === 1 ? 0 : rng.int(0, period - 1) });
  };
  // Corridor-ish building: doors mostly connect nearby rooms, so routes are long.
  for (let i = 1; i < n; i++) add(ids[i], ids[rng.int(Math.max(0, i - 4), i - 1)]);
  for (let i = 0; i < n * 0.9; i++) { const a = rng.int(0, n - 1); add(ids[a], ids[Math.min(n - 1, a + rng.int(1, 5))]); }
  const start = ids[0];
  const goal = ids[n - 1];
  const hostile = rng.shuffle(ids.slice(1, -1)).slice(0, Math.round(n * 0.08)).sort();
  return {
    round, start, goal, hostile,
    doors: rng.shuffle(doors).sort((x, y) => x.id.localeCompare(y.id)),
  };
}

export function genDoors(seed) {
  const rng = makeRng(seed, "doors");
  const rounds = [];
  for (let r = 1; r <= ROUNDS; r++) {
    for (let attempt = 0; ; attempt++) {
      if (attempt > 2000) throw new Error(`could not generate round ${r}`);
      const sc = makeScenario(rng, r);
      // Repair ties: while several door sequences tie for earliest arrival,
      // remove a door that only an alternative uses.
      let T, seqs;
      for (let fix = 0; fix < 60; fix++) {
        T = earliest(sc);
        if (T < 0) break;
        seqs = sequences(sc, T);
        if (seqs.length === 1) break;
        const keep = new Set(seqs[0].split(" "));
        const alt = seqs.slice(1).flatMap((x) => x.split(" ")).filter((id) => !keep.has(id));
        if (!alt.length) break;
        const drop = rng.pick(alt);
        sc.doors = sc.doors.filter((d) => d.id !== drop);
      }
      if (T < (r > 3 ? 8 : 5) || seqs.length !== 1) continue;
      const answer = seqs[0];
      if (r > 3 && (answer.split(" ").length === T || staticBfs(sc) === answer)) continue;
      rounds.push({ scenario: sc, answer, arrival: T, attempts: attempt + 1 });
      break;
    }
  }
  return { rounds, fragment: `FC-${rng.token(4)}-${rng.token(4)}` };
}
