import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Job } from "../../shared/types.ts";
import { sheetsApi, type SheetInfo } from "../api.ts";

const SheetEditor = lazy(() => import("./SheetEditor.tsx"));
const engine = () => import("./sheetEngine.ts");

/** The job's spreadsheet: one workbook (with as many sheets inside it as you like), saved as a real .xlsx file. */
export function SheetsTab({ job }: { job: Job }) {
  const [book, setBook] = useState<SheetInfo | null | undefined>(undefined); // undefined = still loading
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sheetsApi.list(job.id).then((l) => setBook(l[0] ?? null)).catch((e) => setError(e.message));
  }, [job.id]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await task(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const create = () => void run(async () => {
    setBook(await sheetsApi.create(job.id, "Spreadsheet", await (await engine()).blankXlsx("Spreadsheet")));
  });
  const upload = (f: File) => void run(async () => {
    const bytes = new Uint8Array(await f.arrayBuffer());
    try { await (await engine()).openXlsx(bytes, "Check"); }
    catch { throw new Error("That file could not be read as an .xlsx spreadsheet."); }
    setBook(await sheetsApi.create(job.id, "Spreadsheet", bytes));
  });
  const remove = () => {
    if (!book) return;
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    setSure(false);
    void run(async () => { await sheetsApi.remove(book.id); setBook(null); });
  };

  return (
    <main className="page" style={{ maxWidth: 1400 }}>
      <h1>Sheets</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        A spreadsheet for this job, with formulas and formatting. Add more sheets inside it with the tabs along the bottom. It saves as you edit and downloads as a normal .xlsx file.
      </p>
      {error && <p className="error-text" role="alert">{error}</p>}

      {book === null && (
        <div className="card">
          <p style={{ marginTop: 0 }}>This job has no spreadsheet yet.</p>
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={create}>Create spreadsheet</button>
            <button className="btn" disabled={busy} onClick={() => file.current?.click()}>Upload an .xlsx instead</button>
            <input ref={file} type="file" hidden aria-label="Upload spreadsheet" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
          </div>
        </div>
      )}

      {book && (
        <>
          <div className="row" style={{ marginBottom: 8, justifyContent: "flex-end" }}>
            <a className="btn" href={sheetsApi.downloadUrl(book.id)} download>Download .xlsx</a>
            <button className={`btn danger${sure ? " sure" : ""}`} disabled={busy} onClick={remove}>{sure ? "Click again to delete" : "Delete spreadsheet"}</button>
          </div>
          <Suspense fallback={<p className="muted">Opening…</p>}>
            <SheetEditor key={book.id} sid={book.id} />
          </Suspense>
        </>
      )}
    </main>
  );
}
