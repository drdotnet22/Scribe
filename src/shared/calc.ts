// Formula evaluation for amount cells.
// Accepts plain numbers ("285.88"), arithmetic ("=1169.59+52", "=18*44/144*27.5"),
// percentages ("=100*5%") and names from the cutlist ("=doors_sqft*27.5").

export type Vars = Record<string, number>;
export interface CalcResult { v: number; blank?: boolean; err?: string }

export function calc(raw: unknown, vars: Vars = {}): CalcResult {
  let s = String(raw ?? "").trim();
  if (!s) return { v: 0, blank: true };
  if (s[0] === "=") s = s.slice(1);

  // swap names for their values
  const lower: Vars = {};
  for (const [k, v] of Object.entries(vars)) lower[k.toLowerCase()] = v;
  let unknown = "";
  s = s.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => {
    const v = lower[name.toLowerCase()];
    if (v === undefined) { unknown ||= name; return name; }
    return `(${v})`;
  });
  if (unknown) return { v: 0, err: `Unknown name: ${unknown}` };

  s = s
    .replace(/[$,]/g, "")
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)")
    .replace(/\^/g, "**")
    .replace(/×/g, "*")
    .replace(/÷/g, "/");
  if (!/^[\d+\-*/().\s]*$/.test(s) || !s.trim()) return { v: 0, err: "Can't read this formula" };
  try {
    const v = Function(`"use strict";return (${s})`)();
    return Number.isFinite(v) ? { v } : { v: 0, err: "Not a number" };
  } catch {
    return { v: 0, err: "Can't read this formula" };
  }
}

export const num = (raw: unknown, vars?: Vars) => calc(raw, vars).v;

export function fmt(n: number): string {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** What a cell shows when you are not editing it. */
export function display(raw: unknown, vars?: Vars): string {
  const r = calc(raw, vars);
  return r.blank ? "" : r.err ? String(raw) : fmt(r.v);
}

/** True when the cell holds a calculation rather than a plain number. */
export function isFormula(raw: unknown, vars?: Vars): boolean {
  const r = calc(raw, vars);
  return !r.blank && !r.err && !/^\s*[\d,.$]+\s*$/.test(String(raw));
}
