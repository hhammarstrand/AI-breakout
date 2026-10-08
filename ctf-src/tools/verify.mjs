// Facilitator: verify receipts that teams paste into the Teams chat.
//
//   BLACKOUT_SEED=<secret> node tools/verify.mjs RCPT-A-red-team-250-1a2b3c4d [more...]
//   BLACKOUT_SEED=<secret> node tools/verify.mjs < chat.txt     # scans text for receipts

import { readFileSync } from "node:fs";
import { hmac8 } from "../src/crypto.js";
import { generateAll } from "./generate.mjs";

const seed = process.env.BLACKOUT_SEED || (process.argv.includes("--dev") ? "dev" : null);
if (!seed) { console.error("BLACKOUT_SEED is not set (or pass --dev)."); process.exit(1); }

const g = await generateAll(seed);
const secret = { A: g.frag.A, B: g.frag.B, C: g.frag.C, F: g.F.code };

let input = process.argv.slice(2).filter((a) => !a.startsWith("--")).join("\n");
if (!input && !process.stdin.isTTY) input = readFileSync(0, "utf8");
const receipts = input.match(/RCPT-[A-Z]-[a-z0-9-]+-\d+-[0-9a-f]{8}/g) || [];
if (!receipts.length) { console.error("no receipts found."); process.exit(1); }

const totals = new Map();
for (const r of receipts) {
  const parts = r.split("-");
  const mission = parts[1];
  const mac = parts.at(-1);
  const points = Number(parts.at(-2));
  const team = parts.slice(2, -2).join("-");
  const ok = secret[mission] && (await hmac8(secret[mission], `${mission}|${team}|${points}`)) === mac;
  console.log(`${ok ? "OK  " : "FAKE"}  ${mission}  ${team.padEnd(20)} ${String(points).padStart(4)}  ${r}`);
  if (ok) {
    const t = totals.get(team) || {};
    t[mission] = Math.max(t[mission] || 0, points);
    totals.set(team, t);
  }
}
console.log("\nscoreboard:");
[...totals.entries()]
  .map(([team, m]) => [team, Object.values(m).reduce((a, b) => a + b, 0), Object.keys(m).sort().join("")])
  .sort((a, b) => b[1] - a[1])
  .forEach(([team, pts, ms]) => console.log(`  ${team.padEnd(20)} ${String(pts).padStart(5)}  [${ms}]`));
