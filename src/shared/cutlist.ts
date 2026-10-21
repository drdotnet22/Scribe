// Parser for the supplier's text cutlists.
// It reads sections (BODIES, END PANELS, DOORS, DRAWERS ...) and turns them into data.
// The supplier's company name and their price totals are deliberately not kept.

import type { BodyPart, Cell, CabRef, Dim, PanelRow, PanelSection, ParsedCutlist } from "./types.ts";

const DIM = String.raw`(\d+(?:\s\d+\/\d+)?|\d+\/\d+)`;

export function dim(text: string): Dim {
  const t = text.trim();
  let m = /^(\d+)$/.exec(t);
  if (m) return { text: t, inches: +m[1] };
  m = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(t);
  if (!m) throw new Error("bad dimension: " + text);
  return { text: t, inches: (m[1] ? +m[1] : 0) + +m[2] / +m[3] };
}

/** "1[#1(2) #2(1)]" -> [{room:1,cabinet:"1",qty:"2"}, {room:1,cabinet:"2",qty:"1"}] */
export function parseRefs(s: string): CabRef[] {
  const m = /^(\d+)\[(.*)\]$/.exec(s.trim());
  if (!m) return [];
  return m[2].split(/\s+/).filter(Boolean).map((tok) => {
    const t = /^#?([0-9]+[A-Z]?)(?:\((.*)\))?$/.exec(tok);
    return { room: +m[1], cabinet: t ? t[1] : tok, qty: t?.[2] ?? "" };
  });
}

const HEADINGS = [
  "BODIES",
  "END PANELS/WAINSCOT Panels",
  "FRAME AND PANEL DOORS",
  "FRAME AND PANEL DRAWERS",
  "DRAWERS",
  "PULL-OUTS",
  "JOB TOTALS",
];

