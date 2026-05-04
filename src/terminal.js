// Tiny terminal engine: typewriter output queue + command parser.
// Levels register handlers via Terminal.setHandler(fn).

export class Terminal {
  constructor(rootEl, promptInputEl, promptLabelEl) {
    this.root = rootEl;
    this.input = promptInputEl;
    this.label = promptLabelEl;
    this.queue = [];
    this.busy = false;
    this.handler = null;
    this.history = [];
    this.histIdx = -1;
    this.speedMs = 12;
    this.input.addEventListener("keydown", (e) => this.#onKey(e));
  }

  setHandler(fn) { this.handler = fn; }
  setLabel(text) { this.label.textContent = text; }

  setEnabled(enabled) {
    this.input.disabled = !enabled;
    if (enabled) this.input.focus();
  }

  setPlaceholder(text) { this.input.placeholder = text || ""; }

  focus() { this.input.focus(); }

  clear() {
    this.root.innerHTML = "";
  }

  // Add a line instantly with optional css class.
  println(text = "", cls = "") {
    const div = document.createElement("div");
    div.className = "line" + (cls ? " " + cls : "");
    div.textContent = text;
    this.root.appendChild(div);
    this.#scroll();
  }

  // Multi-line block, instant.
  printBlock(text, cls = "") {
    text.split("\n").forEach((l) => this.println(l, cls));
  }

  // Typewriter print: returns a promise that resolves when done.
  async type(text = "", cls = "", charMs = this.speedMs) {
    const div = document.createElement("div");
    div.className = "line" + (cls ? " " + cls : "");
    this.root.appendChild(div);
    for (let i = 0; i < text.length; i++) {
      div.textContent += text[i];
      this.#scroll();
      // small randomization for organic feel
      const wait = Math.max(2, charMs + (Math.random() * 4 - 2));
      // skip wait if user holds enter (best-effort)
      await sleep(wait);
    }
  }

  async typeBlock(text, cls = "", charMs = this.speedMs) {
    for (const line of text.split("\n")) {
      await this.type(line, cls, charMs);
    }
  }

  glitch(text) { this.println(text, "glitch"); }

  blank(n = 1) { for (let i = 0; i < n; i++) this.println(""); }

  // Echoes the user-typed line back into history.
  echo(text) { this.println(text, "echo"); }

  #scroll() {
    this.root.scrollTop = this.root.scrollHeight;
  }

  #onKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const raw = this.input.value;
      this.input.value = "";
      const trimmed = raw.trim();
      if (!trimmed) { this.echo(""); return; }
      this.history.push(trimmed);
      this.histIdx = this.history.length;
      this.echo(trimmed);
      if (this.handler) this.handler(trimmed);
    } else if (e.key === "ArrowUp") {
      if (!this.history.length) return;
      this.histIdx = Math.max(0, this.histIdx - 1);
      this.input.value = this.history[this.histIdx] || "";
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (!this.history.length) return;
      this.histIdx = Math.min(this.history.length, this.histIdx + 1);
      this.input.value = this.history[this.histIdx] || "";
      e.preventDefault();
    } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.clear();
    }
  }
}

export function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Parse a command string into [name, ...args] preserving quoted strings.
export function parseCommand(s) {
  const out = [];
  const re = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[0]);
  }
  return out;
}
