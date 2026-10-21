import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Job } from "../../shared/types.ts";
import { sheetsApi, type SheetInfo } from "../api.ts";

const SheetEditor = lazy(() => import("./SheetEditor.tsx"));
const engine = () => import("./sheetEngine.ts");

/** Spreadsheets for the job. Each one is stored as a real .xlsx file. */
export function SheetsTab({ job }: { job: Job }) {
  const [list, setList] = useState<SheetInfo[] | null>(null);
  const [sid, setSid] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<"" | "new" | "rename">("");
  const [name, setName] = useState("");
  const [sure, setSure] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sheetsApi.list(job.id).then((l) => { setList(l); setSid((cur) => cur || l[0]?.id || ""); }).catch((e) => setError(e.message));
  }, [job.id]);

  const current = list?.find((s) => s.id === sid);
  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await task(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  const add = (info: SheetInfo) => { setList((l) => [...(l ?? []), info]); setSid(info.id); };

  const create = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    const title = name.trim() || "Sheet";
    add(await sheetsApi.create(job.id, title, await (await engine()).blankXlsx(title)));
    setNaming(""); setName("");
  }); };
  const rename = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    if (!current) return;
    const info = await sheetsApi.rename(current.id, name);
    setList((l) => l!.map((s) => (s.id === info.id ? info : s)));
    setNaming(""); setName("");
  }); };
  const upload = (f: File) => void run(async () => {
    const bytes = new Uint8Array(await f.arrayBuffer());
    try { await (await engine()).openXlsx(bytes, "Check"); }
    catch { throw new Error("That file could not be read as an .xlsx spreadsheet."); }
    add(await sheetsApi.create(job.id, f.name.replace(/\.xlsx$/i, ""), bytes));
  });
  const remove = () => {
    if (!current) return;
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    setSure(false);
    void run(async () => {
      await sheetsApi.remove(current.id);
      const rest = list!.filter((s) => s.id !== current.id);
      setList(rest); setSid(rest[0]?.id ?? "");
    });
  };

  return (
    <main className="page" style={{ maxWidth: 1400 }}>
      <h1>Sheets</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Spreadsheets for this job, with formulas and formatting. Each one is saved as it changes and downloads as a normal .xlsx file.
      </p>

      <div className="sheet-chips" style={{ marginBottom: 10 }}>
        {(list ?? []).map((s) => (
          <button key={s.id} className={`chip${s.id === sid ? " on" : ""}`} aria-pressed={s.id === sid}
            onClick={() => { setSid(s.id); setNaming(""); setSure(false); }}>{s.name}</button>
        ))}
        <button className="btn" disabled={busy} onClick={() => { setNaming("new"); setName(""); }}>New spreadsheet</button>
        <button className="btn" disabled={busy} onClick={() => file.current?.click()}>Upload .xlsx</button>
        <input ref={file} type="file" hidden aria-label="Upload spreadsheet" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      </div>

      {naming && (
        <form className="row" style={{ marginBottom: 10 }} onSubmit={naming === "new" ? create : rename}>
          <input autoFocus aria-label="Spreadsheet name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={naming === "new" ? "Name, such as Cost estimate" : "New name"}
            style={{ padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, minWidth: 240 }} />
          <button className="btn primary" disabled={busy || (naming === "rename" && !name.trim())}>{naming === "new" ? "Create" : "Rename"}</button>
          <button type="button" className="btn" onClick={() => setNaming("")}>Cancel</button>
        </form>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}

      {current && (
        <div className="row" style={{ marginBottom: 8, flexWrap: "wrap" }}>
          <b>{current.name}</b>
          <button className="btn" onClick={() => { setNaming("rename"); setName(current.name); }}>Rename</button>
          <a className="btn" href={sheetsApi.downloadUrl(current.id)} download>Download .xlsx</a>
          <button className={`btn danger${sure ? " sure" : ""}`} disabled={busy} onClick={remove}>{sure ? "Click again to delete" : "Delete"}</button>
        </div>
      )}

      {list && !list.length && !naming && <p className="muted">No spreadsheets yet. Create one, or upload an existing .xlsx file.</p>}
      {current && (
        <Suspense fallback={<p className="muted">Opening…</p>}>
          <SheetEditor key={current.id} sid={current.id} />
        </Suspense>
      )}
    </main>
  );
}
