// Fills in the supplier's drawer order form (an .xlsx template) without disturbing anything else in it:
// the logo, text box and check boxes stay exactly as the supplier made them.

import JSZip from "jszip";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { usDate } from "../shared/invoice.ts";
import { drawerLines } from "../shared/outputs.ts";
import type { AppSettings } from "../shared/settings.ts";
import type { DrawerOrderState, Job } from "../shared/types.ts";

export const FORM_ROWS = 21; // rows 34..54 on the form
const FIRST_ROW = 34;

function templatePath(): string {
  for (const rel of ["../assets/drawer-order-form.xlsx", "../../assets/drawer-order-form.xlsx"]) {
    const p = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(p)) return p;
  }
  throw new Error("Drawer order form template not found.");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
type Value = string | number | boolean | null;

/** Replace the value of one cell, keeping its style. */
function setCell(xml: string, ref: string, value: Value): string {
  const re = new RegExp(`<c r="${ref}"((?:\\s[^>]*?)?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  if (!m) throw new Error(`Template cell ${ref} not found.`);
  const style = /\ss="(\d+)"/.exec(m[1])?.[1];
  const s = style ? ` s="${style}"` : "";
  let cell: string;
  if (value === null || value === "") cell = `<c r="${ref}"${s}/>`;
  else if (typeof value === "boolean") cell = `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
  else if (typeof value === "number") cell = `<c r="${ref}"${s}><v>${value}</v></c>`;
  else cell = `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  return xml.replace(re, () => cell);
}

export async function buildDrawerForm(job: Job, d: DrawerOrderState, settings: AppSettings): Promise<Buffer> {
  const blank = (r: { qty: number; height: string; width: string; depth: string; front: string; note: string; scallop: string }) =>
    !r.qty && !r.height && !r.width && !r.depth && !r.front && !r.note && !r.scallop;
  const rows = drawerLines(job, d, settings).filter((r) => !blank(r));
  if (rows.length > FORM_ROWS) throw new Error(`The form holds ${FORM_ROWS} rows and this job has ${rows.length}.`);

  const zip = await JSZip.loadAsync(readFileSync(templatePath()));
  let xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
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

  // Rebuild the package part by part (no folder entries), in the template's own order.
  const out = new JSZip();
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    out.file(name, name === "xl/worksheets/sheet1.xml" ? xml : await entry.async("nodebuffer"), { createFolders: false });
  }
  return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
