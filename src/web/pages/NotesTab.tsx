import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Job } from "../../shared/types.ts";
import { joplinApi } from "../api.ts";

interface Props {
  job: Job;
  update: (edit: (j: Job) => void) => void;
  flush: () => Promise<void>;
}

type Line = { kind: "busy" | "ok" | "error"; text: string } | null;
const IDLE_MS = 5_000;       // sync this long after you stop typing
const POLL_MS = 90_000;      // while the tab stays open and you are not typing, look for changes made in Joplin
const QUIET_MS = 10_000;

/** Free-form markdown notes for the job: type on the left, see the result on the right. With Joplin set up, they sync both ways. */
export function NotesTab({ job, update, flush }: Props) {
  const notes = job.notes ?? "";
  const [joplin, setJoplin] = useState<"off" | "down" | "on">("off");
  const [line, setLine] = useState<Line>(null);
  const [missing, setMissing] = useState(false);

  // Latest values for the timers below.
  const text = useRef(notes); text.current = notes;
  const synced = useRef<string | null>(null);      // the text Joplin last agreed with
  const busy = useRef(false), again = useRef(false);
  const lastEdit = useRef(0);
  const jobId = useRef(job.id); jobId.current = job.id;
  const updateRef = useRef(update); updateRef.current = update;
  const flushRef = useRef(flush); flushRef.current = flush;
  const on = useRef(false); on.current = joplin === "on";

  const runSync = useCallback(async () => {
    if (busy.current) { again.current = true; return; }
    busy.current = true; again.current = false;
    const sent = text.current;
    setLine({ kind: "busy", text: "Syncing with Joplin…" });
    try {
      await flushRef.current();
      const res = await joplinApi.syncNote(jobId.current, sent);
      setMissing(res.status === "missing");
      if (res.text !== sent && text.current === sent) updateRef.current((j) => { j.notes = res.text; }); // Joplin's version
      if (res.text === sent || text.current === sent) synced.current = res.text;
      const at = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setLine(res.status === "missing"
        ? { kind: "error", text: "The note for this job was deleted in Joplin, so syncing is paused." }
        : res.action === "conflict"
        ? { kind: "error", text: "This note was edited in both places. Your Scribe text was kept, and the Joplin version is saved as a separate note in the job's notebook." }
        : res.action === "adopted" ? { kind: "ok", text: `Updated from Joplin at ${at}.` }
        : res.action === "created" ? { kind: "ok", text: "Added to Joplin in its own notebook." }
        : res.status === "idle" ? { kind: "ok", text: "Joplin is connected. The note is added to Joplin once you write something." }
        : { kind: "ok", text: `In step with Joplin at ${at}.` });
    } catch (e) {
      setLine({ kind: "error", text: (e as Error).message });
    }
    busy.current = false;
    if (again.current) void runSync();
  }, []);
  const runRef = useRef(runSync); runRef.current = runSync;

  // Is Joplin set up? If so, sync when the tab opens.
  useEffect(() => {
    let alive = true;
    joplinApi.status().then((s) => {
      if (!alive || !s.enabled) return;
      setJoplin(s.reachable ? "on" : "down");
      if (s.reachable) void runRef.current();
    }).catch(() => { /* Joplin is optional */ });
    return () => {
      alive = false;
      // Leaving the tab with changes Joplin has not seen: send them.
      if (on.current && synced.current !== null && text.current !== synced.current) {
        void joplinApi.syncNote(jobId.current, text.current, true).catch(() => undefined);
      }
    };
  }, []);

  // After you stop typing.
  useEffect(() => {
    lastEdit.current = Date.now();
    if (!on.current || synced.current === null || notes === synced.current) return;
    const t = setTimeout(() => void runRef.current(), IDLE_MS);
    return () => clearTimeout(t);
  }, [notes]);

  // While the tab is open and quiet: pick up edits made in Joplin.
  useEffect(() => {
    if (joplin !== "on") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastEdit.current > QUIET_MS) void runRef.current();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [joplin]);

  const relink = async () => { await joplinApi.relink(job.id); setMissing(false); void runSync(); };

  return (
    <main className="page" style={{ maxWidth: 1200 }}>
      <h1>Notes</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Saved with the job as you type. Markdown works: <code>#</code> headings, <code>**bold**</code>, <code>- lists</code>, <code>- [ ] to-do items</code> and <code>| tables |</code>.
      </p>

      {joplin === "down" && <p className="error-text" role="status">Joplin is set up, but the Joplin container is not answering right now. Notes are still saved in Scribe.</p>}
      {joplin === "on" && (
        <div className="row" style={{ marginBottom: 10, flexWrap: "wrap" }} role="status">
          <span className={line?.kind === "error" ? "error-text" : "muted"}>{line?.text ?? ""}</span>
          {missing
            ? <button className="btn" onClick={relink}>Create it in Joplin again</button>
            : <button className="btn" disabled={line?.kind === "busy"} onClick={() => void runSync()}>Sync with Joplin now</button>}
        </div>
      )}

      <div className="notes-grid">
        <label className="notes-pane">
          <span className="muted">Write</span>
          <textarea className="notes-edit" aria-label="Notes" value={notes} spellCheck
            placeholder="Measurements, customer requests, things to remember…"
            onChange={(e) => update((j) => { j.notes = e.target.value; })} />
        </label>
        <div className="notes-pane">
          <span className="muted">Preview</span>
          <div className="notes-preview card" aria-label="Notes preview">
            {notes.trim()
              ? <Markdown remarkPlugins={[remarkGfm]}>{notes}</Markdown>
              : <p className="muted">Nothing here yet.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
