// Turns a parsed cutlist into the documents the shop needs:
//  - finished door / drawer front / end panel order forms
//  - plywood (sheet goods) cutlists grouped by material and thickness
//  - named numbers (door square feet ...) that invoice formulas can use

import type { CabRef, Dim, DrawerLine, DrawerOrderState, Job, OrderGroup, ParsedCutlist, PlyGroup, PlyRow } from "./types.ts";
import type { Vars } from "./calc.ts";
import { dim } from "./cutlist.ts";

/** Materials that are dropped from the plywood cutlist unless the user turns them on. */
export const DEFAULT_HIDDEN_MATERIALS = ["Undefined Material"];

/** Left off by default: parts with no material. */
export const hiddenByDefault = (material: string) => DEFAULT_HIDDEN_MATERIALS.includes(material);

/** "#3", "#3 ×2", "#2 (1,2)". Drawer position letters (A, B, C) are dropped. */
export function refText(r: CabRef): string {
  const id = `#${r.cabinet}`;
  if (!r.qty || r.qty === "1" || /^[A-Za-z]$/.test(r.qty)) return id;
  if (/^\d+$/.test(r.qty)) return `${id} ×${r.qty}`;
  return `${id} (${r.qty})`;
}
const unique = (a: string[]) => [...new Set(a)];
export const refsText = (refs: CabRef[]) => unique(refs.map(refText)).join(", ");

const sqft = (qty: number, w: number, l: number) => (qty * w * l) / 144;

/* ---------- finished doors, drawer fronts, end panels ---------- */

const ORDER_SECTIONS: { heading: string; label: string; hinge: boolean }[] = [
  { heading: "FRAME AND PANEL DOORS", label: "Doors", hinge: true },
  { heading: "FRAME AND PANEL DRAWERS", label: "Drawer fronts", hinge: false },
  { heading: "END PANELS/WAINSCOT Panels", label: "End panels", hinge: false },
];

export function orderGroups(p: ParsedCutlist): OrderGroup[] {
  const groups: OrderGroup[] = [];
  for (const def of ORDER_SECTIONS) {
    const s = p.sections.find((x) => x.heading === def.heading);
    if (!s || !s.rows.length) continue;
    const g: OrderGroup = {
      key: def.heading,
      heading: def.label,
      style: s.meta["Style"] ?? "",
      panelMaterial: s.meta["Panel Material"] ?? "",
      frameMaterial: s.meta["Stiles & Rails"] ?? "",
      showHinge: def.hinge,
      rows: [], pieces: 0, sqft: 0,
    };
    for (const row of s.rows) {
      for (const c of row.columns["Finished Size"] ?? []) {
        g.rows.push({ qty: c.qty, w: c.w.text, h: c.l.text, hinge: row.hinge, refs: refsText(row.refs) });
        g.pieces += c.qty;
        g.sqft += sqft(c.qty, c.w.inches, c.l.inches);
      }
    }
    groups.push(g);
  }
  return groups;
}

/* ---------- plywood and other cut parts ---------- */

interface RawPart { material: string; qty: number; w: string; l: string; wi: number; li: number; part: string; refs: string }

function collectParts(p: ParsedCutlist): RawPart[] {
  const parts: RawPart[] = [];
  for (const b of p.bodyParts) {
    parts.push({
      material: b.material, qty: b.qty, w: b.width.text, l: b.length.text,
      wi: b.width.inches, li: b.length.inches, part: b.description, refs: refsText(b.refs),
    });
  }
  // drawer boxes and pull-outs: each column has its own material in the section header
  const boxSections: { heading: string; prefix: string; cols: [string, string, string][] }[] = [
    { heading: "DRAWERS", prefix: "DRAWER", cols: [["Ends", "End", "END"], ["Sides", "Sides", "SIDE"], ["Bottoms", "Bottom", "BOTTOM"]] },
    { heading: "PULL-OUTS", prefix: "PULL-OUT", cols: [["Fronts", "Front", "FRONT"], ["Ends", "End", "END"], ["Sides", "Sides", "SIDE"], ["Bottoms", "Bottom", "BOTTOM"]] },
  ];
  for (const def of boxSections) {
    const s = p.sections.find((x) => x.heading === def.heading);
    if (!s) continue;
    for (const row of s.rows) {
      for (const [col, metaKey, label] of def.cols) {
        const material = s.meta[metaKey];
        if (!material) continue;
        for (const c of row.columns[col] ?? []) {
          parts.push({
            material, qty: c.qty, w: c.w.text, l: c.l.text, wi: c.w.inches, li: c.l.inches,
            part: `${def.prefix} ${label}`, refs: refsText(row.refs),
          });
        }
      }
    }
  }
  return parts;
}

export function materialsIn(p: ParsedCutlist): string[] {
  const seen: string[] = [];
  for (const x of collectParts(p)) if (!seen.includes(x.material)) seen.push(x.material);
  return seen;
}

/** Plywood cutlist: grouped by material, same-size parts combined, widest first. */
export function plywoodGroups(p: ParsedCutlist, hidden: string[]): PlyGroup[] {
  const byMaterial = new Map<string, Map<string, RawPart>>();
  for (const part of collectParts(p)) {
    if (hidden.includes(part.material)) continue;
    const rows = byMaterial.get(part.material) ?? new Map<string, RawPart>();
    const key = `${part.part}|${part.w}|${part.l}`;
    const prev = rows.get(key);
    if (prev) {
      prev.qty += part.qty;
      prev.refs = unique([prev.refs, part.refs].filter(Boolean).join(", ").split(", ")).join(", ");
    } else rows.set(key, { ...part });
    byMaterial.set(part.material, rows);
  }
  const groups: PlyGroup[] = [];
  for (const [material, rows] of byMaterial) {
    const list = [...rows.values()].sort((a, b) => b.wi - a.wi || b.li - a.li || a.part.localeCompare(b.part));
    const out: PlyRow[] = list.map((r) => ({ qty: r.qty, w: r.w, l: r.l, part: r.part, refs: r.refs }));
    groups.push({
      material, rows: out,
      pieces: list.reduce((t, r) => t + r.qty, 0),
      sqft: list.reduce((t, r) => t + sqft(r.qty, r.wi, r.li), 0),
    });
  }
  return groups.sort((a, b) => thickness(b.material) - thickness(a.material) || a.material.localeCompare(b.material));
}

