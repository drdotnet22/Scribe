import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Job } from "../../shared/types.ts";

interface Props {
  job: Job;
  update: (edit: (j: Job) => void) => void;
}

/** Free-form markdown notes for the job: type on the left, see the result on the right. */
export function NotesTab({ job, update }: Props) {
  const notes = job.notes ?? "";
  return (
    <main className="page" style={{ maxWidth: 1200 }}>
      <h1>Notes</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Saved with the job as you type. Markdown works: <code>#</code> headings, <code>**bold**</code>, <code>- lists</code>, <code>- [ ] to-do items</code> and <code>| tables |</code>.
      </p>
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
