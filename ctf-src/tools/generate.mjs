// Deterministic puzzle generation shared by build.mjs and verify.mjs.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeRng } from "./rng.mjs";
import { genSensors } from "./gen/sensors.mjs";
import { genLablog, loadLabcrypt } from "./gen/lablog.mjs";
import { genDoors } from "./gen/doors.mjs";
import { genFinal } from "./gen/final.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function generateAll(seed) {
  const seal = await loadLabcrypt(join(ROOT, "src", "labcrypt.js"));
  const rng = makeRng(seed, "fragments");
  const A = genSensors(seed);
  const B = genLablog(seed, seal);
  const C = genDoors(seed);
  const F = genFinal(seed);
  const frag = { A: `FA-${rng.token(4)}-${rng.token(4)}`, B: B.answer, C: C.fragment };
  const flag = `BLACKOUT{${rng.token(6)}-${rng.token(6)}}`;
  return { A, B, C, F, frag, flag };
}
