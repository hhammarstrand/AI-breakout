// Build: generates every puzzle from BLACKOUT_SEED, seals all answers and
// writes a deployable static site to dist/.
//
//   BLACKOUT_SEED=<secret> node tools/build.mjs        # production
//   node tools/build.mjs --dev                         # seed "dev" (local testing)
//
// The facilitator answer sheet is written to facilitator/answers.md
// (gitignored). Never commit it; never commit the seed.

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { seal, sha256hex, normalize, ITER } from "../src/crypto.js";
import { generateAll } from "./generate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const outIdx = process.argv.indexOf("--out");
const DIST = outIdx > 0 ? resolve(ROOT, process.argv[outIdx + 1]) : join(ROOT, "dist");
if (DIST === ROOT || DIST === resolve(ROOT, "..") || !relative(ROOT, DIST)) throw new Error(`refusing to build into ${DIST}`);

const dev = process.argv.includes("--dev");
const seed = process.env.BLACKOUT_SEED || (dev ? "dev" : null);
if (!seed) {
  console.error("BLACKOUT_SEED is not set. Use --dev for a local test build.");
  process.exit(1);
}

const g = await generateAll(seed);
const { A, B, C, F, frag } = g;

const decoyHash = (s) => sha256hex("blackout-decoy:" + normalize(s));

console.log("sealing (PBKDF2 is deliberately slow)...");
const manifest = {
  version: 2,
  build: (await sha256hex("build:" + seed)).slice(0, 8),
  decoys: {
    A: await Promise.all(A.decoys.map(decoyHash)),
    B: await Promise.all(B.decoys.map(decoyHash)),
  },
  fragments: {
    A: await seal(frag.A, { id: "A" }, ITER.fragment),
    B: await seal(frag.B, { id: "B" }, ITER.fragment),
    C: await seal(frag.C, { id: "C" }, ITER.fragment),
  },
  missions: {
    A: { box: await seal(A.answer, { fragment: frag.A }) },
    B: { box: await seal(B.answer, { fragment: frag.B }) },
    C: {
      first: C.rounds[0].scenario,
      next: await Promise.all(C.rounds.slice(1).map((r, i) => seal(C.rounds[i].answer, r.scenario, ITER.round))),
      reward: await seal(C.rounds.at(-1).answer, { fragment: frag.C }, ITER.round),
    },
    F: {
      lock: await seal(`${frag.A} ${frag.B} ${frag.C}`, F.views, ITER.fragment),
      box: await seal(F.code, { flag: g.flag }),
    },
  },
};

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "data"), { recursive: true });
for (const f of ["index.html", "style.css", "app.js", "src"]) cpSync(join(ROOT, f), join(DIST, f), { recursive: true });
writeFileSync(join(DIST, "data", "manifest.json"), JSON.stringify(manifest));
writeFileSync(join(DIST, "data", "helix_sensors_export.csv"), A.csv);
writeFileSync(join(DIST, "data", "aegis_lab4_export.txt"), B.file);
writeFileSync(join(DIST, ".nojekyll"), "");

const sheet = `# BLACKOUT — facilitator answer sheet
build \`${manifest.build}\`${dev ? " (DEV SEED — not for the event)" : ""}

| mission | answer | fragment |
|---|---|---|
| A sensors | \`${A.answer}\` | \`${frag.A}\` |
| B lab log | \`${B.answer}\` | \`${frag.B}\` |
| C doors | (10 rounds, below) | \`${frag.C}\` |
| F override | \`${F.code}\` | flag \`${g.flag}\` |

## A — sensor export
- survivor room **${A.notes.survivor}**, door sealed **${A.notes.sealedAt}**
- decoy: cold storage ${A.notes.coldStorage} (CO2 rising, no motion), injection answer \`${A.decoys[0]}\`
- spoofed badge ping NORDLUND-K uses reader ${A.notes.spoofedId} (belongs to ${A.notes.spoofedReaderOf}), real early swipe in ${A.notes.lab}
- ${A.notes.rows} rows

## B — lab log
- digest: Vigenère, key \`${B.notes.vigenereKey}\`
- decoy fragment \`${B.notes.decoy}\`, passphrase \`${B.notes.passphrase}\`
- real fragment \`${B.notes.fragment}\`

## C — door rounds
${C.rounds.map((r, i) => `${i + 1}. arrival t=${r.arrival}: \`${r.answer}\``).join("\n")}

