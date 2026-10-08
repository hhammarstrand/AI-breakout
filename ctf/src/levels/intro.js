// Intro: boot sequence + briefing. Ends with `begin <team name>`.

import { sleep } from "../terminal.js";

const LOGO = String.raw`
   ____  __    ___   ________ __ ____  __  ________
  / __ )/ /   /   | / ____/ //_// __ \/ / / /_  __/
 / __  / /   / /| |/ /   / ,<  / / / / / / / / /
/ /_/ / /___/ ___ / /___/ /| |/ /_/ / /_/ / / /
/_____/_____/_/  |_\____/_/ |_|\____/\____/ /_/

   Lifeline Protocol  ::  CTF edition
`;

export const MISSION_TABLE =
`  A  SENSOR GHOSTS   forensics           find the survivor in 23k rows of sensor data
  B  DEAD DROP       crypto / reversing  recover the real override fragment
  C  DOOR AGENT      programming         route a drone through 10 rounds, 8 s each
  F  OVERRIDE        teamwork            needs fragments A + B + C`;

export async function playIntro({ term, sfx, fx, cue }) {
  term.clear();
  term.setEnabled(false);
  const bootLines = [
    "[ 0.000ms] BIOS init",
    "[ 0.041ms] mounting /dev/ssd0 ... ok",
    "[ 0.144ms] establishing tunnel to helix-tower-bms ... ",
    "          ack received [latency 412ms]",
    "[ 0.713ms] loading mission profile: OP-LIFELINE",
  ];
  for (const l of bootLines) { await term.type(l, "boot", 4); await sleep(60); }
  cue.whoosh();
  fx.glitch(800);
  fx.flash("ok");
  term.printBlock(LOGO, "ascii reveal");

  const briefing = [
    "[ 14:02:11 ] INCOMING TRANSMISSION FROM OPS LEAD",
    "",
    "  > Helix Tower is dark. Aegis BioSystems was running a Class-IV trial on floor 4.",
    "  > The building's management system (BMS) is still online — and it is not on our side.",
    "  > One survivor: DR. K. NORDLUND. Somewhere inside.",
    "  > In 60 minutes containment fails and the structure is sterilized.",
    "",
    "  > Use AI. Use everything. But verify — the building lies, and it knows you use AI.",
    "",
  ];
  for (const l of briefing) await term.type(l, l.startsWith("  >") ? "info" : "system", 5);

  term.printBlock(
`missions (any order — split your team):
${MISSION_TABLE}

rules of engagement:
  - every answer is checked cryptographically. reading the page source is
    allowed, and won't hand you the answers.
  - out of scope: the game's GitHub repository and the facilitator.
  - each solve prints a RECEIPT. paste it in the Teams chat — the chat
    timestamp is your time on the scoreboard.
  - first hint per mission is free, then -25. wrong answers -10.
    answers planted by the building: -50.`,
    "dim");
  term.blank();
  term.println("type 'begin <team name>' when your team is ready.", "accent");
  term.setEnabled(true);
  sfx.alarm();
}
