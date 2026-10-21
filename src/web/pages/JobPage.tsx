import { lazy, Suspense, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { cutlistVars } from "../../shared/outputs.ts";
import { api } from "../api.ts";
import { DocView, Topbar, type DocName } from "../components.tsx";
import { useJob } from "../useJob.ts";
import { CutlistTab } from "./CutlistTab.tsx";
import { DoorTab } from "./DoorTab.tsx";
import { DrawerTab } from "./DrawerTab.tsx";

// Loaded only when opened: they bring in the markdown renderer and the spreadsheet engine.
const NotesTab = lazy(() => import("./NotesTab.tsx").then((m) => ({ default: m.NotesTab })));
const SheetsTab = lazy(() => import("./SheetsTab.tsx").then((m) => ({ default: m.SheetsTab })));

const TABS = [
  { key: "invoice", label: "Invoice" },
  { key: "cutlist", label: "Cutlist" },
  { key: "doors", label: "Door order" },
  { key: "plywood", label: "Plywood cutlist" },
  { key: "drawers", label: "Drawer order" },
  { key: "notes", label: "Notes" },
  { key: "sheets", label: "Sheets" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const SAVE_TEXT = { idle: "", dirty: "Unsaved changes…", saving: "Saving…", saved: "All changes saved", error: "Not saved. Retrying on your next edit" };

export function JobPage() {
  const { id, tab } = useParams();
  const nav = useNavigate();
  const { job, error, save, update, replace, flush, discard } = useJob(id);
  const [sure, setSure] = useState(false);
  const vars = useMemo(() => (job?.cutlist ? cutlistVars(job.cutlist.parsed) : {}), [job?.cutlist]);

  if (!TABS.some((t) => t.key === tab)) return <Navigate to={`/jobs/${id}/invoice`} replace />;
  const current = tab as TabKey;

  if (error) return (<><Topbar /><main className="page"><p className="error-text">{error}</p><Link to="/">Back to jobs</Link></main></>);
  if (!job) return (<><Topbar /><main className="page muted">Loading…</main></>);

  const isDoc = current === "invoice" || current === "plywood";
  async function openPdf() {
    await flush();
    const url = `/api/jobs/${job!.id}/pdf/${current}`;
    if (!window.open(url, "_blank")) window.location.href = url;
  }
  async function remove() {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    discard();
    await api.remove(job!.id);
    nav("/");
  }

  return (
    <>
      <Topbar>
        <span className={`status${save === "error" ? " error" : ""}`} role="status">{SAVE_TEXT[save]}</span>
        {isDoc && <button className="btn" onClick={() => window.print()}>Print</button>}
        {isDoc && <button className="btn primary" onClick={openPdf}>Open PDF</button>}
      </Topbar>

      <div className="titlebar no-print">
        <label htmlFor="job-title">Invoice name</label>
        <input id="job-title" value={job.title} autoComplete="off"
          onChange={(e) => update((j) => { j.title = e.target.value; })} />
        <button className={`btn danger${sure ? " sure" : ""}`} onClick={remove}>{sure ? "Click again to delete" : "Delete job"}</button>
      </div>
      <nav className="tabs no-print" aria-label="Job sections">
        {TABS.map((t) => (
          <Link key={t.key} to={`/jobs/${job.id}/${t.key}`} className={`tab${t.key === current ? " on" : ""}`}
            aria-current={t.key === current ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>

      {current === "cutlist"
        ? <CutlistTab job={job} update={update} replace={replace} flush={flush} />
        : current === "drawers"
        ? <DrawerTab job={job} update={update} flush={flush} />
        : current === "doors"
        ? <DoorTab job={job} update={update} flush={flush} />
        : current === "notes"
        ? <Suspense fallback={<main className="page muted">Loading…</main>}><NotesTab job={job} update={update} /></Suspense>
        : current === "sheets"
        ? <Suspense fallback={<main className="page muted">Loading…</main>}><SheetsTab job={job} /></Suspense>
        : <div className="workspace"><div className="sheet"><DocView doc={current as DocName} job={job} vars={vars} onEdit={update} /></div></div>}
    </>
  );
}