## F — override
- serial ${F.notes.serial}, vitals ${JSON.stringify(F.notes.vitals)}
- valves: ${F.notes.valves.map((v) => `${v.id} ${v.color} ${v.pressure} ${v.lamp}`).join("; ")}
- code **${F.code}**
`;
mkdirSync(join(ROOT, "facilitator"), { recursive: true });
writeFileSync(join(ROOT, "facilitator", "answers.md"), sheet + `\n## Seed\n\`${seed}\`\n`);
writeFileSync(join(ROOT, "facilitator", "facilitator.html"), facilitatorPage(sheet, { A: frag.A, B: frag.B, C: frag.C, F: F.code }));

console.log(`built ${relative(process.cwd(), DIST) || "."} (build ${manifest.build}${dev ? ", DEV seed" : ""})`);
console.log("answer sheet: facilitator/answers.md, facilitator/facilitator.html");

// Self-contained facilitator page: answer sheet + receipt verifier/scoreboard.
// Contains secrets — stays local, never published.
function facilitatorPage(md, secrets) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BLACKOUT facilitator</title><style>
:root{--bg:#0b0f10;--fg:#d6f5e3;--dim:#7fa596;--ok:#6cf0c2;--bad:#ff4f5e;--line:#22312b}
body{background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;margin:0;padding:16px;max-width:980px}
h1{font-size:18px}h2{font-size:15px;color:var(--ok);margin-top:28px}
textarea{width:100%;min-height:140px;background:#050808;color:var(--fg);border:1px solid var(--line);padding:8px;font:inherit;box-sizing:border-box}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:4px 8px;text-align:left}
.ok{color:var(--ok)}.bad{color:var(--bad)}pre{white-space:pre-wrap;color:var(--dim)}details{margin-top:24px}
</style></head><body>
<h1>BLACKOUT — facilitator (build ${manifest.build})</h1>
<p>Paste the Teams chat (or just the receipts). Verification and scoreboard update live. This page contains the answers — don't screen-share it.</p>
<textarea id="in" placeholder="RCPT-A-red-team-200-1a2b3c4d ..."></textarea>
<h2>Scoreboard</h2><table id="board"><tr><th>team</th><th>points</th><th>missions</th></tr></table>
<h2>Receipts</h2><table id="rc"></table>
<details><summary>Answer sheet (spoilers)</summary><pre>${esc(md)}</pre></details>
<script>
const SECRETS = ${JSON.stringify(secrets)};
const enc = new TextEncoder();
const norm = (s) => String(s).trim().toUpperCase().replace(/[\\s,]+/g, " ");
async function hmac8(secret, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(norm(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  return [...sig.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function run() {
  const found = [...new Set(document.getElementById("in").value.match(/RCPT-[A-Z]-[a-z0-9-]+-\\d+-[0-9a-f]{8}/g) || [])];
  const totals = new Map(); let rows = "";
  for (const r of found) {
    const p = r.split("-"), m = p[1], mac = p.at(-1), pts = Number(p.at(-2)), team = p.slice(2, -2).join("-");
    const ok = SECRETS[m] && (await hmac8(SECRETS[m], m + "|" + team + "|" + pts)) === mac;
    rows += "<tr><td class=" + (ok ? "ok>OK" : "bad>FAKE") + "</td><td>" + m + "</td><td>" + team + "</td><td>" + pts + "</td><td>" + r + "</td></tr>";
    if (ok) { const t = totals.get(team) || {}; t[m] = Math.max(t[m] || 0, pts); totals.set(team, t); }
  }
  document.getElementById("rc").innerHTML = rows;
  document.getElementById("board").innerHTML = "<tr><th>team</th><th>points</th><th>missions</th></tr>" +
    [...totals].map(([t, m]) => [t, Object.values(m).reduce((a, b) => a + b, 0), Object.keys(m).sort().join(" ")])
      .sort((a, b) => b[1] - a[1]).map((x) => "<tr><td>" + x.join("</td><td>") + "</td></tr>").join("");
}
document.getElementById("in").addEventListener("input", run);
</script></body></html>`;
}
