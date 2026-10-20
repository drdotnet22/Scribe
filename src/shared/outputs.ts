// Turns a parsed cutlist into the documents the shop needs:
//  - finished door / drawer front / end panel order forms
//  - plywood (sheet goods) cutlists grouped by material and thickness
//  - named numbers (door square feet ...) that invoice formulas can use

import type { CabRef, DrawerRow, OrderGroup, ParsedCutlist, PlyGroup, PlyRow } from "./types.ts";
import type { Vars } from "./calc.ts";

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

/** "9/16 Poplar" -> "Poplar" */
export function drawerSpecies(p: ParsedCutlist): string {
  const s = p.sections.find((x) => x.heading === "DRAWERS")?.meta["Sides"] ?? "";
  return s.replace(/^\s*(?:\d+\s+)?\d+\/\d+\s*/, "").replace(/^\d+\s+/, "").trim();
}

/**
 * One row per drawer box size. Box height is the end-piece width, box width is the
 * end-piece length, box depth is the side-piece length. The front size comes from the
 * matching drawer front (same cabinet and position letter in the cutlist).
 */
export function drawerRows(p: ParsedCutlist, includePullouts = true): DrawerRow[] {
  const frontOf = new Map<string, string>();
  const fronts = p.sections.find((x) => x.heading === "FRAME AND PANEL DRAWERS");
  for (const row of fronts?.rows ?? []) {
    const c = row.columns["Finished Size"]?.[0];
    if (!c) continue;
    for (const r of row.refs) frontOf.set(`${r.cabinet}|${r.qty}`, `${c.l.text} x ${c.w.text}`);
  }

  const rows = new Map<string, DrawerRow & { h: number; w: number }>();
  const add = (r: DrawerRow, h: number, w: number) => {
    const key = [r.height, r.width, r.depth, r.front, r.note].join("|");
    const prev = rows.get(key);
    if (prev) prev.qty += r.qty; else rows.set(key, { ...r, h, w });
  };

  const boxes = p.sections.find((x) => x.heading === "DRAWERS");
  for (const row of boxes?.rows ?? []) {
    const end = row.columns["Ends"]?.[0], side = row.columns["Sides"]?.[0], bottom = row.columns["Bottoms"]?.[0];
    if (!end || !side) continue;
    const qty = bottom?.qty ?? end.qty / 2;
    const front = row.refs.map((r) => frontOf.get(`${r.cabinet}|${r.qty}`)).find(Boolean) ?? "";
    add({ qty, height: end.w.text, width: end.l.text, depth: side.l.text, front, note: "" }, end.w.inches, end.l.inches);
  }

  if (includePullouts) {
    const po = p.sections.find((x) => x.heading === "PULL-OUTS");
    for (const row of po?.rows ?? []) {
      const end = row.columns["Ends"]?.[0], side = row.columns["Sides"]?.[0], bottom = row.columns["Bottoms"]?.[0], fr = row.columns["Fronts"]?.[0];
      if (!end || !side) continue;
      add({
        qty: bottom?.qty ?? end.qty / 2, height: end.w.text, width: end.l.text, depth: side.l.text,
        front: fr ? `${fr.w.text} x ${fr.l.text}` : "", note: "Pull-out",
      }, end.w.inches, end.l.inches);
    }
  }
  return [...rows.values()]
    .sort((a, b) => Number(!!a.note) - Number(!!b.note) || b.h - a.h || b.w - a.w)
    .map(({ h: _h, w: _w, ...r }) => r);
}