/** "3/4 Birch VC" -> 0.75 so thicker stock lists first. */
function thickness(material: string): number {
  const m = /^(?:(\d+)\s+)?(\d+)\/(\d+)|^(\d+)/.exec(material.trim());
  if (!m) return 0;
  if (m[4]) return +m[4];
  return (m[1] ? +m[1] : 0) + +m[2] / +m[3];
}

/* ---------- numbers the invoice can use ---------- */

export function cutlistVars(p: ParsedCutlist): Vars {
  const g = (label: string) => orderGroups(p).find((x) => x.heading === label);
  const doors = g("Doors"), fronts = g("Drawer fronts"), ends = g("End panels");
  return {
    doors_count: doors?.pieces ?? 0,
    doors_sqft: doors?.sqft ?? 0,
    drawerfronts_count: fronts?.pieces ?? 0,
    drawerfronts_sqft: fronts?.sqft ?? 0,
    endpanels_count: ends?.pieces ?? 0,
    endpanels_sqft: ends?.sqft ?? 0,
    cabinets_count: p.cabinetCount,
  };
}

/* ---------- finished drawer boxes (the supplier's drawer order form) ---------- */

/** Undermount slide lengths (inches). Drawer boxes must be exactly one of these deep. */
export const SLIDE_SIZES = [9, 12, 15, 18, 21];

/** "20 1/2", "20.5" or "21" -> inches, or null when it is not a number. */
export function inchesOf(text: string): number | null {
  const t = text.trim().replace(/"$/, "");
  try { return dim(t).inches; } catch { /* maybe a decimal */ }
  return /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : null;
}

/** Round a box depth up to the slide it rides on (only when it is within an inch of one). */
export function slideDepth(d: Dim): string {
  const slide = SLIDE_SIZES.find((s) => s >= d.inches - 1e-9 && s - d.inches <= 1);
  return slide === undefined ? d.text : String(slide);
}

/** True for rows that should have a standard slide depth (everything except pull-outs). */
export function needsSlideDepth(r: DrawerLine): boolean {
  return !/pull-?out/i.test(r.note) && !r.pulloutNoScoop && !r.pulloutScoop;
}

/** True when the row's depth is one of the available slide sizes (or does not need one). */
export function depthMatchesSlide(r: DrawerLine): boolean {
  if (!needsSlideDepth(r)) return true;
  const n = inchesOf(r.depth);
  return n !== null && SLIDE_SIZES.includes(n);
}

export const blankDrawerLine = (): DrawerLine => ({
  qty: 1, height: "", width: "", depth: "",
  bottom38: false, pulloutNoScoop: false, pulloutScoop: false, ears: false, scallop: "", partsOnly: false, logo: false,
  front: "", note: "",
});

/**
 * One row per drawer box size, straight from the cutlist. Box height is the end-piece width,
 * box width is the end-piece length, box depth is the side-piece length rounded up to the slide size.
 * Pull-outs keep their own depth. Front size is left blank.
 */
export function drawerRows(p: ParsedCutlist, includePullouts = true): DrawerLine[] {
  const rows = new Map<string, DrawerLine & { h: number; w: number }>();
  const add = (r: DrawerLine, h: number, w: number) => {
    const key = [r.height, r.width, r.depth, r.note].join("|");
    const prev = rows.get(key);
    if (prev) prev.qty += r.qty; else rows.set(key, { ...r, h, w });
  };

  const boxes = p.sections.find((x) => x.heading === "DRAWERS");
  for (const row of boxes?.rows ?? []) {
    const end = row.columns["Ends"]?.[0], side = row.columns["Sides"]?.[0], bottom = row.columns["Bottoms"]?.[0];
    if (!end || !side) continue;
    add({ ...blankDrawerLine(), qty: bottom?.qty ?? end.qty / 2, height: end.w.text, width: end.l.text, depth: slideDepth(side.l) },
      end.w.inches, end.l.inches);
  }

  if (includePullouts) {
    const po = p.sections.find((x) => x.heading === "PULL-OUTS");
    for (const row of po?.rows ?? []) {
      const end = row.columns["Ends"]?.[0], side = row.columns["Sides"]?.[0], bottom = row.columns["Bottoms"]?.[0];
      if (!end || !side) continue;
      add({ ...blankDrawerLine(), qty: bottom?.qty ?? end.qty / 2, height: end.w.text, width: end.l.text, depth: side.l.text, note: "Pull-out" },
        end.w.inches, end.l.inches);
    }
  }
  return [...rows.values()]
    .sort((a, b) => Number(!!a.note) - Number(!!b.note) || b.h - a.h || b.w - a.w)
    .map(({ h: _h, w: _w, ...r }) => r);
}

/** The rows that go on the form: the hand-edited list if there is one, otherwise the cutlist's. */
export function drawerLines(job: Job, d: DrawerOrderState | undefined): DrawerLine[] {
  if (d?.rows) return d.rows;
  return job.cutlist ? drawerRows(job.cutlist.parsed, d?.includePullouts ?? true) : [];
}
