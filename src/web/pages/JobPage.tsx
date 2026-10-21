import { lazy, Suspense, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { jobVars } from "../../shared/outputs.ts";
import { api } from "../api.ts";
import { DocView, Topbar, type DocName } from "../components.tsx";
import { useJob } from "../useJob.ts";
import { CutlistTab } from "./CutlistTab.tsx";
import { DoorTab } from "./DoorTab.tsx";
import { DrawerTab } from "./DrawerTab.tsx";
import { PlywoodTab } from "./PlywoodTab.tsx";

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
  const [query] = useSearchParams();
  const nav = useNavigate();
  const { job, error, save, update, replace, flush, discard } = useJob(id);
  const [sure, setSure] = useState(false);
  const vars = useMemo(() => (job ? jobVars(job) : {}), [job]);

  if (!TABS.some((t) => t.key === tab)) return <Navigate to={`/jobs/${id}/invoice`} replace />;
  const current = tab as TabKey;
  // Split view: the tab in the address is pinned on the left, ?right= is the one beside it.
  const rightParam = query.get("right");
  const right = TABS.some((t) => t.key === rightParam && t.key !== current) ? (rightParam as TabKey) : null;
  const split = right !== null;
  const firstOther = TABS.find((t) => t.key !== current)!.key;
  const tabUrl = (key: TabKey) => split && key !== current ? `/jobs/${id}/${current}?right=${key}` : `/jobs/${id}/${key}`;

  if (error) return (<><Topbar /><main className="page"><p className="error-text">{error}</p><Link to="/">Back to jobs</Link></main></>);
  if (!job) return (<><Topbar /><main className="page muted">Loading…</main></>);

  const isDoc = current === "invoice" || right === "invoice";
  async function openPdf() {
    await flush();
    const url = `/api/jobs/${job!.id}/pdf/invoice`;
    if (!window.open(url, "_blank")) window.location.href = url;
  }
  async function remove() {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    discard();
    await api.remove(job!.id);
    nav("/");
  }

  function renderTab(key: TabKey) {
    return key === "cutlist"
      ? <CutlistTab job={job!} update={update} replace={replace} flush={flush} />
      : key === "drawers"
      ? <DrawerTab job={job!} update={update} flush={flush} />
      : key === "doors"
      ? <DoorTab job={job!} update={update} flush={flush} />
      : key === "plywood"
      ? <PlywoodTab job={job!} update={update} flush={flush} />
      : key === "notes"
      ? <Suspense fallback={<main className="page muted">Loading…</main>}><NotesTab job={job!} update={update} flush={flush} /></Suspense>
      : key === "sheets"
      ? <Suspense fallback={<main className="page muted">Loading…</main>}><SheetsTab job={job!} /></Suspense>
      : <div className="workspace"><div className="sheet"><DocView doc={key as DocName} job={job!} vars={vars} onEdit={update} /></div></div>;
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
        {TABS.map((t) => {
          const pinned = split && t.key === current;
          const on = split ? t.key === right : t.key === current;
          return pinned
            ? <span key={t.key} className="tab pinned" title="Pinned on the left">{t.label} <small>(left)</small></span>
            : <Link key={t.key} to={tabUrl(t.key)} className={`tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined}>{t.label}</Link>;
        })}
        {split
          ? <Link className="tab split-btn" to={`/jobs/${job.id}/${current}`}>Cancel split tabs</Link>
          : <Link className="tab split-btn" to={`/jobs/${job.id}/${current}?right=${firstOther}`}>Split tabs</Link>}
      </nav>

      {split
        ? <div className="split">
            <div className="pane" aria-label="Left pane">{renderTab(current)}</div>
            <div className="pane" aria-label="Right pane">{renderTab(right!)}</div>
          </div>
        : renderTab(current)}
    </>
  );
}
