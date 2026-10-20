import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { Job } from "../../shared/types.ts";
import { cutlistVars } from "../../shared/outputs.ts";
import { api } from "../api.ts";
import { DocView, type DocName } from "../components.tsx";

declare global { interface Window { __printReady?: boolean } }

/** The page the server opens to make a PDF. No toolbars, nothing editable. */
export function PrintPage() {
  const { id, doc } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const vars = useMemo(() => (job?.cutlist ? cutlistVars(job.cutlist.parsed) : {}), [job?.cutlist]);

  useEffect(() => { api.get(id!).then(setJob).catch((e) => setError(e.message)); }, [id]);

  useEffect(() => {
    if (!job) return;
    void (async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })));
      window.__printReady = true;
    })();
  }, [job]);

  if (error) return <p>{error}</p>;
  if (!job) return null;
  return (
    <div className="print-root">
      <div className="sheet"><DocView doc={doc as DocName} job={job} vars={vars} /></div>
    </div>
  );
}
