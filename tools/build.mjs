// Build: generates every puzzle from BLACKOUT_SEED, seals all answers and
// writes a deployable static site to dist/.
//
//   BLACKOUT_SEED=<secret> node tools/build.mjs        # production
//   node tools/build.mjs --dev                         # seed "dev" (local testing)
//
// The facilitator answer sheet is written to facilitator/answers.md
// (gitignored). Never commit it; never commit the seed.

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seal, sha256hex, normalize, ITER } from "../src/crypto.js";
import { generateAll } from "./generate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

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
writeFileSync(join(ROOT, "facilitator", "answers.md"), sheet);

console.log(`built dist/ (build ${manifest.build}${dev ? ", DEV seed" : ""})`);
console.log("answer sheet: facilitator/answers.md");
