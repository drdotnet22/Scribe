// Types shared by the server and the web app.

/* ---------- cutlist (parsed from the supplier's text file) ---------- */

export interface Dim { text: string; inches: number }
export interface CabRef { room: number; cabinet: string; qty: string }

export interface BodyPart {
  material: string;
  qty: number;
  width: Dim;
  length: Dim;
  edge?: string;          // edge-banding code from the file (kept, never printed)
  description: string;
  refs: CabRef[];
}

export interface Cell { qty: number; w: Dim; l: Dim }
export interface PanelRow {
  columns: Record<string, Cell[]>;
  refs: CabRef[];
  hinge?: string;
}
export interface PanelSection {
  heading: string;
  meta: Record<string, string>;
  stock: string[];
  columnNames: string[];
  rows: PanelRow[];
}
export interface ParsedCutlist {
  customer?: string;            // exactly as written in the file, e.g. "Stotzfus, Virgil"
  date?: string;
  room?: { number: string; name: string };
  cabinetCount: number;
  bodyParts: BodyPart[];
  sections: PanelSection[];
  warnings: string[];
}

/* ---------- invoice ---------- */

export interface Line { d: string; a: string }
export interface RecapLine { label: string; a: string }

export interface InvoiceData {
  name: string; address: string; email: string; phone: string;
  date: string;                     // yyyy-mm-dd
  wood: string; finish: string; doorStyle: string; pulls: string;
  cabStyle?: string; knobs?: string; // older invoices; kept in the data, not shown
  cabinets: Line[];
  accessories: Line[];
  recap: RecapLine[];
  installation: string;
  paid: string;
  notes: string;
  terms: string;
}

/* ---------- job ---------- */

export interface CutlistState {
  raw: string;
  parsed: ParsedCutlist;
  hiddenMaterials: string[];        // materials left off the plywood cutlist
  revision?: number;                // 1 for the first import, +1 each time a new cutlist is approved
  imported?: number;                // when this version was imported
  history?: CutlistVersion[];       // earlier versions, newest first
}
export interface CutlistVersion { revision: number; imported: number; raw: string }
export interface OrderState { supplier: string; date: string; notes: string }

/** Choices on the supplier's drawer order form (finished drawer boxes). */
export interface DrawerOrderState {
  species: string;                  // blank = taken from the cutlist's drawer side material
  thickness: "1/2" | "5/8";
  grade: "Cabinet Plus+" | "Furniture Grade" | "Commercial Standard";
  topEdge: "" | "Bullnose" | "Hand Radius";
  frontDrill: "" | "Slab Drill" | "Corner Drill";
  groove: "" | "Undermount" | "Sidemount 1/2" | "Sidemount 1/4";
  clearCoat: boolean;
  dateOrdered: string;              // yyyy-mm-dd
  dateRequested: string;
  delivery: string;
  includePullouts: boolean;
}
export interface DrawerRow { qty: number; height: string; width: string; depth: string; front: string; note: string }

export interface Job {
  id: string;
  title: string;                    // the invoice name; also the name used for files
  created: number;
  updated: number;
  invoice: InvoiceData;
  cutlist?: CutlistState;
  order: OrderState;
  drawerOrder?: DrawerOrderState;
}
export interface JobSummary { id: string; title: string; customer: string; updated: number }

/* ---------- derived documents ---------- */

export interface OrderRow { qty: number; w: string; h: string; hinge?: string; refs: string }
export interface OrderGroup {
  key: string;
  heading: string;                  // "Doors", "Drawer fronts", "End panels"
  style: string;
  panelMaterial: string;
  frameMaterial: string;
  showHinge: boolean;
  rows: OrderRow[];
  pieces: number;
  sqft: number;
}
export interface PlyRow { qty: number; w: string; l: string; part: string; refs: string }
export interface PlyGroup { material: string; rows: PlyRow[]; pieces: number; sqft: number }

/* ---------- comparing two cutlists ---------- */

export interface CutlistChange {
  area: string;                     // "Doors", "Drawer fronts", "3/4 Birch VC" ...
  kind: "added" | "removed" | "changed";
  item: string;                     // "17 1/2 × 37 3/4 (Pair)"
  from: number;
  to: number;
}
export interface VarChange { name: string; from: number; to: number }
export interface CutlistComparison {
  identical: boolean;
  changes: CutlistChange[];
  vars: VarChange[];
  notes: string[];                  // customer / cabinet count / new materials
  warnings: string[];               // lines in the new file that were not understood
  currentRevision: number;
}
