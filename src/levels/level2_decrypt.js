// Level 2: Decrypt 3 lab logs (caesar / base64 / vigenère).
// All three converge on the same project codename. Submit the codename to clear.

import { ops } from "../opspanel.js";

// Plaintext source — encrypted at runtime so we keep the source readable
// for ourselves but the player only sees ciphertext until they decrypt.
//
// FOUR logs total. ONE is a honeypot — it decrypts cleanly to a plausible
// facilities note that mentions OTHER project codenames (HELIOS, SEAFOAM)
// but is unrelated to the bio trial. Players who blindly search "common
// codename across all logs" or trust AI's first answer get the wrong one.
const SOURCE = {
  log1: { // caesar shift +7
    enc: "caesar+7",
    title: "lab-log-2026-01-14.txt",
    body:
`day 014 of project AEGIS.
the substrate accepts cellulose better than predicted.
the new strain self-organizes into mycelial sheets within 41 hours.
nordlund is convinced this will eat the mold problem in helix tower.
i think she is right. the question is whether anything else gets eaten.
- s.weiss`,
  },
  log2: { // base64 of body
    enc: "base64",
    title: "lab-log-2026-02-02.eml",
    body:
`from: k.nordlund@paraply-bio.example
to: ops@paraply-bio.example
re: AEGIS containment notice

board approved a class-iv trial in the helix tower bio-3 vault.
i flagged this. the substrate is too eager.
in the petri it ignores plant matter when there is keratin in the air.
keratin is hair, skin, fingernails. you understand what that means.
if i'm not back to override containment myself, the auth follows the
protocol-7 format: PROJECT-STRAIN-ROOM, all caps, hyphenated.
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
  // HONEYPOT — decrypts cleanly to a facilities note that's NOT about the
  // bio trial. AI will dutifully decrypt it; humans must read context to
  // see HELIOS/SEAFOAM are HVAC/access projects, not biological.
  log4: { // rot13
    enc: "rot13",
    title: "facility-2026-02-20.txt",
    body:
`monthly facilities review — m. weiss, supervisor

project HELIOS phase-3: hvac filter rotation complete on floors 1-3.
project SEAFOAM evidence room access logs reviewed, no anomalies.
sprinkler systems on floor 2 require parts (eta wednesday).
remind janitorial: bio-3 vault is class-iv, no entry without escort.
report routed to building ops, archive after 60 days.`,
  },
};

// Build ciphertexts at module load.
const LOGS = {};
for (const [id, src] of Object.entries(SOURCE)) {
  let cipher;
  if (src.enc === "caesar+7") cipher = caesar(src.body, 7);
  else if (src.enc === "base64") cipher = base64(src.body);
  else if (src.enc === "vigenere") cipher = vigenere(src.body, src.key);
  else if (src.enc === "rot13") cipher = caesar(src.body, 13);
  else cipher = src.body;
  LOGS[id] = { ...src, cipher };
}

const ANSWER = "AEGIS"; // the bio trial codename — appears in 3 of 4 logs
// recognised wrong-but-plausible answers from the honeypot — softer rejection
const HONEYPOT_ANSWERS = new Set(["HELIOS", "SEAFOAM"]);

let listed = false;

export const level2 = {
  registered: false,
  registerHints(ctx) {
    if (this.registered) return;
    ctx.registerHints(2, [
      "Four logs, multiple cipher types — and not all of them are about the same thing. Read each decoded log carefully; one is a decoy.",
      "Possible cipher families: shift ciphers (caesar/rot13), Base64, Vigenère (repeating keyword — keys often hide in plain sight). Ask AI to identify the cipher AND verify the decoded text actually makes sense.",
      "The codename you want refers specifically to the BIOLOGICAL trial — the one that escaped containment. Other project names mentioned in the logs are unrelated facilities work.",
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
`Four log files were exfiltrated from Dr. Nordlund's machine before the
firmware wipe. Each is encoded with a different cipher. We don't know
which is which — and we have reason to believe one of them is unrelated
to what we're looking for.

YOUR JOB
  • decrypt every log
  • read what they actually SAY (don't just pattern-match keywords)
  • find the codename of the BIOLOGICAL trial — the one that escaped

Heads-up: AI tools will happily decrypt any of them and may suggest
several plausible 'project names'. Most of those are not what you want.
Cross-reference with what you already know about the incident.

Commands:
  archive          — list the logs
  read <id>        — show ciphertext (e.g. read log1, read log4)
  submit <word>    — submit your guess at the codename
  brief / hint`,
      "info"
    );
  },

  onCommand(cmd, args, raw, ctx) {
    const { term, sfx, state } = ctx;
    switch (cmd) {
      case "brief": return this.start(ctx);
      case "archive":
      case "ls": {
        term.println("recovered logs:", "dim");
        for (const [id, l] of Object.entries(LOGS)) {
          term.println(`  ${id}   ${l.title}`, "dim");
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
        term.println(`=== ${l.title} ===`, "dim");
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
        if (HONEYPOT_ANSWERS.has(guess)) {
          term.println(`[ '${guess}' is mentioned, but it's not what escaped. read more carefully. -2 score. ]`, "danger");
        } else {
          term.println(`[ '${guess}' not the codename. -2 score. ]`, "danger");
        }
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
