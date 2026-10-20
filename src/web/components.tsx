import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Job } from "../shared/types.ts";
import type { Vars } from "../shared/calc.ts";
import { InvoiceDoc } from "./docs/InvoiceDoc.tsx";
import { DoorOrderDoc } from "./docs/DoorOrderDoc.tsx";
import { PlywoodDoc } from "./docs/PlywoodDoc.tsx";

export type DocName = "invoice" | "doors" | "plywood";

export function Topbar({ children }: { children?: ReactNode }) {
  return (
    <header className="topbar no-print">
      <Link className="brand" to="/">Scribe</Link>
      {children}
      <Link className="navlink" to="/settings">Settings</Link>
    </header>
  );
}

export function DocView(props: { doc: DocName; job: Job; vars: Vars; onEdit?: (e: (j: Job) => void) => void }) {
  const { doc, ...rest } = props;
  if (doc === "doors") return <DoorOrderDoc {...rest} />;
  if (doc === "plywood") return <PlywoodDoc {...rest} />;
  return <InvoiceDoc {...rest} />;
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}
