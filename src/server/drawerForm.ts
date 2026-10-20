// Fills in the supplier's drawer order form (an .xlsx template) without disturbing anything else in it:
// the logo, text box and check boxes stay exactly as the supplier made them.

import { usDate } from "../shared/invoice.ts";
import { drawerLines } from "../shared/outputs.ts";
import type { AppSettings } from "../shared/settings.ts";
import type { DrawerOrderState, Job } from "../shared/types.ts";
import { loadTemplate, saveTemplate, setCell, type Value } from "./xlsxCells.ts";

export const FORM_ROWS = 21; // rows 34..54 on the form
const FIRST_ROW = 34;

export async function buildDrawerForm(job: Job, d: DrawerOrderState, settings: AppSettings): Promise<Buffer> {
  const blank = (r: { qty: number; height: string; width: string; depth: string; front: string; note: string; scallop: string }) =>
    !r.qty && !r.height && !r.width && !r.depth && !r.front && !r.note && !r.scallop;
  const rows = drawerLines(job, d, settings).filter((r) => !blank(r));
  if (rows.length > FORM_ROWS) throw new Error(`The form holds ${FORM_ROWS} rows and this job has ${rows.length}.`);

  const { zip, xml: start, sheet } = await loadTemplate("drawer-order-form.xlsx");
  let xml = start;
  const set = (ref: string, v: Value) => { xml = setCell(xml, ref, v); };

  set("R3", job.title);
  set("R7", d.dateOrdered ? usDate(d.dateOrdered) : "");
  set("R11", d.dateRequested ? usDate(d.dateRequested) : "");
  set("R15", d.delivery);

  // Species is always Maple. Thickness, grade, edge, drill, groove and clear coat stay as the supplier's form ships.
  set("D20", "Maple");

  for (let i = 0; i < FORM_ROWS; i++) {
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
