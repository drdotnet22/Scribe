// Compares two parsed cutlists by what gets ordered or cut, not by cabinet numbers,
// because a layout change renumbers cabinets but the pieces are what matter.

import type { CutlistChange, CutlistComparison, ParsedCutlist, VarChange } from "./types.ts";
import { cutlistVars, hiddenByDefault, materialsIn, orderGroups, plywoodGroups } from "./outputs.ts";

type Tally = Map<string, { item: string; qty: number }>;

function add(t: Tally, key: string, item: string, qty: number) {
  const prev = t.get(key);
  if (prev) prev.qty += qty; else t.set(key, { item, qty });
}

function tallies(p: ParsedCutlist, hidden: string[]): Map<string, Tally> {
  const areas = new Map<string, Tally>();
  const area = (name: string) => { const t = areas.get(name) ?? new Map(); areas.set(name, t); return t as Tally; };
  for (const g of orderGroups(p)) {
    const t = area(g.heading);
    for (const r of g.rows) {
      const item = `${r.w} × ${r.h}${g.showHinge && r.hinge ? ` (${r.hinge})` : ""}`;
      add(t, item, item, r.qty);
    }
  }
  for (const g of plywoodGroups(p, hidden)) {
    const t = area(g.material);
    for (const r of g.rows) add(t, `${r.part}|${r.w}|${r.l}`, `${r.part.toLowerCase()} ${r.w} × ${r.l}`, r.qty);
  }
  return areas;
}

/** Which materials are left off the plywood cutlist after a new cutlist arrives. */
export function carriedHidden(oldHidden: string[], oldP: ParsedCutlist | undefined, newP: ParsedCutlist): string[] {
  const known = new Set(oldP ? materialsIn(oldP) : []);
  return materialsIn(newP).filter((m) => (known.has(m) ? oldHidden.includes(m) : hiddenByDefault(m)));
}

export function compareCutlists(
  oldP: ParsedCutlist, oldHidden: string[], newP: ParsedCutlist, currentRevision: number,
): CutlistComparison {
  const newHidden = carriedHidden(oldHidden, oldP, newP);
  const a = tallies(oldP, oldHidden), b = tallies(newP, newHidden);
  const changes: CutlistChange[] = [];

  for (const name of [...new Set([...a.keys(), ...b.keys()])]) {
    const ta = a.get(name) ?? new Map(), tb = b.get(name) ?? new Map();
    for (const key of new Set([...ta.keys(), ...tb.keys()])) {
      const from = ta.get(key)?.qty ?? 0, to = tb.get(key)?.qty ?? 0;
      if (from === to) continue;
      changes.push({
        area: name, item: (tb.get(key) ?? ta.get(key))!.item, from, to,
        kind: from === 0 ? "added" : to === 0 ? "removed" : "changed",
      });
    }
  }

  const va = cutlistVars(oldP), vb = cutlistVars(newP);
  const vars: VarChange[] = Object.keys(vb)
    .filter((k) => Math.abs(va[k] - vb[k]) > 0.005)
    .map((name) => ({ name, from: va[name], to: vb[name] }));

  const notes: string[] = [];
  if ((oldP.customer ?? "") !== (newP.customer ?? "")) notes.push(`Customer changes from "${oldP.customer ?? ""}" to "${newP.customer ?? ""}".`);
  if (oldP.cabinetCount !== newP.cabinetCount) notes.push(`Cabinet rows: ${oldP.cabinetCount} → ${newP.cabinetCount}.`);
  const oldMats = new Set(materialsIn(oldP));
  for (const m of materialsIn(newP)) if (!oldMats.has(m)) notes.push(`New material: ${m}${newHidden.includes(m) ? " (left off the plywood cutlist)" : ""}.`);
  const newMats = new Set(materialsIn(newP));
  for (const m of oldMats) if (!newMats.has(m)) notes.push(`Material no longer used: ${m}.`);

  return {
    identical: !changes.length && !notes.length && !vars.length,
    changes, vars, notes, warnings: newP.warnings, currentRevision,
  };
}
