// Level 2: Decrypt 3 lab logs (caesar / base64 / vigenère).
// All three converge on the same project codename. Submit the codename to clear.

import { ops } from "../opspanel.js";

// Plaintext source — encrypted at runtime so we keep the source readable
// for ourselves but the player only sees ciphertext until they decrypt.
const SOURCE = {
  log1: { // caesar shift +7
    enc: "caesar+7",
    title: "lab-log-2026-01-14.txt",
    body:
`day 014 of project AEGIS.
the substrate accepts cellulose better than predicted.
strain k9 self-organizes into mycelial sheets within 41 hours.
nordlund is convinced this will eat the mold problem in helix tower.
i think she is right. the question is whether anything else gets eaten.
- s.weiss`,
  },
  log2: { // base64 of the body, then optionally rot13 — keep simple base64
    enc: "base64",
    title: "lab-log-2026-02-02.eml",
    body:
`from: k.nordlund@aegis-bio.example
to: ops@aegis-bio.example
re: AEGIS containment notice

board approved a class-iv trial in the helix tower bio-3 vault.
i flagged this. the substrate is too eager.
in the petri it ignores plant matter when there is keratin in the air.
keratin is hair, skin, fingernails. you understand what that means.
nobody listened. trial proceeds wednesday. - kn`,
  },
  log3: { // vigenère with key NORDLUND
    enc: "vigenere",
    key: "NORDLUND",
    title: "lab-log-2026-03-08.txt",
    body:
`internal note. do not forward.

bio-3 vault breach at 09:14. AEGIS substrate aerosolized.
two lab techs exposed. symptoms onset under three minutes.
they walked into walls and did not breathe.
i sealed the floor. fire suppression armed for thermite at +60m.
if you are reading this, do not enter the building.
- k. nordlund`,
  },
};

// Build ciphertexts at module load.
const LOGS = {};
for (const [id, src] of Object.entries(SOURCE)) {
  let cipher;
  if (src.enc === "caesar+7") cipher = caesar(src.body, 7);
  else if (src.enc === "base64") cipher = base64(src.body);
  else if (src.enc === "vigenere") cipher = vigenere(src.body, src.key);
  else cipher = src.body;
  LOGS[id] = { ...src, cipher };
}

const ANSWER = "AEGIS"; // common keyword across all three logs

let listed = false;

export const level2 = {
  registered: false,
  registerHints(ctx) {
    if (this.registered) return;
    ctx.registerHints(2, [
      "Three logs, three different ciphers. The ciphers are listed next to each log title.",
      "Caesar is a letter-shift. Base64 is reversible to bytes. Vigenère uses a repeating keyword — its key is on the email envelope.",
      "The same project codename appears in every decoded log. It's the answer.",
    ]);
    this.registered = true;
  },

  async start(ctx) {
    const { term } = ctx;
    this.registerHints(ctx);
    ops.setMode("l2");
    ops.updateSurvivor({ bpm: 102, tag: "locked", location: "4-12 SERVER" });
    ops.updateDrone({ state: "holding @ 4-12", pos: "4-12", batt: 96 });
    term.println("", "");
    term.println("=== L2  DECRYPT THE LAB LOGS ===", "system");
    term.println("", "");
    term.printBlock(
`Three logs were exfiltrated from Dr. Nordlund's machine before the firmware
wipe. Each is encoded differently. The cipher type is shown next to the
log title.

Read them, decrypt them with AI's help, and identify the shared project
codename. The codename is the one word that appears, in plaintext, in all
three decoded files.

Commands: archive / read <id> / submit <word> / brief / hint`,
      "info"
    );
    listed = false;
  },

  onCommand(cmd, args, raw, ctx) {
    const { term, sfx, state } = ctx;
    switch (cmd) {
      case "brief": return this.start(ctx);
      case "archive":
      case "ls": {
        term.println("recovered logs:", "dim");
        for (const [id, l] of Object.entries(LOGS)) {
          term.println(`  ${id}   ${l.title.padEnd(28)}  cipher: ${l.enc}${l.key ? " (key on envelope)" : ""}`, "dim");
        }
        listed = true;
        return;
      }
      case "read":
      case "cat": {
        const id = (args[0] || "").toLowerCase();
        if (!LOGS[id]) {
          term.println(`no such log: '${id}'. try 'archive'.`, "muted");
          return;
        }
        const l = LOGS[id];
        term.println(`=== ${l.title}    [${l.enc}${l.key ? " key=" + l.key : ""}] ===`, "dim");
        l.cipher.split("\n").forEach((line) => term.println(line, "info"));
        return;
      }
      case "submit": {
        const guess = (args.join(" ") || "").trim().toUpperCase();
        if (!guess) { term.println("usage: submit <codename>", "muted"); return; }
        if (guess === ANSWER) {
          sfx.ok();
          state.addScore(25);
          state.addItem(ANSWER);
          state.completeLevel(2);
          term.println("", "");
          term.println(`[ codename verified: ${ANSWER} ]`, "accent");
          term.println("  fragment acquired: " + ANSWER, "accent");
          term.println("  +25 score", "muted");
          ctx.refreshHUD();
          ctx.go(3);
          return;
        }
        sfx.nope();
        state.get().wrongAttempts++;
        state.addScore(-2);
        state.save();
        term.println(`[ '${guess}' not the codename. -2 score. ]`, "danger");
        return;
      }
      default:
        term.println(`unknown: ${cmd}. try 'archive' to list logs.`, "muted");
    }
  },
};

// --- ciphers ---

function caesar(s, shift) {
  return s.split("").map((c) => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90)  return String.fromCharCode(((code - 65 + shift) % 26) + 65);
    if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + shift) % 26) + 97);
    return c;
  }).join("");
}

function base64(s) {
  // standard base64 of the UTF-8 bytes — split to 64-char lines
  const b = btoa(unescape(encodeURIComponent(s)));
  return b.replace(/(.{64})/g, "$1\n");
}

function vigenere(s, key) {
  const K = key.toUpperCase();
  let ki = 0;
  return s.split("").map((c) => {
    const code = c.charCodeAt(0);
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (!isUpper && !isLower) return c;
    const base = isUpper ? 65 : 97;
    const shift = K.charCodeAt(ki % K.length) - 65;
    ki++;
    return String.fromCharCode(((code - base + shift) % 26) + base);
  }).join("");
}
