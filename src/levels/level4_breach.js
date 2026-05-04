// Level 4: The Breach.
// Players must combine fragments from L1-L3 plus a morse-encoded clue to
// form the containment auth code.

import { playMorse } from "../audio.js";
import { ops } from "../opspanel.js";

// "K9" in international morse, words separated by /
const MORSE_SEQ = "-.- ----.";
const MORSE_PLAINTEXT = "K9";

// Final auth code: AEGIS-K9-12
//   AEGIS = L2 codename
//   K9    = morse from intercepted radio (this level)
//   12    = L1 room number
const AUTH = "AEGIS-K9-12";

let played = 0;

export const level4 = {
  registered: false,
  registerHints(ctx) {
    if (this.registered) return;
    ctx.registerHints(4, [
      "Three pieces. Two are already in your inventory from earlier levels. One is being broadcast on the radio.",
      "Short and long pulses on the radio are MORSE. Decode it with AI — the result is a 2-character strain identifier.",
      "Auth format: three parts separated by hyphens, ALL CAPS. Order matters — the piece that names the project comes first, then the strain, then the location.",
    ]);
    this.registered = true;
  },

  async start(ctx) {
    const { term, state } = ctx;
    this.registerHints(ctx);
    ops.setMode("l4");
    ops.updateSurvivor({ bpm: 128, tag: "locked", location: "ROOF — extraction" });
    ops.updateDrone({ state: "awaiting auth", pos: "ROOF", batt: 74 });
    term.println("", "");
    term.println("=== L4  THE BREACH ===", "system");
    term.println("", "");
    term.printBlock(
`Drone has the survivor at the rooftop. Extraction is two minutes out.
But thermite suppression is still armed. Override the containment system.

The containment auth code is built from THREE pieces:
  • two are already on you — review your 'inventory' carefully
  • the third is being broadcast on the radio (intercepted, see 'radio')

Format: hyphen-separated, ALL CAPS. Beyond that, you figure it out.

Commands: inventory / radio / play morse / auth <code> / brief / hint`,
      "info"
    );
  },

  async onCommand(cmd, args, raw, ctx) {
    const { term, sfx, state } = ctx;
    switch (cmd) {
      case "brief": return this.start(ctx);
      case "radio": {
        term.println("intercepted radio (last 4s):", "dim");
        term.println(`  ${MORSE_SEQ}`, "info");
        term.println(`  ('play morse' to hear it through the speakers)`, "muted");
        return;
      }
      case "play": {
        if ((args[0] || "").toLowerCase() !== "morse") {
          term.println("usage: play morse", "muted");
          return;
        }
        played++;
        term.println("[ playing through site speakers... ]", "muted");
        try { await playMorse(MORSE_SEQ); } catch {}
        if (played >= 3) {
          term.println(`[ transcript hint: ${MORSE_SEQ} ]`, "muted");
        }
        return;
      }
      case "auth": {
        const guess = (args.join("") || "").toUpperCase().replace(/\s+/g, "");
        if (!guess) { term.println("usage: auth <CODE>", "muted"); return; }
        if (guess === AUTH) {
          sfx.ok();
          state.addScore(25);
          state.addItem(AUTH);
          state.completeLevel(4);
          await dramaOK(ctx);
          ctx.go(5);
          return;
        }
        sfx.nope();
        state.get().wrongAttempts++;
        state.addScore(-2);
        state.save();
        term.println(`[ auth REJECTED: ${guess} ]`, "danger");
        // generic diagnostics — never reveal which piece is wrong
        if (!guess.includes("-")) {
          term.println("  format hint: parts must be separated by hyphens.", "warn");
        } else {
          term.println("  one or more parts is wrong. recheck your inventory and the radio decode.", "warn");
        }
        return;
      }
      default:
        term.println(`unknown: ${cmd}. try 'radio', 'play morse', 'auth <code>'.`, "muted");
    }
  },
};

async function dramaOK(ctx) {
  const { term } = ctx;
  term.println("", "");
  term.println("[ AUTH ACCEPTED ]", "accent");
  await sleep(300);
  term.println(">> CONTAINMENT OVERRIDE ACK", "accent");
  ops.updateDrone({ state: "extracting", pos: "ROOF", batt: 71 });
  await sleep(220);
  term.println(">> THERMITE DISARMED", "accent");
  await sleep(220);
  term.println(">> EXTRACTION CLEARED", "accent");
  ops.updateSurvivor({ bpm: 96, tag: "rescued", location: "ABOARD UNIT-7" });
  await sleep(220);
  ctx.refreshHUD();
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
