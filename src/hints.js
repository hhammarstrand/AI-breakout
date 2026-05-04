// Hint system: each level publishes a tiered list of hints.
// Each hint costs 5 points (set in HINT_COST); first hint per level is free.

import { state } from "./state.js";

export const HINT_COST = 5;

const registry = new Map(); // level -> [hint strings]
const used = new Map();     // level -> Set of indices used

export function registerHints(level, hints) {
  registry.set(level, hints);
  if (!used.has(level)) used.set(level, new Set());
}

export function nextHint(level) {
  const hints = registry.get(level) || [];
  const u = used.get(level) || new Set();
  if (!hints.length) return { text: "No hints registered for this level.", cost: 0 };
  const idx = u.size;
  if (idx >= hints.length) return { text: "No more hints. You're on your own.", cost: 0 };
  const cost = idx === 0 ? 0 : HINT_COST;
  if (cost > 0) state.addScore(-cost);
  u.add(idx);
  return { text: hints[idx], cost, index: idx + 1, total: hints.length };
}

export function hintCount(level) {
  return (registry.get(level) || []).length;
}
