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

/** Order details for the supplier's drawer order form. The drawer specs themselves stay as the form ships. */
export interface DrawerOrderState {
  dateOrdered: string;              // yyyy-mm-dd
  dateRequested: string;
  delivery: string;
  includePullouts: boolean;
  rows?: DrawerLine[];              // hand-edited list; when absent the rows come straight from the cutlist
}

/** One row on the supplier's drawer order form. */
/** One row of finished doors, drawer fronts or end panels. */
export interface SizeLine { qty: number; width: string; height: string; note: string }

/** The supplier's door order form. Door specs are typed in by hand; sizes start from the cutlist. */
export interface DoorOrderState {
  type: "quote" | "order";
  po: string;
  date: string;                     // yyyy-mm-dd
  dateRequired: string;
  species: string; doorStyle: string; insideEdge: string; panelProfile: string; outsideEdge: string; drawerStyle: string;
  euroHinges: boolean;              // drill for Euro hinges
  contactName: string; address: string; cityStateZip: string; phone: string; email: string;
  doors?: SizeLine[];               // hand-edited lists; when absent they come straight from the cutlist
  fronts?: SizeLine[];
  endPanels?: SizeLine[];
}

/** One row on the supplier's drawer order form. */
export interface DrawerLine {
  qty: number;
  height: string; width: string; depth: string;
  bottom38: boolean;                // 3/8" bottom
  pulloutNoScoop: boolean;
  pulloutScoop: boolean;
  ears: boolean;
  scallop: string;                  // "Scallop sides to"
  partsOnly: boolean;
  logo: boolean;                    // brand logo
  front: string;                    // front size (height x length), typed by hand
  note: string;                     // comments
}

export interface InvoiceVersion { id: string; name: string; invoice: InvoiceData }

export interface Job {
  id: string;
  title: string;                    // the job name; also the name used for files
  created: number;
  updated: number;
  invoice: InvoiceData;             // the version that is open now
  /** Named versions of the invoice. The open one lives in `invoice`; its copy in this list is only refreshed when you switch away. */
  invoiceVersions?: InvoiceVersion[];
  activeInvoice?: string;           // id of the open version
  cutlist?: CutlistState;
  order: OrderState;
  drawerOrder?: DrawerOrderState;
  doorOrder?: DoorOrderState;
  /** The plywood cutlist once edited by hand (otherwise it comes straight from the cutlist). */
  plywood?: { groups: PlyEditGroup[] };
  /** Free-form markdown notes for the job. */
  notes?: string;
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
/** A material and its parts as kept in a hand-edited plywood list. */
export interface PlyEditGroup { material: string; rows: PlyRow[] }
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
