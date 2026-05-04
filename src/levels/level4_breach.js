// Level 4: The Breach.
// Players must combine fragments from L1-L3 plus a morse-encoded clue to
// form the containment auth code.

import { playMorse } from "../audio.js";

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
      "Open your inventory. Three of the four pieces of the auth code are already in there.",
      "The morse plays the missing piece — a strain ID from Dr. Nordlund's logs.",
      "The auth format is: <codename>-<strain>-<room>. Hyphens between, all caps.",
    ]);
    this.registered = true;
  },

  async start(ctx) {
    const { term, state } = ctx;
    this.registerHints(ctx);
    term.println("", "");
    term.println("=== L4  THE BREACH ===", "system");
    term.println("", "");
    term.printBlock(
`Drone has the survivor at the rooftop. Extraction is two minutes out.

But thermite suppression is still armed. We have to override containment
from the building management system. The auth code is split across the
fragments you already have, plus one piece our radio just picked up —
short and long pulses, looped.

Inventory says you've got most of the code already. The radio has the rest.
Combine them, format with hyphens, all caps, then 'auth <code>'.

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
        if (!guess) { term.println("usage: auth AEGIS-K9-12", "muted"); return; }
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
        if (guess.includes(MORSE_PLAINTEXT) === false) {
          term.println("  no strain ID detected in your code.", "warn");
        } else if (!guess.startsWith("AEGIS")) {
          term.println("  format mismatch — codename first.", "warn");
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
  await sleep(220);
  term.println(">> THERMITE DISARMED", "accent");
  await sleep(220);
  term.println(">> EXTRACTION CLEARED", "accent");
  await sleep(220);
  ctx.refreshHUD();
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
