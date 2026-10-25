// Exact arithmetic for the agent. Small models are unreliable at multi-digit maths, so plain
// arithmetic questions are answered here, and the tool agent gets this as a "calculator" tool.

const WORDS: [RegExp, string][] = [
  [/\bmultiplied by\b|\btimes\b|×|·/gi, "*"],
  [/\bdivided by\b|÷/gi, "/"],
  [/\bplus\b|\badded to\b/gi, "+"],
  [/\bminus\b|\bless\b/gi, "-"],
  [/\bto the power of\b|\*\*/gi, "^"],
  [/(\d)\s*x\s*(\d)/gi, "$1*$2"],
  [/,(?=\d{3}\b)/g, ""],
];

/** Evaluates + - * / ^ % and parentheses. Throws on anything else. */
export function evaluate(expression: string): number {
  const src = expression.replace(/\s+/g, "");
  let i = 0;
  const peek = () => src[i];
  const number = (): number => {
    const m = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (!m) throw new Error(`Unexpected "${src[i] ?? "end"}" in ${expression}`);
    i += m[0].length;
    return Number(m[0]);
  };
  const factor = (): number => {
    if (peek() === "-") {
      i++;
      return -factor();
    }
    if (peek() === "+") {
      i++;
      return factor();
    }
    if (peek() === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new Error("Missing )");
      i++;
      return v;
    }
    return number();
  };
  const power = (): number => {
    const base = factor();
    if (peek() === "^") {
      i++;
      return base ** power();
    }
    return base;
  };
  const term = (): number => {
    let v = power();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = src[i++];
      const r = power();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const value = expr();
  if (i !== src.length) throw new Error(`Unexpected "${src[i]}" in ${expression}`);
  if (!Number.isFinite(value)) throw new Error("Result is not a finite number");
  return value;
}

export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6);
}

/** If the question is plain arithmetic ("What is 37 × 48?"), its exact answer. */
export function arithmeticAnswer(question: string): string | null {
  let q = question.trim().replace(/^(what('s| is)|calculate|compute|evaluate|how much is|solve)\s*/i, "").replace(/[?=.!]+\s*$/, "");
  for (const [re, to] of WORDS) q = q.replace(re, to);
  if (!/^[\d\s+\-*/().^%]+$/.test(q) || !/\d\s*[+\-*/^%]\s*[\d(]/.test(q)) return null;
  try {
    return formatNumber(evaluate(q));
  } catch {
    return null;
  }
}
