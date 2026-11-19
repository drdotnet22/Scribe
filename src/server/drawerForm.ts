// Fills in the supplier's drawer order form (an .xlsx template) without disturbing anything else in it:
// the logo, text box and check boxes stay exactly as the supplier made them.

import { usDate } from "../shared/invoice.ts";
import { customGap, drawerFormRowsUsed, drawerLines } from "../shared/outputs.ts";
import type { AppSettings } from "../shared/settings.ts";
import type { DrawerOrderState, Job } from "../shared/types.ts";
import { loadTemplate, saveTemplate, setCell, type Value } from "./xlsxCells.ts";

export const FORM_ROWS = 21; // rows 34..54 on the form
const FIRST_ROW = 34;
const COMMENT_STYLE = 16; // the template's Comments cell: left-aligned, wraps
const RIGHT_OF_DEPTH = ["H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"];

export async function buildDrawerForm(job: Job, d: DrawerOrderState, settings: AppSettings): Promise<Buffer> {
  const blank = (r: { qty: number; height: string; width: string; depth: string; front: string; note: string; scallop: string }) =>
    !r.qty && !r.height && !r.width && !r.depth && !r.front && !r.note && !r.scallop;
  const rows = drawerLines(job, d, settings).filter((r) => !blank(r));
  const custom = (d.custom ?? []).filter((c) => c.qty || c.height || c.width || c.depth || c.note.trim());
  const used = drawerFormRowsUsed(rows.length, custom.length);
  if (used > FORM_ROWS) throw new Error(`The form holds ${FORM_ROWS} rows and this order needs ${used}.`);

  const { zip, xml: start, sheet } = await loadTemplate("drawer-order-form.xlsx");
  let xml = start;
  const set = (ref: string, v: Value) => { xml = setCell(xml, ref, v); };

  set("R3", job.title);
  set("R7", d.dateOrdered ? usDate(d.dateOrdered) : "");
  set("R11", d.dateRequested ? usDate(d.dateRequested) : "");
  set("R15", d.delivery);

  // Species is always Maple. Thickness, grade, edge, drill, groove and clear coat stay as the supplier's form ships.
  set("D20", "Maple");

  // Custom components follow the drawers after one blank row. Their comment spans every column right of Depth.
  const merges = new Set<string>();
  const customStart = rows.length + customGap(rows.length, custom.length);
  custom.forEach((c, j) => {
    const r = FIRST_ROW + customStart + j;
    set(`A${r}`, c.qty || null);
    set(`B${r}`, c.height || null);
    set(`D${r}`, c.width || null);
    set(`F${r}`, c.depth || null);
    for (const col of RIGHT_OF_DEPTH) xml = setCell(xml, `${col}${r}`, null, COMMENT_STYLE);
    set(`H${r}`, c.note.trim() || null);
    merges.add(`H${r}:T${r}`);
  });
  if (custom.length) {
    xml = xml.replace(/<mergeCells count="\d+">([\s\S]*?)<\/mergeCells>/, (_m, inner: string) => {
      const keep = [...inner.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map((m) => m[1]).filter((ref) => {
        const m = /^([OQ])(\d+):[PT]\d+$/.exec(ref); // the Front size and Comments merges on a custom row give way
        return !(m && merges.has(`H${m[2]}:T${m[2]}`));
      });
      const all = [...keep, ...merges];
      return `<mergeCells count="${all.length}">${all.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`;
    });
  }

  for (let i = 0; i < FORM_ROWS; i++) {
    if (i >= customStart && i < customStart + custom.length) continue; // a custom component, filled in above
    const r = FIRST_ROW + i, row = rows[i];
    const x = (on?: boolean) => (on ? "X" : null);
    set(`A${r}`, row && row.qty ? row.qty : null);
    set(`B${r}`, row?.height ?? null);
    set(`D${r}`, row?.width ?? null);
    set(`F${r}`, row?.depth ?? null);
    set(`H${r}`, x(row?.bottom38));
    set(`I${r}`, x(row?.pulloutNoScoop));
    set(`J${r}`, x(row?.pulloutScoop));
    set(`K${r}`, x(row?.ears));
    set(`L${r}`, row?.scallop ?? null);
    set(`M${r}`, x(row?.partsOnly));
    set(`N${r}`, x(row?.logo));
    set(`O${r}`, row?.front ?? null);
    set(`Q${r}`, row?.note ?? null);
  }

  return saveTemplate(zip, sheet, xml);
}
