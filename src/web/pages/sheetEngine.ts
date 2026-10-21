// The spreadsheet engine (WebAssembly). Loaded only when a job's Sheets tab is opened.
import { init, Model } from "@ironcalc/workbook";

let ready: Promise<unknown> | null = null;
export const ensureEngine = () => (ready ??= init());

const timezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

/** A new empty workbook, as .xlsx bytes. */
export async function blankXlsx(name: string): Promise<Uint8Array> {
  await ensureEngine();
  return new Model(name, "en", timezone(), "en").toXlsx();
}

/** Open .xlsx bytes. Throws when the engine cannot read the file. */
export async function openXlsx(bytes: Uint8Array, name: string): Promise<Model> {
  await ensureEngine();
  const model = Model.fromXlsx(bytes, name, "en", timezone(), "en");
  model.evaluate(); // files from other programs may carry no calculated values
  return model;
}

export type { Model };
