import { useEffect, useMemo, useState } from "react";
import { IronCalc } from "@ironcalc/workbook";
import "@ironcalc/workbook/style.css";
import { sheetsApi } from "../api.ts";
import { openXlsx, type Model } from "./sheetEngine.ts";

type State = "loading" | "saved" | "dirty" | "saving" | "error";
const TEXT: Record<State, string> = { loading: "Opening…", saved: "All changes saved", dirty: "Unsaved changes…", saving: "Saving…", error: "Not saved. Will retry" };

/** One spreadsheet: loads the .xlsx, shows the editor, and saves a moment after you stop editing. */
export default function SheetEditor({ sid }: { sid: string }) {
  const [model, setModel] = useState<Model | null>(null);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true, m: Model | null = null, dirty = false, saving = false;
    let timer: ReturnType<typeof setTimeout> | null = null, poll: ReturnType<typeof setInterval> | undefined;

    const save = async (keepalive = false) => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!m || !dirty || saving) return;
      saving = true; dirty = false;
      if (alive) setState("saving");
      try {
        const bytes = m.toXlsx();
        await sheetsApi.save(sid, bytes, keepalive && bytes.length < 60_000);
        if (alive) { setState(dirty ? "dirty" : "saved"); setError(""); }
      } catch (e) {
        dirty = true;
        if (alive) { setState("error"); setError((e as Error).message); }
      }
      saving = false;
    };
    const schedule = (ms: number) => { if (!timer) timer = setTimeout(() => void save(), ms); };

    (async () => {
      try {
        const opened = await openXlsx(await sheetsApi.load(sid), "Workbook");
        if (!alive) return;
        opened.flushSendQueue(); // forget anything from opening the file
        m = opened;
        setModel(opened); setState("saved");
        // The editor queues a record of every change; any record means there is something to save.
        poll = setInterval(() => {
          if (!m) return;
          if (m.flushSendQueue().length > 1) { dirty = true; if (alive) setState("dirty"); schedule(1500); }
          else if (dirty && !saving) schedule(4000); // a failed save: try again
        }, 600);
      } catch (e) {
        if (alive) { setState("error"); setError((e as Error).message || "That spreadsheet could not be opened."); }
      }
    })();

    const onHide = () => { if (m && m.flushSendQueue().length > 1) dirty = true; void save(true); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      onHide(); // leaving the tab: save what is left
      alive = false;
      if (poll) clearInterval(poll);
      if (timer) clearTimeout(timer);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [sid]);

  // The same element every time, so the status line changing never re-renders (and never disturbs) the editor.
  const editor = useMemo(() => (model ? <IronCalc model={model} /> : null), [model]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 4 }}>
        <span role="status" className={state === "error" ? "error-text" : "muted"}>{TEXT[state]}{state === "error" && error ? `: ${error}` : ""}</span>
      </div>
      <div className="sheet-host">{editor ?? <p className="muted" style={{ padding: 16 }}>{state === "error" ? error : "Opening…"}</p>}</div>
    </div>
  );
}
