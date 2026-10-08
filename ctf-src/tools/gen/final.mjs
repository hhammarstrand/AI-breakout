// Final — containment override. Information is split across three roles
// (operator / engineer / medic). Each player opens one role on their own
// machine; the team has to talk to assemble the 6-digit override code.

import { makeRng } from "../rng.mjs";

const COLORS = ["RED", "AMBER", "BLUE", "GREEN", "WHITE"];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function genFinal(seed) {
  const rng = makeRng(seed, "final");
  const serialDigits = String(rng.int(1000, 9999));
  const serialLetter = rng.pick("ABCDEFGHIKLMNOPRSTUVXZ".split(""));
  const serial = `HX-${serialDigits}-${serialLetter}`;
  const valves = [...Array(6)].map((_, i) => ({
    id: `V${i + 1}`,
    color: rng.pick(COLORS),
    pressure: +(rng.next() * 6 + 0.5).toFixed(1),
    lamp: rng.chance(0.45) ? "BLINKING" : "STEADY",
  }));
  const vitals = {
    hr: rng.int(88, 141),
    spo2: rng.int(86, 98),
    blood: rng.pick(BLOOD),
    tempC: +(36 + rng.next() * 2.5).toFixed(1),
    resp: rng.int(14, 28),
  };

  const vowel = "AEIOU".includes(serialLetter);
  const d1 = valves.filter((v) => v.lamp === "BLINKING").length % 10;
  const d2 = (Number(serialDigits.at(-1)) + (vowel ? 3 : 0)) % 10;
  const d3 = (valves.filter((v) => v.color === "RED" && v.pressure > 3).length + (vitals.spo2 < 92 ? 5 : 0)) % 10;
  const maxV = valves.reduce((a, b) => (b.pressure > a.pressure ? b : a));
  const d4 = Math.floor(maxV.pressure) % 10;
  const d5 = Math.floor(vitals.hr / 10) % 10;
  const d6 = (d1 + d2 + d3 + d4 + d5) % 10;
  let code = `${d1}${d2}${d3}${d4}${d5}${d6}`;
  if (vitals.blood.endsWith("-")) code = [...code].reverse().join("");

  const operator =
`CONTAINMENT CONTROLLER — FRONT PANEL
controller serial : ${serial}
mode              : LOCKDOWN (thermite suppression armed)

valve  color   pressure  lamp
${valves.map((v) => `${v.id.padEnd(6)} ${v.color.padEnd(7)} ${v.pressure.toFixed(1).padStart(4)} bar  ${v.lamp}`).join("\n")}

you can SEE the panel. you do NOT have the manual.
describe what you see to your engineer.`;

  const engineer =
`HELIX CONTAINMENT OVERRIDE — FIELD MANUAL §7.3
the override code has six digits, d1..d6. compute each one:

  d1  number of valves whose lamp is BLINKING.
  d2  last digit of the controller serial number.
      if the serial ends in a vowel (A E I O U), add 3. keep only the last digit.
  d3  number of RED valves with pressure strictly above 3.0 bar.
      if the survivor's SpO2 is below 92, add 5. keep only the last digit.
  d4  integer part of the HIGHEST valve pressure.
  d5  tens digit of the survivor's heart rate.
  d6  (d1 + d2 + d3 + d4 + d5), last digit.

  if the survivor's blood type is Rh-negative, enter the code REVERSED.

submit with:  override <six digits>
you have the manual. you do NOT see the panel or the survivor.`;

  const medic =
`DRONE MED-LINK — PATIENT: NORDLUND, K.
heart rate   : ${vitals.hr} bpm
SpO2         : ${vitals.spo2} %
blood type   : ${vitals.blood}
core temp    : ${vitals.tempC} °C
resp. rate   : ${vitals.resp} /min
status       : conscious, hypoxic stress, mobile

you can see the patient. relay what the engineer asks for.`;

  return { code, views: { operator, engineer, medic }, notes: { serial, valves, vitals, code } };
}
