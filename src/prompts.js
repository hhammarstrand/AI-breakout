// Pre-canned starter prompts per level. Players type 'prompts' in-level
// to see workshop-vetted prompts they can paste into Claude/Copilot/Gemini.
// Pedagogical: shows GOOD prompt structure (role + context + concrete data
// + explicit deliverable) without spoiling the answer.

const registry = new Map();

export function registerPrompts(level, prompts) {
  registry.set(level, prompts);
}

export function getPrompts(level) {
  return registry.get(level) || null;
}
