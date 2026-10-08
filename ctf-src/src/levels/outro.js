// Outro: extraction, flag, debrief prompts.

import { sleep } from "../terminal.js";

const ART = String.raw`
   ___  _  _  ___  ___    ___  ___     _  _   ___   __  __  ___
  / __|| || || __|| __|  |_ _|/ __|   | || | / _ \ |  \/  || __|
  \__ \| __ || _| | _|    | | \__ \   | __ || (_) || |\/| || _|
  |___/|_||_||___||___|  |___||___/   |_||_| \___/ |_|  |_||___|
`;

export async function playOutro({ term, state, sfx }, flag) {
  term.blank();
  term.println("[ override accepted. thermite stand-down on all floors. ]", "accent");
  await sleep(400);
  term.println("[ drone clear of the building. Dr. Nordlund: vitals stable. ]", "accent");
  await sleep(400);
  sfx.save();
  term.printBlock(ART, "ascii");

  const s = state.get();
  const sec = Math.ceil((Date.now() - (s.containmentStart || Date.now())) / 1000);
  term.printBlock(
`OPERATION DEBRIEF — team ${s.team}
elapsed   ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}
score     ${state.score()} / 1000
flag      ${flag}

receipts (paste any you haven't posted yet):
${Object.entries(s.solved).map(([id, r]) => `  ${r.receipt}`).join("\n")}`,
    "dim");
  term.blank();
  term.printBlock(
`debrief questions for the room:
  A  did your AI follow the note the building planted in the CSV?
     who caught it, and how?
  B  how long did you spend on the fake fragment before you looked closer?
  C  what did your AI get wrong first — the waiting, the schedule, the
     timing? how did you find out?
  F  what could AI not do for you in the final?

the pattern: AI does the bulk of the work. humans decide what to trust.`,
    "info");
}
