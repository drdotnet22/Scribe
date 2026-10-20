// Small helpers for filling cells in a supplier's .xlsx template by editing its XML directly,
// so everything else in the file (logos, text boxes, check boxes, print setup) stays exactly as made.

import JSZip from "jszip";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Value = string | number | boolean | null;

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Find a template file in assets/ whether running from src/server (dev) or dist (built). */
export function templatePath(name: string): string {
  for (const rel of [`../assets/${name}`, `../../assets/${name}`]) {
    const p = fileURLToPath(new URL(rel, import.meta.url));
    if (existsSync(p)) return p;
  }
  throw new Error(`Template ${name} not found.`);
}

export async function loadTemplate(name: string) {
  const zip = await JSZip.loadAsync(readFileSync(templatePath(name)));
  const sheet = "xl/worksheets/sheet1.xml";
  return { zip, xml: await zip.file(sheet)!.async("string"), sheet };
}

/** Replace one cell's value. Keeps its style unless `style` is given. */
export function setCell(xml: string, ref: string, value: Value, style?: number): string {
  const re = new RegExp(`<c r="${ref}"((?:\\s[^>]*?)?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  if (!m) throw new Error(`Template cell ${ref} not found.`);
  const keep = /\ss="(\d+)"/.exec(m[1])?.[1];
  const st = style ?? (keep ? Number(keep) : undefined);
  const s = st === undefined ? "" : ` s="${st}"`;
  let cell: string;
  if (value === null || value === "") cell = `<c r="${ref}"${s}/>`;
  else if (typeof value === "boolean") cell = `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
  else if (typeof value === "number") cell = `<c r="${ref}"${s}><v>${value}</v></c>`;
  else cell = `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  return xml.replace(re, () => cell);
}

/** Write the package back part by part (no folder entries), in the template's own order. */
export async function saveTemplate(zip: JSZip, sheet: string, xml: string, extra: Record<string, string> = {}): Promise<Buffer> {
  const out = new JSZip();
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const text = name === sheet ? xml : extra[name];
    out.file(name, text ?? (await entry.async("nodebuffer")), { createFolders: false });
  }
  return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Excel's date serial number for a yyyy-mm-dd string. */
export function excelDate(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000);
}
