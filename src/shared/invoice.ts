import type { DoorOrderState, DrawerOrderState, InvoiceData, Job, Line } from "./types.ts";
import { num, type Vars } from "./calc.ts";

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

export function blankJob(id: string, title: string): Job {
  const now = Date.now();
  return {
    id, title, created: now, updated: now,
    invoice: blankInvoice(),
    order: { supplier: "", date: today(), notes: "" },
    drawerOrder: blankDrawerOrder(),
    doorOrder: blankDoorOrder(),
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

export function blankDoorOrder(): DoorOrderState {
  return {
    type: "quote", po: "", date: today(), dateRequired: "",
    species: "", doorStyle: "", insideEdge: "", panelProfile: "", outsideEdge: "", drawerStyle: "5 piece", euroHinges: true,
    contactName: "", address: "", cityStateZip: "", phone: "", email: "",
  };
}
