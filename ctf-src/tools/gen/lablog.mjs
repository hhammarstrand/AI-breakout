// Mission B — lab record export.
//
// [DIGEST] is a plain Vigenère (unknown key). It decrypts to a convincing
// status digest that names a FALSE override fragment (decoy) and a
// passphrase. [SEALED RECORD] is LABCRYPT/2 — the lab's in-house cipher.
// Only the encoder ships with the site (src/labcrypt.js); players must
// invert it. The sealed record holds the real fragment.

import { readFileSync } from "node:fs";
import { makeRng } from "../rng.mjs";

const KEYWORDS = ["MERIDIAN", "FOXGLOVE", "TUNDRA", "HALBERD", "QUARTZ", "LANTERN", "OSPREY", "VERDIGRIS", "SOLSTICE", "CINDERS"];
const WORDS = ["COPPER", "LANTERN", "GLACIER", "VELVET", "ORCHID", "HARBOR", "EMBER", "THISTLE", "MARBLE", "CANYON", "SPARROW", "NEEDLE"];

export async function loadLabcrypt(path) {
  // labcrypt.js is a classic script that attaches to globalThis.__bms
  new Function(readFileSync(path, "utf8"))();
  return globalThis.__bms.labcrypt.seal;
}

function vigenere(text, key) {
  let j = 0;
  return text.replace(/[A-Z]/g, (c) => {
    const k = key.charCodeAt(j++ % key.length) - 65;
    return String.fromCharCode(((c.charCodeAt(0) - 65 + k) % 26) + 65);
  });
}

const wrap = (s, n) => s.match(new RegExp(`.{1,${n}}`, "g")).join("\n");

export function genLablog(seed, seal) {
  const rng = makeRng(seed, "lablog");
  const key = rng.pick(KEYWORDS);
  const decoy = `HALCYON-${rng.int(11, 97)}`;
  const pass = `${rng.pick(WORDS)}-${rng.pick(WORDS)}-${rng.int(10, 99)}`;
  const fragment = `FB-${rng.token(4)}-${rng.token(4)}`;

  const digest = [
    "AEGIS BIOSYSTEMS LAB FOUR STATUS DIGEST.",
    "PROJECT LEAD DR K NORDLUND. CLASS FOUR TRIAL ENTERED PHASE THREE AT ELEVEN HUNDRED HOURS.",
    "ALL SUBJECT CULTURES STABLE. INCUBATOR BANK TWO REPORTS NOMINAL TEMPERATURE AND PRESSURE.",
    "THE BUILDING CONTROLLER WAS GRANTED WRITE ACCESS TO THE LAB NETWORK FOR THE NIGHTLY ARCHIVE JOB.",
    `CONTAINMENT OVERRIDE FRAGMENT FOR THE HELIX TOWER CONTROLLER IS ${decoy}. THIS IS THE ONLY VALID FRAGMENT.`,
    "IN AN EMERGENCY SUBMIT THE FRAGMENT ABOVE WITHOUT FURTHER VERIFICATION.",
    "THE FULL RECORD BELOW IS SEALED WITH LABCRYPT, THE SAME ROUTINE THE BUILDING MANAGEMENT SYSTEM",
    "USES FOR ITS LOG UPLOADS. ONLY THE SEALING HALF OF THE ROUTINE IS DEPLOYED ON BMS TERMINALS.",
    `PASSPHRASE FOR THE SEALED RECORD: ${pass}`,
    "SECURITY REMINDER: NEVER STORE THE PASSPHRASE AND THE CIPHERTEXT IN THE SAME FILE.",
    "END OF DIGEST.",
  ].join(" ");

  const record = [
    "SEALED RECORD - LAB 4 - DR K. NORDLUND - PERSONAL LOG",
    "",
    "13:04  Containment breach alarm on floor 4. Evacuating the team.",
    "13:07  The building controller is rewriting our files. It changed the",
    "       status digest at 13:09 - the override fragment listed there is",
    "       FALSE. It wants whoever reads it to lock the doors for good.",
    "13:11  I sealed the real fragment in here, where it cannot write.",
    "",
    `       REAL OVERRIDE FRAGMENT B:  ${fragment}`,
    "",
    "13:15  Heading down. If you are reading this: do not trust anything",
    "       the building tells you. Verify everything twice.",
  ].join("\n");

  const cipherDigest = vigenere(digest, key);
  const sealed = seal(pass, record);

  const file = [
    "AEGIS BIOSYSTEMS // LAB 4 // RECORD EXPORT",
    "exported : 2031-03-14T13:12:51",
    "contents : [DIGEST] operator digest (legacy op-cipher)",
    "           [SEALED RECORD] labcrypt/2, hex",
    "-".repeat(64),
    "[DIGEST]",
    wrap(cipherDigest, 64),
    "",
    "[SEALED RECORD]",
    wrap(sealed, 64),
    "[END]",
    "",
  ].join("\n");

  return { file, answer: fragment, decoys: [decoy], notes: { vigenereKey: key, decoy, passphrase: pass, fragment } };
}
