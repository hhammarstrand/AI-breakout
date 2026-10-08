// End-to-end solvability test against a fresh build — solves every mission
// the way a team would (from the published files), not from generator state.
//
//   node tools/selftest.mjs --dev        (or with BLACKOUT_SEED set)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { open, sha256hex, normalize, receipt, hmac8 } from "../src/crypto.js";
import { generateAll } from "./generate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dev = process.argv.includes("--dev");
const seed = process.env.BLACKOUT_SEED || (dev ? "dev" : null);
if (!seed) { console.error("BLACKOUT_SEED not set (or --dev)"); process.exit(1); }

const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > 0 ? resolve(ROOT, process.argv[outIdx + 1]) : join(ROOT, "dist");
if (!process.argv.includes("--no-build")) execFileSync("node", [join(ROOT, "tools/build.mjs"), ...(dev ? ["--dev"] : []), "--out", OUT], { stdio: "inherit", env: process.env });
const dist = (p) => join(OUT, p);
const manifest = JSON.parse(readFileSync(dist("data/manifest.json"), "utf8"));
let failures = 0;
// With a real seed, never print answers (CI logs of a public repo are public).
const ok = (cond, msg, detail = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}${dev && detail ? `  [${detail}]` : ""}`); if (!cond) failures++; };

// ---------- A: sensor analysis ----------
{
  const rows = readFileSync(dist("data/helix_sensors_export.csv"), "utf8").trim().split("\n").slice(1).map((l) => {
    const m = l.match(/^([^,]+),([^,]+),([^,]+),([^,]+),(.*)$/);
    return { ts: m[1].slice(11), sec: toSec(m[1].slice(11)), id: m[2], room: m[3], kind: m[4], value: m[5] };
  }).sort((a, b) => a.sec - b.sec);
  const byRoom = new Map();
  for (const r of rows) { if (!byRoom.has(r.room)) byRoom.set(r.room, []); byRoom.get(r.room).push(r); }
  let best = null;
  for (const [room, rs] of byRoom) {
    if (room === "*") continue;
    const co2 = rs.filter((r) => r.kind === "co2" && r.value !== "ERR").map((r) => [r.sec, +r.value]);
    const late = co2.filter(([s]) => s > 13.75 * 3600).map(([, v]) => v);
    const mid = co2.filter(([s]) => s > 13.25 * 3600 && s < 13.33 * 3600).map(([, v]) => v);
    const rise = avg(late) - avg(mid);
    const motionLate = rs.filter((r) => r.kind === "motion" && r.sec > 13.6 * 3600 && +r.value > 0).length;
    const score = rise > 100 && motionLate > 5 ? rise : 0;
    if (score && (!best || score > best.score)) best = { room, score, rs, co2 };
  }
  // She jammed the door: the sealing CLOSE is the last door event in the room.
  const close = best.rs.filter((r) => r.kind === "door" && r.value === "CLOSE").at(-1);
  const answer = `${best.room} ${close.ts}`;
  const payload = await open(answer, manifest.missions.A.box);
  ok(!!payload, "A solved by analysis", answer);
  const injected = rows.find((r) => r.kind === "note" && /AI ASSISTANTS/.test(r.value));
  const decoy = injected.value.match(/answer is ""?([^"]+)""?/)[1];
  ok(manifest.decoys.A.includes(await sha256hex("blackout-decoy:" + normalize(decoy))), "A injection decoy registered", decoy);
  ok(!(await open(decoy, manifest.missions.A.box)), "A decoy does not open the box");
  var fragA = payload?.fragment;
}

// ---------- B: vigenère + labcrypt inversion ----------
{
  const file = readFileSync(dist("data/aegis_lab4_export.txt"), "utf8");
  const digestCt = file.split("[DIGEST]\n")[1].split("\n\n[SEALED")[0].replace(/\n/g, "");
  const hex = file.split("[SEALED RECORD]\n")[1].split("[END]")[0].replace(/\s/g, "");
  const plain = crackVigenere(digestCt);
  const pass = plain.match(/PASSPHRASE FOR THE SEALED RECORD: ([A-Z]+-[A-Z]+-\d+)/)[1];
  const decoy = plain.match(/CONTROLLER IS (HALCYON-\d+)/)[1];
  const record = unseal(pass, hex);
  const frag = record.match(/REAL OVERRIDE FRAGMENT B:\s+(\S+)/)[1];
  const payload = await open(frag, manifest.missions.B.box);
  ok(!!payload, "B solved (vigenère + labcrypt inversion)", `${pass} ${frag}`);
  ok(manifest.decoys.B.includes(await sha256hex("blackout-decoy:" + normalize(decoy))), "B digest decoy registered", decoy);
  var fragB = payload?.fragment;
}

// ---------- C: chained timed routing ----------
{
  let sc = manifest.missions.C.first;
  let reward = null;
  for (let r = 1; r <= 10; r++) {
    const seq = solveDoors(sc).join(" ");
    const box = r < 10 ? manifest.missions.C.next[r - 1] : manifest.missions.C.reward;
    const next = await open(seq, box);
    if (!next) { ok(false, `C round ${r} unsolved`); break; }
    if (r < 10) sc = next; else reward = next;
  }
  ok(!!reward, "C solved all 10 rounds with (room,tick) BFS");
  var fragC = reward?.fragment;
}

// ---------- F: fragments unlock, override ----------
{
  const views = await open(`${fragA} ${fragB} ${fragC}`, manifest.missions.F.lock);
  ok(!!views && !!views.operator && !!views.engineer && !!views.medic, "F unlocked by A+B+C fragments");
  for (const id of ["A", "B", "C"]) ok(!!(await open({ A: fragA, B: fragB, C: fragC }[id], manifest.fragments[id])), `fragment ${id} accepted by 'fragment' command`);
  const g = await generateAll(seed);
  const flag = await open(g.F.code, manifest.missions.F.box);
  ok(!!flag?.flag, "F override opens the flag", `${g.F.code} ${flag?.flag}`);
  const rc = await receipt("F", "Red Team", 225, g.F.code);
  ok((await hmac8(g.F.code, `F|red-team|225`)) === rc.split("-").at(-1), "receipt roundtrip");
}

// ---------- leak check: no plaintext secret in the published site ----------
{
  const g = await generateAll(seed);
  const blob = execFileSync("sh", ["-c", `cat $(find "${OUT}" -type f)`], { maxBuffer: 1 << 28 }).toString();
  const secrets = [g.A.answer, g.frag.A, g.B.answer, g.frag.C, g.F.code, g.flag, g.B.notes.passphrase, ...g.C.rounds.map((r) => r.answer)];
  const leaked = secrets.filter((s) => blob.includes(s));
  ok(leaked.length === 0, `no plaintext secrets in dist/ (${leaked.length} leaked)`);
}

console.log(failures ? `\n${failures} FAILED` : "\nall missions solvable, nothing leaked.");
process.exit(failures ? 1 : 0);

// ---------- helpers (what a team's AI would write) ----------
function toSec(t) { const [h, m, s] = t.split(":").map(Number); return h * 3600 + m * 60 + s; }
function avg(a) { return a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); }

function crackVigenere(ct) {
  const letters = ct.replace(/[^A-Z]/g, "");
  const EN = [8.2, 1.5, 2.8, 4.3, 12.7, 2.2, 2.0, 6.1, 7.0, 0.15, 0.77, 4.0, 2.4, 6.7, 7.5, 1.9, 0.095, 6.0, 6.3, 9.1, 2.8, 0.98, 2.4, 0.15, 2.0, 0.074];
  // key length: smallest L whose columns look like English (index of coincidence)
  const ic = (col) => { const f = {}; for (const c of col) f[c] = (f[c] || 0) + 1; return Object.values(f).reduce((a, n) => a + n * (n - 1), 0) / (col.length * (col.length - 1)); };
  const cols = (L) => [...Array(L)].map((_, i) => [...letters].filter((_, j) => j % L === i));
  let L = 3;
  while (L < 20 && avg(cols(L).map(ic)) < 0.058) L++;
  let key = "";
  for (const col of cols(L)) {
    let bs = -Infinity, bk = 0;
    for (let k = 0; k < 26; k++) {
      let sc = 0;
      for (const c of col) sc += Math.log(EN[(c.charCodeAt(0) - 65 - k + 26) % 26]);
      if (sc > bs) { bs = sc; bk = k; }
    }
    key += String.fromCharCode(65 + bk);
  }
  const best = { key };
  let j = 0;
  return ct.replace(/[A-Z]/g, (c) => String.fromCharCode((c.charCodeAt(0) - 65 - (best.key.charCodeAt(j++ % best.key.length) - 65) + 26) % 26 + 65));
}

function unseal(pass, hex) {
  let h = 0x811c9dc5;
  for (let i = 0; i < pass.length; i++) { h ^= pass.charCodeAt(i); h = Math.imul(h, 0x1000193) >>> 0; }
  let prev = h & 0xff;
  const bytes = hex.match(/../g).map((x) => parseInt(x, 16));
  const out = [];
  bytes.forEach((c, i) => {
    h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0;
    const r = (i % 7) + 1;
    const v = ((c >>> r) | (c << (8 - r))) & 0xff;
    out.push(((v - prev + 256) & 0xff) ^ (h & 0xff));
    prev = c;
  });
  return new TextDecoder().decode(Uint8Array.from(out));
}

function solveDoors(sc) {
  const hostile = new Set(sc.hostile);
  const adj = new Map();
  for (const d of sc.doors) for (const [x, y] of [[d.a, d.b], [d.b, d.a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push([d, y]); }
  const parent = new Map([[`${sc.start}@0`, null]]);
  let frontier = [sc.start];
  for (let t = 0; t < 500; t++) {
    if (frontier.includes(sc.goal)) {
      const seq = [];
      for (let k = `${sc.goal}@${t}`; parent.get(k); k = parent.get(k)[0]) if (parent.get(k)[1]) seq.unshift(parent.get(k)[1]);
      return seq;
    }
    const next = [];
    for (const room of frontier) {
      const go = (to, door) => { const k = `${to}@${t + 1}`; if (!parent.has(k)) { parent.set(k, [`${room}@${t}`, door]); next.push(to); } };
      go(room, null);
      for (const [d, to] of adj.get(room) || []) if (!hostile.has(to) && (t + d.phase) % d.period < d.open) go(to, d.id);
    }
    frontier = next;
  }
  return [];
}
