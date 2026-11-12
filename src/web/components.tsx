import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Job } from "../shared/types.ts";
import type { Vars } from "../shared/calc.ts";
import { InvoiceDoc } from "./docs/InvoiceDoc.tsx";
import { PlywoodDoc } from "./docs/PlywoodDoc.tsx";
import { api } from "./api.ts";

export type DocName = "invoice" | "plywood";

export function Topbar({ children }: { children?: ReactNode }) {
  return (
    <header className="topbar no-print">
      <Link className="brand" to="/">Scribe</Link>
      {children}
      <Link className="navlink" to="/settings">Settings</Link>
      <SignOut />
    </header>
  );
}

let me: Promise<{ authEnabled: boolean; name: string | null }> | null = null;

/** Who is signed in, and a way out. Hidden when sign-in is turned off. */
function SignOut() {
  const [who, setWho] = useState<{ authEnabled: boolean; name: string | null } | null>(null);
  useEffect(() => { (me ??= api.me()).then(setWho).catch(() => { me = null; }); }, []);
  if (!who?.authEnabled) return null;
  return <a className="navlink" href="/auth/logout" title={who.name ? `Signed in as ${who.name}` : undefined}>Sign out</a>;
}

export function DocView(props: { doc: DocName; job: Job; vars: Vars; onEdit?: (e: (j: Job) => void) => void }) {
  const { doc, ...rest } = props;
  if (doc === "plywood") return <PlywoodDoc {...rest} />;
  return <InvoiceDoc {...rest} />;
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}
