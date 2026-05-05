// Game state: persisted in localStorage. Tracks score, progress, inventory.

const KEY = "blackout.v2";
const TOTAL_LEVELS = 4;

const initial = () => ({
  level: 0,            // 0 = intro, 1..4 = levels, 5 = outro
  completed: [],       // levels completed (1..4)
  score: 0,
  hintsUsed: 0,
  wrongAttempts: 0,
  inventory: [],       // strings: "FRAG-A:K9", "FLOOR-4-ROUTE", etc
  startedAt: null,     // ms epoch
  containmentStart: null, // ms epoch — when 60-min timer started
  extractedAt: null,   // ms epoch — when player reached outro (freezes timer)
  audio: true,
  readerMode: false,   // accessibility: kills flicker/scanlines + bumps font
  teamName: null,      // optional team label for facilitator-friendly status share
  journal: [],         // [{ ts, kind, text }] auto-log of key events
  osRebootDone: false, // BMS-→CDC mid-game skin switch (one-shot at T+30min)
  vegaCompromised: false, // post-reboot VEGA-lies sequence already scheduled
  marginNotesFired: {}, // { 1: true, ... } — operator voices already played per level
  deepScans: {},        // { 1: true, ... } — bonus stretch objectives claimed
  maydayUsed: false,    // one-shot panic-button bonus clue
  bestRun: null,        // { timeSec, score, hintsUsed, wrongAttempts, sig, at }
});

let cache = null;

export const state = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      cache = raw ? { ...initial(), ...JSON.parse(raw) } : initial();
    } catch {
      cache = initial();
    }
    return cache;
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
  },
  reset() {
    cache = initial();
    this.save();
  },
  get() { return cache; },

  addScore(n) {
    // hard mode (?mode=blackout) doubles positive points; penalties unchanged
    const mult = (n > 0 && this.isHardMode()) ? 2 : 1;
    cache.score = Math.max(0, cache.score + n * mult);
    this.save();
  },
  isHardMode() {
    try { return new URLSearchParams(location.search).get("mode") === "blackout"; }
    catch { return false; }
  },
  addItem(item) {
    if (!cache.inventory.includes(item)) {
      cache.inventory.push(item);
      this.logEntry(`fragment acquired: ${item}`, "accent");
    }
    this.save();
  },
  hasItem(item) { return cache.inventory.includes(item); },

  completeLevel(n) {
    if (!cache.completed.includes(n)) {
      cache.completed.push(n);
      cache.completed.sort();
      this.logEntry(`L${n} complete`, "system");
    }
    cache.level = Math.max(cache.level, n + 1);
    this.save();
  },

  setLevel(n) {
    if (cache.level !== n) {
      this.logEntry(n >= 5 ? "extracted" : `entered L${n}`, "info");
    }
    cache.level = n; this.save();
  },

  totalLevels: TOTAL_LEVELS,

  startContainment() {
    if (!cache.containmentStart) {
      cache.containmentStart = Date.now();
      this.save();
    }
  },
  markExtracted() {
    if (!cache.extractedAt) {
      cache.extractedAt = Date.now();
      this.save();
    }
  },
  containmentRemainingMs(durationMs = 60 * 60 * 1000) {
    if (!cache.containmentStart) return durationMs;
    const ref = cache.extractedAt || Date.now();
    return Math.max(0, durationMs - (ref - cache.containmentStart));
  },

  toggleAudio() { cache.audio = !cache.audio; this.save(); return cache.audio; },

  toggleReaderMode() { cache.readerMode = !cache.readerMode; this.save(); return cache.readerMode; },

  setTeamName(name) {
    cache.teamName = name ? String(name).trim().slice(0, 24) : null;
    this.save();
  },

  // Append a key event to the journal. Used for level transitions, hint
  // usage, item acquisition — anything that helps a late-joiner catch up.
  logEntry(text, kind = "info") {
    if (!cache.journal) cache.journal = [];
    cache.journal.push({ ts: Date.now(), kind, text });
    // cap at 200 entries to keep localStorage small
    if (cache.journal.length > 200) cache.journal.shift();
    this.save();
  },

  // Record a completed run; updates bestRun if it beats the previous one.
  // Returns { isBest, previous } so the UI can display "NEW PERSONAL BEST".
  recordRun(run) {
    const previous = cache.bestRun;
    const isBest = !previous
      || run.score > previous.score
      || (run.score === previous.score && run.timeSec < previous.timeSec);
    if (isBest) {
      cache.bestRun = { ...run, at: Date.now() };
      this.save();
    }
    return { isBest, previous };
  },
};
