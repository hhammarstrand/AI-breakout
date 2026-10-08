// Isomorphic crypto helpers (browser + Node 20+), built on WebCrypto.
//
// Every secret in the game (answers, fragments, the final code) is never
// stored. Instead, the build seals each reward with a key derived from the
// secret (PBKDF2 → AES-GCM). Checking an answer == trying to open its box.

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = globalThis.crypto.subtle;

export const ITER = { answer: 400_000, fragment: 150_000, round: 30_000 };

// Canonical form for anything a player types.
export function normalize(s) {
  return String(s).trim().toUpperCase().replace(/[\s,]+/g, " ");
}

function toB64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function keyFrom(secret, salt, iterations) {
  const base = await subtle.importKey("raw", enc.encode(normalize(secret)), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(secret, payload, iterations = ITER.answer) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(secret, salt, iterations);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(payload))));
  return { salt: toB64(salt), iv: toB64(iv), it: iterations, ct: toB64(ct) };
}

// Returns the payload, or null if the secret is wrong.
export async function open(secret, box) {
  try {
    const key = await keyFrom(secret, fromB64(box.salt), box.it);
    const pt = await subtle.decrypt({ name: "AES-GCM", iv: fromB64(box.iv) }, key, fromB64(box.ct));
    return JSON.parse(dec.decode(pt));
  } catch {
    return null;
  }
}

export async function sha256hex(s) {
  const h = new Uint8Array(await subtle.digest("SHA-256", enc.encode(s)));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmac8(secret, msg) {
  const key = await subtle.importKey("raw", enc.encode(normalize(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await subtle.sign("HMAC", key, enc.encode(msg)));
  return [...sig.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "team";
}

// Receipt teams paste into the Teams chat; the facilitator verifies it offline.
export async function receipt(mission, team, points, secret) {
  const t = slug(team);
  const mac = await hmac8(secret, `${mission}|${t}|${points}`);
  return `RCPT-${mission}-${t}-${points}-${mac}`;
}