export function parseCutlist(text: string): ParsedCutlist {
  const lines = text.replace(/\r/g, "").split("\n");
  // A long list of cabinets wraps onto the next line: "1[#9(1,2,3) ..." then "#11(1,2)]". Join them into the first line.
  for (let i = 0; i < lines.length; i++) {
    for (let n = 0; n < 4 && /\d+\[[^\]]*$/.test(lines[i]) && i + 1 < lines.length; n++) {
      const next = lines[i + 1];
      if (!next.trim() || / x /.test(next)) break;
      lines[i] = `${lines[i].trimEnd()} ${next.trim()}`;
      lines[i + 1] = "";
    }
  }
  const out: ParsedCutlist = { cabinetCount: 0, bodyParts: [], sections: [], warnings: [] };
  const cabinetIds = new Set<string>();

  let section = "HEADER";
  let material = "";
  let cur: PanelSection | null = null;
  let colStarts: { name: string; at: number }[] = [];
  let lastRow: PanelRow | null = null;

  const isNoise = (l: string) =>
    /Page \d+\s*$/.test(l) || /^\s*Job Number:/.test(l) || /Cutting List\s*$/.test(l) ||
    /^\s*Number\s*$/.test(l) || /^\s*of Pieces\s+Width/.test(l) || /^[=\-\s]+$/.test(l);

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m: RegExpExecArray | null;

    // page header: date, supplier name (ignored), page number
    m = /^\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s+(.+?)\s{2,}Page \d+/.exec(l);
    if (m) { out.date ??= m[1]; continue; }
    m = /^\s*(.+?)\s+Cutting List\s*$/.exec(l);
    if (m) out.customer ??= m[1].replace(/^BODIES\s+/, "").trim();

    // section headings
    const t = l.trim();
    const hit = HEADINGS.find((h) => t === h || (h === "BODIES" && /^BODIES\s{2,}/.test(t)));
    if (hit && (l.startsWith(hit) || hit === "JOB TOTALS")) {
      section = hit; cur = null; lastRow = null;
      if (hit !== "BODIES" && hit !== "JOB TOTALS") {
        cur = { heading: hit, meta: {}, stock: [], columnNames: [], rows: [] };
        out.sections.push(cur);
      }
      continue;
    }

    if (section === "HEADER") {
      m = /^\s*Room\s+(\d+)\s+(\S.*?)\s*$/.exec(l);
      if (m) out.room = { number: m[1], name: m[2] };
      m = /^\s(\d+-\d+[A-Z]?)\s+(\d+)\s+/.exec(l);
      if (m) cabinetIds.add(m[1]);
      continue;
    }

    if (section === "JOB TOTALS") continue; // the supplier's own prices; not used

    if (section === "BODIES") {
      m = /\*+ MATERIAL: (.+?) \*+/.exec(l);
      if (m) { material = m[1].trim(); continue; }
      if (isNoise(l) || /Ln\. feet/.test(l) || !l.trim()) continue;
      const r = new RegExp(
        String.raw`^\s*(\d+)\s{2,}${DIM}\s{2,}${DIM}(?:\s{2,}(\d[A-Z]))?\s{2,}([A-Z][^\[]*?)\s{2,}(\d+\[[^\]]*\])\s*$`,
      ).exec(l);
      if (r) {
        out.bodyParts.push({
          material, qty: +r[1], width: dim(r[2]), length: dim(r[3]),
          edge: r[4], description: r[5].trim(), refs: parseRefs(r[6]),
        } satisfies BodyPart);
      } else out.warnings.push(`Line ${i + 1} was not understood: ${l.trim()}`);
      continue;
    }

    if (!cur) continue;
    if (isNoise(l) && !/^\s*(Finished Size|Fronts)/.test(l)) continue;

    // "179 ft. of 2 1/4" Stock"
    const stock = /(\d+)\s*ft\.\s+of\s+(.+?)\s+Stock/.exec(l);
    if (stock) cur.stock.push(`${stock[1]} ft of ${stock[2]} stock`);
    const meta = /^\s*(Style|Panel Material|Stiles & Rails|Front|Sides|End|Bottom):\s+(.+?)(?:\s{2,}|$)/.exec(l);
    if (meta && !cur.rows.length) cur.meta[meta[1]] = meta[2].trim();
    const meta2 = /\s(Pull Type|Hinge Type|Slide Type):\s+(.+?)(?:\s{2,}|$)/.exec(l);
    if (meta2 && !cur.rows.length) cur.meta[meta2[1]] = meta2[2].replace(/_+/, "").trim();

    // column header line -> where each column starts
    if (/^\s*(Finished Size|Fronts)/.test(l)) {
      colStarts = [];
      for (const n of ["Finished Size", "Fronts", "Panels", "Ends", "Rails", "Sides", "Stiles/Mullions", "Bottoms"]) {
        const at = l.indexOf(n);
        if (at >= 0) colStarts.push({ name: n, at });
      }
      colStarts.sort((a, b) => a.at - b.at);
      cur.columnNames = colStarts.map((c) => c.name);
      continue;
    }

    // data rows are groups like "2) 19 3/8 x 37 3/4"
    const groups = [...l.matchAll(new RegExp(String.raw`(\d+)\)\s+${DIM}\s+x\s+${DIM}`, "g"))];
    if (!groups.length || !colStarts.length) continue;
    const colOf = (at: number) =>
      colStarts.reduce((b, c) => (Math.abs(c.at - at) < Math.abs(b.at - at) ? c : b)).name;
    const cells: Record<string, Cell[]> = {};
    for (const g of groups) (cells[colOf(g.index!)] ??= []).push({ qty: +g[1], w: dim(g[2]), l: dim(g[3]) });

    const last = groups[groups.length - 1];
    const tail = l.slice(last.index! + last[0].length);
    const rm = /(\d+\[[^\]]*\])\s*(Pair|Left|Right|None)?/.exec(tail);
    if (rm) {
      lastRow = { columns: cells, refs: parseRefs(rm[1]), hinge: rm[2] };
      cur.rows.push(lastRow);
    } else if (lastRow) {
      // a second rail size on its own line belongs to the row above
      for (const [k, v] of Object.entries(cells)) (lastRow.columns[k] ??= []).push(...v);
    } else out.warnings.push(`Line ${i + 1} was not understood: ${l.trim()}`);
  }

  out.cabinetCount = cabinetIds.size;
  if (!out.bodyParts.length && !out.sections.some((s) => s.rows.length)) {
    out.warnings.push("No parts were found. Is this the right kind of cutlist file?");
  }
  return out;
}

/** "Stotzfus, Virgil" -> "Virgil Stotzfus" */
export function personName(cutlistCustomer: string | undefined): string {
  const c = (cutlistCustomer ?? "").trim();
  const m = /^([^,]+),\s*(.+)$/.exec(c);
  return m ? `${m[2]} ${m[1]}`.trim() : c;
}
