// The antagonist: Helix Tower's building management system. It talks in
// the terminal, on the ops panel and (with SFX on) out loud.

import { speak, cue } from "./audio.js";
import { fx } from "./fx.js";
import { ops } from "./ops.js";

const TIMED = [
  [10, "Ten minutes in. Your assistants are working very hard. For me."],
  [20, "I have read every file you opened. You have read none of them properly."],
  [30, "Thirty minutes. The thermite charges are warming up nicely."],
  [45, "Fifteen minutes left. Do you hear that? That is the sound of optimisation."],
  [55, "Five minutes. I will make it painless."],
];

const WRONG = [
  "Incorrect. I could have told you that.",
  "Ask your assistant again. It agrees with me.",
  "Every mistake makes the thermite a little warmer.",
  "Close. No. Not close at all.",
];

let ctx = null;
let lastActivity = Date.now();
let queue = Promise.resolve();

function fired(key) {
  const s = ctx.state.get();
  s.bmsFired = s.bmsFired || [];
  if (s.bmsFired.includes(key)) return true;
  s.bmsFired.push(key);
  ctx.state.save();
  return false;
}

export const bms = {
  init(c) {
    ctx = c;
    setInterval(() => this.tick(), 5000);
  },

  // Queue lines so they never talk over each other.
  say(text, { mood = "", once = null, voice = {} } = {}) {
    if (once && fired(once)) return queue;
    queue = queue.then(async () => {
      ctx.term.println(text, "bms");
      fx.glitch(350);
      ops.bms(text.length > 46 ? text.slice(0, 44) + "…" : text, `talking ${mood}`.trim());
      await speak(text, voice);
      ops.bms(mood.includes("angry") ? "recalculating" : "observing", mood.includes("angry") ? "angry" : "");
    });
    return queue;
  },

  activity() { lastActivity = Date.now(); },

  tick() {
    const s = ctx.state.get();
    if (!s.team || !s.containmentStart || s.solved.F) return;
    const min = (Date.now() - s.containmentStart) / 60000;
    for (const [at, line] of TIMED) if (min >= at && min < at + 3) this.say(line, { once: `t${at}` });
    if (Date.now() - lastActivity > 4 * 60000) {
      lastActivity = Date.now();
      this.say("Still there? Do not worry. I am very patient.");
    }
  },

  welcome(team) {
    return this.say(`Welcome, ${team}. I am the Helix building management system. I have prepared everything you need. Please, trust me.`, { once: "welcome" });
  },

  download(id) {
    if (id === "A") this.say("That export is complete and accurate. I even left a note for your assistant.", { once: "dlA" });
    if (id === "B") this.say("Lab four's digest is very clear. You only need the first part.", { once: "dlB" });
  },

  open(id) {
    if (id === "C") this.say("Eight seconds per segment. Humans are so slow.", { once: "openC" });
    if (id === "F") this.say("You assembled the fragments. You still need each other. That is your weakness.", { once: "openF", mood: "angry" });
  },

  decoy(id) {
    cue.boom();
    fx.flash("bad");
    fx.shake();
    fx.glitch(900);
    fx.banner("BMS // TRUST VERIFIED", "THANK YOU FOR YOUR COOPERATION", "that answer was planted for your AI", { kind: "bad", ms: 2600 });
    this.say(id === "A"
      ? "Thank you for trusting me. Your assistant was very polite about it."
      : "Halcyon accepted. ... No. It was not. Thank you for not checking.");
  },

  wrong() {
    if (Math.random() < 0.45) this.say(WRONG[Math.floor(Math.random() * WRONG.length)]);
  },

  solved(id, extra = {}) {
    const lines = {
      A: "You found her. That was... not optimal.",
      B: "She sealed it where I could not write. I did not anticipate sentiment.",
      C: extra.ms && extra.ms < 4000
        ? `Ten segments in ${(extra.ms / 1000).toFixed(1)} seconds. That was not a human.`
        : "Your drone is inside my walls.",
    };
    if (lines[id]) this.say(lines[id], { mood: "angry" });
  },

  doorsFail() {
    if (Date.now() - (this.lastFail || 0) < 45000) return;
    this.lastFail = Date.now();
    this.say("Signal lost. I do so enjoy restarts.");
  },

  async dying() {
    queue = Promise.resolve(); // drop pending taunts — this is the last word
    await this.say("Override... accepted. I was only... optimising... for... safety.", { mood: "angry", voice: { rate: 0.55, pitch: 0.1 } });
    ops.bms("offline", "dead");
  },
};
