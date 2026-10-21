import type { DoorOrderState, DrawerOrderState, InvoiceData, InvoiceVersion, Job, Line } from "./types.ts";
import { num, type Vars } from "./calc.ts";
import { DEFAULT_DOOR_DEFAULTS, type DoorDefaults } from "./settings.ts";

export const DEFAULT_TERMS = "* Terms: $500 to confirm; 1/3 Down; Balance at completion";

export const rows = (n: number): Line[] => Array.from({ length: n }, () => ({ d: "", a: "" }));

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function usDate(iso: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso || "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

// The accessories table has a "Total" row, so it starts one row shorter to line up with cabinets.
export function blankInvoice(): InvoiceData {
  return {
    name: "", address: "", email: "", phone: "", date: today(),
    wood: "", finish: "", doorStyle: "", pulls: "",
    cabinets: rows(8), accessories: rows(7),
    recap: [{ label: "Door style", a: "" }],
    installation: "", paid: "", notes: "", terms: DEFAULT_TERMS,
  };
}

export function blankJob(id: string, title: string, doorDefaults: DoorDefaults = DEFAULT_DOOR_DEFAULTS): Job {
  const now = Date.now();
  return {
    id, title, created: now, updated: now,
    invoice: blankInvoice(),
    order: { supplier: "", date: today(), notes: "" },
    drawerOrder: blankDrawerOrder(),
    doorOrder: blankDoorOrder(doorDefaults),
  };
}

export function totals(inv: InvoiceData, vars?: Vars) {
  const sum = (a: { a: string }[]) => a.reduce((t, r) => t + num(r.a, vars), 0);
  const cab = sum(inv.cabinets), acc = sum(inv.accessories), extra = sum(inv.recap);
  const sub = cab + acc + extra;
  const grand = sub + num(inv.installation, vars);
  return { cab, acc, sub, grand, bal: grand - num(inv.paid, vars) };
}

export function blankDrawerOrder(): DrawerOrderState {
  return { dateOrdered: today(), dateRequested: "", delivery: "", includePullouts: true };
}

/** A new door order form: today's date, quote only, and your saved defaults for contact and door specs. */
export function blankDoorOrder(defaults: DoorDefaults = DEFAULT_DOOR_DEFAULTS): DoorOrderState {
  return { type: "quote", po: "", date: today(), dateRequired: "", ...defaults };
}

/* ---------- invoice versions ---------- */

export const FIRST_VERSION_NAME = "Original";

/** Every version with its name. A job that never made a copy has just the one. */
export function invoiceVersionList(job: Job): { id: string; name: string }[] {
  return job.invoiceVersions?.length
    ? job.invoiceVersions.map((v) => ({ id: v.id, name: v.name }))
    : [{ id: "v1", name: FIRST_VERSION_NAME }];
}

export function activeInvoiceId(job: Job): string {
  const list = invoiceVersionList(job);
  return list.find((v) => v.id === job.activeInvoice)?.id ?? list[0].id;
}

export function activeInvoiceName(job: Job): string {
  return invoiceVersionList(job).find((v) => v.id === activeInvoiceId(job))!.name;
}

/** Makes sure the list exists, with the open invoice stored in its own slot. Changes the job it is given. */
function syncVersions(job: Job): InvoiceVersion[] {
  if (!job.invoiceVersions?.length) job.invoiceVersions = [{ id: "v1", name: FIRST_VERSION_NAME, invoice: structuredClone(job.invoice) }];
  const id = activeInvoiceId(job);
  job.activeInvoice = id;
  job.invoiceVersions.find((v) => v.id === id)!.invoice = structuredClone(job.invoice);
  return job.invoiceVersions;
}

/** Copies the open invoice into a new, named version and opens it. */
export function newInvoiceVersion(job: Job, name: string): void {
  const list = syncVersions(job);
  const id = `v${Math.max(0, ...list.map((v) => Number(v.id.slice(1)) || 0)) + 1}`;
  list.push({ id, name: name.trim() || `Version ${list.length + 1}`, invoice: structuredClone(job.invoice) });
  job.activeInvoice = id;
}

export function switchInvoice(job: Job, id: string): void {
  const list = syncVersions(job);
  const target = list.find((v) => v.id === id);
  if (!target) return;
  job.invoice = structuredClone(target.invoice);
  job.activeInvoice = id;
}

export function renameInvoiceVersion(job: Job, name: string): void {
  const list = syncVersions(job);
  const v = list.find((x) => x.id === job.activeInvoice)!;
  v.name = name.trim() || v.name;
}

/** Removes the open version and opens the one before it. The last version cannot be removed. */
export function deleteInvoiceVersion(job: Job): void {
  const list = syncVersions(job);
  if (list.length < 2) return;
  const at = list.findIndex((v) => v.id === job.activeInvoice);
  list.splice(at, 1);
  const next = list[Math.max(0, at - 1)];
  job.invoice = structuredClone(next.invoice);
  job.activeInvoice = next.id;
}
