// Tiered hint system. Each level registers a single { nudge, method, answer }.
// Players escalate by re-typing 'hint':
//   tier 1  Nudge   — direction, free
//   tier 2  Method  — name the technique, costs 5 pts
//   tier 3  Answer  — near-spoiler, costs 15 pts
// After tier 3 the player is on their own.

import { state } from "./state.js";

const TIERS = [
  { name: "NUDGE",  cost: 0  },
  { name: "METHOD", cost: 5  },
  { name: "ANSWER", cost: 15 },
];

const registry = new Map();   // level -> { nudge, method, answer }
const usedTier = new Map();   // level -> current tier consumed (0 = none yet)

export function registerHints(level, hints) {
  // Backwards-compat: a flat array of strings is treated as
  // [nudge, method, answer]. New API: object form.
  if (Array.isArray(hints)) {
    registry.set(level, {
      nudge:  hints[0] || "",
      method: hints[1] || hints[0] || "",
      answer: hints[2] || hints[1] || hints[0] || "",
    });
  } else {
    registry.set(level, hints);
  }
  if (!usedTier.has(level)) usedTier.set(level, 0);
}

export function nextHint(level) {
  const hints = registry.get(level);
  if (!hints) return { text: "No hints registered for this level.", cost: 0 };
  const cur = usedTier.get(level) || 0;
  if (cur >= TIERS.length) {
    return { text: "No more hints. You're on your own.", cost: 0, exhausted: true };
  }
  const tier = TIERS[cur];
  const text = cur === 0 ? hints.nudge : cur === 1 ? hints.method : hints.answer;
  if (tier.cost > 0) state.addScore(-tier.cost);
  usedTier.set(level, cur + 1);
  return {
    text, cost: tier.cost,
    tier: tier.name, index: cur + 1, total: TIERS.length,
  };
}

export function hintCount(level) {
  return registry.has(level) ? TIERS.length : 0;
}
