// Checks for the sizes and quantities typed into the door and drawer lists.
import type { DrawerLine, PlyRow, SizeLine } from "./types.ts";

const DENOMINATORS = [2, 4, 8, 16, 32];
const HINT = 'Use a number like 20, 20 1/2 or 20 3/8. Fractions can only be halves, quarters, eighths, sixteenths or thirty-seconds.';

export type Measure = { ok: true; inches: number; text: string } | { ok: false; reason: string };

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** "20", "20 1/2", "20-1/2", "3/8", "20.5" (a decimal that lands on a 1/32) -> inches and tidy text. */
export function parseMeasure(input: string): Measure {
  const t = input.trim().replace(/"$/, "").trim();
  if (!t) return { ok: false, reason: "Enter a size. " + HINT };
  const finish = (whole: number, num: number, den: number): Measure => {
    const inches = whole + num / den;
    if (inches <= 0) return { ok: false, reason: "The size must be more than 0." };
    if (inches > 999) return { ok: false, reason: "That size is too large." };
    const g = num ? gcd(num, den) : 1;
    const frac = num ? `${num / g}/${den / g}` : "";
    return { ok: true, inches, text: [whole || !frac ? String(whole) : "", frac].filter(Boolean).join(" ") };
  };

  let m = /^(\d+)$/.exec(t);
  if (m) return finish(+m[1], 0, 1);

  m = /^(?:(\d+)[\s-]+)?(\d+)\/(\d+)$/.exec(t);
  if (m) {
    const num = +m[2], den = +m[3];
    if (!DENOMINATORS.includes(den)) return { ok: false, reason: `${m[2]}/${m[3]} is not allowed. ` + HINT };
    if (num === 0 || num >= den) return { ok: false, reason: `${m[2]}/${m[3]} is not a fraction of an inch. ` + HINT };
    return finish(m[1] ? +m[1] : 0, num, den);
  }

  m = /^(\d*)\.(\d+)$/.exec(t);
  if (m) {
    const value = parseFloat(t);
    const n32 = Math.round(value * 32);
    if (Math.abs(n32 / 32 - value) > 1e-9) return { ok: false, reason: `${t} does not land on a 1/32. ` + HINT };
    return finish(Math.floor(n32 / 32), n32 % 32, 32);
  }

  return { ok: false, reason: `"${t}" is not a size. ` + HINT };
}

/** Tidy text for a valid size ("20-1/2" -> "20 1/2"); anything else comes back unchanged. */
export function tidyMeasure(text: string): string {
  const r = parseMeasure(text);
  return r.ok ? r.text : text;
}

export function qtyProblem(qty: unknown): string | undefined {
  return typeof qty === "number" && Number.isInteger(qty) && qty >= 1 ? undefined : "Must be a whole number, 1 or more.";
}

/** A size box may be left empty, but then it must be empty on the whole row. */
function sizeProblem(text: string, rowHasSizes: boolean): string | undefined {
  if (!text.trim()) return rowHasSizes ? "Enter a size." : undefined;
  const r = parseMeasure(text);
  return r.ok ? undefined : r.reason;
}

export type Issues<K extends string> = Partial<Record<K, string>>;

export function sizeLineIssues(r: SizeLine): Issues<"qty" | "width" | "height"> {
  const any = !!(r.width.trim() || r.height.trim());
  return { qty: qtyProblem(r.qty), width: sizeProblem(r.width, any), height: sizeProblem(r.height, any) };
}

export function drawerLineIssues(r: DrawerLine): Issues<"qty" | "height" | "width" | "depth" | "scallop"> {
  const any = !!(r.height.trim() || r.width.trim() || r.depth.trim());
  return {
    qty: qtyProblem(r.qty), height: sizeProblem(r.height, any), width: sizeProblem(r.width, any), depth: sizeProblem(r.depth, any),
    scallop: sizeProblem(r.scallop, false),
  };
}

/** Plywood parts always need both sizes. */
export function plyRowIssues(r: PlyRow): Issues<"qty" | "w" | "l"> {
  return { qty: qtyProblem(r.qty), w: sizeProblem(r.w, true), l: sizeProblem(r.l, true) };
}

/** Flatten per-row issues into "Row 2, Width: …" lines for display. */
export function issueList<K extends string>(rows: Issues<K>[], names: Record<K, string>): string[] {
  const out: string[] = [];
  rows.forEach((row, i) => {
    for (const k of Object.keys(names) as K[]) if (row[k]) out.push(`Row ${i + 1}, ${names[k]}: ${row[k]}`);
  });
  return out;
}
