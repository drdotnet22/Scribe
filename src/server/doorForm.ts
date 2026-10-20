// Fills in the supplier's door order form (an .xlsx template), keeping its layout and print setup.
// Doors go in the left table, then a shaded "END PANELS" label row and the end panels under it.
// Drawer fronts go in the right table.

import { DOOR_FORM_ROWS, doorLines, doorTableRows, inchesOf } from "../shared/outputs.ts";
import type { DoorOrderState, Job, SizeLine } from "../shared/types.ts";
import { excelDate, loadTemplate, saveTemplate, setCell, type Value } from "./xlsxCells.ts";

const FIRST_ROW = 17;

// Styles in the template (see xl/styles.xml): numbers in 32nds, plain text, borders. 33 and the fill are added below.
const S = { qty: 26, inch: 27, note: 26, fQty: 12, fInch: 8, fNote: 13, divider: 33 } as const;

const blank = (r: SizeLine) => !r.width.trim() && !r.height.trim() && !r.note.trim();   // a row with only a quantity is still empty
const inchValue = (t: string): Value => { const n = inchesOf(t); return n === null ? (t.trim() || null) : n; };

export function doorFormCounts(job: Job, d: DoorOrderState | undefined) {
  const l = doorLines(job, d);
  const doors = l.doors.filter((r) => !blank(r)).length, ends = l.endPanels.filter((r) => !blank(r)).length;
  return { left: doorTableRows(doors, ends), right: l.fronts.filter((r) => !blank(r)).length, capacity: DOOR_FORM_ROWS };
}

export async function buildDoorForm(job: Job, d: DoorOrderState): Promise<Buffer> {
  const l = doorLines(job, d);
  const doors = l.doors.filter((r) => !blank(r)), ends = l.endPanels.filter((r) => !blank(r)), fronts = l.fronts.filter((r) => !blank(r));
  if (doorTableRows(doors.length, ends.length) > DOOR_FORM_ROWS) {
    throw new Error(`The form's door table holds ${DOOR_FORM_ROWS} rows and this order needs ${doorTableRows(doors.length, ends.length)}.`);
  }
  if (fronts.length > DOOR_FORM_ROWS) throw new Error(`The form's drawer table holds ${DOOR_FORM_ROWS} rows and this order needs ${fronts.length}.`);

  const { zip, xml: start, sheet } = await loadTemplate("door-order-form.xlsx");
  let xml = start;
  const set = (ref: string, v: Value, style?: number) => { xml = setCell(xml, ref, v, style); };

  // header
  set("A4", d.type === "quote" ? "✅" : "☐");
  set("A5", d.type === "order" ? "✅" : "☐");
  set("L2", d.po);
  set("L5", excelDate(d.date));
  set("D7", "Grape Country Woodcraft");
  set("D8", d.contactName); set("D9", d.address); set("D10", d.cityStateZip); set("D11", d.phone); set("D12", d.email);
  set("D13", job.title);
  set("J7", d.species); set("J8", d.doorStyle); set("J9", d.insideEdge); set("J10", d.panelProfile); set("J11", d.outsideEdge);
  set("J12", d.drawerStyle);
  set("J13", excelDate(d.dateRequired));
  set("F15", `${d.euroHinges ? "✅" : "☐"} Drill for Euro Hinges`);

  // tables: every row is reset first so nothing from the template's sample order is left behind
  type Row = { kind: "line"; line: SizeLine } | { kind: "divider" } | null;
  const left: Row[] = [...doors.map((line): Row => ({ kind: "line", line }))];
  if (ends.length) left.push({ kind: "divider" }, ...ends.map((line): Row => ({ kind: "line", line })));
  const merges: string[] = [];

  for (let i = 0; i < DOOR_FORM_ROWS; i++) {
    const r = FIRST_ROW + i, row = left[i] ?? null, f = fronts[i];
    set(`A${r}`, null, row?.kind === "divider" ? S.divider : 6);
    if (row?.kind === "divider") {
      set(`A${r}`, "END PANELS", S.divider);
      for (const c of "BCDEF") set(`${c}${r}`, null, S.divider);
      merges.push(`A${r}:F${r}`);
    } else {
      const x = row?.kind === "line" ? row.line : null;
      set(`B${r}`, x && x.qty ? x.qty : null, S.qty);
      set(`C${r}`, x ? inchValue(x.width) : null, S.inch);
      set(`D${r}`, "x");
      set(`E${r}`, x ? inchValue(x.height) : null, S.inch);
      set(`F${r}`, x?.note.trim() || null, S.note);
    }
    set(`H${r}`, f && f.qty ? f.qty : null, S.fQty);
    set(`I${r}`, f ? inchValue(f.width) : null, S.fInch);
    set(`J${r}`, "x");
    set(`K${r}`, f ? inchValue(f.height) : null, S.fInch);
    set(`L${r}`, f?.note.trim() || null, S.fNote);
  }

  // new styles: a bold, shaded label for the "END PANELS" row
  let styles = await zip.file("xl/styles.xml")!.async("string");
  styles = styles
    .replace(/<fills count="2">([\s\S]*?)<\/fills>/, (_m, inner) =>
      `<fills count="3">${inner}<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills>`)
    .replace(/<cellXfs count="33">([\s\S]*?)<\/cellXfs>/, (_m, inner) =>
      `<cellXfs count="34">${inner}<xf numFmtId="0" fontId="7" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf></cellXfs>`);
  if (!styles.includes('cellXfs count="34"')) throw new Error("Door order template styles were not as expected.");

  if (merges.length) {
    xml = xml.replace(/<mergeCells count="(\d+)">([\s\S]*?)<\/mergeCells>/, (_m, n, inner) =>
      `<mergeCells count="${+n + merges.length}">${inner}${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`);
  }

  return saveTemplate(zip, sheet, xml, { "xl/styles.xml": styles });
}
