// Per-team mission seed. URL param ?seed=<anything> picks codename + strain
// from fixed pools so two teams can't copy-paste each other's auth code.
// Survivor room and hostile set stay fixed (door graph depends on them).

const CODENAMES = ["AEGIS", "KESTREL", "ORYX", "ATHENA", "JANUS", "VESTA", "NEMESIS"];
const STRAINS   = ["K9", "J7", "M3", "V8", "X4", "R5", "T2", "B6", "D1", "F4", "Q8", "Z3"];

const MORSE = {
  A: ".-",   B: "-...", C: "-.-.", D: "-..",  E: ".",    F: "..-.", G: "--.",
  H: "....", I: "..",   J: ".---", K: "-.-",  L: ".-..", M: "--",   N: "-.",
  O: "---",  P: ".--.", Q: "--.-", R: ".-.",  S: "...",  T: "-",    U: "..-",
  V: "...-", W: ".--",  X: "-..-", Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
};

function strHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = s + 0x6D2B79F5 | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function morseEncode(s) {
  return s.toUpperCase().split("")
    .map((c) => MORSE[c] || "")
    .filter(Boolean)
    .join(" ");
}

let mission = null;

function readSeed() {
  const fromUrl = new URLSearchParams(location.search).get("seed");
  return (fromUrl || "default").trim();
}

export function getMission() {
  if (mission) return mission;
  const seed = readSeed();
  const rng = mulberry32(strHash(seed));
  const codename = CODENAMES[Math.floor(rng() * CODENAMES.length)];
  const strain   = STRAINS[Math.floor(rng() * STRAINS.length)];
  const survivor = "4-12";
  const survivorRoomNumber = survivor.split("-")[1].replace(/^0+/, "") || "0";
  mission = {
    seed,
    codename,
    strain,
    morseSeq: morseEncode(strain),
    vigenereKey: "NORDLUND",
    survivor,
    survivorRoomNumber, // string like "12"
    hostiles: ["4-03", "4-07", "4-15"],
    auth: `${codename}-${strain}-${survivorRoomNumber}`,
  };
  return mission;
}

// Useful for debug / outro
export function missionSummary() {
  const m = getMission();
  return `seed=${m.seed}  codename=${m.codename}  strain=${m.strain}  auth=${m.auth}`;
}
