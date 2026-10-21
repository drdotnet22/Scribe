import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { JobSummary } from "../../shared/types.ts";
import { api } from "../api.ts";
import { Topbar } from "../components.tsx";

function NewJobDialog({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const job = await api.create(title, text.trim() ? text : undefined);
      nav(`/jobs/${job.id}/${text.trim() ? "cutlist" : "invoice"}`);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="nj-h"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <form onSubmit={create}>
        <h2 id="nj-h">New job</h2>
        <label htmlFor="nj-title">Job name</label>
        <input id="nj-title" type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Soule - Second bath" autoComplete="off" />
        <label htmlFor="nj-file">Cutlist (optional)</label>
        <input id="nj-file" type="file" accept=".txt,text/plain"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
        <textarea aria-label="Or paste the cutlist text" placeholder="Or paste the cutlist text here" value={text}
          onChange={(e) => setText(e.target.value)} />
        <div className="muted" style={{ fontSize: 12 }}>
          With a cutlist, the customer name is filled in for you, and the name above can be left blank.
        </div>
        {error && <div className="error-text" role="alert">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || (!title.trim() && !text.trim())}>Create job</button>
        </div>
      </form>
    </div>
  );
}

export function JobsPage() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [q, setQ] = useState("");

  const load = () => api.list().then(setJobs).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);

  const shown = (jobs ?? []).filter((j) => `${j.title} ${j.customer}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Topbar />
      <main className="page">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
          <h1 style={{ margin: 0 }}>Jobs</h1>
          <div className="row">
            <button className="btn primary" onClick={() => setDialog(true)}>New job</button>
          </div>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: 12 }}>
            <input aria-label="Search jobs" placeholder="Search by job or customer" value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6 }} />
          </div>
          {jobs === null && !error && <div className="muted" style={{ padding: 16 }}>Loading…</div>}
          {jobs && !shown.length && (
            <div className="muted" style={{ padding: 16 }}>
              {jobs.length ? "No jobs match your search." : "No jobs yet. Click New job to start."}
            </div>
          )}
          <ul className="joblist">
            {shown.map((j) => (
              <li key={j.id}>
                <Link to={`/jobs/${j.id}/invoice`}>
                  <span className="t">{j.title}</span>
                  <span>{j.customer}</span>
                  <span className="muted">{new Date(j.updated).toLocaleDateString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      {dialog && <NewJobDialog onClose={() => setDialog(false)} />}
    </>
  );
}
